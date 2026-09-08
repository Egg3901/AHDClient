import Foundation
import Security
import CryptoKit

// Compiled into both the app plugin and the WidgetKit extension. Only these
// fields can be saved; neither the raw API response nor session cookies are
// written to shared defaults, files, URLs or logs.
struct BriefingStatus: Codable {
  var status: String?
  var name: String?
  var actions: Double?
  var actionCap: Double?
  var funds: Double?
  var personalHomeLiquid: Double?
  var homeCurrency: String?
  var politicalInfluence: Double?
  var favorability: Double?
  var isImperial: Bool?
  var electionStats: ElectionStats?
  var corpNav: CorporationStats?

  struct ElectionStats: Codable {
    var electionId: String
    var myVotePct: Double?
    var marginPct: Double?
    var seatsProjected: Double?
    var totalSeats: Double?
    var isMultiSeat: Bool?
  }
  struct CorporationStats: Codable {
    var sequentialId: Int
    var name: String
    var sharePrice: Double?
    var priceChange1h: Double?
    var liquidCapital: Double?
    var liquidCurrencyCode: String?
    var marketingStrength: Double?
  }
}

struct SavedBriefing: Codable {
  var updatedAt: Date
  var sessionId: String
  var data: BriefingStatus
}

enum BriefingStore {
  static let group = "group.net.lakesidegames.ahdclient"
  static let endpoint = URL(string: "https://ahousedividedgame.com/api/client-status?layout=full")!
  private static let queue = DispatchQueue(label: "net.lakesidegames.ahdclient.widget-refresh")
  private static var pending = [(SavedBriefing?) -> Void]()

  private static var file: URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?
      .appendingPathComponent("multiplayer-briefing.json")
  }

  static func read() -> SavedBriefing? {
    guard let file = file, let bytes = try? Data(contentsOf: file), bytes.count <= 131072,
      let value = try? JSONDecoder().decode(SavedBriefing.self, from: bytes),
      let header = session(), !header.isEmpty, value.sessionId == fingerprint(header),
      Date().timeIntervalSince(value.updatedAt) < 86400 else { return nil }
    return value
  }

  private static func fingerprint(_ header: String) -> String {
    SHA256.hash(data: Data(header.utf8)).map { String(format: "%02x", $0) }.joined()
  }

  static func clear() {
    if let file = file { try? FileManager.default.removeItem(at: file) }
  }

  private static func query() -> [String: Any]? {
    guard let accessGroup = Bundle.main.object(forInfoDictionaryKey: "AHDWidgetKeychainGroup") as? String,
      !accessGroup.contains("$("), !accessGroup.isEmpty else { return nil }
    return [kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "net.lakesidegames.ahdclient.widgets",
      kSecAttrAccount as String: "multiplayer",
      kSecAttrAccessGroup as String: accessGroup]
  }

  static func session() -> String? {
    guard var request = query() else { return nil }
    request[kSecReturnData as String] = true
    request[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?
    guard SecItemCopyMatching(request as CFDictionary, &item) == errSecSuccess,
      let data = item as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }

  static func setSession(_ header: String) {
    queue.sync { updateSession(header) }
  }

  private static func updateSession(_ header: String) {
    guard let request = query(), session() != header else { return }
    clear()
    SecItemDelete(request as CFDictionary)
    guard !header.isEmpty else { return }
    var item = request
    item[kSecValueData as String] = Data(header.utf8)
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    // An unavailable access group stays signed out instead of falling back to
    // plaintext credentials. Entitlements are installed for both targets.
    SecItemAdd(item as CFDictionary, nil)
  }

  static func refresh(_ completion: @escaping (SavedBriefing?) -> Void) {
    queue.async {
      pending.append(completion)
      guard pending.count == 1 else { return }
      func finish(_ value: SavedBriefing?) {
        let callbacks = pending
        pending.removeAll()
        callbacks.forEach { callback in DispatchQueue.main.async { callback(value) } }
      }
      guard let cookie = session(), !cookie.isEmpty else { clear(); finish(nil); return }
      if let saved = read(), Date().timeIntervalSince(saved.updatedAt) < 60 { finish(saved); return }
      let config = URLSessionConfiguration.ephemeral
      config.timeoutIntervalForRequest = 10
      config.timeoutIntervalForResource = 12
      config.httpCookieStorage = nil
      config.urlCache = nil
      let client = URLSession(configuration: config, delegate: NoBriefingRedirect(), delegateQueue: nil)
      var request = URLRequest(url: endpoint, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 10)
      request.setValue(cookie, forHTTPHeaderField: "Cookie")
      request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
      client.dataTask(with: request) { bytes, response, _ in
        queue.async {
          defer { client.finishTasksAndInvalidate() }
          guard session() == cookie else { clear(); finish(nil); return }
          if let code = (response as? HTTPURLResponse)?.statusCode, code == 401 || code == 403 {
            clear(); finish(nil); return
          }
          guard (response as? HTTPURLResponse)?.statusCode == 200,
            let bytes = bytes, bytes.count <= 131072,
            var data = try? JSONDecoder().decode(BriefingStatus.self, from: bytes),
            data.name != nil || data.status == "no-character" else { finish(read()); return }
          data.name = data.name.map { String($0.prefix(120)) }
          let saved = SavedBriefing(updatedAt: Date(), sessionId: fingerprint(cookie), data: data)
          if var file = file, let encoded = try? JSONEncoder().encode(saved) {
            try? encoded.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try? file.setResourceValues(values)
          }
          finish(saved)
        }
      }.resume()
    }
  }
}

private final class NoBriefingRedirect: NSObject, URLSessionTaskDelegate {
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    completionHandler(nil)
  }
}
