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
  var usedMcp = false
  var liveSources: [String] = []
  var liveToolCalled = false
  var local = false
}

struct NativeAskResult {
  let answer: String
  let conversationID: String
  let model: String
  let citations: [String]
  let usedMcp: Bool
  let liveSources: [String]
  let liveToolCalled: Bool
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
    configuration.timeoutIntervalForResource = 120
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
    request.timeoutInterval = path == "/api/ask" ? 120 : 30
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
           onDelta: @escaping (String) -> Void = { _ in }, onStatus: @escaping (String) -> Void = { _ in }) async throws -> NativeAskResult {
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
          model = object["modelName"] as? String ?? object["modelId"] as? String ?? object["model"] as? String ?? model
          usedMcp = object["usedMcp"] as? Bool ?? false
          liveSources = object["liveSources"] as? [String] ?? []
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
    return NativeAskResult(answer: answer, conversationID: returnedConversationID, model: model, citations: citations, usedMcp: usedMcp, liveSources: liveSources, liveToolCalled: false)
  }

  private func result(from object: [String: Any], fallbackConversationID: String) throws -> NativeAskResult {
    let answer = object["answer"] as? String ?? ""
    guard !answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw NativeAskError.emptyAnswer }
    return NativeAskResult(
      answer: answer,
      conversationID: object["convId"] as? String ?? fallbackConversationID,
      model: object["modelName"] as? String ?? object["modelId"] as? String ?? object["model"] as? String ?? "",
      citations: (object["citations"] as? [[String: Any]] ?? []).compactMap { item in
        item["label"] as? String ?? item["path"] as? String
      },
      usedMcp: object["usedMcp"] as? Bool ?? false,
      liveSources: object["liveSources"] as? [String] ?? [],
      liveToolCalled: false,
    )
  }

  func context(question: String) async throws -> (text: String, files: [String]) {
    try await ensureSession()
    let payload = try await withNativeAskTimeout(seconds: 30) { [self] in
      try await self.json(try self.request("/api/ask/context", body: ["question": question, "game": "ahd"]))
    }
    return (payload["context"] as? String ?? "", payload["files"] as? [String] ?? [])
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
  @Published var status = ""
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
    } catch let failure {
      api = client
      signedIn = false
      error = failure.localizedDescription
    }
  }

  func send() {
    let question = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sending, question.utf16.count >= 5, question.utf16.count <= 500 else { return }
    let turnID = UUID().uuidString
    draft = ""
    error = nil
    status = provider == .appleOnDevice ? "Generating on device..." : "Thinking..."
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
            // Account linking enables evidence and the optional live tool; it
            // must not prevent a private on-device answer from being generated.
            evidence = (text: "", files: [])
          }
          let options = FoundationModelOptions(question: question, history: history, length: "standard", style: "standard", mode: "ask", gameContext: evidence.text)
          #if canImport(FoundationModels)
          let liveTool: Any?
          if signedIn, let api {
            if #available(iOS 26.0, *) {
              liveTool = NativeAskLiveTool(api: api)
            } else {
              liveTool = nil
            }
          } else {
            liveTool = nil
          }
          let payload = try await AppleFoundationModelBridge.respond(options, liveTool: liveTool)
          #else
          let payload = try await AppleFoundationModelBridge.respond(options)
          #endif
          // The evidence endpoint provides documentation citations; the optional
          // live tool adds current state citations returned by Ask.
          result = NativeAskResult(
            answer: payload["text"] as? String ?? "",
            conversationID: "",
            model: payload["model"] as? String ?? "Apple Foundation Models",
            citations: evidence.files,
            usedMcp: payload["usedMcp"] as? Bool ?? false,
            liveSources: payload["liveSources"] as? [String] ?? [],
            liveToolCalled: payload["liveToolCalled"] as? Bool ?? false,
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
            onStatus: { [weak self] label in
              Task { @MainActor in self?.status = label }
            },
          )
        }
        guard let index = turns.firstIndex(where: { $0.id == turnID }) else { return }
        turns[index].answer = result.answer
        turns[index].model = result.model
        turns[index].citations = result.citations
        turns[index].usedMcp = result.usedMcp
        turns[index].liveSources = result.liveSources
        turns[index].liveToolCalled = result.liveToolCalled
        turns[index].local = selectedProvider == .appleOnDevice
        if !result.conversationID.isEmpty { conversationID = result.conversationID }
      } catch is CancellationError {
        if Task.isCancelled {
          turns.removeAll { $0.id == turnID }
        } else {
          self.error = "Apple Foundation Models cancelled the answer. Try again or choose Ask server."
          turns.removeAll { $0.id == turnID }
          draft = question
        }
      } catch {
        self.error = error.localizedDescription
        turns.removeAll { $0.id == turnID }
        draft = question
      }
      status = ""
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
          appleStatusBanner
        } else if model.connecting {
          ProgressView("Checking linked game account...").frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal).padding(.bottom, 8)
        } else if model.signedIn {
          Label("Signed in as \(model.accountName)", systemImage: "checkmark.circle.fill")
            .font(.caption).foregroundStyle(.green).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal).padding(.bottom, 8)
        } else {
          signInBanner
        }
        if model.sending && !model.status.isEmpty {
          Text(model.status).font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal).padding(.bottom, 8)
        }
        ScrollViewReader { proxy in
          ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
              if model.turns.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                  Label("Lakeside Ask", systemImage: "bubble.left.and.text.bubble.right.fill").font(.title2.bold())
                  Text("Ask about A House Divided. Ask server uses live game evidence and tools. Apple Foundation Models uses retrieved game evidence, can make one read-only live lookup, and generates the answer on this device.")
                    .font(.callout).foregroundStyle(.secondary)
                }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 24)
              }
              ForEach(model.turns) { turn in
                VStack(alignment: .leading, spacing: 9) {
                  Text(turn.question).font(.headline).padding(12).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.blue.opacity(0.1), in: RoundedRectangle(cornerRadius: 14))
                  HStack {
                    Label(turn.local ? (turn.usedMcp ? "Apple + live Ask tools" : "Apple Foundation Models") : (turn.usedMcp ? "ASK + live tools" : "ASK"), systemImage: turn.local ? "iphone" : "bubble.left")
                    Spacer()
                    if !turn.model.isEmpty { Text(turn.model).font(.caption2).foregroundStyle(.secondary) }
                  }.font(.caption.bold()).foregroundStyle(.secondary)
                  if turn.answer.isEmpty && model.sending { ProgressView("Thinking...").font(.callout) }
                  else { Text(turn.answer).font(.body).textSelection(.enabled) }
                  if turn.local {
                    if turn.usedMcp {
                      Text("Written on device after a read-only live Ask lookup. This question and the live result were sent to Ask server.").font(.caption).foregroundStyle(.secondary)
                    } else if turn.liveToolCalled {
                      Text("Written on device after a live Ask lookup attempt. This question was sent to Ask server, but no live source was returned.").font(.caption).foregroundStyle(.secondary)
                    } else {
                      Text("Written on device from Ask's retrieved game evidence. This question was sent to Ask server for evidence.").font(.caption).foregroundStyle(.secondary)
                    }
                  }
                  if !turn.liveSources.isEmpty { Text("Live sources: " + turn.liveSources.joined(separator: ", ")).font(.caption).foregroundStyle(.secondary) }
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
        Text(model.appleAvailable
          ? (model.signedIn ? "Available. One read-only live Ask lookup can ground current game questions." : "Available privately. Link the game account to enable live lookup.")
          : model.appleMessage)
          .font(.caption).foregroundStyle(model.appleAvailable ? .green : .secondary)
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

  private var appleStatusBanner: some View {
    VStack(alignment: .leading, spacing: 6) {
      if model.signedIn {
        Label("Private on-device answer with one optional read-only live Ask lookup. Live lookup sends this question and its result to Ask server.", systemImage: "lock.shield")
      } else if model.connecting {
        Label("Private on-device answers. Checking whether live lookup is available...", systemImage: "lock.shield")
      } else {
        Label("Private on-device answers. Link your game account to enable live lookup.", systemImage: "lock.shield")
        Button("Link game account", action: onLinkAccount).buttonStyle(.borderedProminent)
      }
      if let error = model.error { Text(error).font(.caption).foregroundStyle(.secondary) }
    }.font(.caption).foregroundStyle(.secondary).padding(.horizontal).padding(.vertical, 9)
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
