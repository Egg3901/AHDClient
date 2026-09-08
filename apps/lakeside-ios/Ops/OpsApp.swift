import SwiftUI

@main struct LakesideOpsApp: App {
    @StateObject private var session = AppSession(.ops)
    var body: some Scene {
        WindowGroup { SessionGate(session: session) { OpsHome() }.tint(.cyan) }
    }
}
