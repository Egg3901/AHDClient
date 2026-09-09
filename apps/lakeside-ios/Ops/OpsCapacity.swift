import SwiftUI
import LakesideCore

/// Account usage and measured activity, with details available on demand.
struct OpsCapacity: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ObservedObject var model: OpsWorkspaceModel
    @State private var openDetails: Set<String> = []
    @State private var showInfo = false

    var body: some View {
        List {
            if model.providers.isEmpty {
                Text("No providers reported.").font(.callout).foregroundStyle(.secondary)
            }
            ForEach(providerItems) { item in
                OpsCapacityProviderCard(
                    provider: item.value,
                    usage: mergedUsage(model.usage, provider: item.id),
                    now: Date(),
                    detailsOpen: Binding(
                        get: { openDetails.contains(item.id) },
                        set: { open in
                            if open { openDetails.insert(item.id) } else { openDetails.remove(item.id) }
                        }
                    )
                )
                .listRowBackground(OpsTheme.surface)
                .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
            }
            if let error = model.error { Text(error).foregroundStyle(.orange) }
            Section { NavigationLink { OpsBenchmarks() } label: { Label("Provider benchmarks", systemImage: "speedometer") } }
        }
        .opsScreen()
        .navigationTitle("Usage")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showInfo = true } label: { Image(systemName: "info.circle") }
                    .accessibilityLabel("How usage is measured")
                    .accessibilityIdentifier("ops-capacity-info")
            }
        }
        .sheet(isPresented: $showInfo) { OpsCapacityInfoSheet(isPresented: $showInfo) }
        .transaction { transaction in if reduceMotion { transaction.animation = nil } }
        .task(id: "\(model.selectedTab)-\(scenePhase == .active)") {
            guard model.selectedTab == 2, scenePhase == .active else { return }
            while !Task.isCancelled {
                await model.refreshUsage(session)
                if Task.isCancelled { return }
                do { try await Task.sleep(for: .seconds(30)) } catch { return }
            }
        }
        .refreshable { await model.refreshUsage(session) }
        .accessibilityIdentifier("ops-capacity")
    }

    private var providerItems: [CapacityIdentity] {
        model.providers.enumerated().map { index, value in
            CapacityIdentity(id: value["id"].string.nonempty ?? "provider-\(index)", value: value)
        }
    }
}

private struct OpsCapacityProviderCard: View {
    let provider: JSONValue
    let usage: JSONValue
    let now: Date
    @Binding var detailsOpen: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let payload = presentProvider(provider, usage: usage, now: now)
        Section {
            VStack(alignment: .leading, spacing: 6) {
                if !payload.accountCaption.isEmpty {
                    CapacityStatusPill(text: payload.accountCaption, tone: payload.accountTone)
                }
                if let message = payload.summaryMessage {
                    Text(message).font(.caption).foregroundStyle(payload.accountTone == .error ? Color.orange : .secondary)
                }
                if payload.freeRouting && payload.windows.isEmpty && payload.readiness == nil {
                    Text("Free model routing").font(.caption).foregroundStyle(.secondary)
                }
                ForEach(payload.windows) { window in
                    OpsCapacityWindowBar(window: window, now: now)
                }
                if let readiness = payload.readiness {
                    OpsCapacityReadiness(readiness: readiness)
                }
                Text(payload.usage.summaryLine)
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.secondary)
                DisclosureGroup("Details", isExpanded: $detailsOpen) {
                    OpsCapacityDetails(payload: payload, now: now)
                }
                .tint(OpsTheme.sky)
                .font(.caption)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .transaction { transaction in if reduceMotion { transaction.animation = nil } }
        } header: {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(payload.label)
                    Spacer(minLength: 8)
                    if payload.stale { Text("Stale").font(.caption).foregroundStyle(.secondary) }
                    Text(payload.runtimeCaption).font(.caption).foregroundStyle(.secondary)
                }
                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(payload.label)
                        if payload.stale { Text("Stale").font(.caption).foregroundStyle(.secondary) }
                    }
                    Text(payload.runtimeCaption).font(.caption).foregroundStyle(.secondary)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("ops-provider-\(provider["id"].string)")
        }
    }
}

private struct CapacityMeter: View {
    let meter: Double
    let color: Color

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(OpsTheme.raised)
                Capsule().fill(color)
                    .frame(width: max(0, min(geo.size.width, geo.size.width * meter / 100)))
            }
        }
        .frame(height: 4)
        .accessibilityHidden(true)
    }
}

private struct OpsCapacityWindowBar: View {
    let window: CapacityWindowPresentation
    let now: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(window.label).font(.subheadline)
                    Spacer(minLength: 8)
                    Text(window.percentText).font(.subheadline.monospacedDigit()).foregroundStyle(window.kind == .reported ? OpsTheme.ink : .secondary)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(window.label).font(.subheadline)
                    Text(window.percentText).font(.subheadline.monospacedDigit()).foregroundStyle(.secondary)
                }
            }
            if let meter = window.meter {
                CapacityMeter(meter: meter, color: window.barColor)
            }
            if let resets = window.resetCaption(now: now) {
                Text(resets).font(.caption).foregroundStyle(.secondary)
            } else if window.kind == .reset {
                Text("New usage not yet reported").font(.caption).foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(window.label)
        .accessibilityValue(window.accessibilityValue)
    }
}

private struct OpsCapacityReadiness: View {
    let readiness: CapacityReadiness

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Routes ready \(readiness.ready)/\(readiness.total)")
                .font(.subheadline.monospacedDigit())
            if readiness.coolingDown > 0 {
                Text("\(readiness.coolingDown) cooling down").font(.caption).foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Routes ready")
        .accessibilityValue("\(readiness.ready) of \(readiness.total) ready\(readiness.coolingDown > 0 ? ", \(readiness.coolingDown) cooling down" : ""). Upstream limits vary. This is not a quota.")
    }
}

private struct OpsCapacityDetails: View {
    let payload: CapacityProviderPresentation
    let now: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            labeled("Billing", payload.billing)
            labeled("Enabled", payload.runtimeEnabled.map { $0 ? "Yes" : "No" } ?? "Not reported")
            labeled("Runtime", payload.runtimeStatus)
            labeled("Account", payload.capacityStatus)
            if let source = payload.source { labeled("Source", source) }
            if let observed = payload.observedAt {
                labeled("Capacity observed", "\(relativeTimestamp(observed, now: now)) · \(absoluteTimestamp(observed))")
            }
            if !payload.models.isEmpty { labeled("Models", payload.models.joined(separator: ", ")) }
            if let cooldown = payload.cooldownUntil, cooldown > now {
                labeled("Cooldown", relativeTimestamp(cooldown, now: now))
            }
            if payload.sharedWindows {
                Text("Account windows are shared across this provider's models.").foregroundStyle(.secondary)
            }
            if payload.readiness != nil {
                Text("Upstream limits vary. This is route availability, not a quota.").foregroundStyle(.secondary)
            }
            if payload.usage.present {
                Text("\(payload.usage.completed) completed · \(payload.usage.failed) failed")
                    .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                if let tokens = payload.usage.tokenCaption {
                    Text(tokens).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                }
                Text(payload.usage.costCaption).foregroundStyle(.secondary)
                if payload.usage.unmeasuredTokens > 0 {
                    Text("\(payload.usage.unmeasuredTokens) attempts have no token measurement.").foregroundStyle(.secondary)
                }
                if payload.usage.unmeasuredCost > 0 {
                    Text("\(payload.usage.unmeasuredCost) attempts have no cost measurement.").foregroundStyle(.secondary)
                }
            }
            ForEach(payload.balances) { balance in
                VStack(alignment: .leading, spacing: 4) {
                    Text(balance.label).font(.caption.weight(.medium))
                    Text(balance.caption).foregroundStyle(.secondary)
                    if let meter = balance.meter {
                        CapacityMeter(meter: meter, color: OpsTheme.sky)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(balance.label)
                .accessibilityValue(balance.accessibilityValue)
            }
            ForEach(payload.windows) { window in
                if let observed = window.observedAt {
                    labeled("\(window.label) reported", relativeTimestamp(observed, now: now))
                }
                if let minutes = window.windowMinutes {
                    labeled(window.label, "\(formatCount(minutes)) minute window as reported")
                }
            }
        }
        .font(.caption)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 6)
    }

    private func labeled(_ title: String, _ value: String) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).foregroundStyle(.secondary)
                Spacer(minLength: 8)
                Text(value).multilineTextAlignment(.trailing)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).foregroundStyle(.secondary)
                Text(value)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title)
        .accessibilityValue(value)
    }
}

private struct CapacityStatusPill: View {
    let text: String
    let tone: CapacityTone
    var body: some View {
        Text(text)
            .font(.caption2.weight(.medium))
            .foregroundStyle(tone.color)
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(tone.color.opacity(0.12), in: Capsule())
            .lineLimit(2)
    }
}

private enum CapacityTone {
    case ok, warn, error, stale, muted
    var color: Color {
        switch self {
        case .ok: return OpsTheme.mint
        case .warn, .error: return .orange
        case .stale, .muted: return .secondary
        }
    }
}

private struct OpsCapacityInfoSheet: View {
    @Binding var isPresented: Bool
    var body: some View {
        NavigationStack {
            List {
                Text("Quota bars count upward as usage is consumed. Higher usage is closer to the limit.")
                Text("Unknown usage is never shown as 0% used or as a full remaining balance.")
                Text("A reset does not invent a fresh reading. Wait for the next report.")
                Text("Stale means the last reading is older than five minutes.")
                Text("Runtime availability is separate from account quota. Free Router shows route readiness, not a subscription limit.")
            }
            .navigationTitle("Usage")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { isPresented = false } } }
        }
        .presentationDetents([.medium, .large])
    }
}

private struct CapacityIdentity: Identifiable {
    let id: String
    let value: JSONValue
}

private enum CapacityWindowKind {
    case reported, exhausted, stale, reset, unreported
}

private struct CapacityWindowPresentation: Identifiable {
    let id: String
    let label: String
    let kind: CapacityWindowKind
    let remaining: Double?
    let used: Double?
    let resetsAt: Date?
    let observedAt: Date?
    let windowMinutes: Double?
    let meter: Double?
    let caption: String
    let accessibilityValue: String

    var percentText: String {
        switch kind {
        case .reset: return "Reset"
        case .unreported: return "Not reported"
        case .stale:
            if let remaining { return "\(formatPercent(100 - remaining))% used · stale" }
            return "Stale"
        case .exhausted: return "100% used"
        case .reported:
            if let remaining { return "\(formatPercent(100 - remaining))% used" }
            return "Reported"
        }
    }

    var barColor: Color {
        switch kind {
        case .stale, .reset, .unreported: return .secondary
        case .exhausted: return .orange
        case .reported:
            guard let remaining else { return OpsTheme.mint }
            if remaining < 10 { return .orange }
            if remaining < 20 { return Color.orange }
            return OpsTheme.mint
        }
    }

    func resetCaption(now: Date) -> String? {
        if kind == .reset { return nil }
        if let resetsAt { return "Resets \(relativeTimestamp(resetsAt, now: now))" }
        if kind == .exhausted { return "Reset time not reported" }
        return nil
    }
}

private struct CapacityReadiness {
    let ready: Int
    let total: Int
    let coolingDown: Int
}

private struct CapacityBalancePresentation: Identifiable {
    let id: String
    let label: String
    let caption: String
    let meter: Double?
    let accessibilityValue: String
}

private struct CapacityUsagePresentation {
    let present: Bool
    let attempts: Int
    let completed: Int
    let failed: Int
    let tokenCaption: String?
    let tokenTotalCaption: String?
    let costCaption: String
    let unmeasuredTokens: Int
    let unmeasuredCost: Int

    var summaryLine: String {
        if !present { return "No activity today" }
        if let tokenTotalCaption { return "\(attempts) attempts · \(tokenTotalCaption)" }
        return "\(attempts) attempts"
    }
}

private struct CapacityProviderPresentation {
    let id: String
    let label: String
    let billing: String
    let freeRouting: Bool
    let runtimeEnabled: Bool?
    let runtimeStatus: String
    let runtimeCaption: String
    let capacityStatus: String
    let accountCaption: String
    let accountTone: CapacityTone
    let hasCapacity: Bool
    let source: String?
    let message: String
    let summaryMessage: String?
    let stale: Bool
    let observedAt: Date?
    let cooldownUntil: Date?
    let models: [String]
    let sharedWindows: Bool
    let windows: [CapacityWindowPresentation]
    let balances: [CapacityBalancePresentation]
    let readiness: CapacityReadiness?
    let usage: CapacityUsagePresentation
}

private let capacityStaleMs: Double = 5 * 60 * 1000
private let hiddenCapacityMessages: Set<String> = [
    "quota reported", "routes ready", "no verified account quota",
    "account quota not reported", "account available"
]

private func finiteNumber(_ value: JSONValue) -> Double? {
    guard let number = value.number, number.isFinite, abs(number) <= 9_000_000_000_000_000 else { return nil }
    return number
}

private func clampPercent(_ value: Double) -> Double { min(100, max(0, value)) }

private func finitePercent(_ value: JSONValue) -> Double? {
    finiteNumber(value).map(clampPercent)
}

private func epochDate(_ value: JSONValue) -> Date? {
    guard let ms = finiteNumber(value) else { return nil }
    return Date(timeIntervalSince1970: ms / 1000)
}

private func formatPercent(_ value: Double) -> String {
    if value > 0 && value < 1 { return "<1" }
    if value > 99 && value < 100 { return ">99" }
    return "\(Int(value.rounded()))"
}

private func formatCount(_ value: Double) -> String {
    Int(value.rounded()).formatted()
}

private func safeLabel(_ value: JSONValue, fallback: String) -> String {
    var text = value.string
    if let regex = try? NSRegularExpression(pattern: "https?://\\S+", options: [.caseInsensitive]) {
        text = regex.stringByReplacingMatches(in: text, range: NSRange(text.startIndex..., in: text), withTemplate: "")
    }
    text = String(text.unicodeScalars.filter { $0.value >= 32 && $0.value != 127 }.map(Character.init))
    text = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if text.count > 48 { text = String(text.prefix(48)) }
    return text.nonempty ?? fallback
}

private func relativeTimestamp(_ date: Date, now: Date) -> String {
    let formatter = RelativeDateTimeFormatter()
    formatter.unitsStyle = .short
    return formatter.localizedString(for: date, relativeTo: now)
}

private func absoluteTimestamp(_ date: Date) -> String {
    date.formatted(date: .abbreviated, time: .shortened)
}

private func presentWindow(id: String, window: JSONValue, now: Date, forcedStale: Bool = false) -> CapacityWindowPresentation {
    let nowMs = now.timeIntervalSince1970 * 1000
    let label = safeLabel(window["label"], fallback: "Quota window")
    let used = finitePercent(window["usedPercent"])
    let remaining = finitePercent(window["remainingPercent"]) ?? used.map { clampPercent(100 - $0) }
    let observedAt = epochDate(window["observedAt"])
    let resetsAt = epochDate(window["resetsAt"])
    let windowMinutes = finiteNumber(window["windowMinutes"]).flatMap { $0 > 0 && $0.isFinite ? $0 : nil }
    let kind: CapacityWindowKind
    if let resetsAt, resetsAt.timeIntervalSince1970 * 1000 <= nowMs {
        kind = .reset
    } else if remaining == nil {
        kind = .unreported
    } else if forcedStale {
        kind = .stale
    } else if let observed = observedAt {
        let observedMs = observed.timeIntervalSince1970 * 1000
        if observedMs > nowMs || nowMs - observedMs > capacityStaleMs { kind = .stale }
        else if (remaining ?? 1) <= 0 { kind = .exhausted }
        else { kind = .reported }
    } else {
        kind = .stale
    }
    var caption = ""
    var accessibility = ""
    let meter: Double?
    switch kind {
    case .reset:
        meter = nil
        caption = "Window reset. New usage not yet reported."
        accessibility = caption
        if let resetsAt { accessibility += ". Reset \(relativeTimestamp(resetsAt, now: now))" }
    case .unreported:
        meter = nil
        caption = "Usage not reported."
        accessibility = caption
    case .stale:
        meter = remaining
        if let remaining {
            caption = "Last reported \(formatPercent(remaining))%. Reading is stale."
            accessibility = "Last reported \(formatPercent(remaining)) percent remaining, stale"
        } else {
            caption = "Last reading is stale. Remaining was not reported."
            accessibility = caption
        }
        if let observedAt { accessibility += ". Reported \(relativeTimestamp(observedAt, now: now))" }
        if let resetsAt { accessibility += ". Resets \(relativeTimestamp(resetsAt, now: now))" }
    case .exhausted:
        meter = 0
        caption = "Exhausted"
        accessibility = "Exhausted"
        if let resetsAt {
            caption += ". Resets \(relativeTimestamp(resetsAt, now: now))"
            accessibility += ". Resets \(relativeTimestamp(resetsAt, now: now))"
        } else {
            caption += ". Reset time not reported"
            accessibility += ". Reset time not reported"
        }
    case .reported:
        meter = remaining
        let percent = formatPercent(remaining ?? 0)
        caption = "\(percent)% remaining"
        accessibility = "\(percent) percent remaining"
        if let resetsAt { accessibility += ". Resets \(relativeTimestamp(resetsAt, now: now))" }
        if let observedAt { accessibility += ". Reported \(relativeTimestamp(observedAt, now: now))" }
    }
    let consumed = meter.map { clampPercent(100 - $0) }
    if let consumed {
        let percent = formatPercent(consumed)
        caption = kind == .exhausted ? "Quota exhausted" : "\(percent)% used"
        accessibility = "\(percent) percent used"
        if kind == .stale { caption += ". Reading is stale."; accessibility += ", stale" }
        if kind == .exhausted { accessibility += ", quota exhausted" }
        if let resetsAt { accessibility += ". Resets \(relativeTimestamp(resetsAt, now: now))" }
    }
    return CapacityWindowPresentation(
        id: id, label: label, kind: kind, remaining: kind == .reset ? nil : remaining, used: used,
        resetsAt: resetsAt, observedAt: observedAt, windowMinutes: windowMinutes, meter: consumed,
        caption: caption, accessibilityValue: accessibility
    )
}

private func presentBalance(id: String, balance: JSONValue) -> CapacityBalancePresentation {
    let label = safeLabel(balance["label"], fallback: "Balance")
    let used = finiteNumber(balance["used"])
    let remaining = finiteNumber(balance["remaining"])
    let limit = finiteNumber(balance["limit"]).flatMap { $0 > 0 ? $0 : nil }
    let unit = safeLabel(balance["unit"], fallback: "").nonempty ?? "units"
    let unitLabel = unit.lowercased() == "usd" ? "USD" : unit
    var parts: [String] = []
    if let remaining { parts.append("\(formatCount(remaining)) remaining") } else { parts.append("Remaining not reported") }
    if let used { parts.append("\(formatCount(used)) used") } else { parts.append("Used not reported") }
    if let limit { parts.append("limit \(formatCount(limit)) \(unitLabel)") } else { parts.append("limit not reported") }
    let caption = parts.joined(separator: " · ")
    var meter: Double?
    if let remaining, let limit { meter = clampPercent(100 * remaining / limit) }
    else if let used, let limit { meter = clampPercent(100 * (1 - used / limit)) }
    var accessibility = caption
    if remaining == nil && used == nil { accessibility = "Balance values not reported" }
    return CapacityBalancePresentation(id: id, label: label, caption: caption, meter: meter, accessibilityValue: accessibility)
}

private func presentUsage(_ usage: JSONValue) -> CapacityUsagePresentation {
    if usage == .null {
        return CapacityUsagePresentation(
            present: false, attempts: 0, completed: 0, failed: 0, tokenCaption: nil, tokenTotalCaption: nil,
            costCaption: "Cost not measured", unmeasuredTokens: 0, unmeasuredCost: 0
        )
    }
    let attempts = Int((finiteNumber(usage["attempts"]) ?? 0).rounded())
    let completed = Int((finiteNumber(usage["completed"]) ?? 0).rounded())
    let failed = Int((finiteNumber(usage["failed"]) ?? 0).rounded())
    let input = finiteNumber(usage["input_tokens"])
    let output = finiteNumber(usage["output_tokens"])
    var tokenCaption: String?
    var tokenTotalCaption: String?
    if let input, let output {
        tokenCaption = "\(formatCount(input)) input tokens · \(formatCount(output)) output tokens"
        tokenTotalCaption = "\(formatCount(input + output)) tokens"
    } else if let input {
        tokenCaption = "\(formatCount(input)) input tokens · output not measured"
        tokenTotalCaption = "\(formatCount(input)) tokens"
    } else if let output {
        tokenCaption = "Input not measured · \(formatCount(output)) output tokens"
        tokenTotalCaption = "\(formatCount(output)) tokens"
    }
    let costCaption: String
    if let cost = finiteNumber(usage["measured_cost_usd"]) {
        costCaption = "Measured cost $\(cost.formatted(.number.precision(.fractionLength(2))))"
    } else {
        costCaption = "Cost not measured"
    }
    return CapacityUsagePresentation(
        present: true, attempts: attempts, completed: completed, failed: failed,
        tokenCaption: tokenCaption, tokenTotalCaption: tokenTotalCaption, costCaption: costCaption,
        unmeasuredTokens: Int((finiteNumber(usage["unmeasured_token_attempts"]) ?? 0).rounded()),
        unmeasuredCost: Int((finiteNumber(usage["unmeasured_cost_attempts"]) ?? 0).rounded())
    )
}

private func mergedUsage(_ rows: [JSONValue], provider: String) -> JSONValue {
    let matches = rows.filter { $0["provider"].string == provider }
    if matches.isEmpty { return .null }
    if matches.count == 1 { return matches[0] }
    func sum(_ key: String, nullable: Bool) -> JSONValue {
        var total = 0.0, any = false
        for row in matches {
            if let value = finiteNumber(row[key]) { total += value; any = true }
        }
        if nullable && !any { return .null }
        return .number(total)
    }
    return .object([
        "provider": .string(provider),
        "attempts": sum("attempts", nullable: false),
        "completed": sum("completed", nullable: false),
        "failed": sum("failed", nullable: false),
        "input_tokens": sum("input_tokens", nullable: true),
        "output_tokens": sum("output_tokens", nullable: true),
        "measured_cost_usd": sum("measured_cost_usd", nullable: true),
        "unmeasured_token_attempts": sum("unmeasured_token_attempts", nullable: false),
        "unmeasured_cost_attempts": sum("unmeasured_cost_attempts", nullable: false)
    ])
}

private func presentProvider(_ provider: JSONValue, usage: JSONValue, now: Date) -> CapacityProviderPresentation {
    let id = provider["id"].string.nonempty ?? "provider"
    let label = safeLabel(provider["label"], fallback: id)
    let billing = safeLabel(provider["billing"], fallback: "unknown").nonempty ?? "unknown"
    let freeRouting = billing == "free" || id == "freerouter"
    let enabledValue = provider.object["enabled"]
    let runtimeEnabled: Bool? = enabledValue == nil ? nil : enabledValue?.bool
    let runtimeStatus = safeLabel(provider["status"], fallback: "unknown")
    let runtimeCaption = runtimeEnabled == false ? "disabled" : runtimeStatus
    let capacity = provider["capacity"]
    let hasCapacity = !capacity.object.isEmpty
    let windowsRaw = hasCapacity ? capacity["windows"].array : provider["allowances"].array
    let windows = windowsRaw.enumerated().map { index, value in
        presentWindow(id: value["id"].string.nonempty ?? "\(id)-window-\(index)", window: value, now: now, forcedStale: capacity["stale"].bool || capacity["status"].string == "error")
    }
    let balances = (hasCapacity ? capacity["balances"].array : []).enumerated().map { index, value in
        presentBalance(id: value["id"].string.nonempty ?? "\(id)-balance-\(index)", balance: value)
    }
    var readiness: CapacityReadiness?
    if hasCapacity, !capacity["readiness"].object.isEmpty {
        let ready = Int((finiteNumber(capacity["readiness"]["ready"]) ?? 0).rounded())
        let total = Int((finiteNumber(capacity["readiness"]["total"]) ?? 0).rounded())
        let cooling = Int((finiteNumber(capacity["readiness"]["coolingDown"]) ?? 0).rounded())
        if total > 0 || ready > 0 { readiness = CapacityReadiness(ready: max(0, ready), total: max(0, total), coolingDown: max(0, cooling)) }
    }
    let capacityStatus = hasCapacity ? safeLabel(capacity["status"], fallback: "unknown") : "not reported"
    let stale = (hasCapacity && capacity["stale"].bool) || windows.contains { $0.kind == .stale || $0.kind == .reset }
    let hasWindowState = windows.contains { $0.kind != .unreported }
    let accountCaption: String
    let accountTone: CapacityTone
    if capacityStatus == "error" {
        accountCaption = "Account error"
        accountTone = .error
    } else if hasWindowState || readiness != nil {
        accountCaption = ""
        accountTone = stale ? .stale : .ok
    } else if freeRouting {
        accountCaption = ""
        accountTone = .muted
    } else {
        accountCaption = "Quota not reported"
        accountTone = .muted
    }
    let source = hasCapacity ? safeLabel(capacity["source"], fallback: "").nonempty : (windowsRaw.isEmpty ? nil : "Session allowances")
    let message = hasCapacity ? safeLabel(capacity["message"], fallback: "") : ""
    let summary: String?
    if accountTone == .error {
        summary = message.nonempty
    } else if hiddenCapacityMessages.contains(message.lowercased()) || message.isEmpty {
        summary = nil
    } else {
        summary = message
    }
    let models = provider["models"].array.map { safeLabel($0["label"].string.isEmpty ? $0["id"] : $0["label"], fallback: $0["id"].string) }.filter { !$0.isEmpty }
    let cooldownUntil = epochDate(provider["cooldownUntil"]).flatMap { $0.timeIntervalSince1970 > 0 ? $0 : nil }
    return CapacityProviderPresentation(
        id: id, label: label, billing: billing, freeRouting: freeRouting, runtimeEnabled: runtimeEnabled,
        runtimeStatus: runtimeStatus, runtimeCaption: runtimeCaption, capacityStatus: capacityStatus,
        accountCaption: accountCaption, accountTone: accountTone, hasCapacity: hasCapacity, source: source,
        message: message, summaryMessage: summary, stale: stale,
        observedAt: hasCapacity ? epochDate(capacity["observedAt"]) : windows.compactMap(\.observedAt).max(),
        cooldownUntil: cooldownUntil, models: models, sharedWindows: models.count > 1 && !windows.isEmpty,
        windows: windows, balances: balances, readiness: readiness, usage: presentUsage(usage)
    )
}
