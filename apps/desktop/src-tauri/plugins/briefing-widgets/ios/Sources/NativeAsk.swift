import Foundation
import SwiftUI
import UIKit
import WebKit

private let nativeAskOrigin = URL(string: "https://ask.lakesidegames.net")!
private let nativeAskLogin = nativeAskOrigin.appendingPathComponent("auth/login")

enum NativeAskProvider: String, Hashable {
  case server
  case appleOnDevice

  var title: String {
    switch self {
    case .server: return "Ask server"
    case .appleOnDevice: return "Apple Foundation Models"
    }
  }
}

struct NativeAskTurn: Identifiable {
  let id: String
  var question: String
  var answer: String
  var model: String = ""
  var citations: [String] = []
  var local = false
}

private struct NativeAskResult {
  let answer: String
  let conversationID: String
  let model: String
  let citations: [String]
}

private enum NativeAskError: LocalizedError {
  case signedOut
  case loginFailed
  case server(String)
  case emptyAnswer

  var errorDescription: String? {
    switch self {
    case .signedOut, .loginFailed:
      return "Ask could not find a linked game account. Link your game account in AHDClient first."
    case .server(let message): return message
    case .emptyAnswer: return "Ask returned an empty answer."
    }
  }
}

private final class NativeAskRedirectDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  private let allowedHosts: Set<String> = [
    "ask.lakesidegames.net",
    "auth.ahousedividedgame.com",
    "ahousedividedgame.com",
    "www.ahousedividedgame.com",
  ]

  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                  newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    guard let url = request.url, url.scheme == "https", let host = url.host?.lowercased(), allowedHosts.contains(host) else {
      completionHandler(nil)
      return
    }
    completionHandler(request)
  }
}

private final class NativeAskAPI {
  private let storage: HTTPCookieStorage
  private let transport: URLSession

  init(gameCookies: [HTTPCookie]) {
    let storage = HTTPCookieStorage()
    self.storage = storage
    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpShouldSetCookies = true
    configuration.httpCookieStorage = storage
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.timeoutIntervalForRequest = 90
    configuration.timeoutIntervalForResource = 900
    configuration.urlCache = nil
    transport = URLSession(configuration: configuration, delegate: NativeAskRedirectDelegate(), delegateQueue: nil)
    for cookie in gameCookies where Self.isRelevant(cookie) {
      storage.setCookie(cookie)
    }
  }

  private static func isRelevant(_ cookie: HTTPCookie) -> Bool {
    let domain = cookie.domain.trimmingCharacters(in: CharacterSet(charactersIn: ".")).lowercased()
    let gameDomain = domain == "ahousedividedgame.com" || domain == "www.ahousedividedgame.com"
    let authDomain = domain == "auth.ahousedividedgame.com"
    let askDomain = domain == "ask.lakesidegames.net"
    let session = cookie.name == "ask_session" || cookie.name == "__Host-ask_session"
      || cookie.name == "auth-token" || cookie.name.hasPrefix("auth-token-")
      || cookie.name.range(of: "^(?:__Secure-)?(?:authjs|next-auth)\\.session-token(?:\\.[0-9]+)?$", options: .regularExpression) != nil
    return (gameDomain || authDomain || askDomain) && session && !cookie.value.isEmpty
  }

  private var askCookie: HTTPCookie? {
    storage.cookies(for: nativeAskOrigin)?.first { $0.name == "ask_session" || $0.name == "__Host-ask_session" }
  }

  private func clearAskCookies() {
    for cookie in storage.cookies(for: nativeAskOrigin) ?? [] where cookie.name == "ask_session" || cookie.name == "__Host-ask_session" {
      storage.deleteCookie(cookie)
    }
  }

  private func request(_ path: String, body: [String: Any]? = nil) throws -> URLRequest {
    guard path.hasPrefix("/") else { throw NativeAskError.server("Invalid Ask request.") }
    var request = URLRequest(url: nativeAskOrigin.appendingPathComponent(String(path.dropFirst())))
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(nativeAskOrigin.absoluteString, forHTTPHeaderField: "Origin")
    request.setValue(nativeAskOrigin.absoluteString + "/", forHTTPHeaderField: "Referer")
    if let body {
      request.httpMethod = "POST"
      request.httpBody = try JSONSerialization.data(withJSONObject: body)
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }
    return request
  }

  private func ensureSession(force: Bool = false) async throws {
    if !force, askCookie != nil { return }
    var request = URLRequest(url: nativeAskLogin)
    request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
    do {
      let (_, response) = try await transport.data(for: request)
      guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode), askCookie != nil else {
        throw NativeAskError.loginFailed
      }
    } catch let error as NativeAskError {
      throw error
    } catch {
      throw NativeAskError.loginFailed
    }
  }

  private func json(_ request: URLRequest) async throws -> [String: Any] {
    let (data, response) = try await transport.data(for: request)
    guard let http = response as? HTTPURLResponse else { throw NativeAskError.server("Ask returned an invalid response.") }
    if http.statusCode == 401 { throw NativeAskError.signedOut }
    guard (200..<300).contains(http.statusCode) else {
      let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
      throw NativeAskError.server(payload?["error"] as? String ?? "Ask returned HTTP \(http.statusCode).")
    }
    guard let value = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
      throw NativeAskError.server("Ask returned invalid data.")
    }
    return value
  }

  func connect() async throws -> [String: Any] {
    do {
      try await ensureSession()
      return try await json(try request("/api/me"))
    } catch let error as NativeAskError {
      guard case .signedOut = error else { throw error }
      clearAskCookies()
      try await ensureSession(force: true)
      return try await json(try request("/api/me"))
    }
  }

  func ask(question: String, conversationID: String, length: String, style: String, mode: String) async throws -> NativeAskResult {
    try await ensureSession()
    let body: [String: Any] = [
      "question": question,
      "convId": conversationID,
      "game": "ahd",
      "useMcp": true,
      "length": length,
      "style": style,
      "effort": "auto",
      "visualizations": false,
      "mode": mode,
      "tz": TimeZone.current.identifier,
      "attachments": [],
    ]
    let request = try self.request("/api/ask", body: body)
    let (bytes, response) = try await transport.bytes(for: request)
    defer { bytes.task.cancel() }
    guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
      throw NativeAskError.server("Ask could not start the answer.")
    }

    var answer = ""
    var model = ""
    var returnedConversationID = conversationID
    var citations: [String] = []
    try await readEvents(bytes) { name, value in
      let object = value as? [String: Any]
      switch name {
      case "meta":
        returnedConversationID = object?["convId"] as? String ?? returnedConversationID
      case "delta":
        answer += value as? String ?? ""
      case "done":
        if let object {
          returnedConversationID = object["convId"] as? String ?? returnedConversationID
          answer = object["answer"] as? String ?? answer
          model = object["modelName"] as? String ?? object["modelId"] as? String ?? object["model"] as? String ?? model
          citations = (object["citations"] as? [[String: Any]] ?? []).compactMap { item in
            item["label"] as? String ?? item["path"] as? String
          }
        }
      case "error":
        throw NativeAskError.server(object?["message"] as? String ?? value as? String ?? "Ask could not complete the answer.")
      default:
        break
      }
    }
    guard !answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw NativeAskError.emptyAnswer }
    return NativeAskResult(answer: answer, conversationID: returnedConversationID, model: model, citations: citations)
  }

  private func readEvents(_ bytes: URLSession.AsyncBytes, handler: (String, Any) throws -> Void) async throws {
    var lineBytes: [UInt8] = []
    var event = "message"
    var payload = ""
    func emit() throws {
      guard !payload.isEmpty else { return }
      guard let data = payload.data(using: .utf8), let value = try? JSONSerialization.jsonObject(with: data) else {
        throw NativeAskError.server("Ask sent an invalid event.")
      }
      try handler(event, value)
      payload = ""
    }
    for try await byte in bytes {
      if byte == 10 {
        let line = String(bytes: lineBytes, encoding: .utf8) ?? ""
        lineBytes.removeAll(keepingCapacity: true)
        if line.isEmpty {
          try emit()
          event = "message"
        } else if line.hasPrefix("event:") {
          event = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
        } else if line.hasPrefix("data:") {
          payload += String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
        }
      } else if byte != 13 {
        lineBytes.append(byte)
      }
    }
    try emit()
  }
}

@MainActor final class NativeAskModel: ObservableObject {
  @Published var provider: NativeAskProvider = .server
  @Published var turns: [NativeAskTurn] = []
  @Published var draft = ""
  @Published var signedIn = false
  @Published var accountName = ""
  @Published var connecting = true
  @Published var sending = false
  @Published var error: String?
  @Published var appleAvailable = false
  @Published var appleMessage = "Checking Apple Foundation Models..."

  private let webView: WKWebView
  private var api: NativeAskAPI?
  private var conversationID = ""
  private var task: Task<Void, Never>?

  init(webView: WKWebView) {
    self.webView = webView
    refreshAppleStatus()
  }

  deinit { task?.cancel() }

  func start() {
    refreshAppleStatus()
    task = Task { [weak self] in await self?.connect() }
  }

  func refreshAppleStatus() {
    let status = AppleFoundationModelBridge.status()
    appleAvailable = status["available"] as? Bool ?? false
    appleMessage = status["message"] as? String ?? "Apple Foundation Models are unavailable."
  }

  func connect() async {
    connecting = true
    defer { connecting = false }
    let cookies = await allCookies()
    let client = NativeAskAPI(gameCookies: cookies)
    do {
      let profile = try await client.connect()
      api = client
      signedIn = true
      accountName = Self.name(from: profile) ?? "linked game account"
      error = nil
    } catch {
      api = client
      signedIn = false
      error = error.localizedDescription
    }
  }

  func send() {
    let question = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sending, question.utf16.count >= 5, question.utf16.count <= 500 else { return }
    let turnID = UUID().uuidString
    draft = ""
    error = nil
    turns.append(NativeAskTurn(id: turnID, question: question, answer: ""))
    sending = true
    let selectedProvider = provider
    let history = turns.dropLast().suffix(8).map { "User: \($0.question)\nAssistant: \(String($0.answer.prefix(1200)))" }
    let oldConversationID = conversationID
    task = Task { [weak self] in
      guard let self else { return }
      defer { sending = false }
      do {
        let result: NativeAskResult
        if selectedProvider == .appleOnDevice {
          guard appleAvailable else { throw FoundationModelBridgeError.unavailable(appleMessage) }
          let options = FoundationModelOptions(question: question, history: history, length: "standard", style: "standard", mode: "ask")
          let payload = try await AppleFoundationModelBridge.respond(options)
          result = NativeAskResult(answer: payload["text"] as? String ?? "", conversationID: "", model: payload["model"] as? String ?? "Apple Foundation Models", citations: [])
        } else {
          guard let api else { throw NativeAskError.signedOut }
          guard signedIn else { throw NativeAskError.signedOut }
          result = try await api.ask(question: question, conversationID: oldConversationID, length: "standard", style: "standard", mode: "auto")
        }
        guard let index = turns.firstIndex(where: { $0.id == turnID }) else { return }
        turns[index].answer = result.answer
        turns[index].model = result.model
        turns[index].citations = result.citations
        turns[index].local = selectedProvider == .appleOnDevice
        if !result.conversationID.isEmpty { conversationID = result.conversationID }
      } catch is CancellationError {
        turns.removeAll { $0.id == turnID }
      } catch {
        self.error = error.localizedDescription
        turns.removeAll { $0.id == turnID }
        draft = question
      }
    }
  }

  private func allCookies() async -> [HTTPCookie] {
    await withCheckedContinuation { continuation in
      webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { cookies in
        continuation.resume(returning: cookies)
      }
    }
  }

  private static func name(from profile: [String: Any]) -> String? {
    let identity = profile["identity"] as? [String: Any]
    let context = profile["context"] as? [String: Any]
    let character = context?["character"] as? [String: Any]
    return identity?["name"] as? String ?? identity?["displayName"] as? String
      ?? character?["name"] as? String ?? context?["displayName"] as? String
  }
}

struct NativeAskView: View {
  @ObservedObject var model: NativeAskModel
  let onLinkAccount: () -> Void
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationView {
      VStack(spacing: 0) {
        providerBar
        if provider == .appleOnDevice {
          Label("Private on-device answers. No question or conversation is sent to the server.", systemImage: "lock.shield")
            .font(.caption).foregroundStyle(.secondary).padding(.horizontal).padding(.vertical, 9)
        } else if model.connecting {
          ProgressView("Checking linked game account...").frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal).padding(.bottom, 8)
        } else if model.signedIn {
          Label("Signed in as \(model.accountName)", systemImage: "checkmark.circle.fill")
            .font(.caption).foregroundStyle(.green).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal).padding(.bottom, 8)
        } else {
          signInBanner
        }
        ScrollViewReader { proxy in
          ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
              if model.turns.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                  Label("Lakeside Ask", systemImage: "bubble.left.and.text.bubble.right.fill").font(.title2.bold())
                  Text("Ask about A House Divided. Ask server uses live game evidence and sources. Apple Foundation Models answers privately on this device without live game data.")
                    .font(.callout).foregroundStyle(.secondary)
                }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 24)
              }
              ForEach(model.turns) { turn in
                VStack(alignment: .leading, spacing: 9) {
                  Text(turn.question).font(.headline).padding(12).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.blue.opacity(0.1), in: RoundedRectangle(cornerRadius: 14))
                  HStack {
                    Label(turn.local ? "Apple Foundation Models" : "ASK", systemImage: turn.local ? "iphone" : "bubble.left")
                    Spacer()
                    if !turn.model.isEmpty { Text(turn.model).font(.caption2).foregroundStyle(.secondary) }
                  }.font(.caption.bold()).foregroundStyle(.secondary)
                  if turn.answer.isEmpty && model.sending { ProgressView("Thinking...").font(.callout) }
                  else { Text(turn.answer).font(.body).textSelection(.enabled) }
                  if turn.local { Text("On device. This answer was not sent to the server.").font(.caption).foregroundStyle(.secondary) }
                  if !turn.citations.isEmpty { Text("Sources: " + turn.citations.joined(separator: ", ")).font(.caption).foregroundStyle(.secondary) }
                }.id(turn.id)
              }
              Color.clear.frame(height: 1).id("native-ask-bottom")
            }.padding()
          }
          .onChange(of: model.turns.count) { _ in withAnimation { proxy.scrollTo("native-ask-bottom", anchor: .bottom) } }
        }
        composer
      }
      .navigationTitle("Ask")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button("Done") { dismiss() } } }
    }
    .navigationViewStyle(.stack)
    .onAppear { model.start() }
  }

  private var provider: NativeAskProvider { model.provider }

  private var providerBar: some View {
    VStack(alignment: .leading, spacing: 7) {
      Picker("Provider", selection: $model.provider) {
        Text(NativeAskProvider.server.title).tag(NativeAskProvider.server)
        Text(NativeAskProvider.appleOnDevice.title).tag(NativeAskProvider.appleOnDevice)
      }.pickerStyle(.segmented)
      if model.provider == .appleOnDevice {
        Text(model.appleAvailable ? "Available on this device" : model.appleMessage).font(.caption).foregroundStyle(model.appleAvailable ? .green : .secondary)
      }
    }.padding(.horizontal).padding(.top, 10).padding(.bottom, 8)
  }

  private var signInBanner: some View {
    VStack(alignment: .leading, spacing: 8) {
      Label("Ask server needs your linked game account.", systemImage: "person.crop.circle.badge.exclamationmark").font(.callout.bold())
      if let error = model.error { Text(error).font(.caption).foregroundStyle(.secondary) }
      Button("Link game account", action: onLinkAccount).buttonStyle(.borderedProminent)
    }.frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal).padding(.bottom, 8)
  }

  private var composer: some View {
    HStack(alignment: .bottom, spacing: 10) {
      TextField("Ask a question...", text: $model.draft)
        .textFieldStyle(.roundedBorder)
        .disabled(model.sending)
      Button { model.send() } label: { Image(systemName: "arrow.up.circle.fill").font(.title2) }
        .disabled(model.sending || model.draft.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count < 5 || (provider == .server && !model.signedIn))
        .accessibilityLabel("Send question")
    }.padding(.horizontal).padding(.vertical, 10).background(.thinMaterial)
  }
}

final class NativeAskController: NSObject {
  static let shared = NativeAskController()
  private weak var webView: WKWebView?
  private weak var presented: UIViewController?

  func attach(_ webView: WKWebView) { self.webView = webView }

  func present() {
    DispatchQueue.main.async { [weak self] in
      guard let self, let webView = self.webView, let root = webView.window?.rootViewController else { return }
      let presenter = Self.topController(root)
      if self.presented != nil { return }
      let model = NativeAskModel(webView: webView)
      let host = UIHostingController(rootView: NativeAskView(model: model) { [weak self] in self?.linkAccount() })
      host.view.backgroundColor = .systemBackground
      host.modalPresentationStyle = .pageSheet
      if #available(iOS 16.0, *), let sheet = host.sheetPresentationController {
        sheet.detents = [.medium(), .large()]
        sheet.prefersGrabberVisible = true
        sheet.preferredCornerRadius = 22
      }
      self.presented = host
      presenter.present(host, animated: true)
    }
  }

  private func linkAccount() {
    let webView = self.webView
    presented?.dismiss(animated: true) {
      guard let webView else { return }
      webView.load(URLRequest(url: URL(string: "https://ahousedividedgame.com/client/link")!))
    }
  }

  private static func topController(_ root: UIViewController) -> UIViewController {
    if let presented = root.presentedViewController { return topController(presented) }
    if let navigation = root as? UINavigationController, let visible = navigation.visibleViewController { return topController(visible) }
    if let tab = root as? UITabBarController, let selected = tab.selectedViewController { return topController(selected) }
    return root
  }
}
