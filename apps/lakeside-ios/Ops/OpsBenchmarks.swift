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
    @State private var error: String?
    @State private var busy = false
    @State private var refresh = 0
    @State private var requestID = UUID().uuidString
    private var running: Bool { runs.contains { ["queued", "running"].contains($0["status"].string) } }
    var body: some View {
        List {
            Section {
                Text("Measure before routing").font(.title2.weight(.semibold))
                Text("Compare answer accuracy and response time on the same small text tests. These are provisional signals, not a full coding or tool benchmark. Routing uses matching results from the last 14 days.").font(.caption).foregroundStyle(.secondary)
            }.listRowBackground(Color.clear)
            Section("Run a comparison") {
                Picker("Provider", selection: $provider) {
                    Text("All available providers").tag("all")
                    ForEach(providers, id: \.["id"].string) { Text($0["label"].string).tag($0["id"].string) }
                }.onChange(of: provider) { _, _ in selectedModel = "" }
                if provider != "all" {
                    Picker("Model", selection: $selectedModel) {
                        Text("Provider default").tag("")
                        ForEach(providers.first { $0["id"].string == provider }?["models"].array ?? [], id: \.["id"].string) { Text($0.first("label", "name", "id")).tag($0["id"].string) }
                    }
                }
                Picker("Tests", selection: $suite) { Text("Analysis").tag("analysis"); Text("Code reasoning").tag("coding") }
                Picker("Effort", selection: $effort) { Text("Low").tag("low"); Text("Medium").tag("medium"); Text("High").tag("high") }
                Button(running ? "Benchmark running" : "Benchmark providers") { Task { await start() } }.disabled(busy || running)
                Text("Uses your connected subscriptions and Free Router. Providers run one at a time, with a fixed timeout and automatic session cleanup.").font(.caption).foregroundStyle(.secondary)
            }
            Section("Measured results") {
                if scores.isEmpty { Text("No measurements yet").foregroundStyle(.secondary) }
                ForEach(Array(scores.enumerated()), id: \.offset) { _, score in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack { Text(score["provider"].string.capitalized).font(.headline); Spacer(); Text(score["suite"].string.capitalized).font(.caption).foregroundStyle(.secondary) }
                        Text(score["model"].string).font(.caption).foregroundStyle(.secondary)
                        let passed = score["passed"].number ?? 0
                        let checks = score["checks"].number ?? 0
                        ProgressView(value: passed, total: max(1, checks)).tint(OpsTheme.mint)
                        Text("\(Int(passed))/\(Int(checks)) checks · \(score["samples"].string) runs · \(score["effort"].string) effort").font(.caption)
                        if let latency = score["latency_ms"].number { Text("Mean response: \((latency / 1000).formatted(.number.precision(.fractionLength(1)))) seconds").font(.caption).foregroundStyle(.secondary) }
                    }.padding(.vertical, 8)
                }
            }
            Section("Recent runs") {
                ForEach(runs, id: \.["id"].string) { run in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack { Text(run["provider"].string.capitalized); Spacer(); OpsStatus(value: run["status"].string) }
                        Text("\(run["suite"].string.capitalized) · \(run["effort"].string) effort").font(.caption).foregroundStyle(.secondary)
                        if !run["resolved_model"].string.isEmpty { Text(run["resolved_model"].string).font(.caption2).foregroundStyle(.secondary) }
                        if !run["error"].string.isEmpty { Text(run["error"].string).font(.caption).foregroundStyle(.orange) }
                        if run["cleanup_status"].string == "failed" { Button("Retry cleanup") { Task {
                            do { _ = try await session.post("/api/ops/benchmarks/cleanup", [:]); refresh += 1 }
                            catch { self.error = error.localizedDescription }
                        } } }
                    }.padding(.vertical, 5)
                }
            }
            if let error { Text(error).foregroundStyle(.orange) }
        }.opsScreen().navigationTitle("Benchmarks").navigationBarTitleDisplayMode(.inline)
            .task { do { providers = try await session.get("/api/ops/providers")["providers"].array } catch { self.error = error.localizedDescription } }
            .task(id: "\(phase == .active)-\(refresh)") {
                guard phase == .active else { return }
                repeat {
                    do { apply(try await session.get("/api/ops/benchmarks")); if !running { return }; try await Task.sleep(for: .seconds(3)) }
                    catch { if !Task.isCancelled { self.error = error.localizedDescription }; return }
                } while !Task.isCancelled
            }.refreshable { refresh += 1 }
    }
    private func apply(_ result: JSONValue) { scores = result["scores"].array; runs = result["runs"].array }
    private func start() async {
        busy = true; defer { busy = false }
        do {
            var body: [String: JSONValue] = ["requestId": .string(requestID), "provider": .string(provider), "suite": .string(suite), "effort": .string(effort)]
            if !selectedModel.isEmpty { body["model"] = .string(selectedModel) }
            apply(try await session.post("/api/ops/benchmarks", body)); requestID = UUID().uuidString; error = nil; refresh += 1
        } catch { self.error = error.localizedDescription }
    }
}
