import SwiftUI
import LakesideCore

struct OpsCompanyCreate: View {
    let entities: [JSONValue]
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var objective = ""
    @State private var why = ""
    @State private var criteria = ""
    @State private var entity = ""
    @State private var taskType = "bugfix"
    @State private var requestID = UUID().uuidString
    @State private var pending: [String: JSONValue]?
    @State private var busy = false
    @State private var error: String?
    private var checks: [String] { criteria.components(separatedBy: .newlines).map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty } }
    var body: some View {
        NavigationStack {
            Form {
                Section("Work to do") {
                    TextField("Short title", text: $title).accessibilityIdentifier("ops-company-title")
                    TextField("What should change?", text: $objective, axis: .vertical).lineLimit(3...8).accessibilityIdentifier("ops-company-objective")
                    TextField("Why does this need attention?", text: $why, axis: .vertical).lineLimit(2...6).accessibilityIdentifier("ops-company-why")
                    Picker("Kind of work", selection: $taskType) { Text("Fix a bug").tag("bugfix"); Text("Build something").tag("implementation"); Text("Research").tag("research"); Text("Analysis").tag("analysis"); Text("Review").tag("review") }
                    Picker("Related project or issue", selection: $entity) { Text("None").tag(""); ForEach(entities, id: \.["id"].string) { Text($0["title"].string).tag($0["id"].string) } }
                }.disabled(busy || pending != nil)
                Section("What done looks like") {
                    TextField("One check per line", text: $criteria, axis: .vertical).lineLimit(4...10).accessibilityIdentifier("ops-company-criteria")
                    Text("Specific checks keep a plausible answer from being mistaken for a completed fix.").font(.caption).foregroundStyle(.secondary)
                }.disabled(busy || pending != nil)
                if let error { Section { Text(error).font(.caption).foregroundStyle(.orange) } }
                if pending != nil { Section { Text("Retry sends the same request. It will not create the work twice.").font(.caption).foregroundStyle(.secondary) } }
            }.navigationTitle("Add work").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(busy) }
                    ToolbarItem(placement: .confirmationAction) { Button(busy ? "Adding…" : pending == nil ? "Add" : "Retry") { Task { await submit() } }.disabled(busy || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || objective.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || why.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || checks.isEmpty).accessibilityIdentifier("ops-company-create-save") }
                }.interactiveDismissDisabled(busy)
        }
    }
    private func submit() async {
        busy = true; defer { busy = false }
        if pending == nil {
            pending = ["requestId": .string(requestID), "externalId": .string(requestID), "source": .string("owner"), "summary": .string(why), "title": .string(title), "objective": .string(objective), "entityId": entity.isEmpty ? .null : .string(entity), "acceptance": .array(checks.map(JSONValue.string)), "taskType": .string(taskType)]
        }
        do { _ = try await session.post("/api/ops/company/signals", pending ?? [:]); dismiss() }
        catch {
            if let status = (error as? AppFailure)?.statusCode, (400..<500).contains(status) { pending = nil; requestID = UUID().uuidString }
            self.error = error.localizedDescription
        }
    }
}

struct OpsCompanyAction: View {
    let job: JSONValue
    let action: CompanyAction
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var version = ""
    @State private var summary = ""
    @State private var kind = "test"
    @State private var criterion = ""
    @State private var passed = true
    @State private var minutes = 30
    @State private var permissions: [String: Bool] = [:]
    @State private var busy = false
    @State private var pending: [String: JSONValue]?
    @State private var conflict = false
    @State private var error: String?
    private let permissionNames = [("investigate", "Investigate"), ("draft", "Prepare a draft"), ("change", "Change files"), ("merge", "Merge changes"), ("deploy", "Deploy changes"), ("communicate", "Send messages")]
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(job["title"].string).font(.headline)
                    Text(explanation).font(.callout).foregroundStyle(.secondary)
                }
                Section {
                    switch action {
                    case .permissions:
                        ForEach(permissionNames, id: \.0) { key, title in Toggle(title, isOn: Binding(get: { permissions[key] ?? false }, set: { permissions[key] = $0 })) }
                    case .version:
                        TextField("Commit SHA or permanent version reference", text: $version).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("ops-company-version")
                    case .check:
                        Picker("Check", selection: $kind) { Text("Test").tag("test"); Text("Independent review").tag("review"); Text("Completion check").tag("acceptance"); Text("Health check").tag("health"); Text("Report only").tag("report") }
                        if kind == "acceptance" { Picker("What was checked?", selection: $criterion) { Text("Choose a check").tag(""); ForEach(job["acceptance"].array, id: \.string) { Text($0.string).tag($0.string) } } }
                        Toggle("Passed", isOn: $passed).accessibilityIdentifier("ops-company-check-passed")
                        TextField("What did you check, and what happened?", text: $summary, axis: .vertical).lineLimit(3...10).accessibilityIdentifier("ops-company-check-summary")
                        LabeledContent("Version", value: job["artifact"].string).font(.caption)
                        Text("Recorded by you. This is your assessment, not an automated test result.").font(.caption).foregroundStyle(.secondary)
                    case .github:
                        LabeledContent("Version to check", value: job["artifact"].string).font(.callout).textSelection(.enabled)
                    case .finish:
                        LabeledContent("Approved version", value: job["artifact"].string).font(.callout).textSelection(.enabled)
                    case .approve:
                        LabeledContent("Version to approve", value: job["artifact"].string).font(.callout).textSelection(.enabled)
                    case .monitor:
                        LabeledContent("Approved version", value: job["artifact"].string).font(.caption).textSelection(.enabled)
                        TextField("Deployment URL or receipt", text: $summary, axis: .vertical).lineLimit(2...5).textInputAutocapitalization(.never).autocorrectionDisabled()
                        Stepper("Observe for \(minutes) minutes", value: $minutes, in: 1...1440, step: 5)
                    case .reopen:
                        TextField("Why does this need more work?", text: $summary, axis: .vertical).lineLimit(3...8)
                    case .cancel:
                        Text("If a worker is still running, stop it from Team before cancelling this work.").font(.callout)
                    }
                }.disabled(busy || pending != nil || conflict)
                if let error { Section { Text(error).font(.caption).foregroundStyle(.orange) } }
                if conflict { Section { Text("This work changed while you were viewing it. Close this sheet to reload the latest version, then review your action again.").font(.callout) } }
                else if pending != nil { Section { Text("Retry keeps the original version and request. If it already succeeded, the server will reject an outdated version instead of applying it twice.").font(.caption).foregroundStyle(.secondary) } }
            }.navigationTitle(action.title).navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button(conflict ? "Close and reload" : "Cancel") { dismiss() }.disabled(busy) }
                    ToolbarItem(placement: .confirmationAction) { Button(busy ? "Saving…" : pending != nil ? "Retry" : action.title) { Task { await submit() } }.disabled(busy || conflict || !valid).accessibilityIdentifier("ops-company-action-save") }
                }.interactiveDismissDisabled(busy)
                .onAppear { version = job["artifact"].string; for (key, _) in permissionNames { permissions[key] = job["contract"][key].bool } }
        }
    }
    private var valid: Bool {
        switch action {
        case .version: return !version.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .check: return !summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && (kind != "acceptance" || !criterion.isEmpty)
        case .monitor, .reopen: return !summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        default: return true
        }
    }
    private var explanation: String {
        switch action {
        case .permissions: return "Set what this job is allowed to do. Granting permission does not merge, deploy, or send anything by itself."
        case .version: return "Choose the exact version the checks should cover. Changing it clears earlier approval and verification."
        case .check: return "Record a result for the current version. Completion needs a passing test, a separate review, and every completion check. A report alone does not prove it is done."
        case .github: return "Read GitHub checks and reviews for this exact version in the linked repository. This does not run a deployment or change the repository."
        case .approve: return "Approve only the version shown below. This records your approval; it does not deploy it."
        case .finish: return "Accept the checked and approved research, analysis, or review result and close this job."
        case .monitor: return "Record a deployment that already happened and start observing it. This screen does not deploy anything. A fresh passing health check after the observation period ends is required."
        case .reopen: return "Explain what needs more work. Previous approval and completion checks must be earned again."
        case .cancel: return "Stop tracking this work as active. Running workers must be stopped separately."
        }
    }
    private func submit() async {
        busy = true; defer { busy = false }
        if pending == nil {
            var body: [String: JSONValue] = ["version": job["version"]]
            switch action {
            case .permissions: body["contract"] = .object(permissions.mapValues(JSONValue.bool))
            case .version: body["artifact"] = .string(version)
            case .check:
                body.merge(["artifact": job["artifact"], "kind": .string(kind), "summary": .string(summary), "passed": .bool(passed), "source": .string("owner")]) { _, new in new }
                if kind == "acceptance" { body["criterion"] = .string(criterion) }
            case .github, .approve, .finish: body["artifact"] = job["artifact"]
            case .monitor: body.merge(["artifact": job["artifact"], "receipt": .string(summary), "minutes": .number(Double(minutes))]) { _, new in new }
            case .reopen: body["reason"] = .string(summary)
            case .cancel: break
            }
            pending = body
        }
        do { _ = try await session.post("/api/ops/company/missions/\(try opsSafePathID(job["id"].string))/\(action.endpoint)", pending ?? [:]); dismiss() }
        catch {
            let status = (error as? AppFailure)?.statusCode
            conflict = status == 409
            if let status, (400..<500).contains(status), !conflict { pending = nil }
            self.error = error.localizedDescription
        }
    }
}

struct OpsCompanyAssign: View {
    let job: JSONValue
    let conversationID: String
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var staff: [JSONValue] = []
    @State private var workspaces: [JSONValue] = []
    @State private var providers: [JSONValue] = []
    @State private var conversations: [JSONValue] = []
    @State private var member = ""
    @State private var workspace = ""
    @State private var conversation = ""
    @State private var stage = "investigate"
    @State private var provider = "auto"
    @State private var selectedModel = ""
    @State private var effort = "auto"
    @State private var minutes = 20
    @State private var loading = true
    @State private var busy = false
    @State private var conflict = false
    @State private var refresh = 0
    @State private var pending: [String: JSONValue]?
    @State private var error: String?
    private var toolFree: Bool { provider == "freerouter" && job["task_type"].string == "analysis" }
    private var efforts: [String] {
        if provider == "auto" { return ["low", "medium", "high"] }
        if toolFree { return [] }
        let models = providers.first { $0["id"].string == provider }?["models"].array ?? []
        let model = models.first { $0["id"].string == selectedModel } ?? models.first { $0["isDefault"].bool } ?? models.first ?? .null
        return model["thinkingOptions"].array.map { $0["id"].string }.filter { ["low", "medium", "high"].contains($0) }
    }
    var body: some View {
        NavigationStack {
            Form {
                Section { Text(job["title"].string).font(.headline); Text("Start a real worker with a time limit. Their report returns here; checking the result is a separate step.").font(.caption).foregroundStyle(.secondary) }
                if loading { ProgressView("Loading your team") }
                Section("Next step") {
                    Picker("Work", selection: $stage) { Text("Investigate").tag("investigate"); Text("Make the change").tag("implement"); Text("Check the result").tag("verify") }
                    if stage == "implement" && !job["contract"]["change"].bool { Text("Grant permission to change files before assigning this step.").font(.caption).foregroundStyle(.orange) }
                    if stage == "verify" { Text("A different worker checks the result. A completion report does not count as a passing check.").font(.caption).foregroundStyle(.secondary) }
                    Picker("Team member", selection: $member) { Text("New worker").tag(""); ForEach(staff, id: \.["id"].string) { Text($0["name"].string).tag($0["id"].string) } }
                    Picker("Supervising chat", selection: $conversation) { Text("Choose a conversation").tag(""); ForEach(conversations, id: \.["id"].string) { Text($0["title"].string).tag($0["id"].string) } }
                }.disabled(loading || busy || pending != nil || conflict)
                Section("Model and time") {
                    OpsProviderFields(provider: $provider, model: $selectedModel, providers: providers, includeFree: job["task_type"].string == "analysis")
                    Picker("Effort", selection: $effort) { Text("Match task").tag("auto"); ForEach(efforts, id: \.self) { Text($0.capitalized).tag($0) } }.disabled(efforts.isEmpty)
                    Stepper("Time limit: \(minutes) minutes", value: $minutes, in: 1...120)
                }.disabled(loading || busy || pending != nil || conflict)
                if !toolFree {
                    Section("Files") {
                        Picker("Separate working copy", selection: $workspace) { Text("Choose a working copy").tag(""); ForEach(workspaces.filter { $0["isolation"].string == "worktree" }, id: \.["workspaceId"].string) { Text($0["title"].string).tag($0["workspaceId"].string) } }
                        Text("Uses an existing isolated working copy. Create one from Team if the project is not listed.").font(.caption).foregroundStyle(.secondary)
                    }.disabled(loading || busy || pending != nil || conflict)
                } else { Section { Text("FreeRouter can analyze text. It cannot inspect or change files in this assignment.").font(.caption).foregroundStyle(.secondary) } }
                if let error { Section { Text(error).font(.caption).foregroundStyle(.orange); if loading { Button("Retry loading") { refresh += 1 } } } }
                if conflict { Section { Text("This work has changed. Close and reopen this sheet to review the latest state before assigning another worker.").font(.callout) } }
                else if pending != nil { Section { Text("Retry uses the same version. The service prevents duplicate worker assignments.").font(.caption).foregroundStyle(.secondary) } }
            }.navigationTitle("Assign next step").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button(conflict ? "Close and reload" : "Cancel") { dismiss() }.disabled(busy) }
                    ToolbarItem(placement: .confirmationAction) { Button(busy ? "Starting…" : pending == nil ? "Start" : "Retry") { Task { await submit() } }.disabled(loading || busy || conflict || conversation.isEmpty || (!toolFree && workspace.isEmpty) || (stage == "implement" && !job["contract"]["change"].bool)).accessibilityIdentifier("ops-company-assign-start") }
                }.interactiveDismissDisabled(busy)
                .onChange(of: provider) { _, _ in effort = "auto" }
                .onChange(of: selectedModel) { _, _ in effort = "auto" }
                .task(id: refresh) {
                    loading = true
                    do {
                        async let a = session.get("/api/ops/providers")
                        async let b = session.get("/api/ops/workspaces")
                        async let c = session.get("/api/ops/staff")
                        async let d = session.get("/api/ops/bootstrap")
                        let (catalog, spaces, team, boot) = try await (a, b, c, d)
                        try Task.checkCancellation()
                        providers = catalog["providers"].array; workspaces = spaces["workspaces"].array; staff = team["staff"].array; conversations = boot["conversations"].array
                        conversation = job["conversation_id"].string.nonempty ?? conversationID
                        if !conversations.contains(where: { $0["id"].string == conversation }) { conversation = boot["conversation"]["id"].string }
                        loading = false; error = nil
                    } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
                }
        }
    }
    private func submit() async {
        busy = true; defer { busy = false }
        if pending == nil {
            var body: [String: JSONValue] = ["version": job["version"], "workspaceId": toolFree ? .null : .string(workspace), "conversationId": .number(Double(conversation) ?? 0), "provider": .string(provider), "model": selectedModel.isEmpty ? .null : .string(selectedModel), "effort": .string(effort), "maxMinutes": .number(Double(minutes)), "stage": .string(stage)]
            if !member.isEmpty { body["staffId"] = .string(member) }
            pending = body
        }
        do { _ = try await session.post("/api/ops/company/missions/\(try opsSafePathID(job["id"].string))/assign", pending ?? [:]); dismiss() }
        catch {
            let status = (error as? AppFailure)?.statusCode
            conflict = status == 409
            if let status, (400..<500).contains(status), !conflict { pending = nil }
            self.error = error.localizedDescription
        }
    }
}
