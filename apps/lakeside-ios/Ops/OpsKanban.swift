import SwiftUI
import LakesideCore

struct OpsBoardColumn: Identifiable, Sendable {
    let id: String
    let title: String
    var color: Color {
        switch id {
        case "doing": return OpsTheme.sky
        case "review": return .orange
        case "ready": return .purple
        case "watching": return .cyan
        case "done": return OpsTheme.mint
        default: return .secondary
        }
    }
    static let defaults: [OpsBoardColumn] = [
        .init(id: "todo", title: "To do"), .init(id: "doing", title: "In progress"),
        .init(id: "review", title: "Needs review"), .init(id: "ready", title: "Ready to ship"),
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
    case "verified", "cancelled": return "done"
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
    let onMoved: (JSONValue) async -> Void
    let onReload: () async -> Void
    @EnvironmentObject private var session: AppSession
    @State private var moving = false
    @State private var error: String?
    @State private var destination: String?
    private var columns: [OpsBoardColumn] {
        let parsed = columnData.compactMap { row -> OpsBoardColumn? in
            guard OpsBoardColumn.defaults.contains(where: { $0.id == row["id"].string }) else { return nil }
            return OpsBoardColumn(id: row["id"].string, title: row["title"].string)
        }
        return parsed.isEmpty ? OpsBoardColumn.defaults : parsed
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 7) {
                Image(systemName: "arrow.triangle.2.circlepath")
                Text("One board, shared everywhere")
                Spacer()
                if moving { ProgressView().controlSize(.small) }
            }.font(.caption2).foregroundStyle(.secondary).padding(.horizontal, 16)
            GeometryReader { geometry in
                ScrollViewReader { proxy in
                    ScrollView(.horizontal) {
                        LazyHStack(alignment: .top, spacing: 14) {
                            ForEach(columns) { column in
                                OpsKanbanLane(column: column, jobs: jobs.filter { opsBoardColumn($0) == column.id }.sorted(by: ordered), entities: entities, staff: staff, columns: columns, model: model, moving: moving) { job, target in
                                    Task { await move(job, to: target) }
                                } dropped: { payload in
                                    guard payload.utf8.count <= 2048, let captured = try? JSONValue.parse(payload),
                                          let version = captured["version"].number, version.isFinite, version > 0,
                                          let current = jobs.first(where: { $0["id"] == captured["id"] }),
                                          opsBoardColumn(current) != column.id, !moving else { return false }
                                    guard current["version"] == captured["version"] else {
                                        error = "This card changed while you were moving it. Review the refreshed card and try again."
                                        Task { await onReload() }
                                        return false
                                    }
                                    Task { await move(captured, to: column.id) }
                                    return true
                                }
                                .frame(width: max(245, min(340, geometry.size.width - 40)))
                                .id(column.id)
                            }
                        }.scrollTargetLayout().padding(.horizontal, 16)
                    }.scrollTargetBehavior(.viewAligned).scrollIndicators(.hidden)
                        .onChange(of: destination) { _, target in
                            if let target { withAnimation(.easeInOut(duration: 0.25)) { proxy.scrollTo(target, anchor: .leading) } }
                        }
                }
            }.frame(height: 490)
            if let error { Text(error).font(.caption).foregroundStyle(.orange).padding(.horizontal, 16).accessibilityIdentifier("ops-kanban-error") }
            Text("Move cards to plan work. Starting workers, approving changes, and deploying remain separate steps.").font(.caption2).foregroundStyle(.secondary).padding(.horizontal, 16)
        }.padding(.vertical, 8).accessibilityElement(children: .contain).accessibilityIdentifier("ops-kanban-board")
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
        moving = true; destination = nil; defer { moving = false }
        do {
            let result = try await session.post("/api/ops/company/missions/\(try opsSafePathID(job["id"].string))/move", ["version": job["version"], "column": .string(column)])
            await onMoved(result["mission"])
            error = nil; destination = column
        } catch {
            self.error = error.localizedDescription
            // Reload also resolves an ambiguous response without showing an optimistic move.
            await onReload()
        }
    }
}

private struct OpsKanbanLane: View {
    let column: OpsBoardColumn
    let jobs: [JSONValue]
    let entities: [JSONValue]
    let staff: [JSONValue]
    let columns: [OpsBoardColumn]
    @ObservedObject var model: OpsWorkspaceModel
    let moving: Bool
    let move: (JSONValue, String) -> Void
    let dropped: (String) -> Bool
    @State private var targeted = false
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Circle().fill(column.color).frame(width: 7, height: 7)
                Text(column.title).font(.subheadline.weight(.semibold))
                Spacer(minLength: 4)
                Text("\(jobs.count)").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                    .padding(.horizontal, 7).padding(.vertical, 3).background(.primary.opacity(0.05), in: Capsule())
            }.padding(.horizontal, 2)
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(jobs, id: \.["id"].string) { job in
                        OpsKanbanCard(job: job, column: column, product: entities.first { $0["id"] == job["entity_id"] }?["title"].string ?? "", owner: staff.first { $0["id"] == job["staff_id"] }?["name"].string ?? "", columns: columns, model: model, moving: moving, move: move)
                            .draggable(opsBoardDragPayload(job))
                    }
                    if jobs.isEmpty {
                        VStack(spacing: 8) {
                            Image(systemName: column.id == "done" ? "checkmark.circle" : "rectangle.stack").font(.title3).foregroundStyle(column.color.opacity(0.7))
                            Text("Nothing here yet").font(.caption.weight(.medium))
                            Text("Move a card here when it is ready.").font(.caption2).foregroundStyle(.secondary)
                        }.frame(maxWidth: .infinity).padding(.vertical, 30)
                            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(.primary.opacity(0.08), style: StrokeStyle(lineWidth: 1, dash: [4])))
                    }
                }.padding(.bottom, 10)
            }.scrollIndicators(.hidden)
        }.padding(12).frame(maxHeight: .infinity, alignment: .top)
            .background(targeted ? column.color.opacity(0.10) : OpsTheme.surface.opacity(0.72), in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(targeted ? column.color.opacity(0.5) : .primary.opacity(0.05)))
            .dropDestination(for: String.self) { values, _ in
                guard values.count == 1, let id = values.first else { return false }
                return dropped(id)
            } isTargeted: { targeted = $0 }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("ops-kanban-lane-\(column.id)")
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
        VStack(alignment: .leading, spacing: 13) {
            HStack {
                Text(kind.uppercased()).font(.caption2.weight(.semibold)).tracking(0.8).foregroundStyle(column.color)
                Spacer()
                Button {
                    capturedJob = job
                    showMoves = true
                } label: {
                    Image(systemName: "ellipsis").font(.callout.weight(.medium))
                        .frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain).disabled(moving)
                .accessibilityLabel("Move \(job["title"].string)").accessibilityIdentifier("ops-kanban-move-\(job["id"].string)")
                .confirmationDialog("Move \(capturedJob["title"].string)", isPresented: $showMoves, titleVisibility: .visible) {
                    ForEach(columns.filter { $0.id != opsBoardColumn(capturedJob) }) { target in
                        Button("Move to \(target.title)") { move(capturedJob, target.id) }.accessibilityIdentifier("ops-kanban-move-to-\(target.id)")
                    }
                    Button("Cancel", role: .cancel) {}
                }

            }
            NavigationLink {
                OpsCompanyDetail(jobID: job["id"].string, model: model)
            } label: {
                VStack(alignment: .leading, spacing: 7) {
                    Text(job["title"].string).font(.callout.weight(.semibold)).foregroundStyle(OpsTheme.ink).fixedSize(horizontal: false, vertical: true)
                    Text(job.first("signal_summary", "why", "objective")).font(.caption).foregroundStyle(.secondary).lineLimit(3)
                    if !product.isEmpty { Label(product, systemImage: "square.stack.3d.up").font(.caption2).foregroundStyle(.secondary).lineLimit(1) }
                }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityIdentifier("ops-company-job-\(job["id"].string)")
            Divider().overlay(.primary.opacity(0.03))
            HStack(spacing: 8) {
                Text(owner.isEmpty ? "?" : String(owner.prefix(1)).uppercased()).font(.caption2.weight(.semibold))
                    .frame(width: 25, height: 25).background(column.color.opacity(0.12), in: Circle()).foregroundStyle(column.color)
                    .accessibilityHidden(true)
                Text(owner.isEmpty ? "Unassigned" : owner).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                Spacer(minLength: 0)
                if job["status"].string == "blocked" { Image(systemName: "exclamationmark.circle.fill").foregroundStyle(.orange).accessibilityLabel("Needs attention") }
            }
            if workerActive {
                Label([job["worker_status"].string.replacingOccurrences(of: "_", with: " ").capitalized, job.first("worker_provider", "provider", "runtime_provider"), job.first("worker_model", "model")].filter { !$0.isEmpty }.joined(separator: " · "), systemImage: "waveform")
                    .font(.caption2).foregroundStyle(OpsTheme.mint).lineLimit(2)
            } else {
                Text(companyStatus(job["status"].string)).font(.caption2).foregroundStyle(.secondary)
            }
        }.padding(14).background(OpsTheme.raised.opacity(0.7), in: RoundedRectangle(cornerRadius: 15))
            .overlay(RoundedRectangle(cornerRadius: 15).strokeBorder(.primary.opacity(0.07)))
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("ops-kanban-card-\(job["id"].string)-\(column.id)")
    }
}
