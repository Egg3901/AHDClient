import SwiftUI
import LakesideCore

/// IDs are supplied by the service. URLComponents encodes path characters later;
/// reject separators here so an ID can never change the endpoint being requested.
func opsSafePathID(_ value: String) throws -> String {
    guard !value.isEmpty, value != ".", value != "..", value.count <= 512,
          !value.contains("/"), !value.contains("\\"),
          value.rangeOfCharacter(from: .controlCharacters) == nil else {
        throw URLError(.badURL)
    }
    return value
}

func opsWorkerPath(_ workerID: String) throws -> String {
    "/api/ops/workers/\(try opsSafePathID(workerID))"
}

struct OpsSubagents: View {
    let workerID: String
    @EnvironmentObject private var session: AppSession
    @Environment(\.scenePhase) private var scenePhase
    @State private var expanded = false
    @State private var visible = false
    @State private var rows: [JSONValue] = []
    @State private var saved = false
    @State private var stale = false
    @State private var loading = false
    @State private var error: String?
    @State private var refresh = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button { expanded.toggle() } label: {
                HStack {
                    Text(rows.isEmpty ? "Provider subagents" : "Provider subagents · \(rows.count)")
                    Spacer()
                    Image(systemName: expanded ? "chevron.down" : "chevron.right")
                }.font(.caption.weight(.medium)).frame(minHeight: 32).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("ops-subagents")
            .accessibilityValue(expanded ? "Expanded" : "Collapsed")
            if expanded {
            VStack(alignment: .leading, spacing: 10) {
                if let error {
                    Text(error).font(.caption).foregroundStyle(.orange)
                }
                if stale {
                    Text("Showing the last available team snapshot.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if rows.isEmpty && !loading && error == nil {
                    Text("No provider subagents reported yet.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                ForEach(rows, id: \.["id"].string) { row in
                    NavigationLink {
                        ScrollView {
                            OpsWorkerActivity(workerID: workerID, subagentID: row["id"].string)
                                .padding()
                        }
                        .navigationTitle(title(row))
                        .navigationBarTitleDisplayMode(.inline)
                    } label: {
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "person.crop.circle")
                                .foregroundStyle(OpsTheme.mint)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(title(row)).font(.callout.weight(.medium))
                                if !row["description"].string.isEmpty {
                                    Text(row["description"].string)
                                        .font(.caption).foregroundStyle(.secondary).lineLimit(2)
                                }
                                Text([row["provider"].string, row["status"].string]
                                    .filter { !$0.isEmpty }.joined(separator: " · "))
                                    .font(.caption2).foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.leading, row["parentSubagentId"].string.isEmpty ? 0 : 12)
                    }
                    .accessibilityIdentifier("ops-subagent-\(row["id"].string)")
                }
                HStack {
                    if saved { Text("Saved").foregroundStyle(OpsTheme.mint) }
                    Spacer()
                    if loading { ProgressView().controlSize(.small) }
                    Button(error == nil ? "Refresh" : "Retry") { refresh += 1 }
                        .disabled(loading)
                        .accessibilityIdentifier("ops-subagents-refresh")
                }
                .font(.caption)
                .buttonStyle(.borderless)
            }
            .padding(.top, 8)
            }
        }
        .onAppear { visible = true }
        .onDisappear { visible = false }
        .onChange(of: workerID) { _, _ in
            rows = []; saved = false; stale = false; error = nil
        }
        .task(id: "\(workerID)-\(expanded)-\(visible)-\(scenePhase == .active)-\(refresh)") {
            guard expanded, visible, scenePhase == .active else { return }
            await poll()
        }
    }

    private func title(_ row: JSONValue) -> String {
        row["title"].string.nonempty ?? "Subagent"
    }

    private func poll() async {
        var failures = 0
        while !Task.isCancelled {
            do {
                loading = true
                let result = try await session.get("\(try opsWorkerPath(workerID))/subagents")
                try Task.checkCancellation()
                var seen = Set<String>()
                rows = Array(result["subagents"].array.filter {
                    let id = $0["id"].string
                    return (try? opsSafePathID(id)) != nil && seen.insert(id).inserted
                }.prefix(100))
                saved = result["saved"].bool
                stale = result["stale"].bool
                error = nil
                loading = false
                failures = 0
                if saved { return }
                try await Task.sleep(for: .seconds(3))
            } catch {
                loading = false
                if Task.isCancelled || error is CancellationError { return }
                if let url = error as? URLError, url.code == .cancelled { return }
                self.error = error.localizedDescription
                if saved { return }
                if let failure = error as? AppFailure, let code = failure.statusCode,
                   code < 500 && code != 408 && code != 429 { return }
                if let url = error as? URLError, url.code == .badURL { return }
                failures += 1
                do {
                    try await Task.sleep(for: .seconds(min(30, pow(2.0, Double(min(failures, 5))))))
                } catch { return }
            }
        }
    }
}
