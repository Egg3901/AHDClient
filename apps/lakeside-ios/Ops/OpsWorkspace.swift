import SwiftUI
import LakesideCore

@MainActor final class OpsWorkspaceModel: ObservableObject {
    @Published var conversations: [JSONValue] = []
    @Published var turns: [JSONValue] = []
    @Published var workers: [JSONValue] = []
    @Published var staff: [JSONValue] = []
    @Published var providers: [JSONValue] = []
    @Published var usage: [JSONValue] = []
    @Published var conversation = ""
    @Published var selectedTab = 0
    @Published var fileQuestion = ""
    @Published var connected = false
    @Published var error: String?
    @Published var sending = false
    @Published var liveText = ""
    @Published var activity = ""
    @Published var liveActions: [JSONValue] = []
    @Published var streamingID = ""
    private var cursor = "0"
    private var usageRefreshTask: Task<Void, Never>?
    private var replyTask: Task<Void, Never>?
    private var flushTask: Task<Void, Never>?
    private var pendingText = ""
    private var pendingSubmission: (payload: JSONValue, id: String)?

    func connect(_ session: AppSession) async {
        defer { connected = false; replyTask?.cancel(); streamingID = ""; flushTask?.cancel(); flushTask = nil }
        var delay = 1.0
        while !Task.isCancelled {
            do {
                let boot = try await session.get("/api/ops/bootstrap")
                cursor = boot["cursor"].string
                conversations = boot["conversations"].array
                workers = boot["workers"].array
                staff = boot["staff"].array
                if conversation.isEmpty { conversation = boot["conversation"]["id"].string }
                try await loadTurns(session)
                connected = true; error = nil; delay = 1
                try await session.events("/api/ops/events", query: ["after": cursor]) { event in
                    let envelope = try JSONValue.parse(event.data)
                    let data = envelope["data"]
                    if event.name == "worker.updated" || event.name == "staff.updated" {
                        await self.refreshTeam(session)
                    } else if event.name == "turn.updated", data["conversationId"].string == self.conversation {
                        let selected = self.conversation
                        let update = try await session.get("/api/ops/turns/\(data["turnId"].string)")
                        guard selected == self.conversation else { return }
                        let turn = update["turn"]
                        if turn["deleted"].bool { self.turns.removeAll { $0["id"] == turn["id"] } }
                        else if let index = self.turns.firstIndex(where: { $0["id"] == turn["id"] }) { self.turns[index] = turn }
                        else { self.turns.append(turn); self.turns.sort { ($0["id"].number ?? 0) < ($1["id"].number ?? 0) } }
                        if turn["status"].string == "running", turn["role"].string == "assistant" { self.attach(turn["id"].string, session) }
                    }
                    if !envelope["seq"].string.isEmpty { self.cursor = envelope["seq"].string }
                }
            } catch {
                if Task.isCancelled { return }
                self.error = error.localizedDescription
            }
            connected = false
            do { try await Task.sleep(for: .seconds(delay)) } catch { return }
            delay = min(15, delay * 2)
        }
    }
    func loadTurns(_ session: AppSession) async throws {
        let selected = conversation
        let result = try await session.get("/api/chat/turns", query: ["c": selected])
        guard selected == conversation else { return }
        turns = result["turns"].array
        if let running = turns.last(where: { ["running", "pending"].contains($0["status"].string) && $0["role"].string == "assistant" }) {
            if running["status"].string == "running" { attach(running["id"].string, session) }
        }
    }
    func select(_ id: String, _ session: AppSession) async {
        replyTask?.cancel(); flushTask?.cancel(); flushTask = nil; streamingID = ""; liveText = ""; pendingText = ""
        conversation = id; turns = []
        do { try await loadTurns(session) } catch { self.error = error.localizedDescription }
    }
    func older(_ session: AppSession) async {
        guard let first = turns.first else { return }
        let selected = conversation
        do {
            let response = try await session.get("/api/chat/turns", query: ["c": selected, "before": first["id"].string])
            guard selected == conversation else { return }
            let ids = Set(turns.map { $0["id"].string })
            turns.insert(contentsOf: response["turns"].array.filter { !ids.contains($0["id"].string) }, at: 0)
        } catch { self.error = error.localizedDescription }
    }
    func send(_ text: String, _ session: AppSession, attachments: JSONValue = .array([])) async -> Bool {
        guard !sending, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !attachments.array.isEmpty else { return false }
        sending = true; defer { sending = false }
        let selected = conversation
        let payload: JSONValue = .object(["conversation": .string(selected), "text": .string(text), "attachments": attachments])
        if pendingSubmission?.payload != payload { pendingSubmission = (payload, UUID().uuidString) }
        let requestID = pendingSubmission!.id
        do {
            _ = try await session.post("/api/chat/send", ["conversation": .string(selected), "text": .string(text), "attachments": attachments, "requestId": .string(requestID)])
            pendingSubmission = nil
        } catch { self.error = error.localizedDescription; return false }
        // Acceptance and refreshing the transcript are separate outcomes.
        // A refresh failure must not make the composer submit a second turn.
        do { if selected == conversation { try await loadTurns(session) }; error = nil }
        catch { self.error = "Message accepted. Reconnecting to the conversation." }
        return true
    }

    private func attach(_ id: String, _ session: AppSession) {
        guard streamingID != id else { return }
        replyTask?.cancel(); flushTask?.cancel(); flushTask = nil
        streamingID = id; liveActions = []; pendingText = ""; liveText = ""; activity = "Working"
        replyTask = Task {
            var delay = 1.0
            while !Task.isCancelled, self.streamingID == id {
              self.pendingText = ""
              self.liveActions = []
              do {
                try await session.events("/api/chat/stream/\(id)") { event in
                    guard !Task.isCancelled, self.streamingID == id else { return }
                    let payload = try JSONValue.parse(event.data)
                    switch event.name {
                    case "delta":
                        self.pendingText += payload["text"].string
                        if self.flushTask == nil {
                            self.flushTask = Task {
                                do { try await Task.sleep(for: .milliseconds(50)) } catch { return }
                                self.liveText = self.pendingText; self.flushTask = nil
                            }
                        }
                    case "action":
                        self.activity = payload.first("label", "text", "name")
                        if let index = self.liveActions.firstIndex(where: { !$0["id"].string.isEmpty && $0["id"] == payload["id"] }) { self.liveActions[index] = payload }
                        else { self.liveActions.append(payload); if self.liveActions.count > 200 { self.liveActions.removeFirst() } }
                    case "status": self.activity = payload.first("label", "text", "name")
                    case "final":
                        self.flushTask?.cancel(); self.flushTask = nil
                        self.streamingID = ""; self.liveText = ""; self.activity = ""
                        try await self.loadTurns(session)
                    default: break
                    }
                }
              } catch { if !Task.isCancelled { self.activity = "Reconnecting to live activity" } }
              guard !Task.isCancelled, self.streamingID == id else { return }
              self.flushTask?.cancel(); self.flushTask = nil
              do { try await Task.sleep(for: .seconds(delay)) } catch { return }
              delay = min(15, delay * 2)
            }
        }
    }
    @discardableResult func newConversation(_ session: AppSession) async -> Bool {
        do {
            let result = try await session.post("/api/conversations", ["title": .string("New conversation")])
            await refreshConversations(session)
            await select(result["conversation"]["id"].string, session)
            return true
        } catch { self.error = error.localizedDescription; return false }
    }
    func refreshConversations(_ session: AppSession) async {
        do { conversations = try await session.get("/api/conversations")["conversations"].array }
        catch { self.error = error.localizedDescription }
    }
    func rename(_ id: String, _ title: String, _ session: AppSession) async {
        do { _ = try await session.post("/api/conversations/\(id)/rename", ["title": .string(title)]); await refreshConversations(session) }
        catch { self.error = error.localizedDescription }
    }
    func refreshUsage(_ session: AppSession) async {
        if let task = usageRefreshTask { await task.value; return }
        // The model owns this request so a tab transition cannot cancel a
        // refresh that the newly visible screen is also waiting for.
        let task = Task { @MainActor in
            defer { usageRefreshTask = nil }
            do {
                async let inventory = session.get("/api/ops/providers")
                async let measured = session.get("/api/ops/usage")
                let (a, b) = try await (inventory, measured)
                providers = a["providers"].array; usage = b["providers"].array
            } catch {
                if !Task.isCancelled { self.error = error.localizedDescription }
            }
        }
        usageRefreshTask = task
        await task.value
    }

    func refreshTeam(_ session: AppSession) async {
        do {
            async let a = session.get("/api/ops/workers")
            async let b = session.get("/api/ops/staff")
            let (runs, people) = try await (a, b)
            workers = runs["workers"].array; staff = people["staff"].array
        } catch { self.error = error.localizedDescription }
    }
    func workerAction(_ id: String, _ action: String, _ session: AppSession) async {
        do { _ = try await session.post("/api/ops/workers/\(id)/\(action)", [:]); workers = try await session.get("/api/ops/workers")["workers"].array }
        catch { self.error = error.localizedDescription }
    }
}

struct OpsWorkspace: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var model = OpsWorkspaceModel()
    var body: some View {
        TabView(selection: $model.selectedTab) {
            NavigationStack { OpsConversation(model: model) }.tabItem { Label("Assistant", systemImage: "bubble.left.and.text.bubble.right") }.tag(0)
            NavigationStack { OpsTeam(model: model) }.tabItem { Label("Team", systemImage: "person.2") }.tag(1)
            NavigationStack { OpsCapacity(model: model) }.tabItem { Label("Usage", systemImage: "chart.pie.fill") }.tag(2)
            NavigationStack { OpsFiles() }.tabItem { Label("Files", systemImage: "folder") }.tag(3)
            NavigationStack { OpsHubTools() }.tabItem { Label("Hub", systemImage: "square.grid.2x2") }.tag(4)
        }
        .environmentObject(model)
        .tint(OpsTheme.sky)
        .toolbarBackground(OpsTheme.background, for: .tabBar).toolbarBackground(.visible, for: .tabBar)
        .task(id: scenePhase) { if scenePhase == .active { await model.connect(session) } }
    }
}

struct OpsConversation: View {
    @StateObject private var attachments = ChatAttachments()
    @EnvironmentObject private var session: AppSession
    @ObservedObject var model: OpsWorkspaceModel
    @State private var draft = ""
    @State private var history = false
    @FocusState private var composing: Bool
    private var title: String { model.conversations.first { $0["id"].string == model.conversation }?["title"].string ?? "Assistant" }
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 7) {
                Circle().fill(model.connected ? OpsTheme.mint : Color.orange).frame(width: 5, height: 5)
                Text(model.connected ? "Connected" : "Reconnecting")
                Spacer()
                Text("Codex / Muse").foregroundStyle(.secondary)
            }.font(.caption2).foregroundStyle(.secondary).padding(.horizontal, 24).padding(.vertical, 10)
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 28) {
                        if model.turns.isEmpty {
                            VStack(alignment: .leading, spacing: 18) {
                                BrandMark(surface: .hub, size: 40)
                                Text("What needs\n your attention?".replacingOccurrences(of: "\n ", with: "\n"))
                                    .font(.system(size: 36, weight: .semibold)).tracking(-1.2)
                                Text("Plan, build, and follow through with your studio assistant.").font(.callout).foregroundStyle(.secondary)
                                ForEach(["Review what needs my attention", "Plan an implementation", "Investigate a bug"], id: \.self) { prompt in
                                    Button { draft = prompt; composing = true } label: {
                                        HStack { Text(prompt); Spacer(); Image(systemName: "arrow.up.left") }.font(.callout).padding(.vertical, 12)
                                    }.buttonStyle(.plain)
                                    Divider()
                                }
                            }.padding(.vertical, 30)
                        } else {
                            Button("Load earlier messages") { Task { await model.older(session) } }.font(.caption).foregroundStyle(.secondary)
                        }
                        ForEach(model.turns.filter { $0["status"].string != "quiet" }, id: \.["id"].string) { turn in
                            OpsMessage(turn: turn, model: model)
                        }
                        Color.clear.frame(height: 1).id("latest")
                    }.padding(.horizontal, 24).padding(.vertical, 20)
                }.scrollDismissesKeyboard(.interactively)
                .onChange(of: model.turns.count) { old, new in
                    if old == 0 || (new > old && model.sending) { proxy.scrollTo("latest", anchor: .bottom) }
                }
                .overlay(alignment: .bottomTrailing) {
                    if !model.turns.isEmpty {
                        Button { withAnimation { proxy.scrollTo("latest", anchor: .bottom) } } label: {
                            Image(systemName: "arrow.down").font(.callout.weight(.semibold)).padding(10).background(.regularMaterial, in: Circle())
                        }.accessibilityLabel("Jump to latest message").padding(12)
                    }
                }
            }
            ForEach(model.workers.filter { !$0["permissions"].array.isEmpty }, id: \.["id"].string) { worker in
                NavigationLink { OpsWorkerDetail(worker: worker, model: model) } label: {
                    HStack { Image(systemName: "hand.raised"); Text("\(worker["name"].string) needs a decision").lineLimit(1); Spacer(); Image(systemName: "chevron.right") }
                        .font(.caption.weight(.medium)).foregroundStyle(.orange).padding(12)
                        .background(Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                }.padding(.horizontal, 16).padding(.bottom, 8)
            }
            if let error = model.error { Text(error).font(.caption).foregroundStyle(.orange).padding(.horizontal).lineLimit(3) }
            AttachmentTray(attachments: attachments).disabled(model.sending).padding(.horizontal, 20)
            HStack(alignment: .bottom, spacing: 12) {
                AttachmentPicker(attachments: attachments).disabled(model.sending)
                TextField("Message Ops", text: $draft, axis: .vertical).lineLimit(1...6).focused($composing)
                    .accessibilityIdentifier("ops-composer").padding(.vertical, 8)
                if !model.streamingID.isEmpty {
                    Button { Task {
                        do { _ = try await session.post("/api/chat/stop", ["turn": .string(model.streamingID)]) }
                        catch { model.error = error.localizedDescription }
                    } } label: { Image(systemName: "stop.fill").padding(9) }.accessibilityLabel("Stop reply")
                }
                Button { let text = draft; let files = attachments.payload; Task { if await model.send(text, session, attachments: files) { if draft == text { draft = "" }; attachments.items.removeAll() } } } label: {
                    Image(systemName: "arrow.up").font(.body.weight(.semibold)).frame(width: 34, height: 34)
                        .background(OpsTheme.sky, in: Circle()).foregroundStyle(OpsTheme.onAccent)
                }.disabled(model.sending || attachments.uploading || (draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && attachments.items.isEmpty)).accessibilityLabel("Send message")
            }.padding(12).background(OpsTheme.surface, in: RoundedRectangle(cornerRadius: 20))
                .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(.primary.opacity(0.09)))
                .padding(.horizontal, 16).padding(.bottom, 10)
        }.opsScreen().navigationTitle(title).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button { history = true } label: { Image(systemName: "sidebar.left") }.accessibilityLabel("Conversations") }
                ToolbarItem(placement: .principal) { BrandHeader(surface: .hub) }
                ToolbarItem(placement: .topBarTrailing) { Button { Task { await model.newConversation(session) } } label: { Image(systemName: "square.and.pencil") }.accessibilityLabel("New conversation") }
            }
            .onChange(of: model.fileQuestion) { _, question in if !question.isEmpty { draft = question; model.fileQuestion = ""; composing = true } }
            .sheet(isPresented: $history) { OpsHistory(model: model) }
    }
}

private struct OpsMessage: View {
    let turn: JSONValue
    @ObservedObject var model: OpsWorkspaceModel
    private var owner: Bool { turn["role"].string == "owner" }
    private var live: Bool { turn["id"].string == model.streamingID }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if owner {
                ForEach(Array(turn["attachments"].array.enumerated()), id: \.offset) { _, file in Label(file["name"].string, systemImage: "paperclip").font(.caption) }
                Text(turn["body"].string).font(.body).textSelection(.enabled).padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(OpsTheme.raised.opacity(0.65), in: RoundedRectangle(cornerRadius: 16))
            } else {
                HStack(spacing: 8) {
                    BrandMark(surface: .hub, size: 22)
                    Text(turn["role"].string == "assistant" ? "Ops" : "Team").font(.subheadline.weight(.semibold))
                    Spacer()
                    Text(turn["route"]["label"].string).font(.caption2).foregroundStyle(.secondary)
                }
                if live && model.liveText.isEmpty { LoadingShimmer(text: "Thinking…") }
                else { NativeMarkdown(text: live ? model.liveText : (turn["body"].string.nonempty ?? turn["status"].string.capitalized), streaming: live) }
                OpsActivity(actions: live ? model.liveActions : turn["actions"].array)
                if live && !model.activity.isEmpty { LoadingShimmer(text: model.activity).font(.caption).lineLimit(2) }
                if !turn["error"].string.isEmpty { Text(turn["error"].string).font(.caption).foregroundStyle(.orange) }
                if !live && !turn["body"].string.isEmpty {
                    HStack(spacing: 22) {
                        Button { UIPasteboard.general.string = turn["body"].string } label: { Image(systemName: "doc.on.doc") }.accessibilityLabel("Copy reply")
                        ShareLink(item: turn["body"].string) { Image(systemName: "square.and.arrow.up") }.accessibilityLabel("Share reply")
                    }.font(.caption).foregroundStyle(.secondary).buttonStyle(.plain)
                }
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct OpsHistory: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var model: OpsWorkspaceModel
    @State private var search = ""
    @State private var renaming: JSONValue = .null
    @State private var title = ""
    var body: some View {
        NavigationStack {
            List {
                Section { Button { Task { if await model.newConversation(session) { dismiss() } } } label: { Label("New conversation", systemImage: "square.and.pencil") } }
                Section("Recent conversations") {
                    ForEach(model.conversations.filter { search.isEmpty || $0["title"].string.localizedCaseInsensitiveContains(search) }, id: \.["id"].string) { item in
                        Button { Task { await model.select(item["id"].string, session); dismiss() } } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(item["title"].string).foregroundStyle(.primary).lineLimit(2)
                                    if !item["updated_at"].string.isEmpty { Text(item["updated_at"].string.prefix(10)).font(.caption).foregroundStyle(.secondary) }
                                }
                                Spacer()
                                if item["id"].string == model.conversation { Image(systemName: "checkmark").font(.caption) }
                            }.padding(.vertical, 5)
                        }.swipeActions { Button("Rename") { renaming = item; title = item["title"].string }.tint(OpsTheme.sky) }
                    }
                }
                if let error = model.error { Text(error).foregroundStyle(.orange) }
            }.opsScreen().navigationTitle("Conversations").searchable(text: $search)
                .toolbar { Button("Done") { dismiss() } }
                .alert("Rename conversation", isPresented: Binding(get: { renaming != .null }, set: { if !$0 { renaming = .null } })) {
                    TextField("Title", text: $title)
                    Button("Save") { let id = renaming["id"].string; Task { await model.rename(id, title, session) } }
                    Button("Cancel", role: .cancel) { }
                }
                .task { await model.refreshConversations(session) }
        }
    }
}

struct OpsTeam: View {
    @EnvironmentObject private var session: AppSession
    @ObservedObject var model: OpsWorkspaceModel
    @State private var filter = "All"
    @State private var search = ""
    @State private var newWorker = false
    @State private var newStaff = false
    private var filtered: [JSONValue] { model.workers.filter {
        let terminal = ["completed", "failed", "cancelled"].contains($0["job_status"].string)
        let matches = filter == "All" || (filter == "Active" && !terminal) || (filter == "Finished" && terminal) || (filter == "Needs you" && !$0["permissions"].array.isEmpty)
        return matches && (search.isEmpty || ($0["name"].string + " " + $0["brief"].string).localizedCaseInsensitiveContains(search))
    } }
    var body: some View {
        List {
            Section {
                HStack(spacing: 12) {
                    BrandMark(surface: .hub, size: 30)
                    VStack(alignment: .leading, spacing: 4) { Text("Ops assistant").font(.headline); Text("Main agent · Codex / Muse").font(.caption).foregroundStyle(.secondary) }
                    Spacer()
                }.padding(.vertical, 8)
                Text("Your team").font(.title2.weight(.semibold))
                Text("Keep a standing team, launch specialists, and step into their work.").font(.callout).foregroundStyle(.secondary)
                Picker("Filter workers", selection: $filter) { ForEach(["All", "Active", "Needs you", "Finished"], id: \.self) { Text($0) } }.pickerStyle(.segmented)
            }.listRowBackground(Color.clear).listRowSeparator(.hidden)
            Section("Staff") {
                ForEach(model.staff.filter { search.isEmpty || ($0["name"].string + " " + $0["role"].string).localizedCaseInsensitiveContains(search) }, id: \.["id"].string) { member in
                    NavigationLink { OpsStaffDetail(model: model, staff: member) } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Label(member["name"].string, systemImage: "person.crop.circle").font(.headline)
                            Text(member["role"].string).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                            let count = model.workers.filter { $0["staff_id"].string == member["id"].string && !["completed", "failed", "cancelled"].contains($0["job_status"].string) }.count
                            Text(count == 0 ? "Available for assignments" : "\(count) active \(count == 1 ? "assignment" : "assignments")").font(.caption2).foregroundStyle(OpsTheme.mint)
                        }.padding(.vertical, 6)
                    }.listRowBackground(OpsTheme.surface)
                }
                Button { newStaff = true } label: { Label("Add team member", systemImage: "person.badge.plus") }
            }
            Section { Text("Assignments").font(.headline) }.listRowBackground(Color.clear)
            if filtered.isEmpty { ContentUnavailableView("No matching workers", systemImage: "person.2", description: Text("Ask your assistant to delegate a task, or choose another filter.")) }
            ForEach(filtered, id: \.["id"].string) { worker in
                NavigationLink { OpsWorkerDetail(worker: worker, model: model) } label: {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack { Text(worker["name"].string).font(.headline); Spacer(); OpsStatus(value: worker["job_status"].string) }
                        Text(worker["brief"].string).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                        HStack { Text(worker.first("runtime_provider", "provider").capitalized); if !worker["permissions"].array.isEmpty { Label("Decision needed", systemImage: "hand.raised") } }.font(.caption).foregroundStyle(.secondary)
                    }.padding(.vertical, 8)
                }.listRowBackground(OpsTheme.surface)
            }
        }.opsScreen().navigationTitle("Team").searchable(text: $search, prompt: "Search staff and assignments")
            .toolbar { Button { newWorker = true } label: { Image(systemName: "plus") }.accessibilityLabel("New worker") }
            .sheet(isPresented: $newWorker) { OpsNewAssignment(model: model) }
            .sheet(isPresented: $newStaff) { OpsStaffEditor(model: model) }
            .refreshable { await model.refreshTeam(session) }
    }
}

struct OpsStatus: View {
    let value: String
    private var color: Color { ["failed", "waiting"].contains(value) ? .orange : value == "completed" ? OpsTheme.mint : .secondary }
    var body: some View { Text(value == "delivery_unknown" ? "Delivery uncertain" : value.capitalized).font(.caption2.weight(.medium)).foregroundStyle(color).padding(.horizontal, 8).padding(.vertical, 4).background(color.opacity(0.09), in: Capsule()) }
}

struct OpsWorkerDetail: View {
    @EnvironmentObject private var session: AppSession
    let worker: JSONValue
    @ObservedObject var model: OpsWorkspaceModel
    @State private var detail: JSONValue = .null
    @State private var activityLog = ""
    @State private var activityLoading = false
    @State private var activityError: String?
    @State private var activityRefresh = 0
    @State private var activityUpdated: Date?
    @State private var message = ""
    @State private var messageID = UUID().uuidString
    @State private var submittedMessage: String?
    @State private var messages: [JSONValue] = []
    @State private var sendingMessage = false
    @State private var messageError: String?
    @State private var showActivity = false
    @Environment(\.scenePhase) private var phase
    private var current: JSONValue {
        let summary = model.workers.first { $0["id"] == worker["id"] } ?? worker
        var fields = summary.object
        if detail != .null {
            for (key, value) in detail.object where fields[key] == nil { fields[key] = value }
            fields["brief"] = detail["brief"]; fields["result"] = detail["result"]
        }
        return .object(fields)
    }
    var body: some View {
        List {
            Section("Assignment") {
                Text(current["brief"].string)
                LabeledContent("Status", value: current["job_status"].string.capitalized)
                LabeledContent("Assigned by", value: current["origin"].string == "owner" ? "You" : "Ops assistant")
                LabeledContent("Reports to", value: "Ops assistant")
                if !current["conversation_id"].string.isEmpty {
                    Button("Open supervising conversation") { Task { await model.select(current["conversation_id"].string, session); model.selectedTab = 0 } }
                }
                if !current["created_at"].string.isEmpty { LabeledContent("Created", value: opsDate(current["created_at"].string)) }
                if !current["started_at"].string.isEmpty { LabeledContent("Started", value: opsDate(current["started_at"].string)) }
                if !current["finished_at"].string.isEmpty { LabeledContent("Finished", value: opsDate(current["finished_at"].string)) }
                if !current["job_updated_at"].string.isEmpty { LabeledContent("Last update", value: opsDate(current["job_updated_at"].string)) }
                if !current["route_reason"].string.isEmpty { DisclosureGroup("Why this route") { Text(current["route_reason"].string).font(.caption).foregroundStyle(.secondary) } }
                if let budget = current["max_minutes"].number { LabeledContent("Time budget", value: "\(Int(budget)) minutes") }
                if !current["deadline_at"].string.isEmpty { LabeledContent("Deadline", value: opsDate(current["deadline_at"].string)) }
                if current["cleanup_status"].string == "closed" { Label("Worker session closed", systemImage: "checkmark.circle").font(.caption).foregroundStyle(OpsTheme.mint) }
                if current["cleanup_status"].string == "failed" { Text("Session cleanup needs retry. Your work and report are retained.").font(.caption).foregroundStyle(.orange) }
                LabeledContent("Provider", value: current.first("runtime_provider", "provider").capitalized)
                if !current["runtime_model"].string.isEmpty { LabeledContent("Model", value: current["runtime_model"].string) }
            }
            Section("Join the conversation") {
                ForEach(messages, id: \.["id"].string) { item in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(item["text"].string)
                        Text(item["status"].string.replacingOccurrences(of: "_", with: " ").capitalized).font(.caption).foregroundStyle(.secondary)
                    }
                }
                if current["supports_messages"] != .bool(false) && !["completed", "failed", "cancelled", "delivery_unknown", "cancelling"].contains(current["job_status"].string) {
                    TextField("Give this worker direction", text: $message, axis: .vertical).lineLimit(2...6).disabled(sendingMessage || submittedMessage != nil)
                    Text("Your message is queued for the worker's next turn. Ops continues to oversee the assignment.").font(.caption).foregroundStyle(.secondary)
                    Button(submittedMessage == nil ? "Send to worker" : "Retry message") { Task { await sendMessage() } }.disabled(sendingMessage || message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                } else { Text(current["supports_messages"] == .bool(false) ? "This is a tool-free analysis task. Start another assignment for follow-up work." : current["job_status"].string == "delivery_unknown" ? "Delivery could not be confirmed. Cancel this assignment before starting another; the message will not be sent twice." : current["job_status"].string == "cancelling" ? "Cancellation is in progress." : "This assignment has finished. Start another assignment from the team to continue the work.").font(.caption).foregroundStyle(.secondary) }
                if let messageError { Text(messageError).font(.caption).foregroundStyle(.orange) }
            }
            ForEach(current["permissions"].array, id: \.["id"].string) { permission in
                Section("Needs your decision") {
                    Text(permission.first("title", "name")).font(.headline)
                    Text(permission["description"].string)
                    let actions = permission["actions"].array.isEmpty ? [JSONValue.object(["id": .string("allow"), "label": .string("Allow")]), .object(["id": .string("deny"), "label": .string("Deny")])] : permission["actions"].array
                    ForEach(actions, id: \.["id"].string) { action in
                        Button(action["label"].string) { Task {
                            do { _ = try await session.post("/api/ops/workers/\(current["id"].string)/respond", ["requestId": permission["id"], "actionId": action["id"]]) }
                            catch { model.error = error.localizedDescription }
                        } }
                    }
                }
            }
            Section {
                DisclosureGroup("Conversation & tools", isExpanded: $showActivity) {
                    if activityLoading && activityLog.isEmpty { ProgressView("Loading activity") }
                    else if activityLog.isEmpty && activityError == nil { Text("No activity reported yet.").foregroundStyle(.secondary) }
                    if !activityLog.isEmpty {
                        ScrollView { NativeMarkdown(text: activityLog).frame(maxWidth: .infinity, alignment: .leading) }.frame(maxHeight: 380)
                    }
                    if let activityError { Text(activityError).font(.caption).foregroundStyle(.orange) }
                    HStack {
                        if let activityUpdated { Text("Updated \(activityUpdated.formatted(date: .omitted, time: .shortened))").font(.caption2).foregroundStyle(.secondary) }
                        Spacer()
                        Button("Refresh") { activityRefresh += 1 }.disabled(activityLoading)
                        Button { UIPasteboard.general.string = activityLog } label: { Image(systemName: "doc.on.doc") }.disabled(activityLog.isEmpty).accessibilityLabel("Copy worker activity")
                    }.buttonStyle(.borderless)
                }
            }
            if !current["workspace_id"].string.isEmpty {
                Section { NavigationLink("Workspace files") { OpsDirectory(workspace: .object(["workspaceId": current["workspace_id"]]), path: "") } }
            }
            if !current["result"].string.isEmpty { Section("Worker report") { NativeMarkdown(text: current["result"].string) } }
            Section {
                if ["completed", "failed", "cancelled"].contains(current["job_status"].string) {
                    Button("Archive worker") { Task { await model.workerAction(current["id"].string, "archive", session) } }
                } else {
                    Button("Cancel task", role: .destructive) { Task { await model.workerAction(current["id"].string, "cancel", session) } }
                }
            }
            if let error = model.error { Text(error).foregroundStyle(.orange) }
        }.opsScreen().navigationTitle(current["name"].string)
            .task(id: "\(showActivity)-\(phase == .active)-\(activityRefresh)-\(current["job_status"].string)") {
                guard showActivity && phase == .active else { return }
                while !Task.isCancelled {
                    do {
                        activityLoading = true
                        async let a = session.get("/api/ops/workers/\(worker["id"].string)/activity")
                        async let b = session.get("/api/ops/workers/\(worker["id"].string)/messages")
                        let (result, inbox) = try await (a, b)
                        try Task.checkCancellation()
                        messages = inbox["messages"].array
                        activityLog = result["content"].string; activityError = nil; activityUpdated = Date(); activityLoading = false
                        if ["completed", "failed", "cancelled"].contains(current["job_status"].string) { return }
                        try await Task.sleep(for: .seconds(3))
                    } catch { if !Task.isCancelled { activityError = error.localizedDescription }; activityLoading = false; return }
                }
            }
            .task(id: model.workers.first { $0["id"] == worker["id"] }?["job_updated_at"].string) {
                do {
                    async let a = session.get("/api/ops/workers/\(worker["id"].string)")
                    async let b = session.get("/api/ops/workers/\(worker["id"].string)/messages")
                    let (result, inbox) = try await (a, b)
                    detail = result["worker"]; messages = inbox["messages"].array
                }
                catch { model.error = error.localizedDescription }
            }
    }
    private func sendMessage() async {
        sendingMessage = true; defer { sendingMessage = false }
        let text = submittedMessage ?? message
        submittedMessage = text
        do {
            _ = try await session.post("/api/ops/workers/\(worker["id"].string)/messages", ["requestId": .string(messageID), "text": .string(text)])
            submittedMessage = nil; message = ""; messageID = UUID().uuidString; messageError = nil
            messages = try await session.get("/api/ops/workers/\(worker["id"].string)/messages")["messages"].array
            showActivity = true; activityRefresh += 1
        } catch { messageError = error.localizedDescription }
    }
}

struct OpsHubTools: View {
    var body: some View {
        List {
            Section("Remember and plan") {
                NavigationLink { OpsMemoryView() } label: { Label("Assistant memory", systemImage: "text.book.closed") }
                NavigationLink { OpsSchedules() } label: { Label("Schedules", systemImage: "calendar.badge.clock") }
                NavigationLink("Triggers") { RemoteList(title: "Triggers", path: "/api/triggers", key: "triggers") }
                NavigationLink { OpsTasks() } label: { Label("Tasks", systemImage: "checklist") }
            }
            Section { NavigationLink("Account") { AccountView() } }
        }.opsScreen().navigationTitle("Hub")
    }
}

struct OpsMemoryView: View {
    @EnvironmentObject private var session: AppSession
    @State private var bodyText = ""
    @State private var version = ""
    @State private var error: String?
    @State private var saving = false
    var body: some View {
        VStack(alignment: .leading) {
            Text("Your assistant carries these notes across sessions and providers.").font(.callout).foregroundStyle(.secondary)
            TextEditor(text: $bodyText).font(.body.monospaced()).scrollContentBackground(.hidden)
            if let error { Text(error).font(.caption).foregroundStyle(.orange) }
        }.padding().opsScreen().navigationTitle("Memory")
            .toolbar { Button("Save") { Task {
                saving = true; defer { saving = false }
                do { let saved = try await session.post("/api/ops/memory", ["body": .string(bodyText), "version": .string(version)]); version = saved["version"].string; error = nil }
                catch { self.error = error.localizedDescription }
            } }.disabled(saving || version.isEmpty) }
            .task {
                do { let saved = try await session.get("/api/ops/memory"); bodyText = saved["body"].string; version = saved["version"].string }
                catch { self.error = error.localizedDescription }
            }
    }
}
