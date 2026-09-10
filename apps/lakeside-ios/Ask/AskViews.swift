import SwiftUI
import LakesideCore

struct AskHome: View {
    @EnvironmentObject private var session: AppSession
    @State private var conversations: [JSONValue] = []
    @State private var error: String?
    @State private var loading = false
    @State private var path: [String] = []
    @State private var deleting: JSONValue?
    @State private var starters = false
    @State private var initialPrompt = ""
    @State private var search = ""
    @AppStorage("ask.live") private var useLive = false
    var body: some View {
        NavigationStack(path: $path) {
            List {
                Section {
                    BrandHero(surface: .ask, compact: true).padding(.vertical, 10)
                        .listRowBackground(Color.clear).listRowInsets(EdgeInsets(top: 8, leading: 4, bottom: 12, trailing: 4)).listRowSeparator(.hidden)
                }
                Section {
                    Button { initialPrompt = ""; path.append("") } label: {
                        HStack { Label("New conversation", systemImage: "square.and.pencil").font(.headline); Spacer(); Image(systemName: "arrow.right") }.padding(.vertical, 10)
                    }.listRowBackground(Brand.sky.opacity(0.12))
                }
                Section {
                    Button { starters = true } label: { Label("Explore questions", systemImage: "sparkle.magnifyingglass") }
                }
                if conversations.isEmpty && !loading {
                    Section("A place to start") {
                        ForEach(["How is inflation calculated?", "What raises approval before an election?", "How do tariffs affect the economy?"], id: \.self) { prompt in
                            NavigationLink { AskConversation(initialID: "", initialQuestion: prompt) } label: {
                                Label(prompt, systemImage: "arrow.up.right").font(.callout)
                            }
                        }
                    }
                }
                if let error { FailureBanner(message: error) }
                Section("Recent conversations") {
                    ForEach(conversations.filter { search.isEmpty || $0["title"].string.localizedCaseInsensitiveContains(search) }, id: \.["id"].string) { conversation in
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

            .lakesideScreen().navigationTitle("Lakeside Ask").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .principal) { BrandHeader(surface: .ask) }; ToolbarItem(placement: .topBarLeading) { UsageButton() }; ToolbarItem(placement: .topBarTrailing) { NavigationLink { AccountView() } label: { Image(systemName: "person.crop.circle") }.accessibilityLabel("Account") } }
            .navigationDestination(for: String.self) { id in AskConversation(initialID: id, initialQuestion: id.isEmpty ? initialPrompt : "") }
            .searchable(text: $search, prompt: "Search conversations")
            .sheet(isPresented: $starters) { NavigationStack { StarterBrowser { question, live in initialPrompt = question; useLive = live; path.append("") } } }
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
        do { let result = try await session.get("/api/conversations"); conversations = result["conversations"].array; session.updateUsage(result["usage"]); error = nil }
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
    var trail: [String] = []
    var metadata: JSONValue = .null
    var attachments: [JSONValue] = []
}

struct AskConversation: View {
    @StateObject private var attachments = ChatAttachments()
    let initialID: String
    var initialQuestion: String = ""
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
    @AppStorage("ask.game") private var game = "ahd"
    @AppStorage("ask.live") private var live = false
    @AppStorage("ask.length") private var length = "standard"
    @AppStorage("ask.style") private var style = "standard"
    @AppStorage("ask.effort") private var effort = "auto"
    @AppStorage("ask.visualizations") private var visualizations = true
    @State private var mode: AskMode = .auto
    @State private var options = false
    @State private var sharing = false
    @State private var nextCost: JSONValue = .null
    @State private var feedbackNotice: String?
    @State private var followups: [String] = []
    @State private var reportReason = ""
    @State private var feedbackTurn: ChatTurn?
    @FocusState private var focused: Bool
    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 28) {
                    if turns.isEmpty && !loading {
                        VStack(alignment: .leading, spacing: 20) {
                            BrandHero(surface: .ask, compact: true)
                            Text("Ask about mechanics, current game state, or how systems connect.").font(.callout).foregroundStyle(.secondary)
                        }.padding(.vertical, 24)

                    }
                    ForEach(turns) { turn in
                        VStack(alignment: .leading, spacing: 16) {
                            ForEach(Array(turn.attachments.enumerated()), id: \.offset) { _, file in Label(file["name"].string, systemImage: "paperclip").font(.caption) }
                            Text(turn.question).font(.headline).padding(14).frame(maxWidth: .infinity, alignment: .leading)
                                .background(Brand.sky.opacity(0.12), in: RoundedRectangle(cornerRadius: 16))
                            HStack(spacing: 8) { BrandMark(surface: .ask, size: 22); Text("ASK").font(.caption2.bold()).tracking(1.5); Spacer(); if !turn.model.isEmpty { Text(turn.model).font(.caption2).foregroundStyle(.secondary) } }
                            NativeMarkdown(text: turn.answer, streaming: streaming && turn.id == turns.last?.id)
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
                            if !turn.trail.isEmpty {
                                DisclosureGroup("Research trail") {
                                    VStack(alignment: .leading, spacing: 10) {
                                        ForEach(Array(turn.trail.enumerated()), id: \.offset) { index, label in
                                            HStack(alignment: .top, spacing: 10) { Text(String(index + 1)).font(.caption.monospacedDigit()).foregroundStyle(Brand.mint); Text(label).font(.caption) }
                                        }
                                    }.padding(.top, 8)
                                }.font(.callout)
                            }
                            if turn.metadata["cached"].bool { Label("Saved answer, no credits used", systemImage: "clock.arrow.circlepath").font(.caption).foregroundStyle(.secondary) }
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
                    if let feedbackNotice { Label(feedbackNotice, systemImage: "checkmark.circle").font(.caption).foregroundStyle(Brand.mint) }
                    if streaming { LoadingShimmer(text: status.nonempty ?? "Thinking…").font(.callout) }
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
        .lakesideScreen().navigationTitle("Ask").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) { BrandHeader(surface: .ask, compact: true) }
            ToolbarItem(placement: .topBarTrailing) { UsageButton() }
            ToolbarItem(placement: .topBarTrailing) {
                Button { options = true } label: { Image(systemName: "slider.horizontal.3") }.disabled(streaming).accessibilityLabel("Answer options")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { sharing = true } label: { Image(systemName: "square.and.arrow.up") }.disabled(turns.isEmpty || streaming).accessibilityLabel("Share conversation")

            }
        }
        .sheet(isPresented: $options) {
            NavigationStack { AskOptionsView(game: $game, live: $live, visualizations: $visualizations, style: $style, length: $length, effort: $effort, games: games) }
        }
        .sheet(isPresented: $sharing) {
            NavigationStack { ConversationSharing(id: conversationID, text: turns.map { "# " + $0.question + "\n\n" + $0.answer }.joined(separator: "\n\n")) }
        }
        .task {
            conversationID = initialID; draft = initialQuestion
            do { games = try await session.get("/api/games")["games"].array } catch { self.error = error.localizedDescription }
            await loadTurns()
            await refreshCost()
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
        VStack(spacing: 10) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(AskMode.allCases, id: \.rawValue) { choice in
                        Button { mode = choice } label: {
                            Text(choice.title).font(.caption.bold()).padding(.horizontal, 13).padding(.vertical, 7)
                                .background(mode == choice ? Brand.sky.opacity(0.2) : Brand.surface, in: Capsule())
                        }.disabled(streaming).accessibilityAddTraits(mode == choice ? .isSelected : [])
                    }
                }
            }
            HStack(spacing: 6) {
                Circle().fill(live ? Brand.mint : Brand.sky).frame(width: 5, height: 5)
                Text(live ? "Live game data" : "Code and documentation").font(.caption2)
                Spacer()
                if let cost = nextCost["cost"].number { Text("\(cost.formatted()) credit\(cost == 1 ? "" : "s")").font(.caption2.monospacedDigit()) }
                Text(games.first(where: { $0["id"].string == game })?["name"].string ?? "A House Divided").font(.caption2).lineLimit(1)
            }.foregroundStyle(.secondary)
            AttachmentTray(attachments: attachments).disabled(streaming)
            HStack(alignment: .bottom, spacing: 12) {
                AttachmentPicker(attachments: attachments).disabled(streaming)
                TextField("Ask a question…", text: $draft, axis: .vertical).lineLimit(1...6).focused($focused)
                    .accessibilityIdentifier("ask-composer")
                    .padding(12).background(Brand.surface, in: RoundedRectangle(cornerRadius: 16)).overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Brand.sky.opacity(0.15))).disabled(streaming)
                if streaming {
                    Button { Task { await stop() } } label: { Image(systemName: "stop.circle.fill").font(.title) }.disabled(stopping).accessibilityLabel("Stop answer")
                } else {
                    Button(action: send) { Image(systemName: "arrow.up.circle.fill").font(.title) }
                        .disabled(loading || attachments.uploading || (draft.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count < 5 && attachments.items.isEmpty) || draft.utf16.count > 500).accessibilityLabel("Send question")
                }
            }
            if mode != .auto { Text(mode.hint).font(.caption2).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading) }
            if draft.utf16.count > 450 { Text("\(draft.utf16.count)/500").font(.caption2).foregroundStyle(draft.utf16.count > 500 ? .red : .secondary).frame(maxWidth: .infinity, alignment: .trailing) }
        }.padding(.horizontal).padding(.vertical, 10).background(Brand.background)
    }
    private func refreshCost() async {
        do { nextCost = try await session.get("/api/nextcost", query: ["convId": conversationID]) }
        catch { if !Task.isCancelled { nextCost = .null } }
    }
    private func loadTurns() async {
        loading = true; defer { loading = false }
        guard !conversationID.isEmpty else { return }
        do {
            let data = try await session.get("/api/conversation", query: ["id": conversationID])
            turns = data["turns"].array.map { ChatTurn(id: $0["id"].string, question: $0["question"].string, answer: $0["answer"].string, citations: $0["citations"].array, answerID: $0["id"], model: $0.first("modelName", "modelId", "model"), metadata: $0, attachments: $0["attachments"].array) }
            error = nil
        } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
    private func send() {
        let entered = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        let question = entered.utf16.count < 5 && !attachments.items.isEmpty ? (entered.isEmpty ? "Please examine the attached files." : entered + "\nPlease examine the attached files.") : entered
        guard !streaming, !attachments.uploading, (5...500).contains(question.utf16.count) else { return }
        let files = attachments.payload
        if conversationID.isEmpty { conversationID = String(UUID().uuidString.prefix(18)) }
        draft = ""; error = nil; followups = []; focused = false; streaming = true; requestID = ""; status = "Thinking…"
        let turnID = UUID().uuidString; turns.append(ChatTurn(id: turnID, question: question, answer: "", attachments: files.array))
        let body: [String: JSONValue] = ["question": .string(question), "convId": .string(conversationID), "game": .string(game), "useMcp": .bool(live), "length": .string(length), "style": .string(style), "effort": .string(effort), "visualizations": .bool(visualizations), "mode": .string(mode.rawValue), "tz": .string(TimeZone.current.identifier), "attachments": files]
        streamTask = Task {
            defer { streaming = false; streamTask = nil; requestID = "" }
            do {
                try await session.stream(body) { event in
                    let data = try JSONValue.parse(event.data)
                    guard let index = turns.firstIndex(where: { $0.id == turnID }) else { return }
                    switch event.name {
                    case "meta": conversationID = data["convId"].string; requestID = data["reqId"].string; status = data["status"].string
                    case "status", "action":
                        status = data["label"].string
                        if !status.isEmpty && turns[index].trail.count < 80 { turns[index].trail.append(status) }
                    case "delta": turns[index].answer += data.string
                    case "done":
                        attachments.items.removeAll()
                        session.updateUsage(data["usage"])
                        turns[index].metadata = data
                        if !data["convId"].string.isEmpty { conversationID = data["convId"].string }
                        turns[index].answer = data["answer"].string; turns[index].citations = data["citations"].array
                        turns[index].answerID = data["answerId"]; turns[index].reportURL = data["reportUrl"].string
                        turns[index].model = data.first("modelName", "modelId", "model")
                        followups = data["followups"].array.map { $0.string.nonempty ?? $0["question"].string }.filter { !$0.isEmpty }
                    case "error": throw AppFailure(message: data.string.nonempty ?? data.first("message", "error").nonempty ?? "The answer could not be completed.")
                    default: break
                    }
                }
                await refreshCost()
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
            do { _ = try await session.post("/api/answer/feedback", ["answerId": turn.answerID, "rating": .string(rating), "reason": .string(reason)]); feedbackNotice = rating == "up" ? "Marked helpful." : "Report sent for review." }
            catch { self.error = error.localizedDescription }
        }
    }
}
