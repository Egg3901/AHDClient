import SwiftUI

@main struct LakesideOpsApp: App {
    @StateObject private var session = AppSession(.hub)
    var body: some Scene {
        WindowGroup { SessionGate(session: session) { OpsWorkspace() }.modifier(LakesideStyle()) }
    }
}
