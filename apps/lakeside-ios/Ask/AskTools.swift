import SwiftUI
import LakesideCore

enum AskMode: String, CaseIterable {
    case auto, verify, autopsy, scenario
    var title: String { switch self { case .auto: "Ask"; case .verify: "Verify"; case .autopsy: "Autopsy"; case .scenario: "Scenario" } }
    var hint: String { switch self {
        case .auto: "Choose the best answer path"
        case .verify: "Test a claim against game evidence"
        case .autopsy: "Trace a live result back to its causes"
        case .scenario: "Project a demand or supply shock over 1 to 60 turns"
    } }
}

struct AskOptionsView: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @Binding var game: String
    @Binding var live: Bool
    @Binding var visualizations: Bool
    @Binding var style: String
    @Binding var length: String
    @Binding var effort: String
    let games: [JSONValue]
    var body: some View {
        Form {
            Section("Game") { Picker("Game", selection: $game) { ForEach(games, id: \.["id"].string) { Text($0["name"].string).tag($0["id"].string) } } }
            Section {
                Toggle("Use live game data", isOn: $live)
                Toggle("Charts, diagrams, and maps", isOn: $visualizations)
            } footer: { Text("Live lookups and visualizations use their own daily allowances.") }
            Section("Response") {
                Picker("Style", selection: $style) { Text("Simplified").tag("simplified"); Text("Standard").tag("standard"); Text("Technical").tag("technical") }
                Picker("Length", selection: $length) { Text("Concise").tag("concise"); Text("Standard").tag("standard"); Text("Deep").tag("deep") }
            }
            if session.profile["entitlement"]["staff"].bool {
                Section("Reasoning effort") {
                    Picker("Effort", selection: $effort) { Text("Auto").tag("auto"); Text("Quick").tag("quick"); Text("Balanced").tag("balanced"); Text("Thorough").tag("thorough") }
                }
            }
        }.lakesideScreen().navigationTitle("Answer options").navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Done") { dismiss() } }
    }
}

struct StarterBrowser: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @AppStorage("ask.game") private var game = "ahd"
    @State private var query = ""
    @State private var category = "all"
    @State private var games: [JSONValue] = []
    let choose: (String, Bool) -> Void
    private var catalog: JSONValue {
        guard let url = Bundle.main.url(forResource: "starters", withExtension: "json"), let data = try? Data(contentsOf: url), let value = try? JSONDecoder().decode(JSONValue.self, from: data) else { return .null }
        return value
    }
    private var questions: [JSONValue] {
        let context = session.profile["context"]
        let values = ["country": context["character"]["country"].string, "party": context["character"]["party"].string,
                      "character": context["character"]["name"].string, "corporation": context["corporation"]["name"].string]
        return catalog["games"][game].array.compactMap { item in
            let requires = item["requires"].string
            guard requires.isEmpty || !(values[requires] ?? "").isEmpty else { return nil }
            var fields = item.object
            var text = item["text"].string
            for (key, value) in values { text = text.replacingOccurrences(of: "{\(key)}", with: value) }
            fields["text"] = .string(text)
            return .object(fields)
        }.filter { (category == "all" || $0["category"].string == category) && (query.isEmpty || $0["text"].string.localizedCaseInsensitiveContains(query)) }
    }
    var body: some View {
        List {
            Section {
                Picker("Game", selection: $game) { ForEach(games, id: \.["id"].string) { Text($0["name"].string).tag($0["id"].string) } }
                Picker("Topic", selection: $category) {
                    Text("All topics").tag("all")
                    ForEach(catalog["categories"].object.keys.sorted(), id: \.self) { key in Text(catalog["categories"][key]["label"].string).tag(key) }
                }
            }
            ForEach(questions, id: \.["id"].string) { question in
                Button { choose(question["text"].string, question["live"].bool); dismiss() } label: {
                    VStack(alignment: .leading, spacing: 7) {
                        HStack { Text(catalog["categories"][question["category"].string]["label"].string.uppercased()).tracking(1); Spacer(); if question["live"].bool { Label("Live", systemImage: "bolt.fill") } }.font(.caption2).foregroundStyle(Brand.mint)
                        Text(question["text"].string).font(.callout).foregroundStyle(Brand.ink)
                    }.padding(.vertical, 7)
                }
            }
            if questions.isEmpty { Text("No matching starters. Try another topic or search.").foregroundStyle(.secondary) }
        }.lakesideScreen().navigationTitle("Explore questions").searchable(text: $query)
            .toolbar { Button("Done") { dismiss() } }
            .task { games = (try? await session.get("/api/games")["games"].array) ?? [] }
    }
}

struct ConversationSharing: View {
    let id: String
    let text: String
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var url: URL?
    @State private var busy = false
    @State private var message: String?
    private var restricted: Bool { session.profile["context"]["isAdmin"].bool || session.profile["context"]["isModerator"].bool }
    var body: some View {
        List {
            Section { ShareLink(item: text) { Label("Share or export answer text", systemImage: "square.and.arrow.up") } }
            if !restricted {
                Section {
                    if let url { ShareLink(item: url) { Label("Share conversation link", systemImage: "link") } }
                    else { Button("Create public link") { changeLink(revoke: false) }.disabled(busy) }
                    Button("Revoke existing link", role: .destructive) { changeLink(revoke: true) }.disabled(busy)
                } footer: { Text("Anyone with the link can read this conversation. Revoking it disables the link.") }
            } else { Text("Public links are unavailable for private staff conversations.").font(.callout).foregroundStyle(.secondary) }
            if busy { ProgressView() }
            if let message { Text(message).font(.callout) }
        }.lakesideScreen().navigationTitle("Share conversation").navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Done") { dismiss() } }
    }
    private func changeLink(revoke: Bool) {
        busy = true
        Task {
            defer { busy = false }
            do {
                let result = try await session.post("/api/conversation/share", ["id": .string(id), "revoke": .bool(revoke)])
                guard result["ok"].bool else { throw AppFailure(message: "The conversation could not be shared.") }
                url = Endpoint.link(result["url"].string, base: session.surface.base)
                message = revoke ? "Public link revoked." : "Your link is ready."
            } catch { message = error.localizedDescription }
        }
    }
}
