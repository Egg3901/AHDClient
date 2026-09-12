// Same-file extensions inspect the real private cookie store without exposing it
// in the application. Only HTTP responses and redirects are simulated here.
extension NativeAskAPI {
  fileprivate var authTestCookies: HTTPCookieStorage { storage }
  fileprivate func finishAuthTest() { transport.invalidateAndCancel() }
}

private func authCookie(_ name: String, _ value: String, _ domain: String, path: String = "/", expires: Date? = nil) -> HTTPCookie {
  var properties: [HTTPCookiePropertyKey: Any] = [.name: name, .value: value, .domain: domain, .path: path, .secure: "TRUE"]
  if let expires { properties[.expires] = expires }
  return HTTPCookie(properties: properties)!
}

private final class AuthTransport: URLProtocol, @unchecked Sendable {
  static var cookies: HTTPCookieStorage!
  static var calls: [String] = []
  static var violations: [String] = []
  static var acceptLegacy = false

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func stopLoading() {}

  override func startLoading() {
    let url = request.url!
    let route = url.host! + url.path
    Self.calls.append(route)
    let header = request.value(forHTTPHeaderField: "Cookie") ?? ""
    var status = 200
    var body = "{}"
    if url.host == "auth.ahousedividedgame.com", Self.acceptLegacy, header.contains("auth-token=linked-game") {
      Self.cookies.setCookie(authCookie("__Host-ask_session", "valid-ask", "ask.lakesidegames.net"))
    } else if url.host == "ask.lakesidegames.net", url.path == "/auth/login" {
      // Keycloak SSO proves the user, then Ask's callback issues a distinct app
      // session. A game app's opaque session alone is not an issuer credential.
      let issuer = URL(string: "https://auth.lakesidegames.net/realms/accounts/protocol/openid-connect/auth")!
      let sso = Self.cookies.cookies(for: issuer)?.contains { $0.name == "KEYCLOAK_IDENTITY" && $0.value == "valid-sso" } == true
      if sso { Self.cookies.setCookie(authCookie("__Host-lakeside_session", "valid-ask", "ask.lakesidegames.net")) }
    } else if url.host == "ask.lakesidegames.net", url.path == "/api/me" {
      if header.contains("KEYCLOAK_") || header.contains("linked-game") { Self.violations.append("Another origin's credential reached Ask") }
      if header.contains("=valid-ask") { body = "{\"identity\":{\"name\":\"Linked player\"}}" }
      else { status = 401 }
    }
    let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
    client!.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client!.urlProtocol(self, didLoad: Data(body.utf8))
    client!.urlProtocolDidFinishLoading(self)
  }
}

private let linkedGame = authCookie("__Host-lakeside_session", "linked-game", "ahousedividedgame.com")
private let issuerSSO = authCookie("KEYCLOAK_IDENTITY", "valid-sso", "auth.lakesidegames.net", path: "/realms/accounts/")
private let issuerSession = authCookie("KEYCLOAK_SESSION", "issuer-session", "auth.lakesidegames.net", path: "/realms/accounts/")

private func check(_ name: String, cookies: [HTTPCookie], succeeds: Bool = true, legacy: Bool = false, loginExpected: Bool = true) async -> Bool {
  let api = NativeAskAPI(gameCookies: cookies)
  defer { api.finishAuthTest() }
  AuthTransport.cookies = api.authTestCookies
  AuthTransport.calls = []
  AuthTransport.violations = []
  AuthTransport.acceptLegacy = legacy
  var connected = false
  var failure = ""
  do {
    let profile = try await api.connect()
    connected = (profile["identity"] as? [String: Any])?["name"] as? String == "Linked player"
  } catch { failure = error.localizedDescription }
  let loggedIn = AuthTransport.calls.contains { $0.hasSuffix("/auth/login") }
  let passed = connected == succeeds && AuthTransport.violations.isEmpty && (!succeeds || loggedIn == loginExpected)
  print("\(passed ? "PASS" : "FAIL"): \(name)\(failure.isEmpty ? "" : ": " + failure)")
  if !passed {
    print("[DEBUG-cookie-store] retained=\(api.authTestCookies.cookies?.map { $0.name } ?? []) calls=\(AuthTransport.calls)")
  }
  return passed
}

#if !canImport(FoundationNetworking)
for (name, jar) in [("initializer", HTTPCookieStorage()), ("ephemeral", URLSessionConfiguration.ephemeral.httpCookieStorage!)] {
  jar.setCookie(issuerSSO)
  print("[DEBUG-cookie-store] \(name): retained=\(jar.cookies?.map { $0.name } ?? []); scoped=\(jar.cookies(for: URL(string: "https://auth.lakesidegames.net/realms/accounts/")!)?.map { $0.name } ?? [])")
}

#endif

Task {
  var passed = true
  for attempt in 1...2 {
    let result = await check("already-linked account, opening Ask \(attempt)", cookies: [linkedGame, issuerSSO, issuerSession])
    passed = result && passed
  }
  let scenarios: [(String, [HTTPCookie], Bool, Bool, Bool)] = [
    ("stale Ask session recovers using existing SSO", [linkedGame, issuerSSO, authCookie("__Host-ask_session", "stale", "ask.lakesidegames.net")], true, false, true),
    ("valid Ask session needs no new link", [linkedGame, authCookie("__Host-lakeside_session", "valid-ask", "ask.lakesidegames.net")], true, false, false),
    ("legacy linked game handoff still works", [authCookie("auth-token", "linked-game", ".ahousedividedgame.com")], true, true, false),
    ("game session alone cannot impersonate issuer SSO", [linkedGame], false, false, true),
    ("foreign issuer cookie is rejected", [linkedGame, authCookie("KEYCLOAK_IDENTITY", "valid-sso", "auth.lakesidegames.net.evil.invalid")], false, false, true),
    ("expired issuer cookie requires sign-in", [linkedGame, authCookie("KEYCLOAK_IDENTITY", "valid-sso", "auth.lakesidegames.net", expires: Date(timeIntervalSince1970: 1))], false, false, true),
  ]
  for (name, cookies, succeeds, legacy, loginExpected) in scenarios {
    let result = await check(name, cookies: cookies, succeeds: succeeds, legacy: legacy, loginExpected: loginExpected)
    passed = result && passed
  }
  exit(passed ? 0 : 1)
}
dispatchMain()
