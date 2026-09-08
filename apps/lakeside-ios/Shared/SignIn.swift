import SwiftUI
import WebKit

struct SessionGate<Content: View>: View {
    @ObservedObject var session: AppSession
    @ViewBuilder var content: () -> Content
    @State private var login = false
    var body: some View {
        Group {
            if session.checking { ProgressView("Connecting…") }
            else if session.signedIn { content().environmentObject(session) }
            else {
                VStack(spacing: 24) {
                    Image(systemName: session.surface.symbol).font(.system(size: 64)).foregroundStyle(.tint)
                    Text(session.surface.title).font(.largeTitle.bold())
                    Text(session.surface == .ask ? "Your questions. Your games. Answers with sources." : "Your services, agents, and projects in one place.")
                        .multilineTextAlignment(.center).foregroundStyle(.secondary)
                    if let error = session.error { Text(error).font(.callout).foregroundStyle(.red) }
                    Button("Sign in to Lakeside") { login = true }.buttonStyle(.borderedProminent).controlSize(.large)
                    Text("Use your existing Lakeside account.").font(.footnote).foregroundStyle(.secondary)
                }.padding(32)
            }
        }
        .task { await session.restore() }
        .sheet(isPresented: $login) {
            NavigationStack {
                LoginBrowser(session: session) { login = false }
                    .navigationTitle("Sign in").navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { login = false } } }
            }
        }
    }
}

/// WebKit is used only for the existing first-party login, never for app content.
private struct LoginBrowser: UIViewRepresentable {
    let session: AppSession
    let done: () -> Void
    func makeCoordinator() -> Coordinator { Coordinator(session: session, done: done) }
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration(); configuration.websiteDataStore = .nonPersistent()
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = context.coordinator
        configuration.websiteDataStore.httpCookieStore.add(context.coordinator)
        context.coordinator.store = configuration.websiteDataStore.httpCookieStore
        web.load(URLRequest(url: session.surface.base.appendingPathComponent(session.surface.login)))
        return web
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.stopLoading(); coordinator.active = false; coordinator.store?.remove(coordinator)
    }
    @MainActor final class Coordinator: NSObject, WKNavigationDelegate, WKHTTPCookieStoreObserver {
        let session: AppSession
        let done: () -> Void
        var store: WKHTTPCookieStore?
        var accepting = false
        var active = true
        init(session: AppSession, done: @escaping () -> Void) { self.session = session; self.done = done }
        func cookiesDidChange(in cookieStore: WKHTTPCookieStore) {
            guard active, !accepting else { return }
            cookieStore.getAllCookies { [weak self] cookies in
                guard let self, self.active, !self.accepting else { return }
                guard let cookie = cookies.first(where: { $0.name == self.session.surface.cookie && !$0.value.isEmpty }) else { return }
                self.accepting = true
                Task { @MainActor in
                    do { try await self.session.accept(cookie); if self.active { self.done() } }
                    catch { self.session.error = error.localizedDescription; self.accepting = false; if self.active { self.done() } }
                }
            }
        }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { cookiesDidChange(in: webView.configuration.websiteDataStore.httpCookieStore) }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            decisionHandler(navigationAction.request.url?.scheme == "https" ? .allow : .cancel)
        }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            if (error as NSError).code != NSURLErrorCancelled { session.error = error.localizedDescription; done() }
        }
    }
}
