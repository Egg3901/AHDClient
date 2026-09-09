import SwiftUI
import LakesideCore

struct OpsWorkDetail: View {
    let cardID: String
    @ObservedObject var store: OpsWorkStore
    @ObservedObject var model: OpsWorkspaceModel
    @EnvironmentObject private var session: AppSession
    @Environment(\.scenePhase) private var phase
    @State private var visible = true
    @State private var detail: JSONValue = .null
    @State private var comment = ""
    @State private var note = ""
    @State private var artifact = ""
    @State private var artifactName = ""
    @State private var dispatch = false
    @State private var edit = false
    @State private var showMove = false
    @State private var movingCard: JSONValue = .null
    @State private var error: String?
    @State private var busy = false
    @State private var decision = ""
    @State private var confirmReview = false
    @State private var reviewedCard: JSONValue = .null
    private var card: JSONValue { store.cards.first { $0["id"].string == cardID } ?? detail["card"] }
    var body: some View {
        List {
            Section {
                Text(card["title"].string).font(.title2.weight(.semibold))
                Text(card["objective"].string)
                Text(store.board["columns"].array.first { $0["id"] == card["columnId"] }?["title"].string ?? "").font(.caption).foregroundStyle(Brand.sky).accessibilityIdentifier("ops-company-current-status")
                if !store.online { Text("Saved card. Comments and activity may be out of date.").font(.caption).foregroundStyle(.orange) }
                if let error { Text(error).font(.caption).foregroundStyle(.orange) }
                Button("Discuss with Ops") { Task {
                    if !card["conversation_id"].string.isEmpty { await model.select(card["conversation_id"].string, session) }
                    model.fileQuestion = "About work \(cardID): \(card["title"].string). "
                    model.selectedTab = 0
                } }.accessibilityIdentifier("ops-work-discuss")
                if card["workVersion"] == .null {
                    NavigationLink("Checks and release history") { OpsCompanyDetail(jobID: cardID, model: model) }.accessibilityIdentifier("ops-work-legacy-detail")
                }
                Button("Start a run") { dispatch = true }.disabled(!store.online).accessibilityIdentifier("ops-company-assign")
                Button("Move") { movingCard = card; showMove = true }.accessibilityIdentifier("ops-work-move")
            }
            Section("Done looks like") {
                ForEach(Array(card["acceptance"].array.enumerated()), id: \.offset) { index, item in Text(item.string).accessibilityIdentifier("ops-company-criterion-\(index)") }
            }
            Section("Runs") {
                ForEach(detail["runs"].array, id: \.["id"].string) { run in
                    NavigationLink { OpsWorkRun(runID: run["id"].string, card: card, store: store) } label: {
                        VStack(alignment: .leading) {
                            Text(run.first("status", "state").replacingOccurrences(of: "_", with: " ").capitalized)
                            Text([run.first("hostId", "host_id"), run.first("actualProvider", "provider"), run.first("actualModel", "model")].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                if detail["runs"].array.isEmpty { Text("No confirmed runs").foregroundStyle(.secondary) }
            }
            Section("Proposal review") {
                Text("Approval is recorded for the reviewed revision. Moving a card does not grant approval.").font(.caption)
                if !card["review"]["state"].string.isEmpty {
                    Text("Review: \(card["review"]["state"].string.capitalized)").accessibilityIdentifier("ops-work-review-state")
                    if !card["review"]["note"].string.isEmpty { Text(card["review"]["note"].string) }
                    if !card["review"]["artifact"].string.isEmpty { Text("Reviewed artifact: \(card["review"]["artifact"].string)").font(.caption).textSelection(.enabled) }
                }
                if !card["approved_artifact"].string.isEmpty { Text("Approved artifact: \(card["approved_artifact"].string)").font(.caption).textSelection(.enabled) }
                TextField("Review note", text: $note, axis: .vertical).accessibilityIdentifier("ops-work-review-note")
                HStack {
                    ForEach(["approve", "reject", "redirect"], id: \.self) { value in Button(value.capitalized) { reviewedCard = card; decision = value; confirmReview = true }.accessibilityIdentifier("ops-work-review-\(value)") }
                }.buttonStyle(.bordered).disabled(!store.online || note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy)
            }
            Section("Files and links") {
                ForEach(Array(detail["artifacts"].array.enumerated()), id: \.offset) { _, item in
                    if let url = Endpoint.link(item.first("url", "location"), base: session.surface.base) { Link(item.first("name", "url"), destination: url) }
                }
                TextField("Link name", text: $artifactName)
                TextField("HTTPS or /uploads/ link", text: $artifact).textInputAutocapitalization(.never).autocorrectionDisabled()
                Button("Attach link") { Task {
                    if await store.submit(type: "artifact.attach", card: card, payload: ["name": .string(artifactName), "url": .string(artifact)], session: session) { artifact = ""; artifactName = ""; await load() }
                } }.disabled(artifactName.isEmpty || !(artifact.hasPrefix("https://") || artifact.hasPrefix("/uploads/")))
            }
            Section("Conversation") {
                ForEach(Array(detail["comments"].array.enumerated()), id: \.offset) { _, item in
                    VStack(alignment: .leading, spacing: 5) { Text(item.first("text", "body")); actor(item) }
                }
                TextField("Add a comment", text: $comment, axis: .vertical).accessibilityIdentifier("ops-work-comment")
                Button("Save comment") { Task {
                    if await store.submit(type: "comment.add", card: card, payload: ["text": .string(comment)], session: session) { comment = ""; await load() }
                } }.disabled(comment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty).accessibilityIdentifier("ops-work-comment-save")
            }
            Section("Activity") {
                ForEach(Array(detail["events"].array.suffix(50).reversed().enumerated()), id: \.offset) { _, event in
                    VStack(alignment: .leading, spacing: 5) { Text(event.first("detail", "type").replacingOccurrences(of: "_", with: " ")); actor(event) }
                }
            }
        }.listStyle(.insetGrouped).buttonStyle(.borderless).scrollDismissesKeyboard(.interactively).navigationTitle("Work").navigationBarTitleDisplayMode(.inline)
            .accessibilityIdentifier("ops-company-detail-scroll").tint(Brand.sky)
            .toolbar { Button("Edit") { edit = true } }
            .sheet(isPresented: $dispatch) { OpsWorkDispatch(card: card, store: store) }
            .sheet(isPresented: $edit) { OpsWorkEdit(card: card, store: store) }
            .sheet(isPresented: $showMove) { OpsWorkMove(card: movingCard, store: store) }
            .confirmationDialog("Confirm \(decision) for revision \(reviewedCard["version"].string)", isPresented: $confirmReview, titleVisibility: .visible) {
                Button("Confirm review") { let chosen = decision; Task {
                    busy = true; defer { busy = false }; _ = await store.submit(type: "proposal.decide", card: reviewedCard, payload: ["decision": .string(chosen), "note": .string(note)], authority: true, session: session); await load()
                } }.accessibilityIdentifier("ops-work-review-confirm")
                Button("Cancel", role: .cancel) { decision = "" }
            }
            .onAppear { visible = true; if detail == .null { detail = store.cache.details["card:" + cardID] ?? .null } }.onDisappear { visible = false }
            .task(id: "\(visible)-\(phase == .active)") {
                guard visible, phase == .active else { return }
                while !Task.isCancelled { await load(); do { try await Task.sleep(for: .seconds(2)) } catch { return } }
            }.refreshable { await load() }
    }
    private func actor(_ event: JSONValue) -> some View {
        Text([event["actor"].first("name", "role", "kind", "id"), opsDate(event.first("createdAt", "created_at"))].filter { !$0.isEmpty }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
    }
    private func load() async {
        do { detail = try await session.get("/api/ops/cards/\(try opsSafePathID(cardID))"); store.rememberDetail("card:" + cardID, value: detail); error = nil; await store.refresh(session) }
        catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
}

private struct OpsWorkMove: View {
    let card: JSONValue
    @ObservedObject var store: OpsWorkStore
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var busy = false
    var body: some View {
        NavigationStack {
            List {
                Text(card["title"].string).font(.headline)
                Text("Moving a card does not approve a proposal or start a run.").font(.caption).foregroundStyle(.secondary)
                ForEach(store.board["columns"].array, id: \.["id"].string) { column in
                    Button(column["title"].string) { Task {
                        busy = true; defer { busy = false }
                        if await store.submit(type: "card.move", card: card, payload: ["columnId": column["id"]], session: session) { dismiss() }
                    } }.buttonStyle(.borderless).disabled(busy || column["id"] == card["columnId"]).accessibilityIdentifier("ops-work-move-to-\(column["id"].string)")
                }
                if let error = store.error { Text(error).font(.caption).foregroundStyle(.orange) }
            }.navigationTitle("Move work").toolbar { Button("Cancel") { dismiss() } }
        }.tint(Brand.sky)
    }
}

private struct OpsWorkEdit: View {
    let card: JSONValue
    @ObservedObject var store: OpsWorkStore
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var objective = ""
    @State private var busy = false
    var body: some View {
        NavigationStack {
            Form { TextField("Title", text: $title); TextField("Objective", text: $objective, axis: .vertical).lineLimit(3...12) }
                .navigationTitle("Edit work").toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) { Button("Save") { Task {
                        busy = true; defer { busy = false }
                        var changes: [String: JSONValue] = [:]; var base: [String: JSONValue] = [:]
                        if title != card["title"].string { changes["title"] = .string(title); base["title"] = card["title"] }
                        if objective != card["objective"].string { changes["objective"] = .string(objective); base["objective"] = card["objective"] }
                        if changes.isEmpty { dismiss(); return }
                        if await store.submit(type: "card.patch", card: card, payload: ["changes": .object(changes), "base": .object(base)], session: session) { dismiss() }
                    } }.disabled(title.isEmpty || busy) }
                }.onAppear { title = card["title"].string; objective = card["objective"].string }
        }
    }
}

private struct OpsWorkDispatch: View {
    let card: JSONValue
    @ObservedObject var store: OpsWorkStore
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var inventory: JSONValue = .null
    @State private var staffMembers: [JSONValue] = []
    @State private var selectedStaff = ""
    @State private var hostID = "cloud"
    @State private var provider = ""
    @State private var workspace = ""
    @State private var model = ""
    @State private var access = "read"
    @State private var effort = "auto"
    @State private var minutes = 15
    @State private var busy = false
    @State private var error: String?
    private var hosts: [JSONValue] { (inventory["cloud"] == .null ? [] : [inventory["cloud"]]) + inventory["runners"].array }
    private var host: JSONValue { hosts.first { $0["id"].string == hostID } ?? .null }
    private var providers: [JSONValue] { host["providers"].array.filter { $0["available"].bool } }
    var body: some View {
        NavigationStack {
            Form {
                Picker("Work with", selection: $selectedStaff) { Text("Temporary worker").tag(""); ForEach(staffMembers, id: \.["id"].string) { Text($0["name"].string).tag($0["id"].string) } }.accessibilityIdentifier("ops-work-dispatch-staff")
                Picker("Run on", selection: $hostID) { ForEach(hosts, id: \.["id"].string) { item in Text(item["name"].string + (item["id"].string != "cloud" && !item["online"].bool ? " (offline)" : "")).tag(item["id"].string) } }
                Picker("Workspace", selection: $workspace) { Text(provider == "freerouter" && hostID == "cloud" ? "No workspace (text only)" : "Choose workspace").tag(""); ForEach(host["workspaces"].array, id: \.["id"].string) { Text($0["name"].string).tag($0["id"].string) } }
                Picker("Provider", selection: $provider) { Text("Choose provider").tag(""); ForEach(providers, id: \.["id"].string) { Text($0["id"].string).tag($0["id"].string) } }
                Picker("Model", selection: $model) { Text("Provider default").tag(""); ForEach(providers.first { $0["id"].string == provider }?["models"].array ?? [], id: \.["id"].string) { Text($0["id"].string).tag($0["id"].string) } }
                Picker("Effort", selection: $effort) { ForEach(["auto", "low", "medium", "high"], id: \.self) { Text($0.capitalized).tag($0) } }
                Picker("Access", selection: $access) { Text("Read only").tag("read"); Text("Make changes").tag("change") }
                Stepper("Maximum \(minutes) minutes", value: $minutes, in: 1...120)
                Text("The selected host works in its configured workspace. Dispatch is confirmed only after the server accepts it.").font(.caption)
                if let error { Text(error).foregroundStyle(.orange) }
                if let error = store.error { Text(error).foregroundStyle(.orange) }
            }.navigationTitle("Start a run").toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Start") { Task {
                    busy = true; defer { busy = false }
                    var payload: [String: JSONValue] = ["hostId": .string(hostID), "workspaceId": .string(workspace), "provider": .string(provider), "maxMinutes": .number(Double(minutes)), "access": .string(access), "effort": .string(effort)]
                    if !model.isEmpty { payload["model"] = .string(model) }
                    if card["conversation_id"] != .null { payload["conversationId"] = .string(card["conversation_id"].string) }
                    if !selectedStaff.isEmpty { payload["staffId"] = .string(selectedStaff) }
                    if await store.submit(type: "run.dispatch", card: card, payload: payload, authority: true, session: session) { dismiss() }
                } }.disabled(busy || !store.online || provider.isEmpty || (workspace.isEmpty && !(hostID == "cloud" && provider == "freerouter")) || (hostID != "cloud" && !host["online"].bool)) }
            }.task { do { inventory = try await session.get("/api/ops/runners"); let roster = try await session.get("/api/ops/staff"); staffMembers = roster["staff"].array } catch { self.error = error.localizedDescription } }
                .onChange(of: hostID) { _, _ in provider = ""; workspace = ""; model = "" }
                .onChange(of: provider) { _, _ in model = "" }
        }.tint(Brand.sky)
    }
}

private struct OpsWorkRun: View {
    let runID: String
    let card: JSONValue
    @ObservedObject var store: OpsWorkStore
    @EnvironmentObject private var session: AppSession
    @Environment(\.scenePhase) private var phase
    @State private var detail: JSONValue = .null
    @State private var error: String?
    @State private var visible = true
    var body: some View {
        List {
            Section("Run") {
                Text(detail["run"]["status"].string.replacingOccurrences(of: "_", with: " ").capitalized)
                Text(detail["run"].first("result", "error")).textSelection(.enabled)
                if !["completed", "failed", "cancelled"].contains(detail["run"]["status"].string) {
                    Button("Request cancellation", role: .destructive) { Task { _ = await store.submit(type: "run.cancel", card: card, payload: ["runId": .string(runID)], authority: true, session: session) } }.buttonStyle(.borderless).disabled(!store.online)
                }
                Text("Cancellation remains a request until the host acknowledges it. A disconnected host may still be working.").font(.caption).foregroundStyle(.secondary)
            }
            Section("Activity") {
                ForEach(Array(detail["events"].array.suffix(100).enumerated()), id: \.offset) { _, event in
                    VStack(alignment: .leading) { Text(event["kind"].string.capitalized).font(.caption).foregroundStyle(.secondary); Text(event.first("text", "detail")).font(.callout).textSelection(.enabled) }
                }
            }
            if let error { Text(error).foregroundStyle(.orange) }
        }.navigationTitle("Run activity").onAppear { visible = true; if detail == .null { detail = store.cache.details["run:" + runID] ?? .null } }.onDisappear { visible = false }
            .task(id: "\(visible)-\(phase == .active)") {
                guard visible, phase == .active else { return }
                while !Task.isCancelled {
                    do { detail = try await session.get("/api/ops/runs/\(try opsSafePathID(runID))"); store.rememberDetail("run:" + runID, value: detail); error = nil } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
                    do { try await Task.sleep(for: .seconds(2)) } catch { return }
                }
            }
    }
}
