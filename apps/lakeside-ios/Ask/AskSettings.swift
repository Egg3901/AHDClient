import SwiftUI
import LakesideCore

struct AskSettingsView: View {
    @EnvironmentObject private var session: AppSession
    @State private var signingOut = false
    @State private var consent = false
    @State private var consentGranted = false
    @State private var games: [JSONValue] = []
    @AppStorage("appearance") private var appearance = "dark"
    @AppStorage("ask.game") private var game = "ahd"
    @AppStorage("ask.live") private var live = false
    @AppStorage("ask.length") private var length = "standard"
    @AppStorage("ask.style") private var style = "standard"
    @AppStorage("ask.visualizations") private var visualizations = true
    @AppStorage("ask.provider") private var provider = AskProvider.server.rawValue

    private var recipients: [AIRecipient] { AIConsent.recipients(from: session.profile) }

    var body: some View {
        List {
            if let error = session.error { Section { ProblemBanner(problem: AskProblem(title: "Account", message: error)) }.listRowBackground(Color.clear) }
            Section {
                LabeledContent("Signed in as", value: session.profile["identity"].first("username", "email", "id").nonempty ?? session.profile.first("email", "role"))
                if !session.profile["entitlement"]["label"].string.isEmpty { LabeledContent("Access", value: session.profile["entitlement"]["label"].string) }
                Button("Sign out", role: .destructive) { signingOut = true; Task { await session.signOut(); signingOut = false } }.disabled(signingOut)
            } header: { AskLabel(text: "Account") }

            Section {
                HStack {
                    Text("Outside AI services")
                    Spacer()
                    Text(consentGranted ? "Allowed" : "Not allowed").foregroundStyle(consentGranted ? Brand.mint : .orange)
                        .accessibilityIdentifier("ask-consent-status")
                }
                Button(consentGranted ? "Review or withdraw" : "Review and allow") { consent = true }
                    .accessibilityIdentifier("ask-settings-ai-providers")
            } header: { AskLabel(text: "AI providers") } footer: {
                Text("Ask server questions go to \(recipients.count) outside AI services after you allow it. On-device answers never do.")
            }

            Section { UsagePanel(usage: session.profile["usage"]).listRowInsets(EdgeInsets()).listRowBackground(Color.clear) }
            Section {
                Picker("Answer engine", selection: $provider) {
                    Text(AskProvider.server.title).tag(AskProvider.server.rawValue)
                    if AppleFoundationModelProvider.isAvailable { Text(AskProvider.appleOnDevice.title).tag(AskProvider.appleOnDevice.rawValue) }
                }
                if !games.isEmpty {
                    Picker("Game", selection: $game) { ForEach(games, id: \.["id"].string) { Text($0["name"].string).tag($0["id"].string) } }
                }
                Picker("Style", selection: $style) { Text("Simplified").tag("simplified"); Text("Standard").tag("standard"); Text("Technical").tag("technical") }
                Picker("Length", selection: $length) { Text("Concise").tag("concise"); Text("Standard").tag("standard"); Text("Deep").tag("deep") }
                Toggle("Live game data", isOn: $live)
                Toggle("Charts, diagrams, and maps", isOn: $visualizations)
            } header: { AskLabel(text: "Answer defaults") } footer: {
                Text(AppleFoundationModelProvider.isAvailable ? "Live data and visualizations use their own daily allowances." : AppleFoundationModelProvider.availabilityMessage)
            }

            Section {
                Picker("Theme", selection: $appearance) {
                    Text("Dark").tag("dark"); Text("Light").tag("light"); Text("System").tag("system")
                }
            } header: { AskLabel(text: "Appearance") }

            Section {
                LabeledContent("Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "Unknown")
                LabeledContent("Server", value: session.surface.host)
                if let url = AskConsentStore.privacyURL { Link("Privacy notice", destination: url) }
            } header: { AskLabel(text: "About") }
        }
        .lakesideScreen().navigationTitle("Settings").navigationBarTitleDisplayMode(.inline)
        .refreshable { await session.refreshProfile(); consentGranted = AskConsentStore.granted(recipients) }
        .task {
            await session.refreshProfile()
            consentGranted = AskConsentStore.granted(recipients)
            games = (try? await session.get("/api/games"))?["games"].array ?? []
        }
        .sheet(isPresented: $consent, onDismiss: { consentGranted = AskConsentStore.granted(recipients) }) {
            NavigationStack { AIConsentSheet { allowed in consentGranted = allowed } }
        }
    }
}
