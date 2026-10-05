import SwiftUI

@main struct LakesideAskApp: App {
    @StateObject private var session = AppSession(.ask)
    init() {
#if DEBUG
        // Fixture runs start from a clean slate so every UI test sees the
        // consent gate and the default answer settings.
        if ProcessInfo.processInfo.arguments.contains("--uitest-fixtures") {
            AskConsentStore.withdraw()
            for key in ["ask.live", "ask.provider", "ask.length", "ask.style", "ask.visualizations", "ask.game"] {
                UserDefaults.standard.removeObject(forKey: key)
            }
        }
#endif
    }
    var body: some Scene {
        WindowGroup { SessionGate(session: session) { AskHome() }.modifier(LakesideStyle()) }
    }
}
