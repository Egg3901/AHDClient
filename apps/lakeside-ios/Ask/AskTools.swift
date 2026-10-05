import SwiftUI
import LakesideCore

enum AskMode: String, CaseIterable, Hashable {
    case auto, verify, autopsy, scenario, report
    var title: String { switch self { case .auto: "Ask"; case .verify: "Verify"; case .autopsy: "Autopsy"; case .scenario: "Scenario"; case .report: "Report" } }
    var symbol: String { switch self {
        case .auto: "bubble.left.and.text.bubble.right"
        case .verify: "checkmark.seal"
        case .autopsy: "point.topleft.down.to.point.bottomright.curvepath"
        case .scenario: "chart.line.uptrend.xyaxis"
        case .report: "doc.richtext"
    } }
    var hint: String { switch self {
        case .auto: "Choose the best answer path"
        case .verify: "Test a claim against game evidence"
        case .autopsy: "Trace a live result back to its causes"
        case .scenario: "Project a demand or supply shock over 1 to 60 turns"
        case .report: "A full report with live data and a shareable page. Uses a deep answer and one live-data question."
    } }
    /// Reports are requested by wording, so the server sees an ordinary question.
    var serverMode: String { self == .report ? AskMode.auto.rawValue : rawValue }
}

/// Starter questions bundled with the app, filtered by the player's context.
enum StarterCatalog {
    static let catalog: JSONValue = {
        guard let url = Bundle.main.url(forResource: "starters", withExtension: "json"), let data = try? Data(contentsOf: url),
              let value = try? JSONDecoder().decode(JSONValue.self, from: data) else { return .null }
        return value
    }()

    static func questions(game: String, profile: JSONValue) -> [JSONValue] {
        let context = profile["context"]
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
        }
    }

    /// A short, varied set for the home screen: one per topic.
    static func featured(game: String, profile: JSONValue, count: Int = 3) -> [JSONValue] {
        var seen = Set<String>()
        var picked: [JSONValue] = []
        for item in questions(game: game, profile: profile) where !item["live"].bool {
            let category = item["category"].string
            guard !seen.contains(category), item["text"].string.range(of: #"\bwatch\b"#, options: [.regularExpression, .caseInsensitive]) == nil else { continue }
            seen.insert(category); picked.append(item)
            if picked.count == count { break }
        }
        return picked
    }

    static func categoryLabel(_ key: String) -> String { catalog["categories"][key]["label"].string }
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
    @Binding var provider: String
    let games: [JSONValue]
    let hasAttachments: Bool
    var body: some View {
        Form {
            Section("Game") { Picker("Game", selection: $game) { ForEach(games, id: \.["id"].string) { Text($0["name"].string).tag($0["id"].string) } } }
            Section("Response") {
                Picker("Answer engine", selection: $provider) {
                    Text(AskProvider.server.title).tag(AskProvider.server.rawValue)
                    if AppleFoundationModelProvider.isAvailable && !hasAttachments {
                        Text(AskProvider.appleOnDevice.title).tag(AskProvider.appleOnDevice.rawValue)
                    }
                }
                Picker("Style", selection: $style) { Text("Simplified").tag("simplified"); Text("Standard").tag("standard"); Text("Technical").tag("technical") }
                Picker("Length", selection: $length) { Text("Concise").tag("concise"); Text("Standard").tag("standard"); Text("Deep").tag("deep") }
            }
            Section {
                Toggle("Use live game data", isOn: $live)
                Toggle("Charts, diagrams, and maps", isOn: $visualizations)
            } footer: {
                if provider == AskProvider.appleOnDevice.rawValue {
                    Text("Answers are generated on this device from Ask documentation. Nothing goes to outside AI services. Live data needs Ask server; each on-device answer offers it as a separate, explicit step. Attachments are unavailable.")
                } else if hasAttachments {
                    Text("Remove attachments before selecting Apple on-device answers.")
                } else {
                    Text("Ask server answers use outside AI services. Live data and visualizations use their own daily allowances.")
                }
            }
            if !AppleFoundationModelProvider.isAvailable && !hasAttachments {
                Section { Text(AppleFoundationModelProvider.availabilityMessage).font(.caption).foregroundStyle(.secondary) }
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
    private var catalog: JSONValue { StarterCatalog.catalog }
    private var questions: [JSONValue] {
        StarterCatalog.questions(game: game, profile: session.profile)
            .filter { (category == "all" || $0["category"].string == category) && (query.isEmpty || $0["text"].string.localizedCaseInsensitiveContains(query)) }
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
                        HStack { AskLabel(text: StarterCatalog.categoryLabel(question["category"].string), color: Brand.sky); Spacer(); if question["live"].bool { Label("Live", systemImage: "bolt.fill").font(.caption2).foregroundStyle(Brand.mint) } }
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
    let title: String
    let markdown: String
    var serverBacked = true
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var url: URL?
    @State private var file: URL?
    @State private var busy = false
    @State private var message: String?
    private var restricted: Bool { session.profile["context"]["isAdmin"].bool || session.profile["context"]["isModerator"].bool }
    var body: some View {
        List {
            Section {
                if let file { ShareLink(item: file) { Label("Export as Markdown file", systemImage: "doc.text") } }
                ShareLink(item: markdown) { Label("Share as text", systemImage: "square.and.arrow.up") }
            } header: { AskLabel(text: "Export") } footer: { Text("Exports stay on this device until you share them.") }
            if !restricted && serverBacked && !id.isEmpty {
                Section {
                    if let url { ShareLink(item: url) { Label("Share conversation link", systemImage: "link") } }
                    else { Button("Create public link") { changeLink(revoke: false) }.disabled(busy) }
                    Button("Revoke existing link", role: .destructive) { changeLink(revoke: true) }.disabled(busy)
                } header: { AskLabel(text: "Public link") } footer: { Text("Anyone with the link can read this conversation. Revoking it disables the link.") }
            } else if restricted {
                Text("Public links are unavailable for private staff conversations.").font(.callout).foregroundStyle(.secondary)
            }
            if busy { ProgressView() }
            if let message { Text(message).font(.callout) }
        }.lakesideScreen().navigationTitle("Share conversation").navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Done") { dismiss() } }
            .task { file = writeExport() }
    }
    private func writeExport() -> URL? {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("ask-export", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let target = directory.appendingPathComponent(ConversationExport.fileName(title))
            try Data(markdown.utf8).write(to: target, options: .atomic)
            return target
        } catch { message = "The Markdown file could not be prepared. Share as text instead."; return nil }
    }
    private func changeLink(revoke: Bool) {
        busy = true
        Task {
            defer { busy = false }
            do {
                let result = try await session.post("/api/conversation/share", ["id": .string(id), "revoke": .bool(revoke)])
                if revoke { url = nil; message = "Public link revoked."; return }
                guard result["ok"].bool else { throw AppFailure(message: "The conversation could not be shared.") }
                url = Endpoint.link(result["url"].string, base: session.surface.base)
                message = "Your link is ready."
            } catch { message = error.displayMessage }
        }
    }
}
