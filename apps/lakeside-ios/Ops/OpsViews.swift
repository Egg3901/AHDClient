import SwiftUI
import Charts
import LakesideCore

struct OpsHome: View {
    var body: some View {
        TabView {
            NavigationStack { OverviewView() }.tabItem { Label("Overview", systemImage: "waveform.path.ecg") }
            NavigationStack { AgentsView() }.tabItem { Label("Agents", systemImage: "terminal") }
            NavigationStack { TicketsView() }.tabItem { Label("Tickets", systemImage: "tray.full") }
            NavigationStack { OpsMoreView() }.tabItem { Label("More", systemImage: "square.grid.2x2") }
        }
    }
}

struct OverviewView: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.scenePhase) private var scenePhase
    @State private var services: [JSONValue] = []
    @State private var summary: JSONValue = .null
    @State private var error: String?
    @State private var updated: Date?
    @State private var loading = false
    var body: some View {
        List {
            if let error { FailureBanner(message: error) }
            if summary != .null {
                Section("Live game") {
                    HStack {
                        metric("Turn", summary["turn"].string)
                        Spacer(); metric("Year", summary["year"].string)
                        Spacer(); metric("Active players", summary["activePlayers"].string)
                    }.padding(.vertical, 10)
                    NavigationLink("Game details") { JSONDetail(title: "Game", value: summary) }
                    NavigationLink("Countries") { RemoteList(title: "Countries", path: "/api/game/countries", key: "countries") }
                }
            }
            Section("Services") {
                ForEach(services, id: \.["id"].string) { service in
                    NavigationLink { ServiceView(service: service) } label: {
                        HStack(spacing: 12) {
                            Circle().fill(service["current"].string == "operational" ? Color.green : service["current"].string == "unknown" ? Color.gray : Color.red).frame(width: 9, height: 9)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(service["name"].string)
                                Text(service["current"].string.replacingOccurrences(of: "_", with: " ").capitalized).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if let latency = service["latencyMs"].number { Text("\(Int(latency)) ms").font(.caption.monospacedDigit()).foregroundStyle(.secondary) }
                        }.padding(.vertical, 4)
                    }
                }
            }
            if let updated { Text("Updated \(updated.formatted(date: .omitted, time: .shortened))").font(.caption).foregroundStyle(.secondary) }
        }
        .navigationTitle("Lakeside Ops")
        .toolbar { NavigationLink { AccountView() } label: { Image(systemName: "person.crop.circle") }.accessibilityLabel("Account") }
        .overlay { if loading && services.isEmpty { ProgressView() } }
        .refreshable { await refresh() }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await refresh()
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(60)) } catch { return }
                await refresh()
            }
        }
    }
    private func metric(_ title: String, _ value: String) -> some View { VStack(alignment: .leading, spacing: 5) { Text(value).font(.title2.bold().monospacedDigit()); Text(title).font(.caption).foregroundStyle(.secondary) } }
    private func refresh() async {
        guard !loading else { return }; loading = true; defer { loading = false }
        do { services = try await session.get("/api/status")["services"].array; updated = Date(); error = nil }
        catch { if !Task.isCancelled { self.error = error.localizedDescription } }
        if session.profile["role"].string == "admin" {
            do { summary = try await session.get("/api/game/summary") }
            catch { if !Task.isCancelled { self.error = error.localizedDescription } }
        }
    }
}

struct ServiceView: View {
    let service: JSONValue
    var body: some View {
        List {
            Section {
                LabeledContent("Status", value: service["current"].string.replacingOccurrences(of: "_", with: " ").capitalized)
                ForEach([("24 hours", "uptime24h"), ("7 days", "uptime7d"), ("90 days", "uptime90d")], id: \.1) { title, key in
                    LabeledContent(title, value: service[key].number.map { "\($0.formatted())%" } ?? "No samples")
                }
            }
            if !service["history"].array.isEmpty {
                Section("Daily uptime") {
                    Chart(Array(service["history"].array.enumerated()), id: \.offset) { _, day in
                        if let pct = day["pct"].number { BarMark(x: .value("Day", day["date"].string), y: .value("Uptime", pct)).foregroundStyle(pct >= 99 ? Color.green : Color.orange) }
                    }.chartYScale(domain: 0...100).chartXAxis(.hidden).frame(height: 180)
                    Text("Percent of successful checks per day").font(.caption).foregroundStyle(.secondary)
                }
            }
            NavigationLink("All service data") { JSONDetail(title: service["name"].string, value: service) }
        }.navigationTitle(service["name"].string).navigationBarTitleDisplayMode(.inline)
    }
}

struct AgentsView: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.scenePhase) private var scenePhase
    @State private var agents: [JSONValue] = []
    @State private var error: String?
    @State private var query = ""
    @State private var loading = false
    @State private var launching = false
    var body: some View {
        List {
            if let error { FailureBanner(message: error) }
            ForEach(agents.filter { query.isEmpty || $0.pretty.localizedCaseInsensitiveContains(query) }, id: \.["sessionId"].string) { agent in
                NavigationLink { AgentView(agent: agent) } label: {
                    VStack(alignment: .leading, spacing: 7) {
                        HStack {
                            Text(agent.first("title", "taskExcerpt", "tmuxName", "sessionId")).font(.headline).lineLimit(2)
                            if agent["needsInput"].bool { Image(systemName: "exclamationmark.bubble.fill").foregroundStyle(.orange).accessibilityLabel("Needs input") }
                        }
                        Text(agent.first("statusLine", "taskExcerpt", "activity", "status")).font(.callout).foregroundStyle(.secondary).lineLimit(2)
                        Text(agent.first("provider", "kind", "model")).font(.caption).foregroundStyle(.secondary)
                    }.padding(.vertical, 5)
                }
            }
        }.navigationTitle("Agents").searchable(text: $query)
        .toolbar { Button { launching = true } label: { Image(systemName: "plus") }.accessibilityLabel("Launch agent") }
        .sheet(isPresented: $launching, onDismiss: { Task { await refresh() } }) { NavigationStack { LaunchAgentView() } }
        .overlay { if loading && agents.isEmpty { ProgressView() } }
        .overlay { if !loading && agents.isEmpty && error == nil { ContentUnavailableView("No agents", systemImage: "terminal") } }
        .refreshable { await refresh() }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }; await refresh()
            while !Task.isCancelled { do { try await Task.sleep(for: .seconds(30)) } catch { return }; await refresh() }
        }
    }
    private func refresh() async {
        guard !loading else { return }; loading = true; defer { loading = false }
        do { let result = try await session.get("/api/code/sessions"); agents = result["sessions"].array; error = result["warning"].string.nonempty }
        catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
}

struct AgentView: View {
    let agent: JSONValue
    @EnvironmentObject private var session: AppSession
    @Environment(\.scenePhase) private var scenePhase
    @State private var snapshot: JSONValue = .null
    @State private var error: String?
    @State private var draft = ""
    @State private var sending = false
    @State private var loading = false
    @State private var delivery: String?
    private var tmux: String { agent["tmuxName"].string }
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                if let error { FailureBanner(message: error) }
                if let delivery { Label(delivery, systemImage: "checkmark.circle").font(.callout).foregroundStyle(.secondary) }
                if snapshot["pendingQuestion"] != .null && !tmux.isEmpty {
                    AgentQuestionView(tmux: tmux, question: snapshot["pendingQuestion"]) { Task { await refresh() } }.id(snapshot["pendingQuestion"].pretty)
                }
                if !snapshot["transcript"]["turns"].array.isEmpty {
                    ForEach(Array(snapshot["transcript"]["turns"].array.enumerated()), id: \.offset) { _, turn in
                        if !turn["user"].string.isEmpty { Text(turn["user"].string).font(.headline).padding().frame(maxWidth: .infinity, alignment: .leading).background(.cyan.opacity(0.12), in: RoundedRectangle(cornerRadius: 14)) }
                        ForEach(Array(turn["blocks"].array.enumerated()), id: \.offset) { _, block in
                            if !block["text"].string.isEmpty { NativeMarkdown(text: block["text"].string) }
                            else { JSONCard(title: block.first("title", "type"), value: block) }
                        }
                    }
                } else if !snapshot["output"].string.isEmpty {
                    Text(snapshot["output"].string.replacingOccurrences(of: "\u{001B}\\[[0-?]*[ -/]*[@-~]", with: "", options: .regularExpression))
                        .font(.system(.footnote, design: .monospaced)).textSelection(.enabled)
                } else if snapshot != .null { JSONCard(title: "Session", value: snapshot) }
                else if loading { ProgressView() }
            }.padding()
        }
        .navigationTitle(agent.first("title", "tmuxName", "sessionId")).navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            if !tmux.isEmpty {
                HStack(alignment: .bottom) {
                    TextField("Message this agent…", text: $draft, axis: .vertical).lineLimit(1...6).textFieldStyle(.roundedBorder)
                    Button { Task { await send() } } label: { Image(systemName: "arrow.up.circle.fill").font(.title) }
                        .disabled(sending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty).accessibilityLabel("Send to agent")
                }.padding().background(.bar)
            }
        }
        .refreshable { await refresh() }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }; await refresh()
            guard !tmux.isEmpty else { return }
            while !Task.isCancelled { do { try await Task.sleep(for: .seconds(8)) } catch { return }; await refresh() }
        }
    }
    private func refresh() async {
        guard !loading else { return }; loading = true; defer { loading = false }
        do {
            if !tmux.isEmpty { snapshot = try await session.get("/api/code/tmux/\(tmux)/capture") }
            else if agent["sessionId"].string.hasPrefix("proc:") { snapshot = agent }
            else { snapshot = try await session.get("/api/code/sessions/\(agent["sessionId"].string)") }
            error = nil
        } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
    private func send() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !sending else { return }; sending = true; defer { sending = false }
        do { _ = try await session.post("/api/code/tmux/\(tmux)/message", ["text": .string(text)]); draft = ""; delivery = "Message queued for the agent."; await refresh() }
        catch { self.error = error.localizedDescription }
    }
}

struct JSONCard: View {
    let title: String
    let value: JSONValue
    var body: some View {
        DisclosureGroup(title.nonempty ?? "Details") { Text(value.pretty).font(.system(.footnote, design: .monospaced)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) }
            .padding().background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
    }
}

struct TicketsView: View {
    @EnvironmentObject private var session: AppSession
    @State private var kind = "tickets"
    @State private var status = "all"
    @State private var items: [JSONValue] = []
    @State private var page = 1
    @State private var totalPages = 1
    @State private var error: String?
    @State private var loading = false
    var body: some View {
        List {
            Picker("Type", selection: $kind) { Text("Tickets").tag("tickets"); Text("Suggestions").tag("suggestions") }.pickerStyle(.segmented)
            if let error { FailureBanner(message: error) }
            ForEach(items, id: \.["_id"].string) { item in
                NavigationLink { TicketView(item: item, kind: kind) } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(item.first("title", "subject", "description", "content").nonempty ?? "Ticket \(item["ticketNumber"].string)").font(.headline).lineLimit(2)
                        HStack { Text("#\(item.first("ticketNumber", "suggestionNumber"))"); Text(item["status"].string.capitalized) }.font(.caption).foregroundStyle(.secondary)
                    }.padding(.vertical, 5)
                }
            }
            if totalPages > 1 {
                HStack {
                    Button("Previous") { page -= 1 }.disabled(page <= 1 || loading)
                    Spacer(); Text("\(page) / \(totalPages)").font(.caption); Spacer()
                    Button("Next") { page += 1 }.disabled(page >= totalPages || loading)
                }.buttonStyle(.borderless)
            }
        }.navigationTitle(kind.capitalized)
        .toolbar { Menu { Picker("Status", selection: $status) { ForEach(["all", "open", "in_progress", "closed"], id: \.self) { Text($0.replacingOccurrences(of: "_", with: " ").capitalized).tag($0) } } } label: { Image(systemName: "line.3.horizontal.decrease.circle") }.accessibilityLabel("Filter status") }
        .overlay { if loading && items.isEmpty { ProgressView() } }
        .overlay { if !loading && items.isEmpty && error == nil { ContentUnavailableView("No \(kind)", systemImage: "tray") } }
        .task(id: "\(kind)-\(status)-\(page)") { await refresh() }
        .onChange(of: kind) { _, _ in page = 1; items = [] }
        .onChange(of: status) { _, _ in page = 1; items = [] }
        .refreshable { await refresh() }
    }
    private func refresh() async {
        loading = true; defer { loading = false }
        do {
            let value = try await session.get("/api/\(kind)", query: ["status": status, "page": String(page)])
            try Task.checkCancellation(); items = value["items"].array; totalPages = Int(value["totalPages"].number ?? 1); error = nil
        } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
}

struct TicketView: View {
    let item: JSONValue
    let kind: String
    @EnvironmentObject private var session: AppSession
    @State private var resolution = ""
    @State private var confirm = false
    @State private var closed = false
    @State private var saving = false
    @State private var error: String?
    var body: some View {
        List {
            if let error { FailureBanner(message: error) }
            Section {
                Text(item.first("title", "subject")).font(.title3.bold())
                LabeledContent("Status", value: closed ? "Closed" : item["status"].string.capitalized)
                NativeMarkdown(text: item.first("description", "content", "body", "message"))
            }
            NavigationLink("All ticket details") { JSONDetail(title: "Ticket details", value: item) }
            if kind == "tickets" && item["status"].string != "closed" && !closed {
                Section("Resolution") {
                    TextField("Describe the fix or resolution", text: $resolution, axis: .vertical).lineLimit(3...8)
                    Button("Close ticket", role: .destructive) { confirm = true }.disabled(saving || resolution.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }.navigationTitle("#\(item.first("ticketNumber", "suggestionNumber"))").navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Close this ticket with your resolution?", isPresented: $confirm) {
            Button("Close ticket", role: .destructive) { Task {
                saving = true; defer { saving = false }
                do { _ = try await session.post("/api/tickets/\(item["_id"].string)/close", ["resolution": .string(resolution)]); closed = true; error = nil }
                catch { self.error = error.localizedDescription }
            } }
        }
    }
}

struct OpsMoreView: View {
    var body: some View {
        List {
            Section("Operations") {
                NavigationLink { FinderView() } label: { Label("Projects and files", systemImage: "folder") }
                NavigationLink { ReportsView() } label: { Label("Daily reports", systemImage: "doc.richtext") }
                NavigationLink { RemoteList(title: "Backups", path: "/api/backups", key: "backups") } label: { Label("Backups", systemImage: "externaldrive") }
                NavigationLink { KnowledgeView() } label: { Label("Knowledge", systemImage: "books.vertical") }
                NavigationLink { CollectionsView() } label: { Label("Database", systemImage: "cylinder.split.1x2") }
            }
            NavigationLink { AccountView() } label: { Label("Account", systemImage: "person.crop.circle") }
        }.navigationTitle("More")
    }
}

struct ReportsView: View {
    @EnvironmentObject private var session: AppSession
    @State private var reports: [JSONValue] = []
    @State private var error: String?
    var body: some View {
        List {
            if let error { FailureBanner(message: error) }
            ForEach(reports, id: \.["date"].string) { report in
                NavigationLink {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 22) {
                            Text(report["headline"].string).font(.title.bold())
                            NativeMarkdown(text: report["executiveSummary"].string)
                            ForEach(Array(report["sections"].array.enumerated()), id: \.offset) { _, section in
                                Text(section.first("title", "heading")).font(.title3.bold())
                                NativeMarkdown(text: section.first("body", "content", "summary", "text"))
                                if !section["bullets"].array.isEmpty { ForEach(Array(section["bullets"].array.enumerated()), id: \.offset) { _, bullet in NativeMarkdown(text: "• " + bullet.string) } }
                            }
                            JSONCard(title: "Actions", value: report["actions"])
                            JSONCard(title: "Metrics", value: report["metrics"])
                        }.padding()
                    }.navigationTitle(report["date"].string).navigationBarTitleDisplayMode(.inline)
                } label: { VStack(alignment: .leading, spacing: 6) { Text(report["headline"].string).font(.headline); Text(report["date"].string).font(.caption).foregroundStyle(.secondary) } }
            }
        }.navigationTitle("Daily reports").task { await refresh() }.refreshable { await refresh() }
    }
    private func refresh() async { do { reports = try await session.get("/api/daily-reports")["reports"].array; error = nil } catch { if !Task.isCancelled { self.error = error.localizedDescription } } }
}

struct RemoteList: View {
    let title: String
    let path: String
    let key: String
    var query: [String: String] = [:]
    @EnvironmentObject private var session: AppSession
    @State private var items: [JSONValue] = []
    @State private var error: String?
    @State private var loading = true
    var body: some View {
        List {
            if let error { FailureBanner(message: error) }
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                NavigationLink(item.first("title", "name", "date", "label", "_id").nonempty ?? "Item \(index + 1)") { JSONDetail(title: title, value: item) }
            }
        }.navigationTitle(title).overlay { if loading { ProgressView() } }
        .overlay { if !loading && items.isEmpty && error == nil { ContentUnavailableView("No results", systemImage: "tray") } }
        .task { await refresh() }.refreshable { await refresh() }
    }
    private func refresh() async {
        loading = true; defer { loading = false }
        do { items = try await session.get(path, query: query)[key].array; error = nil } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
}

struct KnowledgeView: View {
    @EnvironmentObject private var session: AppSession
    @State private var query = ""
    @State private var results: [JSONValue] = []
    @State private var error: String?
    @State private var loading = false
    var body: some View {
        List {
            if let error { FailureBanner(message: error) }
            ForEach(Array(results.enumerated()), id: \.offset) { _, result in
                NavigationLink { KnowledgeEntry(entry: result) } label: {
                    VStack(alignment: .leading, spacing: 6) { Text(result.first("title", "name", "id", "slug")).font(.headline); Text(result.first("snippet", "description", "summary")).font(.callout).lineLimit(3).foregroundStyle(.secondary) }
                }
            }
        }.navigationTitle("Knowledge").searchable(text: $query, prompt: "Search docs and runbooks")
        .overlay { if loading { ProgressView() } }
        .onSubmit(of: .search) { Task { await search() } }.task { await search() }.refreshable { await search() }
    }
    private func search() async {
        guard !loading else { return }; loading = true; defer { loading = false }
        do { results = try await session.get("/api/knowledge/search", query: ["q": query])["results"].array; error = nil } catch { self.error = error.localizedDescription }
    }
}

struct KnowledgeEntry: View {
    let entry: JSONValue
    @EnvironmentObject private var session: AppSession
    @State private var loaded: JSONValue = .null
    @State private var error: String?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let error { FailureBanner(message: error) }
                NativeMarkdown(text: (loaded == .null ? entry : loaded).first("content", "body", "text"))
                JSONCard(title: "Entry details", value: loaded == .null ? entry : loaded)
            }.padding()
        }.navigationTitle(entry.first("title", "id")).navigationBarTitleDisplayMode(.inline)
        .task { do { loaded = try await session.get("/api/knowledge/entry", query: ["kind": entry["kind"].string, "name": entry["name"].string])["entry"] } catch { self.error = error.localizedDescription } }
    }
}

struct CollectionsView: View {
    @EnvironmentObject private var session: AppSession
    @State private var collections: [JSONValue] = []
    @State private var query = ""
    @State private var error: String?
    var body: some View {
        List {
            if let error { FailureBanner(message: error) }
            ForEach(collections.filter { query.isEmpty || $0["name"].string.localizedCaseInsensitiveContains(query) }, id: \.["name"].string) { collection in
                NavigationLink { DocumentsView(collection: collection["name"].string) } label: { LabeledContent(collection["name"].string, value: collection["count"].string) }
            }
        }.navigationTitle("Database").searchable(text: $query).task { await refresh() }.refreshable { await refresh() }
    }
    private func refresh() async { do { collections = try await session.get("/api/db/collections")["collections"].array; error = nil } catch { self.error = error.localizedDescription } }
}

struct DocumentsView: View {
    let collection: String
    @EnvironmentObject private var session: AppSession
    @State private var documents: [JSONValue] = []
    @State private var filter = ""
    @State private var appliedFilter = ""
    @State private var page = 1
    @State private var totalPages = 1
    @State private var error: String?
    var body: some View {
        List {
            if let error { FailureBanner(message: error) }
            ForEach(Array(documents.enumerated()), id: \.offset) { index, document in
                NavigationLink(document.first("name", "title", "username", "_id").nonempty ?? "Document \(index + 1)") { JSONDetail(title: collection, value: document) }
            }
            HStack { Button("Previous") { page -= 1 }.disabled(page <= 1); Spacer(); Text("\(page) / \(max(1, totalPages))").font(.caption); Spacer(); Button("Next") { page += 1 }.disabled(page >= totalPages) }.buttonStyle(.borderless)
        }.navigationTitle(collection).searchable(text: $filter, prompt: "Find by ID or name")
        .onSubmit(of: .search) { appliedFilter = filter; page = 1 }
        .task(id: "\(page)-\(appliedFilter)") { await refresh() }.refreshable { await refresh() }
    }
    private func refresh() async {
        do {
            let result = try await session.get("/api/db/collections/\(collection)", query: ["page": String(page), "filter": appliedFilter, "limit": "20"])
            try Task.checkCancellation(); documents = result["documents"].array; totalPages = Int(result["totalPages"].number ?? 1); error = nil
        } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
}
