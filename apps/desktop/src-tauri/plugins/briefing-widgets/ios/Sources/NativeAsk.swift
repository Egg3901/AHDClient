import Foundation
import SwiftUI
import UIKit
import WebKit

private let nativeAskOrigin = URL(string: "https://ask.lakesidegames.net")!
private let nativeAskLogin = URL(string: "https://ask.lakesidegames.net/auth/login?next=%2F")!
private let nativeAhdLogin = URL(string: "https://auth.ahousedividedgame.com/auth/ahd?return=https%3A%2F%2Fask.lakesidegames.net%2Fauth%2Fnative%2Fcallback")!
private let nativeSandboxHost = "sandbox.ahousedividedgame.com"

enum NativeAskProvider: String, Hashable {
  case server
  case appleOnDevice

  var title: String {
    switch self {
    case .server: return "Online, with live game data"
    case .appleOnDevice: return "On this device"
    }
  }
}

/// An outside company that may receive an Ask server question, from /api/me.
struct NativeAskRecipient: Hashable {
  let name: String
  let detail: String
}

/// App Store guideline 5.1.2(i): name the outside AI services and get the
/// player's permission before an Ask server question reaches them. Permission
/// is tied to the exact list, so a provider added on the server asks again.
/// Same key and signature as the webview Ask panel (consent.ts).
enum NativeAskConsent {
  static let key = "ahdclient.ask.aiConsent"
  static let privacyURL = URL(string: "https://ask.lakesidegames.net/privacy")!

  /// Used only when the Ask server predates the aiProviders field.
  static let fallback: [NativeAskRecipient] = [
    NativeAskRecipient(name: "Meta", detail: "Muse Spark models. On Meta's contributor tier, Meta may use the question and answer to train its models"),
    NativeAskRecipient(name: "Ollama", detail: "Ollama Cloud hosted models"),
    NativeAskRecipient(name: "DeepSeek", detail: "DeepSeek models, operated from China"),
    NativeAskRecipient(name: "Command Code", detail: "MiniMax models"),
    NativeAskRecipient(name: "OpenRouter", detail: "relays to the vendor of the chosen model"),
    NativeAskRecipient(name: "Google", detail: "Gemini models"),
  ]

  static func recipients(from profile: [String: Any]) -> [NativeAskRecipient] {
    let list = (profile["aiProviders"] as? [[String: Any]] ?? []).compactMap { item -> NativeAskRecipient? in
      guard let name = item["name"] as? String, !name.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
      return NativeAskRecipient(name: name, detail: item["detail"] as? String ?? "")
    }
    return list.isEmpty ? fallback : list
  }

  static func signature(_ recipients: [NativeAskRecipient]) -> String {
    recipients.map { "\($0.name)|\($0.detail)" }.sorted().joined(separator: "\n")
  }

  static func granted(_ recipients: [NativeAskRecipient]) -> Bool {
    UserDefaults.standard.string(forKey: key) == signature(recipients)
  }

  static func grant(_ recipients: [NativeAskRecipient]) {
    UserDefaults.standard.set(signature(recipients), forKey: key)
  }

  static func withdraw() {
    UserDefaults.standard.removeObject(forKey: key)
  }
}

struct NativeAskTurn: Identifiable {
  let id: String
  var question: String
  var answer: String
  var model: String = ""
  var citations: [String] = []
  var usedMcp = false
  var liveSources: [String] = []
  var local = false
}

struct NativeAskResult {
  let answer: String
  let conversationID: String
  let model: String
  let citations: [String]
  let usedMcp: Bool
  let liveSources: [String]
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

enum NativeAskTimeoutError: LocalizedError {
  case timedOut(String)

  var errorDescription: String? {
    switch self {
    case .timedOut(let operation): return "Ask (\(operation)) timed out. Check your connection and try again."
    }
  }
}

func withNativeAskTimeout<T>(seconds: UInt64, operation: @escaping @Sendable () async throws -> T) async throws -> T {
  try await withThrowingTaskGroup(of: T.self) { group in
    group.addTask { try await operation() }
    group.addTask {
      try await Task.sleep(nanoseconds: seconds * 1_000_000_000)
      throw NativeAskTimeoutError.timedOut("request")
    }
    defer { group.cancelAll() }
    guard let result = try await group.next() else { throw CancellationError() }
    return result
  }
}

private final class NativeAskRedirectDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  private let allowedHosts: Set<String> = [
    "ask.lakesidegames.net",
    "auth.ahousedividedgame.com",
    "auth.lakesidegames.net",
    "ahousedividedgame.com",
    "www.ahousedividedgame.com",
    "sandbox.ahousedividedgame.com",
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

final class NativeAskAPI: @unchecked Sendable {
  private let storage: HTTPCookieStorage
  private let transport: URLSession
  private let unifiedSessionCookie: String?
  private let gameAuthCookieHeader: String?

  init(gameCookies: [HTTPCookie]) {
    // Use the backed, private store supplied by the ephemeral session.
    // HTTPCookieStorage() accepts setCookie calls but retains nothing on Apple.
    let configuration = URLSessionConfiguration.ephemeral
    let storage = configuration.httpCookieStorage!
    self.storage = storage
    self.unifiedSessionCookie = gameCookies.first { cookie in
      let domain = cookie.domain.trimmingCharacters(in: CharacterSet(charactersIn: ".")).lowercased()
      return cookie.name == "__Host-lakeside_session"
        && (domain == "auth.lakesidegames.net" || domain == "lakesidegames.net")
        && !cookie.value.isEmpty
    }?.value
    self.gameAuthCookieHeader = Self.cookieHeader(from: gameCookies.filter { cookie in
      let domain = cookie.domain.trimmingCharacters(in: CharacterSet(charactersIn: ".")).lowercased()
      let gameDomain = domain == "ahousedividedgame.com" || domain == "www.ahousedividedgame.com" || domain == nativeSandboxHost
      return gameDomain && Self.isGameAuthCookie(cookie) && !cookie.value.isEmpty
    })
    configuration.httpShouldSetCookies = true
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.timeoutIntervalForRequest = 30
    // A live-data answer can stream for several minutes. The service sends a
    // keepalive every 5s, so the per-request idle timeout still catches a dead
    // connection; the resource cap only bounds a runaway stream.
    configuration.timeoutIntervalForResource = 600
    configuration.urlCache = nil
    transport = URLSession(configuration: configuration, delegate: NativeAskRedirectDelegate(), delegateQueue: nil)
    for cookie in gameCookies where Self.isRelevant(cookie) {
      storage.setCookie(cookie)
      if Self.isGameAuthCookie(cookie), let brokerCookie = Self.brokerCookie(from: cookie) {
        storage.setCookie(brokerCookie)
      }
    }
  }

  private static func isRelevant(_ cookie: HTTPCookie) -> Bool {
    let domain = cookie.domain.trimmingCharacters(in: CharacterSet(charactersIn: ".")).lowercased()
    let gameDomain = domain == "ahousedividedgame.com" || domain == "www.ahousedividedgame.com" || domain == nativeSandboxHost
    let authDomain = domain == "auth.ahousedividedgame.com"
    let unifiedAuthDomain = domain == "auth.lakesidegames.net"
    let askDomain = domain == "ask.lakesidegames.net"
    // The issuer's SSO cookies are distinct from each app's opaque session.
    // Keep their original domain and realm path so Ask's OIDC redirects can
    // reuse the game login without sending issuer credentials to Ask itself.
    let issuerSSO = unifiedAuthDomain && (cookie.name == "KEYCLOAK_IDENTITY" || cookie.name == "KEYCLOAK_SESSION")
    let session = Self.isAskCookieName(cookie.name) || Self.isGameAuthCookie(cookie)
    return ((gameDomain || authDomain || unifiedAuthDomain || askDomain) && session || issuerSSO) && !cookie.value.isEmpty
  }

  private static func isAskCookieName(_ name: String) -> Bool {
    name == "ask_session" || name == "__Host-ask_session" || name == "__Host-ask_login"
      || name == "__Host-lakeside_login" || name == "__Host-lakeside_session"
  }

  private static func isAskSessionCookie(_ name: String) -> Bool {
    name == "ask_session" || name == "__Host-ask_session" || name == "__Host-lakeside_session"
  }

  private static func isGameAuthCookie(_ cookie: HTTPCookie) -> Bool {
    cookie.name == "auth-token" || cookie.name.range(of: "^auth-token-[A-Za-z0-9-]+$", options: .regularExpression) != nil
      || cookie.name.range(of: "^(?:__Secure-)?(?:authjs|next-auth)\\.session-token(?:\\.[0-9]+)?$", options: .regularExpression) != nil
  }

  private static func cookieHeader(from cookies: [HTTPCookie]) -> String? {
    var values = [String: String]()
    for cookie in cookies {
      values[cookie.name] = "\(cookie.name)=\(cookie.value)"
    }
    let header = values.keys.sorted().compactMap { values[$0] }.joined(separator: "; ")
    return header.isEmpty ? nil : header
  }

  private static func brokerCookie(from cookie: HTTPCookie) -> HTTPCookie? {
    guard isGameAuthCookie(cookie) else { return nil }
    var properties = cookie.properties ?? [:]
    properties[.domain] = "auth.ahousedividedgame.com"
    properties[.path] = "/"
    properties[.secure] = "TRUE"
    return HTTPCookie(properties: properties)
  }

  private var askCookie: HTTPCookie? {
    storage.cookies(for: nativeAskOrigin)?.first { Self.isAskSessionCookie($0.name) }
  }

  private var hasAskAuthentication: Bool {
    askCookie != nil || unifiedSessionCookie != nil
  }

  private func askCookieHeader() -> String? {
    var values = storage.cookies(for: nativeAskOrigin)?.map { "\($0.name)=\($0.value)" } ?? []
    if let unifiedSessionCookie,
       !values.contains(where: { $0.hasPrefix("__Host-lakeside_session=") }) {
      // The unified session is host-only on auth.lakesidegames.net. Forward it
      // explicitly only to Ask; never attach it to the legacy game broker.
      values.append("__Host-lakeside_session=\(unifiedSessionCookie)")
    }
    return values.isEmpty ? nil : values.joined(separator: "; ")
  }

  private func clearAskCookies() {
    for cookie in storage.cookies(for: nativeAskOrigin) ?? [] where Self.isAskCookieName(cookie.name) {
      storage.deleteCookie(cookie)
    }
  }

  private func request(_ path: String, body: [String: Any]? = nil) throws -> URLRequest {
    guard path.hasPrefix("/") else { throw NativeAskError.server("Invalid Ask request.") }
    var request = URLRequest(url: nativeAskOrigin.appendingPathComponent(String(path.dropFirst())))
    request.timeoutInterval = path == "/api/ask" ? 60 : 30
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(nativeAskOrigin.absoluteString, forHTTPHeaderField: "Origin")
    request.setValue(nativeAskOrigin.absoluteString + "/", forHTTPHeaderField: "Referer")
    if let cookieHeader = askCookieHeader() {
      request.setValue(cookieHeader, forHTTPHeaderField: "Cookie")
    }
    if let body {
      request.httpMethod = "POST"
      request.httpBody = try JSONSerialization.data(withJSONObject: body)
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }
    return request
  }

  private func establishSession(at loginURL: URL) async throws {
    var request = URLRequest(url: loginURL)
    request.timeoutInterval = 30
    if loginURL.host == "auth.ahousedividedgame.com", let gameAuthCookieHeader {
      // The desktop link compatibility cookie is scoped to the game's
      // account endpoint, so URLSession will not send it to the broker even
      // after cloning it into the ephemeral cookie jar. Send the already
      // filtered game session explicitly on this trusted first-party hop.
      request.setValue(gameAuthCookieHeader, forHTTPHeaderField: "Cookie")
    }
    let (_, response) = try await transport.data(for: request)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode), hasAskAuthentication else {
      throw NativeAskError.loginFailed
    }
  }

  private func ensureSession(force: Bool = false, preferGameHandoff: Bool = true) async throws {
    if !force, hasAskAuthentication { return }
    do {
      if preferGameHandoff {
        do {
          try await establishSession(at: nativeAhdLogin)
          return
        } catch {
          // Legacy linked game accounts use the AHD broker. Migrated accounts
          // may already have a unified Lakeside auth session, so fall through
          // to Ask's normal login when the broker cannot complete silently.
        }
      }
      try await establishSession(at: nativeAskLogin)
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
      try await ensureSession(force: true, preferGameHandoff: false)
      return try await json(try request("/api/me"))
    }
  }

  func ask(question: String, conversationID: String, length: String, style: String, mode: String,
           onDelta: @escaping (String) -> Void = { _ in }, onStatus: @escaping (String) -> Void = { _ in },
           onRequestID: @escaping (String) -> Void = { _ in }) async throws -> NativeAskResult {
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
    guard let http = response as? HTTPURLResponse else {
      throw NativeAskError.server("Ask returned an invalid response.")
    }
    guard http.statusCode == 200 else {
      if http.statusCode == 401 { throw NativeAskError.signedOut }
      throw NativeAskError.server("Ask could not start the answer.")
    }
    if http.mimeType != "text/event-stream" {
      var data = Data()
      for try await byte in bytes { data.append(byte) }
      guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
        throw NativeAskError.server("Ask returned invalid data.")
      }
      return try result(from: object, fallbackConversationID: conversationID)
    }

    var answer = ""
    var model = ""
    var returnedConversationID = conversationID
    var citations: [String] = []
    var usedMcp = false
    var liveSources: [String] = []
    try await readEvents(bytes) { name, value in
      let object = value as? [String: Any]
      switch name {
      case "meta":
        returnedConversationID = object?["convId"] as? String ?? returnedConversationID
        if let reqID = object?["reqId"] as? String, !reqID.isEmpty { onRequestID(reqID) }
      case "status", "action":
        if let label = object?["label"] as? String, !label.isEmpty { onStatus(label) }
      case "delta":
        let delta = value as? String ?? (object?["delta"] as? String ?? "")
        answer += delta
        if !delta.isEmpty { onDelta(delta) }
      case "done":
        if let object {
          returnedConversationID = object["convId"] as? String ?? returnedConversationID
          answer = object["answer"] as? String ?? answer
          model = Self.modelLabel(object) ?? model
          usedMcp = object["usedMcp"] as? Bool ?? false
          liveSources = object["liveSources"] as? [String] ?? []
          citations = (object["citations"] as? [[String: Any]] ?? []).compactMap { item in
            item["label"] as? String ?? item["path"] as? String
          }
        }
        return true
      case "error":
        // The service names the field `error`; older builds used `message`.
        throw NativeAskError.server(object?["error"] as? String ?? object?["message"] as? String ?? value as? String ?? "Ask could not complete the answer.")
      default:
        break
      }
      return false
    }
    guard !answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw NativeAskError.emptyAnswer }
    return NativeAskResult(answer: answer, conversationID: returnedConversationID, model: model, citations: citations, usedMcp: usedMcp, liveSources: liveSources)
  }

  /// "Model · Service" so every answer names who wrote it.
  private static func modelLabel(_ object: [String: Any]) -> String? {
    guard let model = object["modelName"] as? String ?? object["modelId"] as? String ?? object["model"] as? String else { return nil }
    if let provider = object["providerName"] as? String, !provider.isEmpty, provider != model { return "\(model) · \(provider)" }
    return model
  }

  private func result(from object: [String: Any], fallbackConversationID: String) throws -> NativeAskResult {
    let answer = object["answer"] as? String ?? ""
    guard !answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw NativeAskError.emptyAnswer }
    return NativeAskResult(
      answer: answer,
      conversationID: object["convId"] as? String ?? fallbackConversationID,
      model: Self.modelLabel(object) ?? "",
      citations: (object["citations"] as? [[String: Any]] ?? []).compactMap { item in
        item["label"] as? String ?? item["path"] as? String
      },
      usedMcp: object["usedMcp"] as? Bool ?? false,
      liveSources: object["liveSources"] as? [String] ?? [],
    )
  }

  func context(question: String) async throws -> (text: String, files: [String]) {
    try await ensureSession()
    let payload = try await withNativeAskTimeout(seconds: 30) { [self] in
      try await self.json(try self.request("/api/ask/context", body: ["question": question, "game": "ahd"]))
    }
    return (payload["context"] as? String ?? "", payload["files"] as? [String] ?? [])
  }

  /// Server-Sent Events framing. The handler returns true on a terminal
  /// event so the stream is released at `done` instead of waiting for EOF.
  private func readEvents(_ bytes: URLSession.AsyncBytes, handler: (String, Any) throws -> Bool) async throws {
    var lineBytes: [UInt8] = []
    var event = "message"
    var dataLines: [String] = []
    func emit() throws -> Bool {
      defer { dataLines.removeAll(); event = "message" }
      guard !dataLines.isEmpty else { return false }
      let payload = dataLines.joined(separator: "\n")
      guard let data = payload.data(using: .utf8),
            let value = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) else {
        throw NativeAskError.server("Ask sent an invalid event.")
      }
      return try handler(event, value)
    }
    for try await byte in bytes {
      try Task.checkCancellation()
      if byte == 10 {
        let line = String(bytes: lineBytes, encoding: .utf8) ?? ""
        lineBytes.removeAll(keepingCapacity: true)
        if line.isEmpty {
          if try emit() { return }
        } else if line.hasPrefix(":") {
          continue
        } else if line.hasPrefix("event:") {
          event = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
        } else if line.hasPrefix("data:") {
          var chunk = String(line.dropFirst(5))
          if chunk.hasPrefix(" ") { chunk.removeFirst() }
          dataLines.append(chunk)
        }
      } else if byte != 13 {
        lineBytes.append(byte)
      }
    }
    if try emit() { return }
    throw NativeAskError.server("The answer stream ended before completion. Check your history in a moment, or try again.")
  }

  /// Abort a server generation. Records nothing and costs no quota.
  func stop(requestID: String) async {
    guard let request = try? self.request("/api/ask/stop", body: ["reqId": requestID]) else { return }
    _ = try? await transport.data(for: request)
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
  @Published var status = ""
  @Published var error: String?
  @Published var appleAvailable = false
  @Published var appleMessage = "Checking Apple Foundation Models..."
  @Published var recipients: [NativeAskRecipient] = []
  @Published var consented = false
  @Published var reviewingConsent = false

  private let webView: WKWebView
  private var api: NativeAskAPI?
  private var conversationID = ""
  private var connectTask: Task<Void, Never>?
  private var sendTask: Task<Void, Never>?
  private var requestID: String?
  /// The turn whose answer is streaming; late deltas for any other turn drop.
  private var streamingTurnID: String?

  init(webView: WKWebView) {
    self.webView = webView
    refreshAppleStatus()
  }

  deinit {
    connectTask?.cancel()
    sendTask?.cancel()
  }

  func start() {
    refreshAppleStatus()
    // onAppear can fire again when the sheet is re-presented; one connect is enough.
    guard connectTask == nil else { return }
    connectTask = Task { [weak self] in await self?.connect() }
  }

  /// Stop the answer in flight. A server generation is aborted too, so a
  /// stopped question records nothing and costs no quota.
  func stop() {
    guard sending else { return }
    if let requestID, let api {
      Task { await api.stop(requestID: requestID) }
    }
    sendTask?.cancel()
  }

  func grantConsent() {
    NativeAskConsent.grant(recipients)
    consented = true
    reviewingConsent = false
  }

  func withdrawConsent() {
    NativeAskConsent.withdraw()
    consented = false
    reviewingConsent = false
  }

  /// The server path is waiting on the player's permission.
  var needsConsent: Bool {
    provider == .server && signedIn && (!consented || reviewingConsent)
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
      recipients = NativeAskConsent.recipients(from: profile)
      consented = NativeAskConsent.granted(recipients)
      signedIn = true
      accountName = Self.name(from: profile) ?? "linked game account"
      error = nil
    } catch let failure {
      api = client
      signedIn = false
      error = failure.localizedDescription
    }
  }

  func send() {
    let question = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sending, question.utf16.count >= 5, question.utf16.count <= 500 else { return }
    // Nothing reaches an outside AI service before the player allows it.
    if provider == .server && !consented { return }
    let turnID = UUID().uuidString
    draft = ""
    error = nil
    status = provider == .appleOnDevice ? "Generating on device..." : "Thinking..."
    turns.append(NativeAskTurn(id: turnID, question: question, answer: ""))
    sending = true
    requestID = nil
    streamingTurnID = turnID
    let selectedProvider = provider
    let history = turns.dropLast().suffix(8).map { "User: \($0.question)\nAssistant: \(String($0.answer.prefix(1200)))" }
    let oldConversationID = conversationID
    sendTask = Task { [weak self] in
      guard let self else { return }
      defer {
        sending = false
        requestID = nil
        streamingTurnID = nil
      }
      do {
        let result: NativeAskResult
        if selectedProvider == .appleOnDevice {
          guard appleAvailable else { throw FoundationModelBridgeError.unavailable(appleMessage) }
          let evidence: (text: String, files: [String])
          if signedIn, let api {
            do {
              evidence = try await api.context(question: question)
            } catch {
              // AFM is still useful when live retrieval is unavailable. Keep
              // the local answer path alive and make the degraded state clear.
              evidence = (text: "", files: [])
              status = "Live game evidence unavailable. Answering on device."
            }
          } else {
            // Account linking enables retrieved evidence; it must not prevent
            // a private on-device answer from being generated.
            evidence = (text: "", files: [])
          }
          let options = FoundationModelOptions(question: question, history: history, length: "standard", style: "standard", mode: "ask", gameContext: evidence.text)
          let payload = try await AppleFoundationModelBridge.respond(options)
          result = NativeAskResult(
            answer: payload["text"] as? String ?? "",
            conversationID: "",
            model: payload["model"] as? String ?? "Apple Foundation Models",
            citations: evidence.files,
            usedMcp: false,
            liveSources: [],
          )
        } else {
          guard let api else { throw NativeAskError.signedOut }
          guard signedIn else { throw NativeAskError.signedOut }
          result = try await api.ask(
            question: question,
            conversationID: oldConversationID,
            length: "standard",
            style: "standard",
            mode: "auto",
            onDelta: { [weak self] delta in
              Task { @MainActor in self?.appendDelta(delta, to: turnID) }
            },
            onStatus: { [weak self] label in
              Task { @MainActor in self?.status = label }
            },
            onRequestID: { [weak self] reqID in
              Task { @MainActor in self?.requestID = reqID }
            },
          )
        }
        guard let index = turns.firstIndex(where: { $0.id == turnID }) else { return }
        turns[index].answer = result.answer
        turns[index].model = result.model
        turns[index].citations = result.citations
        turns[index].usedMcp = result.usedMcp
        turns[index].liveSources = result.liveSources
        turns[index].local = selectedProvider == .appleOnDevice
        if !result.conversationID.isEmpty { conversationID = result.conversationID }
      } catch _ where Task.isCancelled {
        // Stopped by the player. Keep any text that already streamed.
        if let index = turns.firstIndex(where: { $0.id == turnID }), !turns[index].answer.isEmpty {
          turns[index].answer += "\n\n(Stopped)"
        } else {
          turns.removeAll { $0.id == turnID }
          draft = question
        }
      } catch is CancellationError {
        self.error = "Apple Foundation Models cancelled the answer. Try again or choose Ask server."
        turns.removeAll { $0.id == turnID }
        draft = question
      } catch {
        self.error = error.localizedDescription
        turns.removeAll { $0.id == turnID }
        draft = question
      }
      status = ""
    }
  }

  private func appendDelta(_ delta: String, to turnID: String) {
    guard streamingTurnID == turnID, let index = turns.firstIndex(where: { $0.id == turnID }) else { return }
    turns[index].answer += delta
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

/// The Ask sheet's palette: the launcher's dark surfaces and its red accent,
/// the same on iPhone and Android.
private enum AskStyle {
  static let background = Color(red: 20 / 255, green: 20 / 255, blue: 28 / 255)
  static let surface = Color(red: 30 / 255, green: 30 / 255, blue: 42 / 255)
  static let raised = Color(red: 38 / 255, green: 38 / 255, blue: 52 / 255)
  static let border = Color(red: 48 / 255, green: 48 / 255, blue: 64 / 255)
  static let text = Color(red: 236 / 255, green: 236 / 255, blue: 241 / 255)
  static let muted = Color(red: 154 / 255, green: 154 / 255, blue: 171 / 255)
  static let faint = Color(red: 112 / 255, green: 112 / 255, blue: 128 / 255)
  static let accent = Color(red: 200 / 255, green: 32 / 255, blue: 47 / 255)
  static let warning = Color(red: 240 / 255, green: 180 / 255, blue: 120 / 255)
}

/// "iPad" or "iPhone", for copy about where an on-device answer is written.
@MainActor private var nativeAskDeviceName: String {
  UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone"
}

/// Readable line length when the sheet is wide (iPad page sheets, landscape).
private let nativeAskMaxContentWidth: CGFloat = 680

/// Starter questions for an empty chat. Tapping one fills the box.
private let nativeAskStarters = [
  "What did I miss while I was away?",
  "How do actions and action points work?",
  "What happens during a game turn, and in what order?",
]

private struct AskPrimaryButton: View {
  let title: String
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      Text(title).font(.body.weight(.semibold)).foregroundColor(.white)
        .frame(maxWidth: .infinity, minHeight: 48)
        .background(AskStyle.accent, in: RoundedRectangle(cornerRadius: 12))
    }.buttonStyle(.plain)
  }
}

private struct AskSecondaryButton: View {
  let title: String
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      Text(title).font(.body).foregroundColor(AskStyle.text)
        .frame(maxWidth: .infinity, minHeight: 48)
        .background(AskStyle.surface, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(AskStyle.border, lineWidth: 1))
    }.buttonStyle(.plain)
  }
}

struct NativeAskView: View {
  @ObservedObject var model: NativeAskModel
  let onLinkAccount: () -> Void
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    VStack(spacing: 0) {
      header
      if model.provider == .server && !model.connecting && !model.signedIn {
        linkCard.padding(.top, 14)
        Spacer(minLength: 0)
      } else if model.needsConsent {
        consentPanel.padding(.top, 12)
      } else {
        conversation
        if model.sending && !model.status.isEmpty {
          Text(model.status).font(.caption).foregroundColor(AskStyle.muted)
            .frame(maxWidth: .infinity, alignment: .leading).padding(.bottom, 6)
        }
        composer
      }
    }
    .padding(.horizontal, 18)
    .padding(.top, 18)
    .padding(.bottom, 10)
    .frame(maxWidth: nativeAskMaxContentWidth)
    .frame(maxWidth: .infinity)
    .background(AskStyle.background.ignoresSafeArea())
    .preferredColorScheme(.dark)
    .onAppear { model.start() }
    .onDisappear { model.stop() }
  }

  private var provider: NativeAskProvider { model.provider }

  private var accountLine: String {
    if provider == .appleOnDevice {
      return model.appleAvailable ? "Answers written on this \(nativeAskDeviceName)" : model.appleMessage
    }
    if model.connecting { return "Checking your game account..." }
    if model.signedIn { return "Signed in as \(model.accountName)" }
    return "Not linked yet"
  }

  private var header: some View {
    HStack(alignment: .center, spacing: 8) {
      VStack(alignment: .leading, spacing: 2) {
        Text("Ask").font(.title2.bold()).foregroundColor(AskStyle.text)
        Text(accountLine).font(.footnote).foregroundColor(AskStyle.muted).lineLimit(2)
      }
      Spacer(minLength: 8)
      Menu {
        Picker("Answers from", selection: $model.provider) {
          Text("Online, with live game data").tag(NativeAskProvider.server)
          Text("On this \(nativeAskDeviceName)").tag(NativeAskProvider.appleOnDevice)
        }
        if model.signedIn && model.consented {
          Button("AI providers") { model.reviewingConsent = true }
        }
      } label: {
        Image(systemName: "ellipsis").font(.body.weight(.semibold)).foregroundColor(AskStyle.text)
          .frame(width: 40, height: 40).background(AskStyle.surface, in: Circle())
      }.accessibilityLabel("Ask options")
      Button { dismiss() } label: {
        Image(systemName: "xmark").font(.body.weight(.semibold)).foregroundColor(AskStyle.text)
          .frame(width: 40, height: 40).background(AskStyle.surface, in: Circle())
      }.buttonStyle(.plain).accessibilityLabel("Close Ask")
    }
  }

  private var linkCard: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text("Link your game account").font(.headline).foregroundColor(AskStyle.text)
      Text("Ask answers from your own game: your character, party, offices and companies. Link the account you play with to start.")
        .font(.subheadline).foregroundColor(AskStyle.muted).padding(.top, 6).padding(.bottom, 14)
        .fixedSize(horizontal: false, vertical: true)
      AskPrimaryButton(title: "Link game account", action: onLinkAccount)
      if let error = model.error, !error.contains("linked game account") {
        Text(error).font(.caption).foregroundColor(AskStyle.warning).padding(.top, 10)
      }
    }
    .padding(16)
    .background(AskStyle.surface, in: RoundedRectangle(cornerRadius: 14))
    .overlay(RoundedRectangle(cornerRadius: 14).stroke(AskStyle.border, lineWidth: 1))
  }

  private var conversation: some View {
    ScrollViewReader { proxy in
      ScrollView(showsIndicators: false) {
        LazyVStack(alignment: .leading, spacing: 0) {
          if model.turns.isEmpty { emptyState }
          ForEach(model.turns) { turn in turnView(turn).id(turn.id) }
          Color.clear.frame(height: 1).id("native-ask-bottom")
        }.padding(.vertical, 8)
      }
      .onChange(of: model.turns.count) { _ in withAnimation { proxy.scrollTo("native-ask-bottom", anchor: .bottom) } }
      .onChange(of: model.turns.last?.answer.count ?? 0) { _ in proxy.scrollTo("native-ask-bottom", anchor: .bottom) }
    }
  }

  private var emptyState: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Ask anything about A House Divided").font(.headline).foregroundColor(AskStyle.text)
      Text(provider == .server
        ? "Rules, your character, elections, markets. Answers can use live game data."
        : "Answers are written on this \(nativeAskDeviceName) from the game's guides. They do not see live game data.")
        .font(.subheadline).foregroundColor(AskStyle.muted).padding(.bottom, 6)
        .fixedSize(horizontal: false, vertical: true)
      ForEach(nativeAskStarters, id: \.self) { starter in
        Button { model.draft = starter } label: {
          Text(starter).font(.subheadline).foregroundColor(AskStyle.text).multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 14).padding(.vertical, 12)
            .background(AskStyle.surface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(AskStyle.border, lineWidth: 1))
        }.buttonStyle(.plain)
      }
    }.padding(.top, 12)
  }

  private func turnView(_ turn: NativeAskTurn) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Spacer(minLength: 40)
        Text(turn.question).font(.subheadline).foregroundColor(AskStyle.text)
          .padding(.horizontal, 14).padding(.vertical, 10)
          .background(AskStyle.raised, in: RoundedRectangle(cornerRadius: 14))
      }
      if turn.answer.isEmpty && model.sending {
        Text("Thinking...").font(.body).foregroundColor(AskStyle.muted)
      } else {
        Text(turn.answer).font(.body).foregroundColor(AskStyle.text).textSelection(.enabled)
          .fixedSize(horizontal: false, vertical: true)
      }
      let footer = footerText(turn)
      if !footer.isEmpty {
        Text(footer).font(.caption).foregroundColor(AskStyle.faint).fixedSize(horizontal: false, vertical: true)
      }
    }.padding(.top, 14)
  }

  /// Who wrote the answer, the live data it used and its sources, quietly under it.
  private func footerText(_ turn: NativeAskTurn) -> String {
    var lines: [String] = []
    if turn.local {
      lines.append(turn.citations.isEmpty ? "Written on this \(nativeAskDeviceName)" : "Written on this \(nativeAskDeviceName) from the game's guides")
    } else if !turn.model.isEmpty {
      lines.append(turn.model)
    }
    if turn.usedMcp {
      lines.append(turn.liveSources.isEmpty ? "Used live game data" : "Used live game data: " + turn.liveSources.joined(separator: ", "))
    }
    if !turn.citations.isEmpty { lines.append("Sources: " + turn.citations.joined(separator: ", ")) }
    return lines.joined(separator: "\n")
  }

  private var consentPanel: some View {
    ScrollView(showsIndicators: false) {
      VStack(alignment: .leading, spacing: 12) {
        Text("Ask uses outside AI services").font(.title3.bold()).foregroundColor(AskStyle.text)
        Text("Ask answers with AI models run by other companies. When you send a question, it goes to one of the services below. They receive the text you type, earlier messages in the same chat, and, if you ask about your own character, your own game records. Your username, email and account IDs are not sent.")
          .font(.subheadline).foregroundColor(AskStyle.muted).fixedSize(horizontal: false, vertical: true)
        VStack(alignment: .leading, spacing: 10) {
          ForEach(model.recipients, id: \.self) { recipient in
            VStack(alignment: .leading, spacing: 2) {
              Text(recipient.name).font(.subheadline.bold()).foregroundColor(AskStyle.text)
              if !recipient.detail.isEmpty {
                Text(recipient.detail).font(.caption).foregroundColor(AskStyle.muted).fixedSize(horizontal: false, vertical: true)
              }
            }
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(AskStyle.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(AskStyle.border, lineWidth: 1))
        Text("Each service has its own terms and data handling. Every answer names the model and service that wrote it. On-device answers stay on this \(nativeAskDeviceName).")
          .font(.caption).foregroundColor(AskStyle.faint).fixedSize(horizontal: false, vertical: true)
        Link("Ask privacy notice", destination: NativeAskConsent.privacyURL).font(.footnote).foregroundColor(AskStyle.muted)
        if model.consented {
          AskPrimaryButton(title: "Keep using Ask") { model.reviewingConsent = false }
          AskSecondaryButton(title: "Withdraw permission") { model.withdrawConsent() }
        } else {
          AskPrimaryButton(title: "Allow and continue") { model.grantConsent() }
          Text("Ask sends nothing until you allow it.").font(.caption).foregroundColor(AskStyle.faint)
            .frame(maxWidth: .infinity, alignment: .center)
        }
      }.padding(.bottom, 8)
    }
  }

  private var canSend: Bool {
    let length = model.draft.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count
    return length >= 5 && length <= 500 && (provider == .appleOnDevice || (model.signedIn && model.consented))
  }

  private var composer: some View {
    HStack(alignment: .center, spacing: 6) {
      TextField("", text: $model.draft)
        .placeholder(when: model.draft.isEmpty) { Text("Ask about the game").foregroundColor(AskStyle.faint) }
        .foregroundColor(AskStyle.text)
        .disabled(model.sending)
        .submitLabel(.send)
        .onSubmit { if canSend { model.send() } }
        .padding(.horizontal, 10).padding(.vertical, 12)
      if model.sending {
        Button { model.stop() } label: {
          Text("Stop").font(.subheadline.weight(.semibold)).foregroundColor(AskStyle.text)
            .padding(.horizontal, 16).frame(height: 44)
            .background(AskStyle.raised, in: RoundedRectangle(cornerRadius: 12))
        }.buttonStyle(.plain).accessibilityLabel("Stop answer")
      } else {
        Button { model.send() } label: {
          Text("Send").font(.subheadline.weight(.semibold)).foregroundColor(canSend ? .white : AskStyle.faint)
            .padding(.horizontal, 16).frame(height: 44)
            .background(canSend ? AskStyle.accent : AskStyle.raised, in: RoundedRectangle(cornerRadius: 12))
        }.buttonStyle(.plain).disabled(!canSend).accessibilityLabel("Send question")
      }
    }
    .padding(6)
    .background(AskStyle.surface, in: RoundedRectangle(cornerRadius: 16))
    .overlay(RoundedRectangle(cornerRadius: 16).stroke(AskStyle.border, lineWidth: 1))
  }
}

private extension View {
  /// A placeholder in the sheet's own colours; TextField's built-in one is too faint on dark.
  func placeholder<Content: View>(when shown: Bool, @ViewBuilder _ content: () -> Content) -> some View {
    ZStack(alignment: .leading) {
      content().opacity(shown ? 1 : 0)
      self
    }
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
      host.view.backgroundColor = UIColor(red: 20 / 255, green: 20 / 255, blue: 28 / 255, alpha: 1)
      host.overrideUserInterfaceStyle = .dark
      host.modalPresentationStyle = .pageSheet
      // iPad shows a centred page sheet; the content caps its own line length.
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
