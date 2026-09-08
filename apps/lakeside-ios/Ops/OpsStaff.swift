import SwiftUI
import LakesideCore

struct OpsNewAssignment: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var model: OpsWorkspaceModel
    var staff: JSONValue = .null
    @State private var title = ""
    @State private var brief = ""
    @State private var provider = "auto"
    @State private var selectedModel = ""
    @State private var providers: [JSONValue] = []
    @State private var workspaces: [JSONValue] = []
    @State private var projects: [JSONValue] = []
    @State private var workspace = ""
    @State private var project = ""
    @State private var newWorktree = true
    @State private var requestID = UUID().uuidString
    @State private var submission: [String: JSONValue]?
    @State private var busy = false
    @State private var error: String?
    var body: some View {
        NavigationStack {
            Form {
                if staff != .null { Section { LabeledContent("Team member", value: staff["name"].string) } }
                Section("Assignment") {
                    TextField("Title", text: $title).accessibilityIdentifier("ops-assignment-title")
                    TextField("What should they do, and why?", text: $brief, axis: .vertical).lineLimit(4...10).accessibilityIdentifier("ops-assignment-brief")
                }
                Section("Runtime") { OpsProviderFields(provider: $provider, model: $selectedModel, providers: providers) }
                Section("Workspace") {
                    Toggle("Create a separate worktree", isOn: $newWorktree)
                    if newWorktree {
                        Picker("Project", selection: $project) {
                            Text("Choose project").tag("")
                            ForEach(projects, id: \.["path"].string) { Text($0["name"].string).tag($0["path"].string) }
                        }
                    } else {
                        Picker("Worktree", selection: $workspace) {
                            Text("Choose worktree").tag("")
                            ForEach(workspaces.filter { $0["isolation"].string == "worktree" }, id: \.["workspaceId"].string) { Text($0["title"].string).tag($0["workspaceId"].string) }
                        }
                    }
                    Text("Reports return to your current Ops conversation. The main assistant reviews the result.").font(.caption).foregroundStyle(.secondary)
                }
                if let error { Section { Text(error).foregroundStyle(.orange) } }
                if submission != nil { Section { Text("This assignment is saved locally for retry. Retrying uses the same request so it cannot start a duplicate worker.").font(.caption).foregroundStyle(.secondary) } }
            }.disabled(busy || submission != nil).opsScreen().navigationTitle(staff == .null ? "New worker" : "Assign work").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(busy) }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(busy ? "Starting…" : submission == nil ? "Start" : "Retry") { Task { await start() } }
                            .disabled(busy || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || brief.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || (submission == nil && (newWorktree ? project.isEmpty : workspace.isEmpty)))
                    }
                }
                .task {
                    provider = staff["provider"].string.nonempty ?? "auto"; selectedModel = staff["model"].string
                    do {
                        async let a = session.get("/api/ops/providers")
                        async let b = session.get("/api/ops/workspaces")
                        async let c = session.get("/api/ops/projects")
                        let (inventory, spaces, roots) = try await (a, b, c)
                        providers = inventory["providers"].array; workspaces = spaces["workspaces"].array; projects = roots["projects"].array
                    } catch { self.error = error.localizedDescription }
                }
        }
    }
    private func start() async {
        busy = true; error = nil; defer { busy = false }
        do {
            if submission == nil {
                if newWorktree {
                    let created = try await session.post("/api/ops/workspaces", ["path": .string(project), "title": .string(String(title.prefix(60)))])
                    workspace = created["workspaceId"].string
                    guard !workspace.isEmpty else { throw URLError(.cannotParseResponse) }
                    newWorktree = false
                }
                var payload: [String: JSONValue] = ["requestId": .string(requestID), "name": .string(title), "brief": .string(brief), "provider": .string(provider), "model": selectedModel.isEmpty ? .null : .string(selectedModel), "workspaceId": .string(workspace), "conversationId": .number(Double(model.conversation) ?? 0), "origin": .string("owner")]
                if staff != .null { payload["staffId"] = staff["id"] }
                submission = payload
            }
            _ = try await session.post("/api/ops/workers", submission ?? [:])
            await model.refreshTeam(session); dismiss()
        } catch { self.error = error.localizedDescription }
    }
}

struct OpsProviderFields: View {
    @Binding var provider: String
    @Binding var model: String
    let providers: [JSONValue]
    var body: some View {
        Picker("Provider", selection: $provider) {
            Text("Automatic").tag("auto")
            ForEach(providers.filter { $0["capabilities"].array.contains(.string("tools")) }, id: \.["id"].string) { Text($0["label"].string).tag($0["id"].string) }
        }.onChange(of: provider) { _, _ in model = "" }
        if provider != "auto" {
            Picker("Model", selection: $model) {
                Text("Provider default").tag("")
                ForEach(providers.first { $0["id"].string == provider }?["models"].array ?? [], id: \.["id"].string) { Text($0.first("label", "name", "id")).tag($0["id"].string) }
            }
        }
    }
}

struct OpsStaffEditor: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var model: OpsWorkspaceModel
    var staff: JSONValue = .null
    @State private var name = ""
    @State private var role = ""
    @State private var memory = ""
    @State private var provider = "auto"
    @State private var selectedModel = ""
    @State private var providers: [JSONValue] = []
    @State private var busy = false
    @State private var error: String?
    @State private var requestID = UUID().uuidString
    var body: some View {
        NavigationStack {
            Form {
                Section("Identity") {
                    TextField("Name", text: $name).accessibilityIdentifier("ops-staff-name")
                    TextField("Role and responsibilities", text: $role, axis: .vertical).lineLimit(3...8).accessibilityIdentifier("ops-staff-role")
                }
                Section("Runtime preference") { OpsProviderFields(provider: $provider, model: $selectedModel, providers: providers) }
                Section("Persistent memory") {
                    TextEditor(text: $memory).frame(minHeight: 160).accessibilityLabel("Staff memory")
                    Text("These notes and recent run reports carry into future assignments, including when the provider changes.").font(.caption).foregroundStyle(.secondary)
                }
                if let error { Text(error).foregroundStyle(.orange) }
            }.disabled(busy).opsScreen().navigationTitle(staff == .null ? "New team member" : "Edit team member").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(busy) }
                    ToolbarItem(placement: .confirmationAction) { Button("Save") { Task { await save() } }.disabled(busy || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || role.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
                }
                .task {
                    name = staff["name"].string; role = staff["role"].string; memory = staff["memory"].string; provider = staff["provider"].string.nonempty ?? "auto"; selectedModel = staff["model"].string
                    do { providers = try await session.get("/api/ops/providers")["providers"].array } catch { self.error = error.localizedDescription }
                }
        }
    }
    private func save() async {
        busy = true; defer { busy = false }
        do {
            var body: [String: JSONValue] = ["requestId": .string(requestID), "name": .string(name), "role": .string(role), "memory": .string(memory), "provider": .string(provider), "model": .string(selectedModel)]
            if staff != .null { body["version"] = staff["version"] }
            _ = try await session.post(staff == .null ? "/api/ops/staff" : "/api/ops/staff/\(staff["id"].string)", body)
            await model.refreshTeam(session); dismiss()
        } catch { self.error = error.localizedDescription }
    }
}

struct OpsStaffDetail: View {
    @EnvironmentObject private var session: AppSession
    @ObservedObject var model: OpsWorkspaceModel
    let staff: JSONValue
    @State private var detail: JSONValue = .null
    @State private var runs: [JSONValue] = []
    @State private var editing = false
    @State private var assigning = false
    @State private var error: String?
    private var current: JSONValue { detail == .null ? staff : detail }
    var body: some View {
        List {
            Section("Responsibilities") {
                Text(current["role"].string)
                LabeledContent("Provider preference", value: current["provider"].string.capitalized)
                Button("Assign work") { assigning = true }
            }
            Section("Persistent memory") {
                if current["memory"].string.isEmpty { Text("No notes yet. Edit this member to record lasting instructions and context.").foregroundStyle(.secondary) }
                else { NativeMarkdown(text: current["memory"].string) }
            }
            Section("Run history") {
                if runs.isEmpty { Text("No assignments yet").foregroundStyle(.secondary) }
                ForEach(runs, id: \.["id"].string) { run in
                    NavigationLink { OpsWorkerDetail(worker: run, model: model) } label: {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(run["name"].string).font(.headline)
                            HStack { OpsStatus(value: run["job_status"].string); Text(opsDate(run["created_at"].string)).font(.caption).foregroundStyle(.secondary) }
                        }.padding(.vertical, 5)
                    }
                }
            }
            if let error { Text(error).foregroundStyle(.orange) }
        }.opsScreen().navigationTitle(current["name"].string).navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Edit") { editing = true } }
            .sheet(isPresented: $editing, onDismiss: { Task { await load() } }) { OpsStaffEditor(model: model, staff: current) }
            .sheet(isPresented: $assigning, onDismiss: { Task { await load() } }) { OpsNewAssignment(model: model, staff: current) }
            .task(id: model.workers.map { $0["id"].string + $0["job_updated_at"].string }.joined()) { await load() }.refreshable { await load() }
    }
    private func load() async {
        do { let result = try await session.get("/api/ops/staff/\(staff["id"].string)"); detail = result["staff"]; runs = result["runs"].array; error = nil }
        catch { self.error = error.localizedDescription }
    }
}

func opsDate(_ value: String) -> String {
    let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let date = formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    return date?.formatted(date: .abbreviated, time: .shortened) ?? value
}
