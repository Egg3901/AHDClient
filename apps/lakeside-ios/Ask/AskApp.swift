import SwiftUI

@main struct LakesideAskApp: App {
    @StateObject private var session = AppSession(.ask)
    var body: some Scene {
        WindowGroup { SessionGate(session: session) { AskHome() }.tint(.teal) }
    }
}
