import SwiftUI
import LakesideCore

@MainActor final class OpsWorkspaceModel: ObservableObject {
    @Published var conversations: [JSONValue] = []
    @Published var turns: [JSONValue] = []
    @Published var workers: [JSONValue] = []
    @Published var providers: [JSONValue] = []
    @Published var usage: [JSONValue] = []
    @Published var conversation = ""
    @Published var connected = false
    @Published var error: String?
    @Published var sending = false
    @Published var liveText = ""
    @Published var activity = ""
    @Published var streamingID = ""
    private var cursor = "0"
    private var replyTask: Task<Void, Never>?
    private var flushTask: Task<Void, Never>?
    private var pendingText = ""

    func connect(_ session: AppSession) async {
        defer { connected = false; replyTask?.cancel(); flushTask?.cancel(); flushTask = nil }
        var delay = 1.0
        while !Task.isCancelled {
            do {
                let boot = try await session.get("/api/ops/bootstrap")
                cursor = boot["cursor"].string
                conversations = boot["conversations"].array
                workers = boot["workers"].array
                if conversation.isEmpty { conversation = boot["conversation"]["id"].string }
                try await loadTurns(session)
                connected = true; error = nil; delay = 1
                try await session.events("/api/ops/events", query: ["after": cursor]) { event in
                    let envelope = try JSONValue.parse(event.data)
                    let data = envelope["data"]
                    if event.name == "worker.updated" {
                        self.workers = try await session.get("/api/ops/workers")["workers"].array
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
    func send(_ text: String, _ session: AppSession) async -> Bool {
        guard !sending, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        sending = true; defer { sending = false }
        do {
            _ = try await session.post("/api/chat/send", ["conversation": .string(conversation), "text": .string(text)])
            try await loadTurns(session); error = nil; return true
        } catch { self.error = error.localizedDescription; return false }
    }
    private func attach(_ id: String, _ session: AppSession) {
        guard streamingID != id else { return }
        replyTask?.cancel(); flushTask?.cancel(); flushTask = nil
        streamingID = id; pendingText = ""; liveText = ""; activity = "Working"
        replyTask = Task {
            do {
                try await session.events("/api/chat/stream/\(id)") { event in
                    guard self.streamingID == id else { return }
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
                    case "action", "status": self.activity = payload.first("label", "text", "name")
                    case "final":
                        self.flushTask?.cancel(); self.flushTask = nil
                        self.streamingID = ""; self.liveText = ""; self.activity = ""
                        try await self.loadTurns(session)
                    default: break
                    }
                }
            } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
            if self.streamingID == id { self.streamingID = "" }
        }
    }
    func refreshUsage(_ session: AppSession) async {
        do {
            async let inventory = session.get("/api/ops/providers")
            async let measured = session.get("/api/ops/usage")
            let (a, b) = try await (inventory, measured)
            providers = a["providers"].array; usage = b["providers"].array
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
        TabView {
            NavigationStack { OpsConversation(model: model) }.tabItem { Label("Assistant", systemImage: "sparkles") }
            NavigationStack { OpsTeam(model: model) }.tabItem { Label("Team", systemImage: "person.3.sequence.fill") }
            NavigationStack { OpsCapacity(model: model) }.tabItem { Label("Usage", systemImage: "chart.pie.fill") }
            NavigationStack { OpsHubTools() }.tabItem { Label("Hub", systemImage: "square.grid.2x2") }
        }
        .toolbarBackground(Brand.surface, for: .tabBar).toolbarBackground(.visible, for: .tabBar)
        .task(id: scenePhase) { if scenePhase == .active { await model.connect(session) } }
    }
}

struct OpsConversation: View {
    @EnvironmentObject private var session: AppSession
    @ObservedObject var model: OpsWorkspaceModel
    @State private var draft = ""
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 7) {
                Circle().fill(model.connected ? Brand.mint : Color.orange).frame(width: 6, height: 6)
                Text(model.connected ? "Connected to your hub" : "Reconnecting").font(.caption)
                Spacer()
                Text("\(model.workers.filter { ["running", "waiting", "starting"].contains($0["job_status"].string) }.count) active workers").font(.caption.monospacedDigit())
            }.foregroundStyle(.secondary).padding(.horizontal).padding(.vertical, 10)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 18) {
                    if model.turns.isEmpty {
                        VStack(alignment: .leading, spacing: 14) {
                            BrandMark(surface: .hub, size: 56)
                            Text("What are we\nbuilding today?").font(.system(size: 34, weight: .bold, design: .rounded))
                            Text("One assistant. A team when you need it.").foregroundStyle(.secondary)
                        }.padding(.vertical, 36)
                    } else {
                        Button("Load earlier messages") { Task { await model.older(session) } }.font(.caption)
                    }
                    ForEach(model.turns, id: \.["id"].string) { turn in
                        VStack(alignment: .leading, spacing: 9) {
                            HStack {
                                Text(turn["role"].string == "owner" ? "YOU" : turn["role"].string == "assistant" ? "OPS" : "TEAM")
                                    .font(.system(size: 10, weight: .bold, design: .monospaced)).tracking(1.5).foregroundStyle(Brand.sky)
                                Spacer()
                                Text(turn["route"]["label"].string).font(.caption2).foregroundStyle(.secondary)
                            }
                            if turn["id"].string == model.streamingID {
                                Text(model.liveText.isEmpty ? "Thinking…" : model.liveText).textSelection(.enabled)
                                if !model.activity.isEmpty { Text(model.activity).font(.caption).foregroundStyle(.secondary).lineLimit(2) }
                            } else {
                                Text(turn["body"].string.isEmpty ? turn["status"].string.capitalized : turn["body"].string).textSelection(.enabled)
                                if !turn["error"].string.isEmpty { Text(turn["error"].string).font(.caption).foregroundStyle(.orange) }
                            }
                        }.frame(maxWidth: .infinity, alignment: .leading).brandCard()
                    }
                }.padding()
            }.defaultScrollAnchor(.bottom)
            if let error = model.error { Text(error).font(.caption).foregroundStyle(.orange).padding(.horizontal).lineLimit(3) }
            HStack(alignment: .bottom, spacing: 12) {
                TextField("Message Ops", text: $draft, axis: .vertical).lineLimit(1...6).padding(12).background(Brand.raised, in: RoundedRectangle(cornerRadius: 18))
                if !model.streamingID.isEmpty {
                    Button { Task { _ = try? await session.post("/api/chat/stop", ["turn": .string(model.streamingID)]) } } label: { Image(systemName: "stop.circle").font(.title2) }.accessibilityLabel("Stop reply")
                }
                Button { let text = draft; Task { if await model.send(text, session), draft == text { draft = "" } } } label: {
                    Image(systemName: "arrow.up.circle.fill").font(.system(size: 34))
                }.disabled(model.sending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty).accessibilityLabel("Send message")
            }.padding()
        }.lakesideScreen().navigationTitle("Lakeside Ops").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) { BrandHeader(surface: .hub) }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        ForEach(model.conversations, id: \.["id"].string) { conversation in
                            Button(conversation["title"].string) { Task { await model.select(conversation["id"].string, session) } }
                        }
                    } label: { Image(systemName: "bubble.left.and.bubble.right") }.accessibilityLabel("Conversations")
                }
            }
    }
}

struct OpsTeam: View {
    @EnvironmentObject private var session: AppSession
    @ObservedObject var model: OpsWorkspaceModel
    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text("A team that fits the task.").font(.title2.bold())
                    Text("Ask Ops to delegate independent work. Each worker has its own worktree and reports back to your conversation.").font(.callout).foregroundStyle(.secondary)
                }.padding(.vertical, 8)
            }
            if model.workers.isEmpty { ContentUnavailableView("No workers yet", systemImage: "person.3", description: Text("Your assistant can create workers when a task needs them.")) }
            ForEach(model.workers, id: \.["id"].string) { worker in
                NavigationLink {
                    OpsWorkerDetail(worker: worker, model: model)
                } label: {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack { Text(worker["name"].string).font(.headline); Spacer(); Text(worker["job_status"].string.capitalized).font(.caption).foregroundStyle(Brand.mint) }
                        Text(worker["brief"].string).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                        Text(worker.first("runtime_provider", "provider").uppercased()).font(.system(size: 9, weight: .bold, design: .monospaced)).foregroundStyle(Brand.sky)
                    }.padding(.vertical, 8)
                }
            }
        }.lakesideScreen().navigationTitle("Your team")
    }
}

struct OpsWorkerDetail: View {
    @EnvironmentObject private var session: AppSession
    let worker: JSONValue
    @ObservedObject var model: OpsWorkspaceModel
    @State private var detail: JSONValue = .null
    private var current: JSONValue {
        let summary = model.workers.first { $0["id"] == worker["id"] } ?? worker
        var fields = summary.object
        if detail != .null { fields["brief"] = detail["brief"]; fields["result"] = detail["result"] }
        return .object(fields)
    }
    var body: some View {
        List {
            Section("Task") { Text(current["brief"].string); LabeledContent("Status", value: current["job_status"].string.capitalized) }
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
            if !current["result"].string.isEmpty { Section("Worker report") { Text(current["result"].string).textSelection(.enabled) } }
            Section {
                if ["completed", "failed", "cancelled"].contains(current["job_status"].string) {
                    Button("Archive worker") { Task { await model.workerAction(current["id"].string, "archive", session) } }
                } else {
                    Button("Cancel task", role: .destructive) { Task { await model.workerAction(current["id"].string, "cancel", session) } }
                }
            }
            if let error = model.error { Text(error).foregroundStyle(.orange) }
        }.lakesideScreen().navigationTitle(current["name"].string)
            .task(id: model.workers.first { $0["id"] == worker["id"] }?["updated_at"].string) {
                do { detail = try await session.get("/api/ops/workers/\(worker["id"].string)")["worker"] }
                catch { model.error = error.localizedDescription }
            }
    }
}

struct OpsCapacity: View {
    @EnvironmentObject private var session: AppSession
    @ObservedObject var model: OpsWorkspaceModel
    var body: some View {
        List {
            Section { Text("Know where the work goes.").font(.title2.bold()); Text("Today's measured assistant and worker usage. Subscription capacity is shown only when the provider reports it.").font(.callout).foregroundStyle(.secondary) }
            ForEach(model.providers, id: \.["id"].string) { provider in
                Section(provider["label"].string) {
                    LabeledContent("Runtime", value: provider["status"].string.capitalized)
                    let measured = model.usage.first { $0["provider"] == provider["id"] } ?? .null
                    LabeledContent("Attempts today", value: measured["attempts"].string.isEmpty ? "0" : measured["attempts"].string)
                    if let input = measured["input_tokens"].number, let output = measured["output_tokens"].number {
                        HStack(spacing: 16) {
                            UsageRing(fraction: output / max(1, input + output), color: Brand.sky, size: 48)
                            VStack(alignment: .leading) {
                                Text("\(Int(input + output).formatted()) measured tokens").font(.headline)
                                Text("\(Int(input).formatted()) input · \(Int(output).formatted()) output").font(.caption).foregroundStyle(.secondary)
                            }
                        }.padding(.vertical, 8)
                    }
                    if provider["allowances"].array.isEmpty {
                        Text("Subscription remaining: not reported").font(.caption).foregroundStyle(.secondary)
                    }
                    ForEach(provider["allowances"].array, id: \.["id"].string) { allowance in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack { Text(allowance["label"].string); Spacer(); Text("\(Int(allowance["remainingPercent"].number ?? 0))% left").monospacedDigit() }.font(.caption)
                            ProgressView(value: allowance["remainingPercent"].number ?? 0, total: 100).tint(Brand.mint)
                            if let observed = allowance["observedAt"].number {
                                Text("Reported \(Date(timeIntervalSince1970: observed / 1000).formatted(date: .omitted, time: .shortened))").font(.caption2).foregroundStyle(.secondary)
                            }
                        }.padding(.vertical, 4)
                    }
                    if let count = measured["unmeasured_token_attempts"].number, count > 0 { Text("\(Int(count)) attempts have no token measurement.").font(.caption).foregroundStyle(.secondary) }
                }
            }
            if let error = model.error { Text(error).foregroundStyle(.orange) }
        }.lakesideScreen().navigationTitle("Usage").task { await model.refreshUsage(session) }.refreshable { await model.refreshUsage(session) }
    }
}

struct OpsHubTools: View {
    var body: some View {
        List {
            Section("Remember and plan") {
                NavigationLink("Assistant memory") { OpsMemoryView() }
                NavigationLink("Schedules") { RemoteList(title: "Schedules", path: "/api/schedules", key: "schedules") }
                NavigationLink("Triggers") { RemoteList(title: "Triggers", path: "/api/triggers", key: "triggers") }
                NavigationLink("Tasks") { RemoteList(title: "Tasks", path: "/api/tasks", key: "tasks") }
            }
            Section { NavigationLink("Account") { AccountView() } }
        }.lakesideScreen().navigationTitle("Hub")
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
        }.padding().lakesideScreen().navigationTitle("Memory")
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
