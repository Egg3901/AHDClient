import ObjectiveC
import UIKit
import WebKit

/// wry's WKUIDelegate implements no JavaScript panel callbacks, so on iOS
/// `window.confirm()` returns false, `alert()` is dropped and `prompt()` returns
/// null without showing anything. Every guarded action in the game then
/// silently does nothing. This wraps the delegate wry installed: the three
/// panels are answered here with UIAlertController, everything else is
/// forwarded to the original delegate untouched.
final class JSDialogDelegate: NSObject, WKUIDelegate {
  private static var key: UInt8 = 0
  private let inner: WKUIDelegate?

  private init(inner: WKUIDelegate?) {
    self.inner = inner
  }

  static func install(on webview: WKWebView) {
    if webview.uiDelegate is JSDialogDelegate { return }
    let proxy = JSDialogDelegate(inner: webview.uiDelegate)
    // uiDelegate is weak; the webview owns the proxy through this association.
    objc_setAssociatedObject(webview, &key, proxy, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    webview.uiDelegate = proxy
  }

  override func responds(to aSelector: Selector!) -> Bool {
    super.responds(to: aSelector) || (inner?.responds(to: aSelector) ?? false)
  }

  override func forwardingTarget(for aSelector: Selector!) -> Any? {
    if let inner = inner, inner.responds(to: aSelector) { return inner }
    return super.forwardingTarget(for: aSelector)
  }

  func webView(
    _ webView: WKWebView,
    runJavaScriptAlertPanelWithMessage message: String,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping () -> Void
  ) {
    let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
    if !present(alert, from: webView) { completionHandler() }
  }

  func webView(
    _ webView: WKWebView,
    runJavaScriptConfirmPanelWithMessage message: String,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping (Bool) -> Void
  ) {
    let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
    alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
    if !present(alert, from: webView) { completionHandler(false) }
  }

  func webView(
    _ webView: WKWebView,
    runJavaScriptTextInputPanelWithPrompt prompt: String,
    defaultText: String?,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping (String?) -> Void
  ) {
    let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
    alert.addTextField { $0.text = defaultText }
    alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
    alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak alert] _ in
      completionHandler(alert?.textFields?.first?.text ?? "")
    })
    if !present(alert, from: webView) { completionHandler(nil) }
  }

  /// Presents from the top-most controller. False means nothing could present
  /// (no window yet), and the caller must answer the panel itself.
  private func present(_ alert: UIAlertController, from webView: WKWebView) -> Bool {
    guard var top = webView.window?.rootViewController else { return false }
    while let next = top.presentedViewController, !next.isBeingDismissed { top = next }
    top.present(alert, animated: true)
    return true
  }
}
