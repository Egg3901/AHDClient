import SwiftUI
import LakesideCore

func opsRoutingLabel(_ selection: JSONValue) -> String {
    guard selection != .null else { return "Routing" }
    let provider = selection["provider"].string
    let name = provider == "auto" ? "Auto" : provider == "freerouter" ? "FreeRouter" : provider.capitalized
    return selection["model"].string.isEmpty ? name : "\(name) · \(selection["model"].string)"
}

struct OpsRouting: View {
    let conversationID: String
    @Binding var selection: JSONValue
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var providers: [JSONValue] = []
    @State private var provider = "auto"
    @State private var model = ""
    @State private var effort = "auto"
    @State private var fallback = false
    @State private var loading = true
    @State private var saving = false
    @State private var error: String?
    @State private var refresh = 0

    private var selectedProvider: JSONValue { providers.first { $0["id"].string == provider } ?? .null }
    private var models: [JSONValue] { selectedProvider["models"].array }
    private var efforts: [String] {
        if provider == "auto" { return ["low", "medium", "high"] }
        guard provider != "freerouter" else { return [] }
        let selected = models.first { $0["id"].string == model } ?? models.first { $0["isDefault"].bool } ?? models.first ?? .null
        return selected["thinkingOptions"].array.map { $0["id"].string }.filter { ["low", "medium", "high"].contains($0) }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Changes apply to the next message. Current work keeps its route, and this conversation and its memory stay together.").font(.callout).foregroundStyle(.secondary)
                }
                if loading { ProgressView("Loading routing") }
                Section("Next message") {
                    Picker("Provider", selection: Binding(get: { provider }, set: { provider = $0; model = ""; effort = "auto"; fallback = $0 == "auto" })) {
                        Text("Auto").tag("auto")
                        ForEach(providers.filter { ["codex", "muse", "grok", "freerouter"].contains($0["id"].string) }, id: \.["id"].string) {
                            Text($0.first("label", "id")).tag($0["id"].string)
                        }
                    }.accessibilityIdentifier("ops-routing-provider")
                    if provider != "auto" {
                        Picker("Model", selection: Binding(get: { model }, set: { model = $0; effort = "auto" })) {
                            Text("Provider default").tag("")
                            ForEach(models, id: \.["id"].string) { Text($0.first("label", "name", "id")).tag($0["id"].string) }
                            if !model.isEmpty && !models.contains(where: { $0["id"].string == model }) { Text("\(model) (unavailable)").tag(model) }
                        }.accessibilityIdentifier("ops-routing-model")
                    }
                    Picker("Effort", selection: $effort) {
                        ForEach(["auto"] + efforts, id: \.self) { Text($0 == "auto" ? "Match task" : $0.capitalized).tag($0) }
                    }.disabled(efforts.isEmpty).accessibilityIdentifier("ops-routing-effort")
                    Toggle("Allow provider fallback", isOn: $fallback).accessibilityIdentifier("ops-routing-fallback")
                    if provider != "auto" {
                        Text(fallback ? "Ops may use another available provider if this route fails." : "Keep this provider. If unavailable, report the problem instead of switching.").font(.caption).foregroundStyle(.secondary)
                    }
                    if provider == "freerouter" { Label("FreeRouter supports text chat here. Tool execution requires Codex, Muse, or Grok.", systemImage: "info.circle").font(.caption).foregroundStyle(.secondary) }
                }.disabled(loading || saving)
                if let error { Section { Text(error).foregroundStyle(.orange); if loading { Button("Retry") { refresh += 1 } } } }
            }
            .navigationTitle("Model & routing").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(saving) }
                ToolbarItem(placement: .confirmationAction) { Button(saving ? "Saving…" : "Save") { Task { await save() } }.disabled(loading || saving).accessibilityIdentifier("ops-routing-save") }
            }
            .interactiveDismissDisabled(saving)
            .task(id: refresh) {
                loading = true
                do {
                    async let a = session.get("/api/ops/providers")
                    async let b = session.get("/api/ops/conversations/\(conversationID)/routing")
                    let (catalog, saved) = try await (a, b)
                    try Task.checkCancellation()
                    providers = catalog["providers"].array
                    provider = saved["provider"].string.nonempty ?? "auto"
                    model = saved["model"].string; effort = saved["effort"].string.nonempty ?? "auto"; fallback = saved["allowFallback"].bool
                    selection = saved; error = nil
                    loading = false
                } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
            }
        }
    }
    private func save() async {
        saving = true; defer { saving = false }
        do {
            selection = try await session.post("/api/ops/conversations/\(conversationID)/routing", ["provider": .string(provider), "model": model.isEmpty ? .null : .string(model), "effort": .string(effort), "allowFallback": .bool(fallback)])
            dismiss()
        } catch { self.error = error.localizedDescription }
    }
}
