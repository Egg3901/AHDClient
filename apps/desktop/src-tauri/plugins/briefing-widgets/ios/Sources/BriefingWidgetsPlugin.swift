import Foundation
import Tauri
import UIKit
import WebKit
import WidgetKit

final class BriefingWidgetsPlugin: Plugin, WKHTTPCookieStoreObserver {
  private weak var gameView: WKWebView?
  private var observers = [NSObjectProtocol]()
  private var syncGeneration = 0

  @objc public override func load(webview: WKWebView) {
    gameView = webview
    NativePush.shared.attach(webview)
    NativeAskController.shared.attach(webview)
    webview.configuration.websiteDataStore.httpCookieStore.add(self)
    for name in [UIApplication.didBecomeActiveNotification, UIApplication.willResignActiveNotification] {
      observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in self?.sync(); NativePush.shared.refreshPermission() })
    }
    sync()
  }

  func cookiesDidChange(in cookieStore: WKHTTPCookieStore) { sync() }

  private func sync() {
    guard let store = gameView?.configuration.websiteDataStore.httpCookieStore else { return }
    syncGeneration += 1
    let generation = syncGeneration
    store.getAllCookies { [weak self] cookies in
      guard let self = self, generation == self.syncGeneration else { return }
      let selected = cookies.filter { cookie in
        let domain = cookie.domain.hasPrefix(".") ? String(cookie.domain.dropFirst()) : cookie.domain
        let name = cookie.name
        let session = name == "auth-token" || name.range(of: "^auth-token-[A-Za-z0-9-]+$", options: .regularExpression) != nil ||
          name.range(of: "^(__Secure-)?(authjs|next-auth)\\.session-token(\\.[0-9]+)?$", options: .regularExpression) != nil
        return domain == "ahousedividedgame.com" && session &&
          (cookie.expiresDate == nil || cookie.expiresDate! > Date()) &&
          "/api/client-status".hasPrefix(cookie.path)
      }.sorted { $0.name < $1.name }
      let header = selected.map { "\($0.name)=\($0.value)" }.joined(separator: "; ")
      let changed = BriefingStore.session() != header
      BriefingStore.setSession(header)
      NativePush.shared.sync()
      if changed { WidgetCenter.shared.reloadAllTimelines() }
      BriefingStore.refresh { _ in WidgetCenter.shared.reloadAllTimelines() }
    }
  }

  @objc public func pushStatus(_ invoke: Invoke) {
    NativePush.shared.refreshPermission()
    invoke.resolve(NativePush.shared.status())
  }

  @objc public func configurePush(_ invoke: Invoke) throws {
    struct Options: Decodable { let enabled: Bool }
    let options = try invoke.parseArgs(Options.self)
    NativePush.shared.configure(options.enabled) { invoke.resolve($0) }
  }

  @objc public func showAsk(_ invoke: Invoke) {
    NativeAskController.shared.present()
    invoke.resolve(["ok": true])
  }

  deinit {
    gameView?.configuration.websiteDataStore.httpCookieStore.remove(self)
    observers.forEach { NotificationCenter.default.removeObserver($0) }
  }
}

@_cdecl("init_plugin_briefing_widgets")
func initBriefingWidgets() -> Plugin { BriefingWidgetsPlugin() }
