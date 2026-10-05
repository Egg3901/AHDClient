import SwiftUI
import LakesideCore

/// Watches are created by asking. This screen lists and removes them.
struct AskWatchesView: View {
    @EnvironmentObject private var session: AppSession
    @ObservedObject var features: AskFeatures
    var ask: (String) -> Void
    @State private var problem: AskProblem?
    @State private var removing: Set<String> = []

    static let examples = [
        "Watch USD/GBP and tell me when it crosses above 1.30",
        "Tell me when a war involving France starts",
        "Alert me when new bills are introduced in the UK",
    ]

    var body: some View {
        List {
            if let problem { Section { ProblemBanner(problem: problem) { _ = Task { await load() } } }.listRowBackground(Color.clear) }
            Section {
                if features.watchItems.isEmpty {
                    Text("No active watches.").font(.callout).foregroundStyle(.secondary)
                }
                ForEach(features.watchItems, id: \.["id"].string) { watch in
                    watchRow(watch)
                        .swipeActions { Button("Delete", role: .destructive) { remove(watch) } }
                }
            } header: {
                AskLabel(text: features.watchLimit.map { "Active · \(features.watchItems.count) of \($0)" } ?? "Active · \(features.watchItems.count)")
            } footer: {
                Text("Ask checks public game state about every 10 minutes. When a watch fires, the alert arrives with your next answer.")
            }
            if !features.watchEvents.isEmpty {
                Section {
                    ForEach(Array(features.watchEvents.prefix(10).enumerated()), id: \.offset) { _, event in
                        VStack(alignment: .leading, spacing: 3) {
                            Text(event.first("message", "label").nonempty ?? "Watch fired").font(.footnote)
                            HStack(spacing: 8) {
                                if !event["watchId"].string.isEmpty { Text("#\(event["watchId"].string)") }
                                if let fired = ServerDate.parse(event["createdAt"]) { Text(fired.formatted(.relative(presentation: .named))) }
                            }.font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
                        }.accessibilityElement(children: .combine)
                    }
                } header: { AskLabel(text: "Recent alerts", color: Brand.mint) }
            }
            Section {
                ForEach(Self.examples, id: \.self) { example in
                    Button { ask(example) } label: {
                        HStack {
                            Text(example).font(.callout).foregroundStyle(Brand.ink).multilineTextAlignment(.leading)
                            Spacer(minLength: 8)
                            Image(systemName: "arrow.up.right").font(.caption).foregroundStyle(.secondary).accessibilityHidden(true)
                        }
                    }.accessibilityHint("Starts a question that creates this watch")
                }
            } header: { AskLabel(text: "Create one by asking") } footer: {
                Text("Watch commands use no question credits. Say \"my watches\" or \"delete watch #id\" in any conversation too.")
            }
        }
        .lakesideScreen().navigationTitle("Watches").navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
    }

    private func watchRow(_ watch: JSONValue) -> some View {
        let id = watch["id"].string
        return HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol(watch["kind"].string)).foregroundStyle(Brand.mint).frame(width: 22).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(watch.first("label", "description").nonempty ?? watch["kind"].string).font(.callout)
                HStack(spacing: 10) {
                    Text("#\(id)")
                    if let created = ServerDate.parse(watch["createdAt"]) { Text("Since \(created.formatted(date: .abbreviated, time: .omitted))") }
                    if let fired = ServerDate.parse(watch["lastFiredAt"]) { Text("Fired \(fired.formatted(.relative(presentation: .named)))").foregroundStyle(Brand.mint) }
                    else { Text("Not fired yet") }
                }.font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            if removing.contains(id) { ProgressView() }
            else {
                Button { remove(watch) } label: { Image(systemName: "trash") }
                    .buttonStyle(.borderless).foregroundStyle(.red)
                    .accessibilityLabel("Delete watch \(watch.first("label", "description"))")
                    .accessibilityIdentifier("ask-watch-delete-\(id)")
            }
        }.padding(.vertical, 2)
    }

    private func symbol(_ kind: String) -> String {
        switch kind {
        case "fx": return "dollarsign.arrow.circlepath"
        case "war": return "shield.lefthalf.filled"
        case "legislation": return "building.columns"
        default: return "eye"
        }
    }

    private func load() async {
        do { try await features.refreshWatches(session); problem = nil }
        catch { if !Task.isCancelled { problem = AskProblem(error) } }
    }

    private func remove(_ watch: JSONValue) {
        let id = watch["id"].string
        guard !removing.contains(id) else { return }
        removing.insert(id)
        Task {
            defer { removing.remove(id) }
            do {
                _ = try await session.post("/api/watches/delete", ["id": watch["id"]])
                features.watchItems.removeAll { $0["id"].string == id }
                AskAnnouncer.say("Watch deleted")
                try? await features.refreshWatches(session)
            } catch { problem = AskProblem(error) }
        }
    }
}

/// Reports are full answers with their own shareable page.
struct AskReportsView: View {
    @EnvironmentObject private var session: AppSession
    @ObservedObject var features: AskFeatures
    var ask: (String) -> Void
    @State private var problem: AskProblem?

    var body: some View {
        List {
            if let problem { Section { ProblemBanner(problem: problem) { _ = Task { await load() } } }.listRowBackground(Color.clear) }
            Section {
                if features.reportItems.isEmpty {
                    Text("No reports yet.").font(.callout).foregroundStyle(.secondary)
                }
                ForEach(features.reportItems, id: \.["token"].string) { report in reportRow(report) }
            } header: { AskLabel(text: "Your reports · \(features.reportItems.count)") }
            Section {
                Button { ask("Write a report on ") } label: { Label("Request a report", systemImage: "doc.badge.plus") }
            } footer: {
                Text("Reports use a deep answer and one live-data question, and get a page you can share. You can also pick Report from the answer mode menu.")
            }
        }
        .lakesideScreen().navigationTitle("Reports").navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
    }

    @ViewBuilder private func reportRow(_ report: JSONValue) -> some View {
        let title = report["title"].string.nonempty ?? "Report"
        let url = Endpoint.link(report["url"].string.nonempty ?? "/r/\(report["token"].string)", base: session.surface.base)
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                if let url { Link(title, destination: url).font(.callout) } else { Text(title).font(.callout) }
                if let created = ServerDate.parse(report["createdAt"]) {
                    Text(created.formatted(date: .abbreviated, time: .shortened)).font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 8)
            if let url {
                ShareLink(item: url) { Image(systemName: "square.and.arrow.up") }
                    .buttonStyle(.borderless).accessibilityLabel("Share \(title)")
            }
        }.padding(.vertical, 2)
    }

    private func load() async {
        do { try await features.refreshReports(session); problem = nil }
        catch { if !Task.isCancelled { problem = AskProblem(error) } }
    }
}
