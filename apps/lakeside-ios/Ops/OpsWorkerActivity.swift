import SwiftUI
import LakesideCore

/// Compact public activity inspector for one worker. Parent embeds this in worker detail.
struct OpsWorkerActivity: View {
    let workerID: String
    var initialContent: String = ""
    var subagentID: String? = nil

    @EnvironmentObject private var session: AppSession
    @EnvironmentObject private var workspace: OpsWorkspaceModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var open = false
    @State private var visible = false
    @State private var entries: [WorkerActivityItem] = []
    @State private var content = ""
    @State private var revision = ""
    @State private var saved = false
    @State private var stale = false
    @State private var truncated = false
    @State private var updateCount = 0
    @State private var observedAt: Date?
    @State private var error: String?
    @State private var search = ""
    @State private var expandedIDs: Set<String> = []
    @State private var showEarlier = false
    @State private var refresh = 0
    @State private var loading = false
    @FocusState private var searchFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button { open.toggle() } label: {
                HStack(spacing: 8) {
                    Image(systemName: open ? "chevron.down" : "chevron.right")
                    Text(headerTitle)
                    Spacer()
                    if stale { Text("Stale").font(.caption2).foregroundStyle(.secondary).accessibilityIdentifier("ops-worker-activity-stale") }
                    if saved { Text("Saved").font(.caption2).foregroundStyle(OpsTheme.mint) }
                    if loading { ProgressView().controlSize(.small) }
                }
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
                .frame(minHeight: 32).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("ops-worker-activity-toggle")
            .accessibilityValue(open ? "Expanded" : "Collapsed")

            if open {
                if let error {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(error).font(.caption).foregroundStyle(.orange)
                        Button("Retry") { refresh += 1 }
                            .accessibilityIdentifier("ops-worker-activity-retry")
                    }
                }
                if !entries.isEmpty {
                    TextField("Search activity", text: $search)
                        .font(.callout)
                        .textFieldStyle(.roundedBorder)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .focused($searchFocused)
                        .submitLabel(.done)
                        .onSubmit { searchFocused = false }
                        .accessibilityIdentifier("ops-worker-activity-search")
                }
                if hiddenCount > 0 {
                    Button("Show earlier (\(hiddenCount))") { showEarlier = true }
                        .font(.caption)
                        .accessibilityIdentifier("ops-worker-activity-earlier")
                }
                if visibleItems.isEmpty && error == nil && !loading {
                    Text(emptyMessage).font(.caption).foregroundStyle(.secondary)
                }
                ForEach(visibleItems) { item in
                    WorkerActivityRow(item: item, expanded: expansionBinding(item.id), live: !saved && !stale && workspace.connected)
                        .accessibilityIdentifier("ops-worker-activity-entry-\(item.id)")
                }
                if entries.isEmpty && !content.isEmpty {
                    NativeMarkdown(text: content)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityIdentifier("ops-worker-activity-content")
                }
                HStack {
                    if truncated { Text("Truncated").font(.caption2).foregroundStyle(.secondary) }
                    if let observedAt {
                        Text("Updated \(observedAt.formatted(date: .omitted, time: .shortened))")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("Refresh") { refresh += 1 }
                        .disabled(loading)
                        .accessibilityIdentifier("ops-worker-activity-refresh")
                    Button {
                        UIPasteboard.general.string = copyText
                    } label: {
                        Image(systemName: "doc.on.doc")
                    }
                    .disabled(copyText.isEmpty)
                    .accessibilityLabel("Copy worker activity")
                    .accessibilityIdentifier("ops-worker-activity-copy")
                }
                .buttonStyle(.borderless)
                .font(.caption)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .onAppear {
            visible = true
            if content.isEmpty { content = initialContent }
        }
        .onDisappear { visible = false }
        .onChange(of: activityIdentity) { _, _ in reset(seed: initialContent) }
        .task(id: pollKey) {
            guard open, visible, scenePhase == .active, !workerID.isEmpty else { return }
            await poll()
        }
    }

    private var activityIdentity: String { "\(workerID)/\(subagentID ?? "")" }

    private var pollKey: String { "\(activityIdentity)-\(open)-\(visible)-\(scenePhase == .active)-\(refresh)" }

    private var headerTitle: String {
        if updateCount > 0 { return "Activity · \(updateCount)" }
        if !entries.isEmpty { return "Activity · \(entries.count)" }
        return "Activity"
    }

    private var emptyMessage: String {
        if !search.isEmpty { return "No matching activity" }
        return "No activity reported yet."
    }

    private var hiddenCount: Int {
        guard search.isEmpty, !showEarlier, entries.count > WorkerActivityLimits.initialVisible else { return 0 }
        return entries.count - WorkerActivityLimits.initialVisible
    }

    private var visibleItems: [WorkerActivityItem] {
        let source: [WorkerActivityItem]
        if search.isEmpty {
            source = hiddenCount > 0 ? Array(entries.suffix(WorkerActivityLimits.initialVisible)) : entries
        } else {
            source = entries.filter { $0.searchable.localizedCaseInsensitiveContains(search) }
        }
        return source
    }

    private var copyText: String {
        if !entries.isEmpty {
            return entries.map { item in
                var lines = [item.title]
                if !item.role.isEmpty { lines.insert(item.role, at: 0) }
                if !item.body.isEmpty { lines.append(item.body) }
                return lines.joined(separator: "\n")
            }.joined(separator: "\n\n")
        }
        return content
    }

    private func expansionBinding(_ id: String) -> Binding<Bool> {
        Binding(
            get: { expandedIDs.contains(id) },
            set: { isOpen in
                if isOpen { expandedIDs.insert(id) } else { expandedIDs.remove(id) }
            }
        )
    }

    private func reset(seed: String) {
        entries = []
        content = seed
        revision = ""
        saved = false
        stale = false
        truncated = false
        updateCount = 0
        observedAt = nil
        error = nil
        search = ""
        expandedIDs = []
        showEarlier = false
    }

    private func poll() async {
        var delay: Double = 3
        var failures = 0
        while !Task.isCancelled {
            do {
                loading = true
                var query: [String: String] = [:]
                if !revision.isEmpty { query["after"] = revision }
                let base = try opsWorkerPath(workerID)
                let path: String
                if let subagentID {
                    path = "\(base)/subagents/\(try opsSafePathID(subagentID))/activity"
                } else {
                    path = "\(base)/activity"
                }
                let result = try await session.get(path, query: query)
                try Task.checkCancellation()
                apply(result)
                error = nil
                loading = false
                failures = 0
                delay = 3
                if saved { return }
                try await Task.sleep(for: .seconds(delay))
            } catch is CancellationError {
                loading = false
                return
            } catch {
                loading = false
                if Task.isCancelled { return }
                if let url = error as? URLError, url.code == .cancelled { return }
                self.error = error.localizedDescription
                stale = true
                if saved { return }
                if isTransient(error) {
                    failures += 1
                    delay = min(WorkerActivityLimits.maxBackoff, pow(2.0, Double(min(failures, 5))))
                    do { try await Task.sleep(for: .seconds(delay)) } catch { return }
                    continue
                }
                return
            }
        }
    }

    private func apply(_ result: JSONValue) {
        let unchanged = result["unchanged"].bool
        saved = result["saved"].bool
        stale = result["stale"].bool
        truncated = result["truncated"].bool
        if let count = result["updateCount"].number { updateCount = boundedActivityInt(count) }
        if let observed = result["observedAt"].number, observed > 0 {
            observedAt = Date(timeIntervalSince1970: observed / 1000)
        } else if result["observedAt"] == .null {
            observedAt = nil
        }
        if unchanged { return }
        let nextRevision = result["revision"].string
        if !nextRevision.isEmpty { revision = nextRevision }
        let parsed = Array(parseActivityEntries(result["entries"]).suffix(WorkerActivityLimits.backendMax))
        if parsed != entries {
            entries = parsed
        }
        let nextContent = result["content"].string
        if result["content"] != .null, nextContent != content {
            content = nextContent
        }
    }
}

private enum WorkerActivityLimits {
    static let initialVisible = 30
    static let backendMax = 100
    static let maxBackoff: Double = 30
}

private struct WorkerActivityItem: Identifiable, Equatable {
    let id: String
    let kind: String
    let role: String
    let title: String
    let body: String
    let state: String?

    var searchable: String { [kind, role, title, body, state ?? ""].joined(separator: "\n") }
}

private struct WorkerActivityRow: View {
    let item: WorkerActivityItem
    @Binding var expanded: Bool
    let live: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 8) {
                OpsActivityMark(state: item.state == "running" && !live ? "recorded" : item.state ?? "recorded", size: 22, activity: item.title)
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title).font(.caption.weight(.medium)).foregroundStyle(OpsTheme.ink)
                    if !item.role.isEmpty {
                        Text(item.role).font(.caption2).foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 4)
                if let state = item.state, !state.isEmpty {
                    Text(state.replacingOccurrences(of: "_", with: " ").capitalized)
                        .font(.caption2)
                        .foregroundStyle(color)
                }
            }
            if item.kind == "tool" {
                if !item.body.isEmpty {
                    DisclosureGroup(isExpanded: $expanded) {
                        activityBody(item.body)
                    } label: {
                        Text(expanded ? "Hide output" : "Show output").font(.caption2)
                            .frame(maxWidth: .infinity, minHeight: 28, alignment: .leading).contentShape(Rectangle())
                    }
                }
            } else if !item.body.isEmpty {
                if item.kind == "status" && item.body.count < 140 {
                    Text(item.body).font(.caption).foregroundStyle(.secondary).textSelection(.enabled)
                } else {
                    NativeMarkdown(text: item.body)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private var icon: String {
        switch item.kind {
        case "tool": return item.state == "failed" ? "exclamationmark.circle" : "wrench.and.screwdriver"
        case "message": return "text.bubble"
        default: return "circle"
        }
    }

    private var color: Color {
        switch item.state {
        case "failed": return .orange
        case "completed", "saved": return OpsTheme.mint
        default: return .secondary
        }
    }

    @ViewBuilder
    private func activityBody(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Output").font(.caption2.weight(.semibold))
                Spacer()
                Button { UIPasteboard.general.string = text } label: { Image(systemName: "doc.on.doc") }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Copy output")
            }
            NativeMarkdown(text: text)
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
        }
        .padding(8)
        .background(OpsTheme.raised.opacity(0.65), in: RoundedRectangle(cornerRadius: 8))
    }
}

private func parseActivityEntries(_ value: JSONValue) -> [WorkerActivityItem] {
    value.array.enumerated().compactMap { index, row in
        let title = row["title"].string
        let body = row["body"].string
        if title.isEmpty && body.isEmpty { return nil }
        let kind = row["kind"].string
        let resolved = ["message", "tool", "status"].contains(kind) ? kind : "status"
        return WorkerActivityItem(
            id: row["id"].string.nonempty ?? "entry-\(index)",
            kind: resolved,
            role: row["role"].string,
            title: title.nonempty ?? (resolved == "tool" ? "Tool" : resolved.capitalized),
            body: body,
            state: row["state"].string.nonempty
        )
    }
}

private func boundedActivityInt(_ value: Double) -> Int {
    guard value.isFinite else { return 0 }
    if value >= Double(Int.max) { return Int.max }
    if value <= Double(Int.min) { return Int.min }
    return Int(value.rounded())
}

private func isTransient(_ error: Error) -> Bool {
    if let failure = error as? AppFailure, let code = failure.statusCode {
        return code >= 500 || code == 408 || code == 429
    }
    guard let url = error as? URLError else { return false }
    switch url.code {
    case .timedOut, .networkConnectionLost, .notConnectedToInternet, .cannotConnectToHost,
            .cannotFindHost, .dnsLookupFailed, .dataNotAllowed, .internationalRoamingOff,
            .secureConnectionFailed, .cannotLoadFromNetwork:
        return true
    default:
        return false
    }
}
