import SwiftUI
import LakesideCore

struct OpsBoardColumn: Identifiable, Sendable {
    let id: String
    let title: String
    var color: Color { switch id { case "done": Brand.mint; case "review": .orange; case "ready": .purple; default: Brand.sky } }
    var hint: String { ["todo": "Ready to pick up", "doing": "Being worked on", "review": "Check the result", "ready": "You approved the next step", "watching": "Check that the change holds", "done": "Finished and checked"][id] ?? "" }
    static let defaults: [OpsBoardColumn] = [
        .init(id: "todo", title: "To do"), .init(id: "doing", title: "In progress"),
        .init(id: "review", title: "Needs review"), .init(id: "ready", title: "Approved"),
        .init(id: "watching", title: "Watching"), .init(id: "done", title: "Done")
    ]
}

func opsBoardColumn(_ job: JSONValue) -> String {
    let explicit = job["column"].string
    if OpsBoardColumn.defaults.contains(where: { $0.id == explicit }) { return explicit }
    switch job["status"].string {
    case "investigating", "working": return "doing"
    case "awaiting_verification", "awaiting_approval", "blocked": return "review"
    case "approved": return "ready"
    case "monitoring": return "watching"
    case "verified": return "done"
    case "cancelled": return ""
    default: return "todo"
    }
}

private func opsBoardDragPayload(_ job: JSONValue) -> String {
    let captured: JSONValue = .object(["id": job["id"], "version": job["version"]])
    guard let data = try? JSONEncoder().encode(captured) else { return "" }
    return String(data: data, encoding: .utf8) ?? ""
}

struct OpsKanban: View {
    let jobs: [JSONValue]
    let entities: [JSONValue]
    let staff: [JSONValue]
    let columnData: [JSONValue]
    @ObservedObject var model: OpsWorkspaceModel
    var showAll = false
    let onMoved: (JSONValue) async -> Void
    let onReload: () async -> Void
    @EnvironmentObject private var session: AppSession
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var moving = false
    @State private var error: String?
    @State private var selectedColumn = "todo"
    private var columns: [OpsBoardColumn] {
        let parsed = columnData.compactMap { row -> OpsBoardColumn? in
            guard OpsBoardColumn.defaults.contains(where: { $0.id == row["id"].string }) else { return nil }
            return OpsBoardColumn(id: row["id"].string, title: row["title"].string)
        }
        return parsed.isEmpty ? OpsBoardColumn.defaults : parsed
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let error { Text(error).font(.caption).foregroundStyle(.orange).padding(.horizontal, 16).accessibilityIdentifier("ops-kanban-error") }
            if showAll {
                ScrollView { LazyVStack(spacing: 10) { cards(jobs.sorted(by: ordered)) }.padding(16) }
                    .refreshable { await onReload() }
            } else {
                Text("Swipe through stages. Tap a card for its conversation, agent and next step.")
                    .font(.caption).foregroundStyle(.secondary).padding(.horizontal, 16)
                GeometryReader { geometry in
                    ScrollView(.horizontal) {
                        LazyHStack(alignment: .top, spacing: 12) {
                            ForEach(columns) { column in
                                let work = jobs.filter { opsBoardColumn($0) == column.id }.sorted(by: ordered)
                                VStack(alignment: .leading, spacing: 12) {
                                    HStack {
                                        Circle().fill(column.color).frame(width: 8, height: 8)
                                        Text(column.title).font(.headline)
                                        Spacer()
                                        Text("\(work.count)").font(.subheadline.monospacedDigit()).foregroundStyle(.secondary)
                                    }
                                    Text(column.hint).font(.caption).foregroundStyle(.secondary)
                                    ScrollView {
                                        LazyVStack(spacing: 10) {
                                            cards(work)
                                            if work.isEmpty { Text("Nothing here yet").font(.callout).foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(.vertical, 28) }
                                        }.padding(.bottom, 20)
                                    }.refreshable { await onReload() }
                                }.padding(12).frame(width: min(340, max(260, geometry.size.width - 44)), height: geometry.size.height, alignment: .top)
                                    .background(column.color.opacity(0.045), in: RoundedRectangle(cornerRadius: 18))
                                    .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(column.color.opacity(0.14)))
                                    .id(column.id)
                                    .accessibilityElement(children: .contain).accessibilityIdentifier("ops-kanban-lane-\(column.id)")
                                    .dropDestination(for: String.self) { payloads, _ in
                                        guard payloads.count == 1, let payload = payloads.first else { return false }
                                        return drop(payload, into: column.id)
                                    }
                            }
                        }.scrollTargetLayout().padding(.horizontal, 16)
                    }.scrollTargetBehavior(.viewAligned)
                        .scrollPosition(id: Binding<String?>(get: { selectedColumn }, set: { if let value = $0 { selectedColumn = value } }))
                        .accessibilityIdentifier("ops-kanban-scroll")
                }
            }
        }.padding(.bottom, 8).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .accessibilityElement(children: .contain).accessibilityIdentifier("ops-kanban-board")
    }
    @ViewBuilder private func cards(_ work: [JSONValue]) -> some View {
        ForEach(work, id: \.["id"].string) { job in
            OpsKanbanCard(job: job, column: columns.first { $0.id == opsBoardColumn(job) } ?? columns[0], product: entities.first { $0["id"] == job["entity_id"] }?["title"].string ?? "", owner: staff.first { $0["id"] == job["staff_id"] }?["name"].string ?? "", columns: columns, model: model, moving: moving) { captured, target in
                Task { await move(captured, to: target) }
            }.draggable(opsBoardDragPayload(job))
        }
    }
    private func drop(_ payload: String, into column: String) -> Bool {
        guard payload.utf8.count <= 2048, let captured = try? JSONValue.parse(payload),
              let version = captured["version"].number, version.isFinite, version > 0,
              let current = jobs.first(where: { $0["id"] == captured["id"] }),
              opsBoardColumn(current) != column, !moving else { return false }
        guard current["version"] == captured["version"] else {
            error = "This card changed while you were moving it. Review the refreshed card and try again."
            Task { await onReload() }
            return false
        }
        Task { await move(captured, to: column) }
        return true
    }
    private func ordered(_ a: JSONValue, _ b: JSONValue) -> Bool {
        let left = a["board_rank"].number ?? 0, right = b["board_rank"].number ?? 0
        if left != right { return left < right }
        return a["id"].string < b["id"].string
    }
    private func move(_ job: JSONValue, to column: String) async {
        guard !moving else { return }
        guard let current = jobs.first(where: { $0["id"] == job["id"] }), current["version"] == job["version"], job["version"] != .null else {
            error = "This card changed while you were choosing a move. Review the refreshed card and try again."
            await onReload()
            return
        }
        moving = true; defer { moving = false }
        do {
            let result = try await session.post("/api/ops/company/missions/\(try opsSafePathID(job["id"].string))/move", ["version": job["version"], "column": .string(column)])
            await onMoved(result["mission"])
            error = nil; selectedColumn = column
        } catch {
            self.error = error.localizedDescription
            // Reload also resolves an ambiguous response without showing an optimistic move.
            await onReload()
        }
    }
}

private struct OpsKanbanCard: View {
    let job: JSONValue
    let column: OpsBoardColumn
    let product: String
    let owner: String
    let columns: [OpsBoardColumn]
    @ObservedObject var model: OpsWorkspaceModel
    let moving: Bool
    let move: (JSONValue, String) -> Void
    @State private var showMoves = false
    @State private var capturedJob: JSONValue = .null
    private var workerActive: Bool { ["running", "starting", "queued", "awaiting_permission", "awaiting_input", "cancelling"].contains(job["worker_status"].string) }
    private var kind: String { ["bugfix": "Bug fix", "implementation": "Build", "research": "Research", "analysis": "Analysis", "review": "Review"][job["task_type"].string] ?? "Work" }
    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            NavigationLink {
                OpsCompanyDetail(jobID: job["id"].string, model: model)
            } label: {
                VStack(alignment: .leading, spacing: 7) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(job["title"].string).font(.callout.weight(.semibold)).foregroundStyle(Brand.ink).fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                        if job["status"].string == "blocked" { Text("Needs you").font(.caption2.weight(.medium)).foregroundStyle(.orange) }
                        else if workerActive { OpsStatus(value: job["worker_status"].string, identity: job["staff_id"].string.nonempty ?? job["worker_id"].string, needsDecision: !(model.workers.first { $0["id"].string == job["worker_id"].string }?["permissions"].array ?? []).isEmpty, connected: model.connected) }
                    }
                    Text([owner.isEmpty ? "Unassigned" : owner, product].filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(.secondary).lineLimit(2)
                    if workerActive {
                        Text([job.first("worker_provider", "provider", "runtime_provider"), job.first("worker_model", "model")].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption2).foregroundStyle(Brand.mint).lineLimit(1)
                    }
                }.padding(.vertical, 16).padding(.leading, 16).frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityIdentifier("ops-company-job-\(job["id"].string)")
            Button { capturedJob = job; showMoves = true } label: {
                Image(systemName: "ellipsis").font(.callout).foregroundStyle(.secondary)
                    .frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
            }.buttonStyle(.plain).disabled(moving).padding(.top, 5)
                .accessibilityLabel("Move \(job["title"].string)").accessibilityIdentifier("ops-kanban-move-\(job["id"].string)")
                .confirmationDialog("Move \(capturedJob["title"].string)", isPresented: $showMoves, titleVisibility: .visible) {
                    ForEach(columns.filter { $0.id != opsBoardColumn(capturedJob) }) { target in
                        Button("Move to \(target.title)") { move(capturedJob, target.id) }.accessibilityIdentifier("ops-kanban-move-to-\(target.id)")
                    }
                    Button("Cancel", role: .cancel) {}
                }
        }.background(Brand.surface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(alignment: .leading) {
                if workerActive || job["status"].string == "blocked" { RoundedRectangle(cornerRadius: 1).fill(job["status"].string == "blocked" ? Color.orange : Brand.mint).frame(width: 2).padding(.vertical, 12) }
            }
            .accessibilityElement(children: .contain).accessibilityIdentifier("ops-kanban-card-\(job["id"].string)-\(column.id)")
    }
}
