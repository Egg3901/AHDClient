import SwiftUI
import LakesideCore

enum OpsTheme {
    static let background = Brand.adaptive(0x101317, 0xf7f8fa)
    static let surface = Brand.adaptive(0x191e24, 0xffffff)
    static let raised = Brand.adaptive(0x222a33, 0xeaf0f6)
    static let sky = Brand.adaptive(0x94bada, 0x356c98)
    static let mint = Brand.adaptive(0x96bea9, 0x33785c)
    static let ink = Brand.adaptive(0xe9edf1, 0x20252c)
    static let onAccent = Brand.adaptive(0x14212c, 0xffffff)
}
extension View {
    func opsScreen() -> some View {
        scrollContentBackground(.hidden).background(OpsTheme.background)
            .toolbarBackground(OpsTheme.background, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
    }
}

struct OpsActivity: View {
    var actions: [JSONValue]
    var body: some View {
        if !actions.isEmpty {
            DisclosureGroup {
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(Array(actions.enumerated()), id: \.offset) { _, action in
                        DisclosureGroup {
                            if !action["command"].string.isEmpty { Text(action["command"].string).font(.caption.monospaced()).textSelection(.enabled) }
                            if !action["output"].string.isEmpty { Text(action["output"].string).font(.caption.monospaced()).textSelection(.enabled) }
                            if !action["ts"].string.isEmpty { Text(action["ts"].string).font(.caption2).foregroundStyle(.secondary) }
                        } label: {
                            Label(action.first("label", "name"), systemImage: action["name"].string == "bash" ? "terminal" : "wrench.and.screwdriver")
                                .font(.caption).lineLimit(2)
                        }
                    }
                }.padding(.top, 12)
            } label: { Label("Activity · \(actions.count) \(actions.count == 1 ? "step" : "steps")", systemImage: "list.bullet.rectangle").font(.caption.weight(.medium)) }
            .foregroundStyle(.secondary)
        }
    }
}

struct OpsFiles: View {
    @EnvironmentObject private var session: AppSession
    @State private var workspaces: [JSONValue] = []
    @State private var error: String?
    var body: some View {
        List {
            Section {
                Text("Workspace files").font(.title2.weight(.semibold))
                Text("Browse source, inspect changes, and bring a file into your next conversation.").font(.callout).foregroundStyle(.secondary)
            }.listRowBackground(Color.clear).listRowSeparator(.hidden)
            ForEach(workspaces, id: \.["workspaceId"].string) { workspace in
                NavigationLink { OpsDirectory(workspace: workspace, path: "") } label: {
                    Label { VStack(alignment: .leading, spacing: 5) {
                        Text(workspace["title"].string.nonempty ?? "Workspace").font(.headline)
                        Text(workspace["isolation"].string.capitalized).font(.caption).foregroundStyle(.secondary)
                    }.padding(.vertical, 6) } icon: { Image(systemName: "folder") }
                }.listRowBackground(OpsTheme.surface)
            }
            if workspaces.isEmpty && error == nil { ContentUnavailableView("No workspaces", systemImage: "folder", description: Text("Workspaces appear here when registered with your agent runtime.")) }
            if let error { Text(error).foregroundStyle(.orange) }
        }.opsScreen().navigationTitle("Files").task { await load() }.refreshable { await load() }
    }
    private func load() async {
        do { workspaces = try await session.get("/api/ops/workspaces")["workspaces"].array; error = nil }
        catch { self.error = error.localizedDescription }
    }
}

struct OpsDirectory: View {
    @EnvironmentObject private var session: AppSession
    let workspace: JSONValue
    let path: String
    @State private var entries: [JSONValue] = []
    @State private var search = ""
    @State private var error: String?
    @State private var truncated = false
    var body: some View {
        List {
            Section { NavigationLink { OpsChanges(workspace: workspace, path: path) } label: { Label("Review changes", systemImage: "arrow.triangle.branch") } }
            ForEach(entries.filter { search.isEmpty || $0["name"].string.localizedCaseInsensitiveContains(search) }, id: \.["path"].string) { entry in
                NavigationLink {
                    if entry["directory"].bool { OpsDirectory(workspace: workspace, path: entry["path"].string) }
                    else { OpsFilePreview(workspace: workspace, path: entry["path"].string) }
                } label: { Label(entry["name"].string, systemImage: entry["directory"].bool ? "folder" : "doc.text").font(.subheadline).padding(.vertical, 3) }
                    .listRowBackground(OpsTheme.surface)
            }
            if truncated { Text("Showing the first 500 entries.").font(.caption).foregroundStyle(.secondary) }
            if let error { Text(error).foregroundStyle(.orange) }
        }.opsScreen().navigationTitle(path.isEmpty ? "Workspace" : (path as NSString).lastPathComponent).navigationBarTitleDisplayMode(.inline)
            .searchable(text: $search, prompt: "Filter this folder")
            .task { await load() }.refreshable { await load() }
    }
    private func load() async {
        do { let result = try await session.get("/api/ops/files", query: ["workspace": workspace["workspaceId"].string, "path": path]); entries = result["entries"].array; truncated = result["truncated"].bool; error = nil }
        catch { self.error = error.localizedDescription }
    }
}

struct OpsFilePreview: View {
    @EnvironmentObject private var model: OpsWorkspaceModel
    @EnvironmentObject private var session: AppSession
    let workspace: JSONValue
    let path: String
    @State private var content = ""
    @State private var mode = "Source"
    var startWithChanges = false
    @State private var error: String?
    @State private var note = ""
    @State private var loading = true
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(path).font(.caption.monospaced()).foregroundStyle(.secondary).lineLimit(2).padding()
            Picker("Preview", selection: $mode) { Text("Source").tag("Source"); Text("Changes").tag("Changes") }.pickerStyle(.segmented).padding(.horizontal)
            if loading { ProgressView().frame(maxWidth: .infinity).padding() }
            if let error { Text(error).font(.callout).foregroundStyle(.orange).padding() }
            if !note.isEmpty { Text(note).font(.caption).foregroundStyle(.secondary).padding() }
            GeometryReader { geometry in
                ScrollView([.horizontal, .vertical]) {
                    VStack(alignment: .leading, spacing: 0) {
                if mode == "Changes" {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(content.components(separatedBy: "\n").enumerated()), id: \.offset) { _, line in
                            Text(line.isEmpty ? " " : line).font(.system(size: 12, design: .monospaced))
                                .foregroundStyle(line.hasPrefix("+") ? OpsTheme.mint : line.hasPrefix("-") ? Color.orange : OpsTheme.ink)
                                .padding(.vertical, 2)
                        }
                    }.padding().textSelection(.enabled)
                } else { Text(content).font(.system(size: 12, design: .monospaced)).textSelection(.enabled).padding() }
                    }.frame(minWidth: geometry.size.width, minHeight: geometry.size.height, alignment: .topLeading)
                }
            }
        }.opsScreen().navigationTitle((path as NSString).lastPathComponent).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Ask about file") { model.fileQuestion = "Review \(path) in workspace \(workspace["workspaceId"].string). "; model.selectedTab = 0 }
                        Button("Copy path") { UIPasteboard.general.string = path }
                        ShareLink(item: content) { Label("Share file", systemImage: "square.and.arrow.up") }.disabled(content.isEmpty)
                    } label: { Image(systemName: "ellipsis.circle") }.accessibilityLabel("File actions")
                }
            }
            .onAppear { if startWithChanges { mode = "Changes" } }
            .task(id: mode) {
                loading = true; error = nil; note = ""; content = ""; defer { loading = false }
                do {
                    let result = try await session.get(mode == "Changes" ? "/api/ops/files/diff" : "/api/ops/files/read", query: ["workspace": workspace["workspaceId"].string, "path": path])
                    try Task.checkCancellation()
                    content = result["content"].string
                    note = result["binary"].bool ? "Binary file. Text preview is unavailable." : result["truncated"].bool ? "Preview limited to 256 KB." : mode == "Changes" && content.isEmpty ? "No tracked changes against HEAD." : ""
                } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
            }
    }
}

struct OpsSchedules: View {
    @EnvironmentObject private var session: AppSession
    @State private var items: [JSONValue] = []
    @State private var error: String?
    @State private var busy = false
    @State private var pending: JSONValue = .null
    @State private var notice: String?
    var body: some View {
        List {
            Section { Text("Recurring work").font(.title2.weight(.semibold)); Text("Manage the routines your assistant runs for you.").font(.callout).foregroundStyle(.secondary) }.listRowBackground(Color.clear)
            ForEach(items, id: \.["id"].string) { item in
                Section {
                    HStack { Text(item["title"].string).font(.headline); Spacer(); Text((item["enabled"].bool || item["enabled"].number == 1) ? "Active" : "Paused").font(.caption).foregroundStyle(.secondary) }
                    Text(item["brief"].string).font(.subheadline).foregroundStyle(.secondary)
                    LabeledContent("Cadence", value: item["cadence"].string).font(.caption)
                    HStack {
                        Button((item["enabled"].bool || item["enabled"].number == 1) ? "Pause" : "Resume") { Task { await action(item, "toggle") } }
                        Spacer()
                        Button("Run now") { pending = item }
                    }.disabled(busy)
                }.listRowBackground(OpsTheme.surface)
            }
            if items.isEmpty { ContentUnavailableView("No schedules", systemImage: "calendar", description: Text("Ask Ops to schedule a recurring task.")) }
            if let notice { Text(notice).foregroundStyle(OpsTheme.mint) }
            if let error { Text(error).foregroundStyle(.orange) }
        }.opsScreen().navigationTitle("Schedules").task { await load() }.refreshable { await load() }
            .confirmationDialog("Run this schedule now?", isPresented: Binding(get: { pending != .null }, set: { if !$0 { pending = .null } })) {
                Button("Run now") { let item = pending; Task { await action(item, "run") } }
            }
    }
    private func load() async {
        do { items = try await session.get("/api/schedules")["schedules"].array; error = nil }
        catch { self.error = error.localizedDescription }
    }
    private func action(_ item: JSONValue, _ action: String) async {
        busy = true; defer { busy = false }
        do { _ = try await session.post("/api/schedules/\(item["id"].string)/\(action)", [:]); notice = action == "run" ? "Task queued." : "Schedule updated."; await load() }
        catch { self.error = error.localizedDescription }
    }
}

struct OpsTasks: View {
    @EnvironmentObject private var session: AppSession
    @State private var items: [JSONValue] = []
    @State private var search = ""
    @State private var error: String?
    var body: some View {
        List {
            ForEach(items.filter { search.isEmpty || $0["title"].string.localizedCaseInsensitiveContains(search) }, id: \.["id"].string) { item in
                NavigationLink { OpsTaskDetail(task: item) } label: {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(item["title"].string).font(.headline)
                        HStack { OpsStatus(value: item["status"].string); Text(item.first("summary", "brief")).font(.caption).foregroundStyle(.secondary).lineLimit(2) }
                    }.padding(.vertical, 5)
                }.listRowBackground(OpsTheme.surface)
            }
            if let error { Text(error).foregroundStyle(.orange) }
        }.opsScreen().navigationTitle("Tasks").searchable(text: $search).task { await load() }.refreshable { await load() }
    }
    private func load() async {
        do { items = try await session.get("/api/tasks")["tasks"].array; error = nil }
        catch { self.error = error.localizedDescription }
    }
}

struct OpsTaskDetail: View {
    @EnvironmentObject private var session: AppSession
    let task: JSONValue
    @State private var detail: JSONValue = .null
    @State private var error: String?
    var body: some View {
        List {
            Section("Status") { OpsStatus(value: detail["status"].string.nonempty ?? task["status"].string) }
            Section("Brief") { Text(task["brief"].string) }
            if !detail["result"].string.isEmpty { Section("Result") { NativeMarkdown(text: detail["result"].string) } }
            if !detail["summary"].string.isEmpty { Section("Summary") { NativeMarkdown(text: detail["summary"].string) } }
            if let error { Text(error).foregroundStyle(.orange) }
        }.opsScreen().navigationTitle(task["title"].string).navigationBarTitleDisplayMode(.inline)
            .task {
                do { detail = try await session.get("/api/tasks/\(task["id"].string)")["task"] }
                catch { self.error = error.localizedDescription }
            }
    }
}

struct OpsChanges: View {
    @EnvironmentObject private var session: AppSession
    let workspace: JSONValue
    let path: String
    @State private var entries: [JSONValue] = []
    @State private var error: String?
    @State private var loaded = false
    var body: some View {
        List {
            Section { Text("Working tree and index against HEAD").font(.caption).foregroundStyle(.secondary) }
            ForEach(entries, id: \.["path"].string) { entry in
                NavigationLink { OpsFilePreview(workspace: workspace, path: entry["path"].string, startWithChanges: !entry["untracked"].bool) } label: {
                    HStack { Text(entry["name"].string).font(.subheadline); Spacer(); Text(entry["untracked"].bool ? "New" : entry["deleted"].bool ? "Deleted" : entry["status"].string).font(.caption.monospaced()).foregroundStyle(OpsTheme.sky) }
                }.listRowBackground(OpsTheme.surface)
            }
            if loaded && entries.isEmpty && error == nil { ContentUnavailableView("No changes", systemImage: "checkmark.circle", description: Text("This folder has no working tree changes.")) }
            if let error { Text(error).font(.callout).foregroundStyle(.orange) }
        }.opsScreen().navigationTitle("Changes").navigationBarTitleDisplayMode(.inline).task { await load() }.refreshable { await load() }
    }
    private func load() async {
        do { entries = try await session.get("/api/ops/files/changes", query: ["workspace": workspace["workspaceId"].string, "path": path])["entries"].array; error = nil }
        catch { self.error = error.localizedDescription }
        loaded = true
    }
}
