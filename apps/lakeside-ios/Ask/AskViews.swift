import SwiftUI
import LakesideCore

struct AskHome: View {
    @EnvironmentObject private var session: AppSession
    @State private var conversations: [JSONValue] = []
    @State private var error: String?
    @State private var loading = false
    @State private var path: [String] = []
    @State private var deleting: JSONValue?
    var body: some View {
        NavigationStack(path: $path) {
            List {
                Section {
                    Button { path.append("") } label: { Label("New conversation", systemImage: "square.and.pencil").font(.headline).padding(.vertical, 8) }
                }
                if let error { FailureBanner(message: error) }
                Section("Recent conversations") {
                    ForEach(conversations, id: \.["id"].string) { conversation in
                        NavigationLink(value: conversation["id"].string) {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(conversation["title"].string.nonempty ?? "Conversation").lineLimit(2)
                                if let timestamp = conversation["updated"].number {
                                    Text(Date(timeIntervalSince1970: timestamp / 1000), style: .relative).font(.caption).foregroundStyle(.secondary)
                                }
                            }.padding(.vertical, 4)
                        }.swipeActions { Button("Delete", role: .destructive) { deleting = conversation } }
                    }
                }
            }
            .overlay { if loading && conversations.isEmpty { ProgressView() } }
            .overlay { if !loading && conversations.isEmpty && error == nil { ContentUnavailableView("Ask something", systemImage: "bubble.left.and.text.bubble.right", description: Text("Start a conversation about any of your games." )).allowsHitTesting(false) } }
            .navigationTitle("Lakeside Ask")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { NavigationLink { AccountView() } label: { Image(systemName: "person.crop.circle") }.accessibilityLabel("Account") } }
            .navigationDestination(for: String.self) { id in AskConversation(initialID: id) }
            .task { await refresh() }.refreshable { await refresh() }
            .onChange(of: path) { _, value in if value.isEmpty { Task { await refresh() } } }
            .confirmationDialog("Delete this conversation?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) {
                Button("Delete conversation", role: .destructive) {
                    guard let item = deleting else { return }; deleting = nil
                    Task {
                        do { _ = try await session.post("/api/conversation/delete", ["id": item["id"]]); await refresh() }
                        catch { self.error = error.localizedDescription }
                    }
                }
            }
        }
    }
    private func refresh() async {
        loading = true; defer { loading = false }
        do { conversations = try await session.get("/api/conversations")["conversations"].array; error = nil }
        catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
}

private struct ChatTurn: Identifiable {
    var id: String
    var question: String
    var answer: String
    var citations: [JSONValue] = []
    var answerID: JSONValue = .null
    var reportURL: String = ""
    var model: String = ""
}

struct AskConversation: View {
    let initialID: String
    @EnvironmentObject private var session: AppSession
    @Environment(\.scenePhase) private var scenePhase
    @State private var conversationID = ""
    @State private var requestID = ""
    @State private var turns: [ChatTurn] = []
    @State private var draft = ""
    @State private var status = ""
    @State private var error: String?
    @State private var loading = true
    @State private var streamTask: Task<Void, Never>?
    @State private var streaming = false
    @State private var stopping = false
    @State private var games: [JSONValue] = []
    @State private var game = "ahd"
    @State private var live = true
    @State private var length = "standard"
    @State private var followups: [String] = []
    @State private var reportReason = ""
    @State private var feedbackTurn: ChatTurn?
    @FocusState private var focused: Bool
    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 28) {
                    if turns.isEmpty && !loading {
                        ContentUnavailableView("What would you like to know?", systemImage: "sparkle.magnifyingglass", description: Text("Ask about mechanics, current game state, or how systems connect."))
                    }
                    ForEach(turns) { turn in
                        VStack(alignment: .leading, spacing: 16) {
                            Text(turn.question).font(.headline).padding(14).frame(maxWidth: .infinity, alignment: .leading)
                                .background(.teal.opacity(0.12), in: RoundedRectangle(cornerRadius: 16))
                            NativeMarkdown(text: turn.answer)
                            if !turn.citations.isEmpty {
                                DisclosureGroup("Sources (\(turn.citations.count))") {
                                    VStack(alignment: .leading, spacing: 12) {
                                        ForEach(Array(turn.citations.enumerated()), id: \.offset) { _, citation in
                                            if let url = Endpoint.link(citation["url"].string, base: session.surface.base) {
                                                Link(destination: url) { Label(citation.first("label", "path").nonempty ?? "Source", systemImage: "doc.text") }
                                            } else { Text(citation.first("label", "path")) }
                                        }
                                    }.padding(.top, 8)
                                }.font(.callout)
                            }
                            if !turn.answer.isEmpty && (!streaming || turn.id != turns.last?.id) {
                                HStack {
                                    Button { UIPasteboard.general.string = turn.answer } label: { Image(systemName: "doc.on.doc") }.accessibilityLabel("Copy answer")
                                    if turn.answerID != .null {
                                        Button { feedback(turn, rating: "up") } label: { Image(systemName: "hand.thumbsup") }.accessibilityLabel("Mark helpful")
                                        Button { feedbackTurn = turn } label: { Image(systemName: "flag") }.accessibilityLabel("Report answer")
                                    }
                                    Spacer()
                                    if let url = Endpoint.link(turn.reportURL, base: session.surface.base) { Link("Report", destination: url) }
                                }.buttonStyle(.borderless).foregroundStyle(.secondary)
                            }
                        }.id(turn.id)
                    }
                    if streaming { HStack { ProgressView(); Text(status.nonempty ?? "Thinking…").font(.callout).foregroundStyle(.secondary) } }
                    if let error {
                        FailureBanner(message: error)
                        if !streaming && !conversationID.isEmpty { Button("Reload saved conversation") { Task { await loadTurns() } } }
                    }
                    if !streaming { ForEach(followups, id: \.self) { suggestion in Button(suggestion) { draft = suggestion }.buttonStyle(.bordered) } }
                    Color.clear.frame(height: 1).id("bottom")
                }.padding()
            }
            .onChange(of: turns.count) { _, _ in withAnimation { proxy.scrollTo("bottom", anchor: .bottom) } }
            .onChange(of: focused) { _, active in if active { withAnimation { proxy.scrollTo("bottom", anchor: .bottom) } } }
            .safeAreaInset(edge: .bottom) { composer }
        }
        .navigationTitle("Ask").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Game", selection: $game) { ForEach(games, id: \.["id"].string) { Text($0["name"].string).tag($0["id"].string) } }
                    Toggle("Use live game data", isOn: $live)
                    Picker("Answer length", selection: $length) { Text("Concise").tag("concise"); Text("Standard").tag("standard"); Text("Detailed").tag("deep") }
                } label: { Image(systemName: "slider.horizontal.3") }.disabled(streaming).accessibilityLabel("Answer options")
            }
        }
        .task {
            conversationID = initialID
            do { games = try await session.get("/api/games")["games"].array } catch { self.error = error.localizedDescription }
            await loadTurns()
        }
        .onDisappear { stopForDeparture() }
        .onChange(of: scenePhase) { _, phase in if phase == .background && streaming { stopForDeparture(); error = "Answer paused when the app went into the background. Reload to see saved answers." } }
        .alert("Report this answer", isPresented: Binding(get: { feedbackTurn != nil }, set: { if !$0 { feedbackTurn = nil } })) {
            TextField("What was wrong?", text: $reportReason)
            Button("Cancel", role: .cancel) { feedbackTurn = nil; reportReason = "" }
            Button("Submit report") { if let turn = feedbackTurn { feedback(turn, rating: "down", reason: reportReason) }; feedbackTurn = nil; reportReason = "" }
        }
    }
    private var composer: some View {
        VStack(spacing: 5) {
            HStack(alignment: .bottom, spacing: 12) {
                TextField("Ask a question…", text: $draft, axis: .vertical).lineLimit(1...6).focused($focused)
                    .padding(12).background(.quaternary, in: RoundedRectangle(cornerRadius: 16)).disabled(streaming)
                if streaming {
                    Button { Task { await stop() } } label: { Image(systemName: "stop.circle.fill").font(.title) }.disabled(stopping).accessibilityLabel("Stop answer")
                } else {
                    Button(action: send) { Image(systemName: "arrow.up.circle.fill").font(.title) }
                        .disabled(loading || draft.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count < 5 || draft.utf16.count > 500).accessibilityLabel("Send question")
                }
            }
            if draft.utf16.count > 450 { Text("\(draft.utf16.count)/500").font(.caption2).foregroundStyle(draft.utf16.count > 500 ? .red : .secondary).frame(maxWidth: .infinity, alignment: .trailing) }
        }.padding(.horizontal).padding(.vertical, 10).background(.bar)
    }
    private func loadTurns() async {
        loading = true; defer { loading = false }
        guard !conversationID.isEmpty else { return }
        do {
            let data = try await session.get("/api/conversation", query: ["id": conversationID])
            turns = data["turns"].array.map { ChatTurn(id: $0["id"].string, question: $0["question"].string, answer: $0["answer"].string, citations: $0["citations"].array, answerID: $0["id"], model: $0["model"].string) }
            error = nil
        } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
    private func send() {
        let question = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !streaming, (5...500).contains(question.utf16.count) else { return }
        if conversationID.isEmpty { conversationID = String(UUID().uuidString.prefix(18)) }
        draft = ""; error = nil; followups = []; focused = false; streaming = true; requestID = ""; status = "Thinking…"
        let turnID = UUID().uuidString; turns.append(ChatTurn(id: turnID, question: question, answer: ""))
        let body: [String: JSONValue] = ["question": .string(question), "convId": .string(conversationID), "game": .string(game), "useMcp": .bool(live), "length": .string(length), "tz": .string(TimeZone.current.identifier)]
        streamTask = Task {
            defer { streaming = false; streamTask = nil; requestID = "" }
            do {
                try await session.stream(body) { event in
                    let data = try JSONValue.parse(event.data)
                    guard let index = turns.firstIndex(where: { $0.id == turnID }) else { return }
                    switch event.name {
                    case "meta": conversationID = data["convId"].string; requestID = data["reqId"].string; status = data["status"].string
                    case "status", "action": status = data["label"].string
                    case "delta": turns[index].answer += data.string
                    case "done":
                        if !data["convId"].string.isEmpty { conversationID = data["convId"].string }
                        turns[index].answer = data["answer"].string; turns[index].citations = data["citations"].array
                        turns[index].answerID = data["answerId"]; turns[index].reportURL = data["reportUrl"].string
                        turns[index].model = data["model"].string
                        followups = data["followups"].array.map { $0.string.nonempty ?? $0["question"].string }.filter { !$0.isEmpty }
                    case "error": throw AppFailure(message: data.string.nonempty ?? data.first("message", "error").nonempty ?? "The answer could not be completed.")
                    default: break
                    }
                }
            } catch { if !Task.isCancelled { self.error = error.localizedDescription; if turns.last?.answer.isEmpty == true { draft = question } } }
        }
    }
    private func stop() async {
        stopping = true; defer { stopping = false }
        guard !requestID.isEmpty else { streamTask?.cancel(); streaming = false; return }
        do {
            _ = try await session.post("/api/ask/stop", ["reqId": .string(requestID)])
            streamTask?.cancel(); streaming = false; error = "Answer stopped."
        } catch { self.error = "Could not stop the server: \(error.localizedDescription)" }
    }
    private func stopForDeparture() {
        guard streaming else { return }
        let id = requestID
        streamTask?.cancel(); streaming = false
        if !id.isEmpty { Task { _ = try? await session.post("/api/ask/stop", ["reqId": .string(id)]) } }
    }
    private func feedback(_ turn: ChatTurn, rating: String, reason: String = "") {
        Task {
            do { _ = try await session.post("/api/answer/feedback", ["answerId": turn.answerID, "rating": .string(rating), "reason": .string(reason)]) }
            catch { self.error = error.localizedDescription }
        }
    }
}
