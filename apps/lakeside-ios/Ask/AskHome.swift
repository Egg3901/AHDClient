import SwiftUI
import LakesideCore

struct AskHome: View {
    @EnvironmentObject private var session: AppSession
    @StateObject private var features = AskFeatures()
    @State private var conversations: [JSONValue] = []
    @State private var problem: AskProblem?
    @State private var loading = false
    @State private var path: [AskRoute] = []
    @State private var deleting: JSONValue?
    @State private var renaming: JSONValue?
    @State private var renameText = ""
    @State private var starters = false
    @State private var search = ""
    @State private var searchResults: [JSONValue]?
    @State private var games: [JSONValue] = []
    @State private var showAll = false
    @AppStorage("ask.game") private var game = "ahd"
    @AppStorage("ask.live") private var live = false

    /// Pin and rename ship with the Ask 3.0.0 conversation list, which reports
    /// `pinned` on every row. Older servers never show these controls.
    private var supportsPinning: Bool { conversations.contains { $0.object["pinned"] != nil } }
    private var visibleConversations: [JSONValue] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        let base = query.isEmpty ? conversations : (searchResults ?? conversations.filter { $0["title"].string.localizedCaseInsensitiveContains(query) })
        return base.sorted { ($0["pinned"].bool ? 1 : 0) > ($1["pinned"].bool ? 1 : 0) }
    }
    /// Recent threads stay short so starters and the library remain in reach.
    private var shownConversations: [JSONValue] {
        showAll || !search.isEmpty ? visibleConversations : Array(visibleConversations.prefix(6))
    }
    private var gameName: String { games.first(where: { $0["id"].string == game })?["name"].string ?? "A House Divided" }

    var body: some View {
        NavigationStack(path: $path) {
            List {
                Section {
                    AskUsageSummary(gameName: gameName)
                        .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16))
                    Button { path.append(.conversation(id: "", prompt: "", live: live)) } label: {
                        HStack {
                            Label("New question", systemImage: "square.and.pencil").font(.body.weight(.semibold))
                            Spacer()
                            Image(systemName: "arrow.right").accessibilityHidden(true)
                        }
                        .padding(.vertical, 12).padding(.horizontal, 14)
                        .foregroundStyle(Brand.onAccent)
                        .background(Brand.sky, in: RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                    .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                    .accessibilityIdentifier("ask-new-question")
                }.listRowBackground(Color.clear).listRowSeparator(.hidden)

                if let problem { Section { ProblemBanner(problem: problem) { _ = Task { await refresh() } } }.listRowBackground(Color.clear) }

                Section {
                    if visibleConversations.isEmpty && !loading {
                        Text(search.isEmpty ? "No conversations yet." : "No conversations match \"\(search)\".")
                            .font(.callout).foregroundStyle(.secondary)
                    }
                    ForEach(shownConversations, id: \.["id"].string) { conversation in
                        NavigationLink(value: AskRoute.conversation(id: conversation["id"].string, prompt: "", live: live)) {
                            conversationRow(conversation)
                        }
                        .swipeActions { Button("Delete", role: .destructive) { deleting = conversation } }
                        .contextMenu {
                            if supportsPinning {
                                Button { pin(conversation) } label: {
                                    Label(conversation["pinned"].bool ? "Unpin" : "Pin", systemImage: conversation["pinned"].bool ? "pin.slash" : "pin")
                                }
                                Button { renameText = conversation["title"].string; renaming = conversation } label: { Label("Rename", systemImage: "pencil") }
                            }
                            Button(role: .destructive) { deleting = conversation } label: { Label("Delete", systemImage: "trash") }
                        }
                    }
                    if visibleConversations.count > shownConversations.count {
                        Button("Show all \(visibleConversations.count) conversations") { showAll = true }
                            .font(.footnote.weight(.semibold))
                    }
                } header: {
                    AskLabel(text: search.isEmpty ? "Recent · \(conversations.count)" : (searchResults == nil ? "Matching titles" : "Search results"))
                }
                if search.isEmpty && (features.watches == .available || features.reports == .available) {
                    Section {
                        if features.watches == .available {
                            NavigationLink(value: AskRoute.watches) {
                                libraryRow("Watches", symbol: "eye", detail: features.watchLimit.map { "\(features.watchItems.count) of \($0)" } ?? "\(features.watchItems.count)")
                            }.accessibilityIdentifier("ask-watches")
                        }
                        if features.reports == .available {
                            NavigationLink(value: AskRoute.reports) {
                                libraryRow("Reports", symbol: "doc.richtext", detail: "\(features.reportItems.count)")
                            }.accessibilityIdentifier("ask-reports")
                        }
                    } header: { AskLabel(text: "Library") }
                }

                if search.isEmpty {
                    Section {
                        ForEach(StarterCatalog.featured(game: game, profile: session.profile), id: \.["id"].string) { item in
                            Button { path.append(.conversation(id: "", prompt: item["text"].string, live: live)) } label: {
                                VStack(alignment: .leading, spacing: 3) {
                                    AskLabel(text: StarterCatalog.categoryLabel(item["category"].string), color: Brand.sky)
                                    Text(item["text"].string).font(.callout).foregroundStyle(Brand.ink).multilineTextAlignment(.leading)
                                }.padding(.vertical, 2)
                            }
                        }
                        Button { starters = true } label: { Label("Explore questions", systemImage: "list.bullet.rectangle") }
                    } header: { AskLabel(text: "Start with") }
                }

            }
            .listStyle(.insetGrouped)
            .overlay { if loading && conversations.isEmpty { ProgressView() } }
            .lakesideScreen().navigationTitle("Lakeside Ask").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) { BrandHeader(surface: .ask) }
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink(value: AskRoute.settings) { Image(systemName: "gearshape") }.accessibilityLabel("Settings")
                }
            }
            .navigationDestination(for: AskRoute.self) { route in
                switch route {
                case .conversation(let id, let prompt, let liveData): AskConversation(initialID: id, initialQuestion: prompt, initialLive: id.isEmpty ? liveData : nil)
                case .watches: AskWatchesView(features: features) { prompt in path.append(.conversation(id: "", prompt: prompt, live: true)) }
                case .reports: AskReportsView(features: features) { prompt in path.append(.conversation(id: "", prompt: prompt, live: true)) }
                case .settings: AskSettingsView()
                }
            }
            .searchable(text: $search, prompt: "Search conversations")
            .task(id: search) { await runSearch() }
            .sheet(isPresented: $starters) {
                NavigationStack { StarterBrowser { question, liveData in path.append(.conversation(id: "", prompt: question, live: liveData || live)) } }
            }
            .task { await refresh() }
            .refreshable { await refresh() }
            .onChange(of: path) { _, value in if value.isEmpty { Task { await refresh() } } }
            .confirmationDialog("Delete this conversation?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
                Button("Delete conversation", role: .destructive) {
                    guard let item = deleting else { return }; deleting = nil
                    Task {
                        do { _ = try await session.post("/api/conversation/delete", ["id": item["id"]]); await refresh() }
                        catch { problem = AskProblem(error) }
                    }
                }
            }
            .alert("Rename conversation", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
                TextField("Title", text: $renameText)
                Button("Cancel", role: .cancel) { renaming = nil }
                Button("Save") { if let item = renaming { rename(item, to: renameText) }; renaming = nil }
            }
        }
    }

    private func libraryRow(_ title: String, symbol: String, detail: String) -> some View {
        HStack {
            Label(title, systemImage: symbol)
            Spacer()
            Text(detail).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
        }
    }

    private func conversationRow(_ conversation: JSONValue) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                if conversation["pinned"].bool { Image(systemName: "pin.fill").font(.caption2).foregroundStyle(Brand.sky).accessibilityLabel("Pinned") }
                Text(conversation["title"].string.nonempty ?? "Conversation").font(.callout).lineLimit(2)
            }
            let snippet = conversation.first("snippet", "match")
            if !snippet.isEmpty { Text(snippet).font(.caption).foregroundStyle(.secondary).lineLimit(2) }
            if let date = ServerDate.parse(conversation["updated"]) {
                Text(date, style: .relative).font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
            }
        }.padding(.vertical, 2)
    }

    private func refresh() async {
        loading = true; defer { loading = false }
        async let gameList = try? session.get("/api/games")
        async let library: Void = features.refresh(session)
        do {
            let result = try await session.get("/api/conversations")
            conversations = result["conversations"].array
            session.updateUsage(result["usage"])
            problem = nil
        } catch { if !Task.isCancelled { problem = AskProblem(error) } }
        _ = await library
        if let list = await gameList?["games"].array, !list.isEmpty { games = list }
    }

    /// Server full-text search when the server supports it; otherwise the
    /// local title filter. A supporting server echoes the query back.
    private func runSearch() async {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { searchResults = nil; return }
        do { try await Task.sleep(nanoseconds: 300_000_000) } catch { return }
        do {
            let result = try await session.get("/api/conversations", query: ["q": query])
            let echoed = result["q"] != .null || result["query"] != .null
            searchResults = echoed ? result["conversations"].array : nil
        } catch { if !Task.isCancelled { searchResults = nil } }
    }

    private func pin(_ conversation: JSONValue) {
        Task {
            do {
                _ = try await session.post("/api/conversation/pin", ["id": conversation["id"], "pinned": .bool(!conversation["pinned"].bool)])
                await refresh()
            } catch {
                problem = error.failureKind == .some(.notFound) ? AskProblem(title: "Not available", message: "Pinning needs a newer Ask server.") : AskProblem(error)
            }
        }
    }

    private func rename(_ conversation: JSONValue, to title: String) {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        Task {
            do {
                _ = try await session.post("/api/conversation/rename", ["id": conversation["id"], "title": .string(String(trimmed.prefix(120)))])
                await refresh()
            } catch {
                problem = error.failureKind == .some(.notFound) ? AskProblem(title: "Not available", message: "Renaming needs a newer Ask server.") : AskProblem(error)
            }
        }
    }
}

/// Today's allowance with a ring, as the first thing on the home screen.
struct AskUsageSummary: View {
    @EnvironmentObject private var session: AppSession
    let gameName: String
    @State private var expanded = false
    @ScaledMetric(relativeTo: .title) private var ringSize: CGFloat = 46
    @ScaledMetric(relativeTo: .title) private var markSize: CGFloat = 34

    var body: some View {
        let usage = session.profile["usage"]
        let credits = Allowance(limit: usage["limit"].number, remaining: usage["remaining"].number)
        let liveData = Allowance(limit: usage["mcpLimit"].number, remaining: usage["mcpRemaining"].number)
        Button { expanded = true } label: {
            HStack(spacing: 14) {
                BrandMark(surface: .ask, size: markSize).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Lakeside Ask").font(.headline).foregroundStyle(Brand.ink)
                    AskLabel(text: gameName, color: Brand.sky)
                    HStack(spacing: 10) {
                        Text(credits.remaining.map { "\($0.formatted()) credits" } ?? "Credits unavailable")
                        if let left = liveData.remaining { Label("\(left.formatted()) live", systemImage: "bolt.fill").foregroundStyle(Brand.mint) }
                    }.font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
                ZStack {
                    UsageRing(fraction: credits.fractionRemaining, color: credits.low ? .orange : Brand.sky, size: ringSize)
                    if let fraction = credits.fractionRemaining {
                        Text("\(Int((fraction * 100).rounded()))%").font(.caption2.monospacedDigit().weight(.semibold)).foregroundStyle(Brand.ink)
                    }
                }.accessibilityHidden(true)
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel("Daily allowance")
        .accessibilityValue(credits.remaining.map { "\($0.formatted()) credits left" } ?? "Unavailable")
        .sheet(isPresented: $expanded) {
            NavigationStack {
                ScrollView { UsagePanel(usage: session.profile["usage"]).padding() }.lakesideScreen()
                    .navigationTitle("Daily allowance").navigationBarTitleDisplayMode(.inline)
                    .toolbar { Button("Done") { expanded = false } }
                    .task { await session.refreshProfile() }
            }.presentationDetents([.medium, .large])
        }
    }
}
