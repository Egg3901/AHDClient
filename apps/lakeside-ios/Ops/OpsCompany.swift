import SwiftUI
import LakesideCore

func companyStatus(_ value: String) -> String {
    ["detected": "New", "investigating": "Investigating", "working": "In progress", "awaiting_verification": "Needs checks", "awaiting_approval": "Needs your approval", "approved": "Approved", "monitoring": "Checking the fix holds", "verified": "Verified", "blocked": "Needs attention", "cancelled": "Cancelled"][value] ?? value.capitalized
}

struct OpsCompany: View {
    @EnvironmentObject private var session: AppSession
    @ObservedObject var model: OpsWorkspaceModel
    @Environment(\.scenePhase) private var phase
    @State private var visible = true
    @State private var refreshing = false
    @State private var snapshot: JSONValue = .null
    @State private var search = ""
    @State private var filter = "all"
    @State private var layout = "board"
    @State private var create = false
    @State private var projects = false
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
        VStack(spacing: 0) {
            if loading && snapshot == .null { ProgressView("Loading work").padding() }
            if let error { Text(error).font(.caption).foregroundStyle(.orange).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 20).padding(.vertical, 8) }
            OpsKanban(jobs: jobs, entities: snapshot["entities"].array, staff: snapshot["staff"].array.isEmpty ? model.staff : snapshot["staff"].array, columnData: snapshot["boardColumns"].array, model: model, showAll: layout == "list", onMoved: { updated in
                acceptMove(updated)
                await load()
            }, onReload: { await load() })
        }.background(Brand.background).foregroundStyle(Brand.ink).tint(Brand.sky)
            .navigationTitle("Work").navigationBarTitleDisplayMode(.inline)
            .searchable(text: $search, prompt: "Find work")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Show", selection: $filter) { Text("All work").tag("all"); Text("Active").tag("active"); Text("Needs you").tag("attention"); Text("Verified").tag("done") }
                        Picker("View", selection: $layout) { Text("Board").tag("board"); Text("List").tag("list") }
                        Button("Projects") { projects = true }
                    } label: { Image(systemName: "line.3.horizontal.decrease") }
                    .accessibilityLabel("Work view options").accessibilityIdentifier("ops-company-view-options")
                }
                ToolbarItem(placement: .topBarTrailing) { Button { create = true } label: { Image(systemName: "plus") }.accessibilityLabel("Add work").accessibilityIdentifier("ops-company-create") }
            }
            .sheet(isPresented: $create, onDismiss: { Task { await load() } }) { OpsCompanyCreate(entities: snapshot["entities"].array).tint(Brand.sky) }
            .sheet(isPresented: $projects) { OpsCompanyProjects(snapshot: snapshot, onReload: { await load() }) }
            .onAppear { visible = true }.onDisappear { visible = false }
            .task(id: "\(visible)-\(phase == .active)-\(create)-\(projects)") {
                guard visible, phase == .active, !create, !projects else { return }
                while !Task.isCancelled {
                    await load()
                    do { try await Task.sleep(for: .seconds(10)) } catch { return }
                }
            }
    }
    private func acceptMove(_ updated: JSONValue) {
        guard !updated["id"].string.isEmpty else { return }
        var fields = snapshot.object
        fields["missions"] = .array(snapshot["missions"].array.map { $0["id"] == updated["id"] ? updated : $0 })
        snapshot = .object(fields)
    }
    private func load() async {
        while refreshing {
            do { try await Task.sleep(for: .milliseconds(25)) } catch { return }
        }
        guard !Task.isCancelled else { return }
        refreshing = true; loading = snapshot == .null; defer { refreshing = false; loading = false }
        do {
            let result = try await session.get("/api/ops/company")
            try Task.checkCancellation()
            // A poll started before a move may arrive after the acknowledgement.
            // Keep newer acknowledged versions while refreshing the rest of the board.
            let known = Dictionary(snapshot["missions"].array.map { ($0["id"].string, $0) }, uniquingKeysWith: { _, latest in latest })
            var fields = result.object
            fields["missions"] = .array(result["missions"].array.map { incoming in
                if let current = known[incoming["id"].string], (current["version"].number ?? 0) > (incoming["version"].number ?? 0) { return current }
                return incoming
            })
            let next = JSONValue.object(fields)
            if snapshot != next { snapshot = next }; error = nil
        } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
}

private struct OpsCompanyProjects: View {
    let snapshot: JSONValue
    let onReload: () async -> Void
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var busy = false
    @State private var error: String?
    var body: some View {
        NavigationStack {
            List {
                ForEach(snapshot["entities"].array, id: \.["id"].string) { item in
                    DisclosureGroup(item["title"].string) {
                        Text(item["summary"].string).font(.callout)
                        Text(item["source"].string).font(.caption).foregroundStyle(.secondary)
                        ForEach(snapshot["links"].array.filter { $0["from_id"] == item["id"] || $0["to_id"] == item["id"] }, id: \.["id"].string) { link in
                            let other = link["from_id"] == item["id"] ? link["to_id"] : link["from_id"]
                            let title = snapshot["entities"].array.first { $0["id"] == other }?["title"].string ?? other.string
                            Text("\(link["relation"].string) · \(title)").font(.caption)
                        }
                    }
                }
                Button("Import known projects") { Task {
                    busy = true; defer { busy = false }
                    do { _ = try await session.post("/api/ops/company/sync", [:]); await onReload(); dismiss() }
                    catch { self.error = error.localizedDescription }
                } }.disabled(busy).accessibilityIdentifier("ops-company-sync")
                if let error { Text(error).font(.caption).foregroundStyle(.orange) }
            }.navigationTitle("Projects").toolbar { Button("Done") { dismiss() } }.tint(Brand.sky)
        }
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
    @State private var visible = true
    @State private var refreshing = false
    @State private var detail: JSONValue = .null
    @State private var action: CompanyAction?
    @State private var assignment = false
    @State private var error: String?
    @State private var loading = false
    private var job: JSONValue { detail["mission"] }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                if loading && detail == .null { ProgressView("Loading work") }
                header
                HStack {
                    Button("Discuss with Ops") { Task {
                        if !job["conversation_id"].string.isEmpty { await model.select(job["conversation_id"].string, session) }
                        model.fileQuestion = "About work \(job["id"].string): \(job["title"].string). "
                        model.selectedTab = 0
                    } }.buttonStyle(.bordered).accessibilityIdentifier("ops-work-discuss")
                    if let worker = model.workers.first(where: { $0["id"] == job["worker_id"] }) {
                        NavigationLink("Agent activity") { OpsWorkerDetail(worker: worker, model: model) }.buttonStyle(.bordered)
                    }
                }
                why
                completionChecks
                people
                recordedChecks
                progress
                if let error { Text(error).font(.caption).foregroundStyle(.orange); Button("Reload") { Task { await load() } } }
            }.padding(.horizontal, 24).padding(.top, 20).padding(.bottom, 28)
                .frame(maxWidth: 720, alignment: .leading).frame(maxWidth: .infinity)
        }.background(Brand.background).foregroundStyle(Brand.ink).tint(Brand.sky)
            .accessibilityElement(children: .contain).accessibilityIdentifier("ops-company-detail-scroll")
            .navigationTitle("Work").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { moreActions } }
            .safeAreaInset(edge: .bottom) { nextStep.padding(.horizontal, 24).padding(.vertical, 12).frame(maxWidth: .infinity).background(Brand.background) }
            .onAppear { visible = true }.onDisappear { visible = false }
            .task(id: "\(visible)-\(phase == .active)-\(action?.rawValue ?? "")-\(assignment)") {
                guard visible, phase == .active, action == nil, !assignment else { return }
                while !Task.isCancelled {
                    await load()
                    do { try await Task.sleep(for: .seconds(10)) } catch { return }
                }
            }.refreshable { await load() }
            .sheet(item: $action, onDismiss: { Task { await load() } }) { action in OpsCompanyAction(job: job, action: action).tint(Brand.sky) }
            .sheet(isPresented: $assignment, onDismiss: { Task { await load(); await model.refreshTeam(session) } }) { OpsCompanyAssign(job: job, conversationID: model.conversation).tint(Brand.sky) }
    }
    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(job["title"].string).font(.title2.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
            Text(companyStatus(job["status"].string)).font(.caption.weight(.medium)).foregroundStyle(job["status"].string == "blocked" ? Color.orange : Brand.sky).accessibilityIdentifier("ops-company-current-status")
            Text(job["objective"].string).font(.body).foregroundStyle(.secondary)
            if !job["error"].string.isEmpty { Text(job["error"].string).font(.caption).foregroundStyle(.orange) }
        }
    }
    private var why: some View {
        VStack(alignment: .leading, spacing: 8) {
            heading("Why")
            Text(detail["signal"]["summary"].string.nonempty ?? "Requested by you.").font(.body)
            Text([detail["signal"]["source"].string.capitalized, opsDate(detail["signal"]["observed_at"].string)].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
        }
    }
    private var completionChecks: some View {
        VStack(alignment: .leading, spacing: 12) {
            heading("Done looks like")
            ForEach(Array(job["acceptance"].array.enumerated()), id: \.offset) { index, criterion in
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "circle").font(.caption).foregroundStyle(Brand.sky).padding(.top, 4)
                    Text(criterion.string).font(.callout).accessibilityIdentifier("ops-company-criterion-\(index)")
                }
            }
        }
    }
    private var people: some View {
        VStack(alignment: .leading, spacing: 12) {
            heading("People")
            if detail["assignments"].array.isEmpty { Text("Not assigned yet").font(.callout).foregroundStyle(.secondary) }
            ForEach(Array(detail["assignments"].array.enumerated()), id: \.offset) { _, run in
                if run["worker_id"].string.isEmpty { assignmentRow(run) }
                else {
                    NavigationLink { ScrollView { OpsWorkerActivity(workerID: run["worker_id"].string).padding() }.navigationTitle("Worker activity") } label: { assignmentRow(run) }
                }
            }
            if !job["conversation_id"].string.isEmpty { Button("Open supervising chat") { Task { await model.select(job["conversation_id"].string, session); model.selectedTab = 0 } }.font(.callout) }
        }
    }
    private var recordedChecks: some View {
        VStack(alignment: .leading, spacing: 12) {
            heading("Checks")
            if !job["artifact"].string.isEmpty { Text("Version · \(job["artifact"].string)").font(.caption.monospaced()).foregroundStyle(.secondary).textSelection(.enabled) }
            if detail["evidence"].array.isEmpty { Text("No checks recorded yet").font(.callout).foregroundStyle(.secondary) }
            ForEach(detail["evidence"].array, id: \.["id"].string) { check in
                DisclosureGroup {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(check["summary"].string).font(.callout)
                        Text("Version: \(check["artifact"].string)").font(.caption.monospaced()).foregroundStyle(.secondary).textSelection(.enabled)
                        Text("Source: \(check["source"].string == "owner" ? "Recorded by you" : check["source"].string)").font(.caption).foregroundStyle(.secondary)
                        if check["source"].string == "owner" { Text("This is your recorded assessment, not an automated check.").font(.caption).foregroundStyle(.secondary) }
                    }.padding(.top, 8)
                } label: { Label("\(check["kind"].string.capitalized) · \(check["passed"].bool ? "Passed" : "Failed")", systemImage: check["passed"].bool ? "checkmark.circle" : "exclamationmark.circle").font(.callout) }
                .accessibilityElement(children: .contain).accessibilityIdentifier("ops-company-check-\(check["id"].string)")
            }
            if !job["approved_artifact"].string.isEmpty { Text("Approved version · \(job["approved_artifact"].string)").font(.caption).textSelection(.enabled) }
            if !job["deployment_receipt"].string.isEmpty { Text("Deployment · \(job["deployment_receipt"].string)").font(.caption).textSelection(.enabled) }
            if job["status"].string == "monitoring" { Text("Record a fresh health check after the observation period ends.").font(.caption).foregroundStyle(.secondary) }
            if !job["monitor_until"].string.isEmpty { Text("Observe until \(opsDate(job["monitor_until"].string))").font(.caption).foregroundStyle(.secondary) }
            if job["status"].string == "verified" { Label(job["completion_mode"].string == "reviewed" ? "Result checked and accepted" : "Checks passed and the fix held through observation.", systemImage: "checkmark.seal").font(.callout).foregroundStyle(Brand.mint) }
        }
    }
    private var progress: some View {
        VStack(alignment: .leading, spacing: 12) {
            heading("Progress")
            ForEach(Array(detail["events"].array.suffix(5).reversed()), id: \.["id"].string) { event in eventRow(event) }
            if detail["events"].array.count > 5 {
                DisclosureGroup("Earlier updates") { ForEach(Array(detail["events"].array.dropLast(5).reversed()), id: \.["id"].string) { event in eventRow(event) } }.font(.caption)
            }
        }
    }
    private func eventRow(_ event: JSONValue) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Circle().fill(Brand.sky.opacity(0.6)).frame(width: 5, height: 5).padding(.top, 7)
            VStack(alignment: .leading, spacing: 4) {
                Text(event["detail"].string.nonempty ?? event["type"].string.replacingOccurrences(of: "_", with: " ")).font(.callout)
                Text(opsDate(event["created_at"].string)).font(.caption2).foregroundStyle(.secondary)
            }
        }
    }
    private func heading(_ value: String) -> some View { Text(value).font(.subheadline.weight(.semibold)) }
    private var moreActions: some View {
        Menu {
            Button("Assign next step") { assignment = true }.accessibilityIdentifier("ops-company-assign")
            Button("Record a check") { action = .check }.disabled(job["artifact"].string.isEmpty).accessibilityIdentifier("ops-company-record-check")
            Button("Check GitHub results") { action = .github }.disabled(job["artifact"].string.isEmpty).accessibilityIdentifier("ops-company-github-check")
            Button("Set version to check") { action = .version }
            Button("Review permissions") { action = .permissions }
            if ["blocked", "verified"].contains(job["status"].string) { Button("Reopen work") { action = .reopen } }
            if !["cancelled", "verified"].contains(job["status"].string) { Button("Cancel work", role: .destructive) { action = .cancel } }
        } label: { Image(systemName: "ellipsis").frame(minWidth: 44, minHeight: 44).contentShape(Rectangle()) }
        .accessibilityLabel("More work actions").accessibilityIdentifier("ops-company-more")
    }
    @ViewBuilder private var nextStep: some View {
        if let running = detail["assignments"].array.first(where: { !["completed", "failed", "cancelled", "canceled", "cancellation", "dispatch_failed"].contains($0["status"].string) && !$0["worker_id"].string.isEmpty }) {
            NavigationLink { ScrollView { OpsWorkerActivity(workerID: running["worker_id"].string).padding() }.navigationTitle("Worker activity") } label: { primaryLabel("Open worker") }
        } else if job["status"].string == "awaiting_approval" { Button { action = .approve } label: { primaryLabel("Approve this version") } }
        else if job["status"].string == "approved" { Button { action = ["research", "analysis", "review"].contains(job["task_type"].string) ? .finish : .monitor } label: { primaryLabel(["research", "analysis", "review"].contains(job["task_type"].string) ? "Mark work complete" : "Record deployment") } }
        else if job["status"].string == "awaiting_verification" { Button { action = job["artifact"].string.isEmpty ? .version : .check } label: { primaryLabel(job["artifact"].string.isEmpty ? "Set version to check" : "Record a check") } }
        else if job["status"].string == "blocked" { Button { action = .reopen } label: { primaryLabel("Reopen work") } }
        else if job["status"].string == "monitoring" { Text("Observing the deployed change").font(.caption).foregroundStyle(.secondary) }
        else if !["verified", "cancelled"].contains(job["status"].string), detail != .null { Button { assignment = true } label: { primaryLabel("Assign next step") } }
    }
    private func primaryLabel(_ title: String) -> some View { Text(title).font(.callout.weight(.semibold)).frame(maxWidth: .infinity).padding(.vertical, 14).background(Brand.sky, in: RoundedRectangle(cornerRadius: 12)).foregroundStyle(Brand.onAccent) }
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
        while refreshing {
            do { try await Task.sleep(for: .milliseconds(25)) } catch { return }
        }
        guard !Task.isCancelled else { return }
        refreshing = true; loading = detail == .null; defer { refreshing = false; loading = false }
        do {
            let result = try await session.get("/api/ops/company/missions/\(try opsSafePathID(jobID))")
            try Task.checkCancellation()
            if detail != result { detail = result }; error = nil
        } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
}
