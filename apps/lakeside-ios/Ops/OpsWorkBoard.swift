import SwiftUI
import LakesideCore

struct OpsWorkBoard: View {
    @ObservedObject var model: OpsWorkspaceModel
    @StateObject private var store = OpsWorkStore()
    @EnvironmentObject private var session: AppSession
    @Environment(\.scenePhase) private var phase
    @State private var visible = true
    @State private var search = ""
    @State private var compact = true
    @State private var create = false
    @State private var configure = false
    @State private var newBoard = false
    private var columns: [JSONValue] { store.board["columns"].array }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            status
            if let error = store.error { Text(error).font(.caption).foregroundStyle(.orange).padding(.horizontal).accessibilityIdentifier("ops-kanban-error") }
            if !store.cache.pending.isEmpty { pending }
            if columns.isEmpty { ContentUnavailableView("No board yet", systemImage: "rectangle.split.3x1", description: Text("Connect to load your boards or create one.")) }
            else {
                GeometryReader { geometry in
                    ScrollView(.horizontal) {
                        LazyHStack(alignment: .top, spacing: 12) {
                            ForEach(columns, id: \.["id"].string) { column in lane(column, width: min(340, max(260, geometry.size.width - 44)), height: geometry.size.height) }
                        }.scrollTargetLayout().padding(.horizontal, 16)
                    }.scrollTargetBehavior(.viewAligned).accessibilityIdentifier("ops-kanban-scroll")
                }
            }
        }.padding(.bottom, 8).background(Brand.background).foregroundStyle(Brand.ink).tint(Brand.sky)
            .accessibilityElement(children: .contain).accessibilityIdentifier("ops-kanban-board")
            .navigationTitle(store.board["name"].string.nonempty ?? "Work").navigationBarTitleDisplayMode(.inline)
            .searchable(text: $search, prompt: "Find work")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Board", selection: $store.selected) { ForEach(store.cache.boards, id: \.["id"].string) { board in Text(board["name"].string).tag(board["id"].string) } }
                        Toggle("Compact cards", isOn: $compact)
                        Button("New board") { newBoard = true }
                        Button("Configure board") { configure = true }.disabled(store.board == .null || !store.online)
                    } label: { Image(systemName: "line.3.horizontal.decrease") }.accessibilityLabel("Work view options").accessibilityIdentifier("ops-company-view-options")
                }
                ToolbarItem(placement: .topBarTrailing) { Button { create = true } label: { Image(systemName: "plus") }.disabled(store.selected.isEmpty).accessibilityLabel("Add work").accessibilityIdentifier("ops-company-create") }
            }
            .sheet(isPresented: $create) { OpsWorkCreate(store: store) }
            .sheet(isPresented: $newBoard) { OpsWorkConfigure(store: store, creating: true) }
            .sheet(isPresented: $configure) { OpsWorkConfigure(store: store, creating: false) }
            .onAppear { visible = true; store.open(session) }.onDisappear { visible = false }
            .task(id: "\(visible)-\(phase == .active)-\(store.selected)") {
                guard visible, phase == .active else { return }
                while !Task.isCancelled { await store.refresh(session); do { try await Task.sleep(for: .seconds(1)) } catch { return } }
            }
    }
    private var status: some View {
        HStack {
            Label(store.online ? "Connected" : "Offline · saved work", systemImage: store.online ? "checkmark.icloud" : "icloud.slash")
            Spacer()
            if let date = store.cache.refreshedAt[store.selected] { Text(date, style: .relative); Text("ago") }
        }.font(.caption).foregroundStyle(.secondary).padding(.horizontal, 16).accessibilityIdentifier("ops-work-sync-status")
    }
    private var pending: some View {
        DisclosureGroup("\(store.cache.pending.count) unconfirmed actions") {
            ForEach(store.cache.pending) { intent in
                VStack(alignment: .leading, spacing: 6) {
                    Text(intent.body["type"]?.string ?? "Action").font(.caption.weight(.semibold))
                    Text(intent.issue ?? (intent.authority ? "Awaiting server receipt; work is not confirmed." : "Saved on this device; waiting to sync.")).font(.caption).foregroundStyle(intent.issue == nil ? Color.secondary : .orange)
                    if let payload = intent.body["payload"] { Text(payload.pretty).font(.caption2.monospaced()).textSelection(.enabled) }
                    if intent.issue != nil {
                        Text("The saved intent above was not applied. Review the current card, dismiss this intent, then submit your chosen change again.").font(.caption)
                        Button("Dismiss intent") { store.discard(intent.id) }
                    }
                }
            }
        }.padding(.horizontal, 16).accessibilityIdentifier("ops-work-outbox")
    }
    private func lane(_ column: JSONValue, width: CGFloat, height: CGFloat) -> some View {
        let cards = store.cards.filter { $0["columnId"] == column["id"] && (search.isEmpty || $0["title"].string.localizedCaseInsensitiveContains(search) || $0["objective"].string.localizedCaseInsensitiveContains(search)) }.sorted {
            let left = $0["board_rank"].number ?? 0, right = $1["board_rank"].number ?? 0
            return left == right ? $0["id"].string < $1["id"].string : left < right
        }
        return VStack(alignment: .leading, spacing: 12) {
            HStack { Text(column["title"].string).font(.headline); Spacer(); Text("\(cards.count)").font(.subheadline.monospacedDigit()) }
            if let limit = column["wipLimit"].number, Double(cards.count) > limit { Text("Above work limit of \(Int(limit))").font(.caption).foregroundStyle(.orange) }
            ScrollView {
                LazyVStack(spacing: 10) {
                    ForEach(cards, id: \.["id"].string) { card in
                        NavigationLink { OpsWorkDetail(cardID: card["id"].string, store: store, model: model) } label: { cardLabel(card) }
                            .buttonStyle(.plain).accessibilityIdentifier("ops-kanban-card-\(card["id"].string)")
                            .contextMenu {
                                ForEach(columns, id: \.["id"].string) { destination in
                                    Button("Move to \(destination["title"].string)") { Task { _ = await store.submit(type: "card.move", card: card, payload: ["columnId": destination["id"]], session: session) } }.disabled(destination["id"] == card["columnId"])
                                }
                            }
                            .accessibilityAction(named: "Move to next stage") {
                                if let index = columns.firstIndex(where: { $0["id"] == card["columnId"] }), index + 1 < columns.count {
                                    Task { _ = await store.submit(type: "card.move", card: card, payload: ["columnId": columns[index + 1]["id"]], session: session) }
                                }
                            }
                    }
                    if cards.isEmpty { Text("Nothing here yet").font(.callout).foregroundStyle(.secondary).padding(.vertical, 28) }
                }.padding(.bottom, 20)
            }.refreshable { await store.refresh(session) }
        }.padding(12).frame(width: width, height: height, alignment: .top)
            .background(Brand.sky.opacity(0.045), in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(Brand.sky.opacity(0.14)))
            .accessibilityElement(children: .contain).accessibilityIdentifier("ops-kanban-lane-\(column["id"].string)")
    }
    private func cardLabel(_ card: JSONValue) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(card["title"].string).font(.callout.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
            if let staff = model.staff.first(where: { $0["id"] == card["staff_id"] }) { Text(staff["name"].string).font(.caption).foregroundStyle(.secondary) }
            if !compact { Text(card["objective"].string).font(.caption).lineLimit(3).foregroundStyle(.secondary) }
            if !card["worker_status"].string.isEmpty { Text(card["worker_status"].string.replacingOccurrences(of: "_", with: " ")).font(.caption).foregroundStyle(Brand.sky) }
            if card["status"].string == "blocked" { Label("Blocked", systemImage: "exclamationmark.circle").font(.caption).foregroundStyle(.orange) }
            if card["status"].string == "awaiting_approval" || card["review"]["state"].string == "proposed" { Label("Proposal needs review", systemImage: "person.crop.circle.badge.questionmark").font(.caption).foregroundStyle(.orange) }
            if store.cache.pending.contains(where: { $0.body["cardId"] == card["id"] }) { Label("Unconfirmed change", systemImage: "clock").font(.caption).foregroundStyle(.orange) }
        }.frame(maxWidth: .infinity, alignment: .leading).padding(compact ? 12 : 16)
            .background(Brand.background, in: RoundedRectangle(cornerRadius: 12))
    }
}

private struct OpsWorkCreate: View {
    @ObservedObject var store: OpsWorkStore
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var objective = ""
    @State private var acceptance = ""
    @State private var busy = false
    var body: some View {
        NavigationStack {
            Form {
                TextField("Title", text: $title).accessibilityIdentifier("ops-company-title")
                TextField("What should be done?", text: $objective, axis: .vertical).lineLimit(3...8).accessibilityIdentifier("ops-company-objective")
                TextField("Done looks like (one criterion per line)", text: $acceptance, axis: .vertical).lineLimit(2...6).accessibilityIdentifier("ops-company-criteria")
                Text("Planning edits can be saved offline. Approval and execution require a connection.").font(.caption)
                if let error = store.error { Text(error).foregroundStyle(.orange) }
            }.navigationTitle("Add work").toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { Task {
                    busy = true; defer { busy = false }
                    var payload: [String: JSONValue] = ["title": .string(title), "objective": .string(objective), "taskType": .string("analysis")]
                    let criteria = acceptance.split(separator: "\n").map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
                    if !criteria.isEmpty { payload["acceptance"] = .array(criteria.map { .string($0) }) }
                    if await store.submit(type: "card.create", payload: payload, session: session) { dismiss() }
                } }.disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy).accessibilityIdentifier("ops-company-create-save") }
            }
        }.tint(Brand.sky)
    }
}

private struct OpsWorkConfigure: View {
    @ObservedObject var store: OpsWorkStore
    let creating: Bool
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var columns: [JSONValue] = []
    @State private var columnTitle = ""
    @State private var category = "queued"
    @State private var busy = false
    @State private var reviewedBoard: JSONValue = .null
    @State private var archived = false
    var body: some View {
        NavigationStack {
            Form {
                TextField("Board name", text: $name)
                if !creating { Toggle("Archived", isOn: $archived) }
                Section("Stages") {
                    ForEach(Array(columns.enumerated()), id: \.offset) { index, column in
                        TextField("Stage title", text: Binding(get: { columns[index]["title"].string }, set: { var fields = columns[index].object; fields["title"] = .string($0); columns[index] = .object(fields) }))
                    }.onDelete { columns.remove(atOffsets: $0) }.onMove { columns.move(fromOffsets: $0, toOffset: $1) }
                    TextField("New stage", text: $columnTitle)
                    Picker("Category", selection: $category) { ForEach(["queued", "active", "review", "done", "cancelled"], id: \.self) { Text($0.capitalized).tag($0) } }
                    Button("Add stage") { columns.append(.object(["id": .string(UUID().uuidString), "title": .string(columnTitle), "category": .string(category)])); columnTitle = "" }.disabled(columnTitle.isEmpty)
                }
                Text("Moving cards never approves a proposal or starts a run. Occupied stages cannot be deleted.").font(.caption)
                if let error = store.error { Text(error).foregroundStyle(.orange) }
            }.navigationTitle(creating ? "New board" : "Configure board").toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .primaryAction) { EditButton() }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { Task {
                    busy = true; defer { busy = false }
                    if creating {
                            guard await store.submit(type: "board.create", payload: ["name": .string(name), "columns": .array(columns)], session: session) else { return }
                        } else {
                            let accepted = await store.submit(type: "board.configure", card: reviewedBoard, payload: ["name": .string(name), "columns": .array(columns), "archived": .bool(archived)], authority: true, session: session)
                            guard accepted else { return }
                        }
                    await store.refresh(session); dismiss()
                } }.disabled(name.isEmpty || columns.isEmpty || busy) }
            }.onAppear {
                reviewedBoard = store.board
                name = creating ? "" : store.board["name"].string
                archived = store.board["archived"].bool
                columns = creating ? ["Inbox", "Ready", "Doing", "Review", "Done"].map { .object(["id": .string($0.lowercased()), "title": .string($0), "category": .string($0 == "Doing" ? "active" : $0 == "Review" ? "review" : $0 == "Done" ? "done" : "queued")]) } : store.board["columns"].array
            }
        }.tint(Brand.sky)
    }
}
