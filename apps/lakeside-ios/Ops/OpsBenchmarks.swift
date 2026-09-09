import SwiftUI
import LakesideCore

struct OpsBenchmarks: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.scenePhase) private var phase
    @State private var scores: [JSONValue] = []
    @State private var runs: [JSONValue] = []
    @State private var providers: [JSONValue] = []
    @State private var provider = "all"
    @State private var selectedModel = ""
    @State private var suite = "analysis"
    @State private var effort = "low"
    @State private var samples = 3
    @State private var error: String?
    @State private var busy = false
    @State private var refresh = 0
    @State private var requestID = UUID().uuidString
    @State private var submitted: BenchmarkRequest?

    private var currentRequest: BenchmarkRequest {
        BenchmarkRequest(provider: provider, model: selectedModel, suite: suite, effort: effort, samples: samples)
    }
    private var active: Bool { runs.contains { BenchmarkRunStatus.active.contains($0["status"].string) } }
    private var cancelling: Bool { runs.contains { $0["status"].string == "cancelling" } }
    private var activeBatchIDs: [String] {
        var seen = Set<String>()
        return runs.compactMap { run -> String? in
            guard BenchmarkRunStatus.active.contains(run["status"].string) else { return nil }
            guard let id = pathID(run["batch_id"].string) else { return nil }
            return seen.insert(id).inserted ? id : nil
        }
    }
    private var startTitle: String {
        if cancelling { return "Cancelling" }
        if active { return "Benchmark running" }
        if busy { return "Starting" }
        if submitted != nil { return "Retry benchmark" }
        return "Benchmark providers"
    }

    var body: some View {
        List {
            Section {
                Text("Measure before routing").font(.headline)
                Text("Small text probes of answer accuracy and latency. Not a coding or tool-use benchmark. Routing uses matching results from the last 14 days.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            .listRowBackground(Color.clear)
            .accessibilityIdentifier("ops-benchmark-scope")

            Section("Run a comparison") {
                Picker("Provider", selection: $provider) {
                    Text("All available providers").tag("all")
                    ForEach(providers, id: \.["id"].string) { Text($0["label"].string).tag($0["id"].string) }
                }
                .disabled(busy)
                .accessibilityIdentifier("ops-benchmark-provider")
                .onChange(of: provider) { _, _ in selectedModel = "" }

                if provider != "all" {
                    Picker("Model", selection: $selectedModel) {
                        Text("Provider default").tag("")
                        ForEach(providers.first { $0["id"].string == provider }?["models"].array ?? [], id: \.["id"].string) {
                            Text($0.first("label", "name", "id")).tag($0["id"].string)
                        }
                    }
                    .disabled(busy)
                    .accessibilityIdentifier("ops-benchmark-model")
                }

                Picker("Tests", selection: $suite) {
                    Text("Analysis").tag("analysis")
                    Text("Code reasoning").tag("coding")
                }
                .disabled(busy)
                .accessibilityIdentifier("ops-benchmark-suite")

                Picker("Effort", selection: $effort) {
                    Text("Low").tag("low")
                    Text("Medium").tag("medium")
                    Text("High").tag("high")
                }
                .disabled(busy)
                .accessibilityIdentifier("ops-benchmark-effort")

                Picker("Repeats", selection: $samples) {
                    ForEach(1...5, id: \.self) { count in
                        Text(count == 1 ? "1 sample" : "\(count) samples").tag(count)
                    }
                }
                .disabled(busy)
                .accessibilityIdentifier("ops-benchmark-samples")

                Button(startTitle) { Task { await start() } }
                    .disabled(busy || active)
                    .accessibilityIdentifier("ops-benchmark-start")

                if !activeBatchIDs.isEmpty {
                    Button(cancelling ? "Cancelling comparison" : "Cancel comparison", role: .destructive) {
                        Task { await cancelActive() }
                    }
                    .disabled(busy || cancelling)
                    .accessibilityIdentifier("ops-benchmark-cancel")
                }

                Text("Uses your connected subscriptions and Free Router. Providers run one at a time, with a fixed timeout and automatic session cleanup.")
                    .font(.caption).foregroundStyle(.secondary)
            }

            Section("Measured results") {
                if scores.isEmpty { Text("No measurements yet").foregroundStyle(.secondary) }
                ForEach(scoreItems) { item in
                    BenchmarkScoreRow(score: item.value)
                        .padding(.vertical, 6)
                        .accessibilityIdentifier("ops-benchmark-score-\(item.value["provider"].string)")
                }
            }

            Section("Recent runs") {
                ForEach(runs, id: \.["id"].string) { run in
                    BenchmarkRunRow(run: run, busy: busy) {
                        Task {
                            do {
                                _ = try await session.post("/api/ops/benchmarks/cleanup", [:])
                                refresh += 1
                            } catch { self.error = error.localizedDescription }
                        }
                    }
                    .padding(.vertical, 4)
                    .accessibilityIdentifier("ops-benchmark-run-\(run["id"].string)")
                }
            }

            if let error { Text(error).foregroundStyle(.orange).accessibilityIdentifier("ops-benchmark-error") }
        }
        .opsScreen()
        .navigationTitle("Benchmarks")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("ops-benchmarks")
        .task {
            do { providers = try await session.get("/api/ops/providers")["providers"].array }
            catch { self.error = error.localizedDescription }
        }
        .task(id: "\(phase == .active)-\(refresh)") {
            guard phase == .active else { return }
            repeat {
                do {
                    apply(try await session.get("/api/ops/benchmarks"))
                    if !active { return }
                    try await Task.sleep(for: .seconds(3))
                } catch {
                    if !Task.isCancelled { self.error = error.localizedDescription }
                    return
                }
            } while !Task.isCancelled
        }
        .refreshable { refresh += 1 }
    }

    private var scoreItems: [BenchmarkScoreItem] {
        scores.enumerated().map { index, value in
            let id = [
                value["provider"].string,
                value["model"].string,
                value["suite"].string,
                value["effort"].string,
                value["suite_version"].string,
                "\(index)"
            ].joined(separator: "|")
            return BenchmarkScoreItem(id: id, value: value)
        }
    }

    private func apply(_ result: JSONValue) {
        scores = result["scores"].array
        runs = result["runs"].array
    }

    private func start() async {
        let payload = currentRequest
        if submitted != payload {
            requestID = UUID().uuidString
        }
        submitted = payload
        busy = true
        defer { busy = false }
        var body: [String: JSONValue] = [
            "requestId": .string(requestID),
            "provider": .string(payload.provider),
            "suite": .string(payload.suite),
            "effort": .string(payload.effort),
            "samples": .number(Double(payload.samples))
        ]
        if !payload.model.isEmpty { body["model"] = .string(payload.model) }
        do {
            apply(try await session.post("/api/ops/benchmarks", body))
            requestID = UUID().uuidString
            submitted = nil
            error = nil
            refresh += 1
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func cancelActive() async {
        let ids = activeBatchIDs
        guard !ids.isEmpty else { return }
        busy = true
        defer { busy = false }
        do {
            for id in ids {
                _ = try await session.post("/api/ops/benchmarks/\(id)/cancel", [:])
            }
            error = nil
            refresh += 1
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct BenchmarkRequest: Equatable {
    var provider: String
    var model: String
    var suite: String
    var effort: String
    var samples: Int
}

private struct BenchmarkScoreItem: Identifiable {
    let id: String
    let value: JSONValue
}

private enum BenchmarkRunStatus {
    static let active: Set<String> = ["queued", "running", "cancelling"]
}

private struct BenchmarkScoreRow: View {
    let score: JSONValue

    var body: some View {
        let passed = boundedInt(score["passed"].number ?? 0)
        let checks = boundedInt(score["checks"].number ?? 0)
        let sampleCount = boundedInt(score["samples"].number ?? 0)
        let confidence = confidenceLabel(score["confidence"].string)
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(score["provider"].string.capitalized).font(.headline)
                Spacer()
                Text(score["suite"].string.capitalized).font(.caption).foregroundStyle(.secondary)
            }
            if !score["model"].string.isEmpty {
                Text(score["model"].string).font(.caption).foregroundStyle(.secondary)
            }
            if !resolvedModels.isEmpty {
                Text(resolvedModels.joined(separator: ", ")).font(.caption2).foregroundStyle(.secondary)
            }
            ProgressView(value: Double(passed), total: Double(max(1, checks))).tint(OpsTheme.mint)
            Text(resultLine(passed: passed, checks: checks, samples: sampleCount, confidence: confidence, effort: score["effort"].string))
                .font(.caption)
            if let band = accuracyBand {
                Text("Accuracy \(band)").font(.caption).foregroundStyle(.secondary)
            }
            if let latency = latencyLine {
                Text(latency).font(.caption).foregroundStyle(.secondary)
            }
            if let failures = score["failures"].number, boundedInt(failures) > 0 {
                Text("\(boundedInt(failures)) failed").font(.caption).foregroundStyle(.orange)
            }
            if !score["suite_version"].string.isEmpty {
                Text("Suite \(score["suite_version"].string)").font(.caption2).foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var resolvedModels: [String] {
        score["resolved_models"].array.compactMap { $0.string.nonempty }
    }

    private var accuracyBand: String? {
        guard let lower = unitInterval(score["accuracy_lower"]), let upper = unitInterval(score["accuracy_upper"]) else { return nil }
        return "\(percentText(lower)) to \(percentText(upper))"
    }

    private var latencyLine: String? {
        let median = score["median_latency_ms"].number
        let p95 = score["p95_latency_ms"].number
        if let median, let p95 {
            return "Median \(secondsText(median)) · p95 \(secondsText(p95))"
        }
        if let median { return "Median \(secondsText(median))" }
        if let p95 { return "p95 \(secondsText(p95))" }
        if let mean = score["latency_ms"].number { return "Mean \(secondsText(mean))" }
        return nil
    }

    private func resultLine(passed: Int, checks: Int, samples: Int, confidence: String, effort: String) -> String {
        var parts = ["\(passed)/\(checks) checks"]
        if !confidence.isEmpty { parts.append(confidence.lowercased()) }
        if samples > 0 { parts.append(samples == 1 ? "1 sample" : "\(samples) samples") }
        else if !score["samples"].string.isEmpty { parts.append("\(score["samples"].string) runs") }
        if !effort.isEmpty { parts.append("\(effort) effort") }
        return parts.joined(separator: " · ")
    }
}

private struct BenchmarkRunRow: View {
    let run: JSONValue
    let busy: Bool
    let retryCleanup: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(run["provider"].string.capitalized)
                Spacer()
                OpsStatus(value: run["status"].string)
            }
            Text("\(run["suite"].string.capitalized) · \(run["effort"].string) effort").font(.caption).foregroundStyle(.secondary)
            if !run["resolved_model"].string.isEmpty {
                Text(run["resolved_model"].string).font(.caption2).foregroundStyle(.secondary)
            }
            if !run["batch_id"].string.isEmpty {
                Text("Batch \(run["batch_id"].string)").font(.caption2).foregroundStyle(.secondary)
            }
            if !run["error"].string.isEmpty {
                Text(run["error"].string).font(.caption).foregroundStyle(.orange)
            }
            if run["cleanup_status"].string == "failed" {
                Button("Retry cleanup") { retryCleanup() }
                    .disabled(busy)
                    .accessibilityIdentifier("ops-benchmark-cleanup-\(run["id"].string)")
            }
        }
    }
}

private func pathID(_ value: String) -> String? {
    let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty, !text.contains("/"), !text.contains("\\"), text != ".", text != ".." else { return nil }
    return text
}

private func boundedInt(_ value: Double) -> Int {
    guard value.isFinite else { return 0 }
    if value >= Double(Int.max) { return Int.max }
    if value <= Double(Int.min) { return Int.min }
    return Int(value.rounded())
}

private func unitInterval(_ value: JSONValue) -> Double? {
    guard let number = value.number, number.isFinite else { return nil }
    return min(1, max(0, number))
}

private func confidenceLabel(_ raw: String) -> String {
    switch raw.lowercased() {
    case "insufficient": return "Insufficient"
    case "provisional": return "Provisional"
    case "established": return "Established"
    case "": return ""
    default: return "Unspecified"
    }
}

private func percentText(_ value: Double) -> String {
    let percent = value * 100
    if abs(percent - percent.rounded()) < 0.05 { return "\(boundedInt(percent))%" }
    return percent.formatted(.number.precision(.fractionLength(1))) + "%"
}

private func secondsText(_ ms: Double) -> String {
    guard ms.isFinite else { return "n/a" }
    return (ms / 1000).formatted(.number.precision(.fractionLength(1))) + "s"
}
