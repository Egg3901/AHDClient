import SwiftUI
import LakesideCore

func companyStatus(_ value: String) -> String {
    ["detected": "New", "investigating": "Investigating", "working": "In progress", "awaiting_verification": "Needs checks", "awaiting_approval": "Needs your approval", "approved": "Approved", "monitoring": "Checking the fix holds", "verified": "Verified", "blocked": "Needs attention", "cancelled": "Cancelled"][value] ?? value.capitalized
}

struct OpsCompany: View {
    @EnvironmentObject private var session: AppSession
    @ObservedObject var model: OpsWorkspaceModel
    @Environment(\.scenePhase) private var phase
    @State private var visible = false
    @State private var refreshing = false
    @State private var snapshot: JSONValue = .null
    @State private var search = ""
    @State private var filter = "all"
    @State private var create = false
    @State private var loading = false
    @State private var error: String?
    private var jobs: [JSONValue] {
        snapshot["missions"].array.filter { job in
            let matches = search.isEmpty || [job["title"].string, job["objective"].string].joined(separator: " ").localizedCaseInsensitiveContains(search)
            let status = job["status"].string
            return matches && (filter == "all" || (filter == "attention" && ["blocked", "awaiting_approval", "awaiting_verification"].contains(status)) || (filter == "active" && !["verified", "cancelled"].contains(status)) || (filter == "done" && status == "verified"))
        }
    }
    var body: some View {
        List {
            Section {
                HStack(alignment: .top) {
                    count("Active", key: "active"); Spacer(); count("Needs you", key: "needsOwner"); Spacer(); count("Fix holding", key: "monitoring"); Spacer(); count("Verified", key: "verified")
                }.padding(.vertical, 4)
                Text("See why work started, who owns it, and what proves it is done.").font(.caption).foregroundStyle(.secondary)
                if !snapshot["automation"]["description"].string.isEmpty { Text(snapshot["automation"]["description"].string).font(.caption).foregroundStyle(.secondary) }
            }
            Section("Work") {
                Picker("Show", selection: $filter) { Text("All").tag("all"); Text("Active").tag("active"); Text("Needs you").tag("attention"); Text("Verified").tag("done") }.pickerStyle(.menu)
                if loading && snapshot == .null { ProgressView("Loading work") }
                if jobs.isEmpty && !loading { Text(search.isEmpty ? "No work here yet. Add something to investigate or improve." : "No matching work.").font(.callout).foregroundStyle(.secondary) }
                ForEach(jobs, id: \.["id"].string) { job in
                    NavigationLink {
                        OpsCompanyDetail(jobID: job["id"].string, model: model)
                    } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(job["title"].string).font(.callout.weight(.medium))
                            Text(companyStatus(job["status"].string)).font(.caption).foregroundStyle(job["status"].string == "blocked" ? Color.orange : OpsTheme.mint)
                            Text(job["objective"].string).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                        }.padding(.vertical, 3)
                    }.accessibilityIdentifier("ops-company-job-\(job["id"].string)")
                }
            }
            Section("Company map") {
                ForEach(snapshot["entities"].array.filter { search.isEmpty || $0["title"].string.localizedCaseInsensitiveContains(search) }, id: \.["id"].string) { item in
                    DisclosureGroup {
                        Text(item["summary"].string).font(.callout)
                        if !item["source"].string.isEmpty { Text("Source: \(item["source"].string)").font(.caption).foregroundStyle(.secondary) }
                        ForEach(snapshot["links"].array.filter { $0["from_id"] == item["id"] || $0["to_id"] == item["id"] }, id: \.["id"].string) { link in
                            let other = link["from_id"] == item["id"] ? link["to_id"] : link["from_id"]
                            let title = snapshot["entities"].array.first { $0["id"] == other }?["title"].string ?? other.string
                            Text("\(link["relation"].string) · \(title)").font(.caption)
                        }
                    } label: { VStack(alignment: .leading) { Text(item["title"].string).font(.callout); Text(item["kind"].string.capitalized).font(.caption).foregroundStyle(.secondary) } }
                }
                Button("Import known projects") { Task {
                    loading = true
                    do { _ = try await session.post("/api/ops/company/sync", [:]); await load() }
                    catch { self.error = error.localizedDescription; loading = false }
                } }.disabled(loading).accessibilityIdentifier("ops-company-sync")
            }
            if let error { Section { Text(error).font(.caption).foregroundStyle(.orange); Button("Reload") { Task { await load() } } } }
        }.opsScreen().navigationTitle("Company").navigationBarTitleDisplayMode(.inline)
            .searchable(text: $search, prompt: "Find work or a project")
            .toolbar { Button { create = true } label: { Image(systemName: "plus") }.accessibilityLabel("Add work").accessibilityIdentifier("ops-company-create") }
            .sheet(isPresented: $create, onDismiss: { Task { await load() } }) { OpsCompanyCreate(entities: snapshot["entities"].array) }
            .onAppear { visible = true }.onDisappear { visible = false }
            .task(id: "\(visible)-\(phase == .active)-\(create)") {
                guard visible, phase == .active, !create else { return }
                while !Task.isCancelled {
                    await load()
                    do { try await Task.sleep(for: .seconds(10)) } catch { return }
                }
            }.refreshable { await load() }
    }
    private func count(_ title: String, key: String) -> some View {
        VStack(alignment: .leading, spacing: 3) { Text(snapshot["counts"][key].string.nonempty ?? "0").font(.title3.weight(.semibold)).monospacedDigit(); Text(title).font(.caption2).foregroundStyle(.secondary) }
    }
    private func load() async {
        guard !refreshing else { return }
        refreshing = true; loading = true; defer { refreshing = false; loading = false }
        do {
            let result = try await session.get("/api/ops/company")
            try Task.checkCancellation()
            snapshot = result; error = nil
        } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
}

enum CompanyAction: String, Identifiable {
    case permissions, version, check, github, approve, monitor, finish, reopen, cancel
    var id: String { rawValue }
    var title: String {
        switch self {
        case .permissions: return "Permissions"
        case .version: return "Set version to check"
        case .check: return "Record a check"
        case .github: return "Check GitHub results"
        case .approve: return "Approve this version"
        case .monitor: return "Record deployment"
        case .finish: return "Mark work complete"
        case .reopen: return "Reopen work"
        case .cancel: return "Cancel work"
        }
    }
    var endpoint: String { [.permissions: "contract", .version: "artifact", .check: "evidence", .github: "verify", .approve: "approve", .monitor: "monitor", .finish: "finish", .reopen: "reopen", .cancel: "cancel"][self] ?? rawValue }
}

struct OpsCompanyDetail: View {
    let jobID: String
    @ObservedObject var model: OpsWorkspaceModel
    @EnvironmentObject private var session: AppSession
    @Environment(\.scenePhase) private var phase
    @State private var visible = false
    @State private var refreshing = false
    @State private var detail: JSONValue = .null
    @State private var action: CompanyAction?
    @State private var assignment = false
    @State private var error: String?
    @State private var loading = false
    private var job: JSONValue { detail["mission"] }
    var body: some View {
        List {
            if loading && detail == .null { ProgressView("Loading work") }
            Section {
                Text(job["title"].string).font(.headline)
                Text(companyStatus(job["status"].string)).font(.caption.weight(.medium)).foregroundStyle(OpsTheme.mint)
                Text(job["objective"].string).font(.callout)
                if !job["error"].string.isEmpty { Text(job["error"].string).font(.caption).foregroundStyle(.orange) }
            }
            Section("Why it started") {
                Text(detail["signal"]["summary"].string.nonempty ?? "Requested by you.").font(.callout)
                if !detail["signal"]["source"].string.isEmpty { LabeledContent("Source", value: detail["signal"]["source"].string.capitalized).font(.caption) }
                if !detail["signal"]["observed_at"].string.isEmpty { Text(opsDate(detail["signal"]["observed_at"].string)).font(.caption).foregroundStyle(.secondary) }
            }
            Section("What done looks like") {
                ForEach(Array(job["acceptance"].array.enumerated()), id: \.offset) { _, criterion in Label(criterion.string, systemImage: "checklist").font(.callout) }
            }
            Section("Team") {
                Button("Assign next step") { assignment = true }.accessibilityIdentifier("ops-company-assign")
                ForEach(Array(detail["assignments"].array.enumerated()), id: \.offset) { _, run in
                    if run["worker_id"].string.isEmpty {
                        assignmentRow(run)
                    } else {
                        NavigationLink {
                            ScrollView { OpsWorkerActivity(workerID: run["worker_id"].string).padding() }.navigationTitle("Worker activity")
                        } label: { assignmentRow(run) }
                    }
                }
                if !job["conversation_id"].string.isEmpty {
                    Button("Open supervising chat") { Task { await model.select(job["conversation_id"].string, session); model.selectedTab = 0 } }
                }
            }
            Section("Checks and approval") {
                LabeledContent("Version to check", value: job["artifact"].string.nonempty ?? "Not set").font(.caption).textSelection(.enabled)
                if !job["approved_artifact"].string.isEmpty { LabeledContent("Approved version", value: job["approved_artifact"].string).font(.caption).textSelection(.enabled) }
                if !job["deployment_receipt"].string.isEmpty { LabeledContent("Deployment receipt", value: job["deployment_receipt"].string).font(.caption).textSelection(.enabled) }
                Button("Set version to check") { action = .version }
                Button("Check GitHub results") { action = .github }.disabled(job["artifact"].string.isEmpty).accessibilityIdentifier("ops-company-github-check")
                Button("Record a check") { action = .check }.disabled(job["artifact"].string.isEmpty).accessibilityIdentifier("ops-company-record-check")
                ForEach(detail["evidence"].array, id: \.["id"].string) { check in
                    DisclosureGroup {
                        Text(check["summary"].string).font(.callout)
                        Text("Version: \(check["artifact"].string)").font(.caption).textSelection(.enabled)
                        Text("Source: \(check["source"].string == "owner" ? "Recorded by you" : check["source"].string)").font(.caption).foregroundStyle(.secondary)
                        if check["source"].string == "owner" { Text("This is your recorded assessment, not an automated check.").font(.caption).foregroundStyle(.secondary) }
                    } label: { Label(check["kind"].string.capitalized, systemImage: check["passed"].bool ? "checkmark.circle" : "exclamationmark.circle").font(.callout) }
                }
                if job["status"].string == "awaiting_approval" { Button("Approve this version") { action = .approve } }
                if job["status"].string == "approved" {
                    if ["research", "analysis", "review"].contains(job["task_type"].string) { Button("Mark work complete") { action = .finish } }
                    else { Button("Record deployment") { action = .monitor } }
                }
                if job["status"].string == "monitoring" { Text("Checking that the fix holds. Record a fresh health check after the observation period ends.").font(.caption).foregroundStyle(.secondary) }
                if job["status"].string == "verified" { Label(job["completion_mode"].string == "reviewed" ? "Result checked and accepted" : "Checks passed and the fix held through observation.", systemImage: "checkmark.seal").font(.caption).foregroundStyle(OpsTheme.mint) }
                if !job["monitor_until"].string.isEmpty { LabeledContent("Observe until", value: opsDate(job["monitor_until"].string)).font(.caption) }
            }
            Section {
                Button("Review permissions") { action = .permissions }
                Text("Permissions apply to this work only. Approval and deployment are separate steps.").font(.caption).foregroundStyle(.secondary)
            }
            Section("History") {
                ForEach(detail["events"].array, id: \.["id"].string) { event in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(event["detail"].string.nonempty ?? event["type"].string.replacingOccurrences(of: "_", with: " ")).font(.callout)
                        Text(opsDate(event["created_at"].string)).font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
            Section {
                if ["blocked", "verified"].contains(job["status"].string) { Button("Reopen work") { action = .reopen } }
                if !["cancelled", "verified"].contains(job["status"].string) { Button("Cancel work", role: .destructive) { action = .cancel } }
            }
            if let error { Section { Text(error).font(.caption).foregroundStyle(.orange); Button("Reload") { Task { await load() } } } }
        }.opsScreen().navigationTitle("Work details").navigationBarTitleDisplayMode(.inline)
            .onAppear { visible = true }.onDisappear { visible = false }
            .task(id: "\(visible)-\(phase == .active)-\(action?.rawValue ?? "")-\(assignment)") {
                guard visible, phase == .active, action == nil, !assignment else { return }
                while !Task.isCancelled {
                    await load()
                    do { try await Task.sleep(for: .seconds(10)) } catch { return }
                }
            }.refreshable { await load() }
            .sheet(item: $action, onDismiss: { Task { await load() } }) { action in OpsCompanyAction(job: job, action: action) }
            .sheet(isPresented: $assignment, onDismiss: { Task { await load(); await model.refreshTeam(session) } }) { OpsCompanyAssign(job: job, conversationID: model.conversation) }
    }
    private func assignmentRow(_ run: JSONValue) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(stageLabel(run["stage"].string)).font(.callout.weight(.medium))
            if let member = model.staff.first(where: { $0["id"] == run["staff_id"] }) { Text(member["name"].string).font(.caption.weight(.medium)) }
            Text([run["provider"].string, run["model"].string, companyStatus(run["status"].string)].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
            if run["worker_id"].string.isEmpty { Text("No worker activity available yet.").font(.caption2).foregroundStyle(.secondary) }
        }
    }
    private func stageLabel(_ stage: String) -> String { ["investigate": "Investigate", "implement": "Make the change", "verify": "Check the result"][stage] ?? stage.capitalized }
    private func load() async {
        guard !refreshing else { return }
        refreshing = true; loading = true; defer { refreshing = false; loading = false }
        do {
            let result = try await session.get("/api/ops/company/missions/\(try opsSafePathID(jobID))")
            try Task.checkCancellation()
            detail = result; error = nil
        } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
}
