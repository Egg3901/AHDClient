import SwiftUI
import LakesideCore

struct AgentQuestionView: View {
    let tmux: String
    let question: JSONValue
    let answered: () -> Void
    @EnvironmentObject private var session: AppSession
    @State private var selected: Set<Int> = []
    @State private var text = ""
    @State private var sending = false
    @State private var error: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(question.first("question", "header").nonempty ?? "Agent needs input", systemImage: "questionmark.bubble").font(.headline)
            if question["partial"].bool { Text("Some options are outside the captured view.").font(.caption).foregroundStyle(.secondary) }
            ForEach(question["options"].array, id: \.["index"].string) { option in
                let index = Int(option["index"].number ?? 0)
                Button {
                    if question["multiSelect"].bool && option["checkbox"].bool {
                        let checkboxes = Set(question["options"].array.filter { $0["checkbox"].bool }.compactMap { $0["index"].number.map(Int.init) })
                        selected.formIntersection(checkboxes)
                        if selected.contains(index) { selected.remove(index) } else { selected.insert(index) }
                    } else { selected = [index] }
                } label: {
                    HStack(alignment: .top) {
                        Image(systemName: selected.contains(index) ? "checkmark.circle.fill" : "circle")
                        VStack(alignment: .leading, spacing: 5) {
                            Text(option["label"].string)
                            if !option["description"].string.isEmpty { Text(option["description"].string).font(.caption).foregroundStyle(.secondary) }
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }.buttonStyle(.bordered)
            }
            TextField("Additional text, if requested", text: $text, axis: .vertical).textFieldStyle(.roundedBorder)
            if let error { FailureBanner(message: error) }
            Button("Send answer") { Task { await submit() } }.buttonStyle(.borderedProminent).disabled(sending || selected.isEmpty)
        }.padding().background(.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
        .task { selected = Set(question["options"].array.filter { $0["checked"].bool }.compactMap { $0["index"].number.map(Int.init) }) }
    }
    private func submit() async {
        sending = true; defer { sending = false }
        do {
            _ = try await session.post("/api/code/tmux/\(tmux)/question", ["options": .array(selected.sorted().map { .number(Double($0)) }), "text": .string(text)])
            answered()
        } catch { self.error = error.localizedDescription }
    }
}

struct LaunchAgentView: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var providers: [JSONValue] = []
    @State private var provider = "codex"
    @State private var cwd = ""
    @State private var title = ""
    @State private var prompt = ""
    @State private var model = "auto"
    @State private var mode = ""
    @State private var error: String?
    @State private var launching = false
    @State private var picking = false
    private var options: JSONValue { providers.first { $0["kind"].string == provider } ?? .null }
    var body: some View {
        Form {
            if let error { FailureBanner(message: error) }
            Section("Task") {
                TextField("Title", text: $title)
                TextField("What should the agent do?", text: $prompt, axis: .vertical).lineLimit(4...10)
                Button { picking = true } label: { LabeledContent("Project", value: cwd.nonempty.map { URL(fileURLWithPath: $0).lastPathComponent } ?? "Choose folder") }
            }
            Section("Agent") {
                Picker("Provider", selection: $provider) { ForEach(providers, id: \.["kind"].string) { Text($0["kind"].string.capitalized).tag($0["kind"].string) } }
                Picker("Model", selection: $model) {
                    Text("Automatic").tag("auto")
                    ForEach(options["models"].array.filter { $0["id"].string != "auto" }, id: \.["id"].string) { Text($0.first("label", "id")).tag($0["id"].string) }
                }
                Picker("Permissions", selection: $mode) { ForEach(options["modes"].array, id: \.["id"].string) { Text($0["label"].string).tag($0["id"].string) } }
                if let selected = options["modes"].array.first(where: { $0["id"].string == mode }) { Text(selected["description"].string).font(.caption).foregroundStyle(.secondary) }
            }
            Button(launching ? "Launching…" : "Launch agent") { Task { await launch() } }
                .disabled(launching || cwd.isEmpty || prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || options == .null)
        }.navigationTitle("Launch agent").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(launching) } }
        .interactiveDismissDisabled(launching)
        .onChange(of: provider) { _, _ in model = "auto"; mode = options["defaultMode"].string }
        .sheet(isPresented: $picking) { NavigationStack { FinderView(onChoose: { cwd = $0; picking = false }) } }
        .task {
            do {
                providers = try await session.get("/api/code/tmux/spawn-options")["providers"].array
                if !providers.contains(where: { $0["kind"].string == provider }) { provider = providers.first?["kind"].string ?? "" }
                mode = options["defaultMode"].string
            } catch { self.error = error.localizedDescription }
        }
    }
    private func launch() async {
        launching = true; defer { launching = false }
        do {
            _ = try await session.post("/api/code/tmux/spawn", ["provider": .string(provider), "cwd": .string(cwd), "title": .string(title), "prompt": .string(prompt), "model": .string(model), "permissionMode": .string(mode)])
            dismiss()
        } catch { self.error = error.localizedDescription }
    }
}

struct FinderView: View {
    var path: String = ""
    var onChoose: ((String) -> Void)? = nil
    @EnvironmentObject private var session: AppSession
    @State private var items: [JSONValue] = []
    @State private var query = ""
    @State private var error: String?
    @State private var loading = true
    var body: some View {
        List {
            if let error { FailureBanner(message: error) }
            ForEach(items.filter { query.isEmpty || $0["name"].string.localizedCaseInsensitiveContains(query) }, id: \.["path"].string) { item in
                if item["type"].string == "dir" {
                    NavigationLink { FinderView(path: item["path"].string, onChoose: onChoose) } label: {
                        Label { VStack(alignment: .leading, spacing: 4) { Text(item["name"].string); if !item["git"]["branch"].string.isEmpty { Text(item["git"]["branch"].string).font(.caption).foregroundStyle(.secondary) } } } icon: { Image(systemName: "folder") }
                    }
                } else if onChoose == nil {
                    NavigationLink { FileView(path: item["path"].string) } label: { Label(item["name"].string, systemImage: "doc.text") }
                }
            }
        }.navigationTitle(path.isEmpty ? "Projects" : URL(fileURLWithPath: path).lastPathComponent)
        .navigationBarTitleDisplayMode(.inline).searchable(text: $query)
        .toolbar { if let onChoose, !path.isEmpty { Button("Use folder") { onChoose(path) } } }
        .overlay { if loading { ProgressView() } }
        .task { await refresh() }.refreshable { await refresh() }
    }
    private func refresh() async {
        loading = true; defer { loading = false }
        do { items = try await session.get("/api/finder/list", query: ["path": path])["items"].array; error = nil } catch { self.error = error.localizedDescription }
    }
}

struct FileView: View {
    let path: String
    @EnvironmentObject private var session: AppSession
    @State private var text = ""
    @State private var error: String?
    var body: some View {
        ScrollView([.vertical, .horizontal]) {
            VStack(alignment: .leading) {
                if let error { FailureBanner(message: error) }
                Text(text).font(.system(.footnote, design: .monospaced)).textSelection(.enabled)
            }.padding()
        }.navigationTitle(URL(fileURLWithPath: path).lastPathComponent).navigationBarTitleDisplayMode(.inline)
        .task { do { text = try await session.get("/api/finder/read", query: ["path": path])["content"].string } catch { self.error = error.localizedDescription } }
    }
}
