import Foundation
import SwiftUI
import SQLite3
import LakesideCore

/// A single SQLite row makes cache, cursor and outbox changes one durable transaction.
private final class WorkDatabase {
    private var db: OpaquePointer?
    init(scope: String) throws {
        let folder = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("Work", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        let url = folder.appendingPathComponent(scope + ".sqlite")
        guard sqlite3_open(url.path, &db) == SQLITE_OK else { throw AppFailure(message: "Could not open the work cache.") }
        guard sqlite3_exec(db, "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), data BLOB NOT NULL);", nil, nil, nil) == SQLITE_OK else { throw AppFailure(message: "Could not prepare the work cache.") }
    }
    deinit { sqlite3_close(db) }
    func read() throws -> WorkCache {
        var statement: OpaquePointer?; defer { sqlite3_finalize(statement) }
        guard sqlite3_prepare_v2(db, "SELECT data FROM state WHERE id=1", -1, &statement, nil) == SQLITE_OK else { throw AppFailure(message: "Could not read the work cache.") }
        let result = sqlite3_step(statement)
        if result == SQLITE_DONE { return WorkCache() }
        guard result == SQLITE_ROW, let bytes = sqlite3_column_blob(statement, 0) else { throw AppFailure(message: "Could not read saved work.") }
        return try JSONDecoder().decode(WorkCache.self, from: Data(bytes: bytes, count: Int(sqlite3_column_bytes(statement, 0))))
    }
    func write(_ state: WorkCache) throws {
        let data = try JSONEncoder().encode(state)
        var statement: OpaquePointer?; defer { sqlite3_finalize(statement) }
        guard sqlite3_prepare_v2(db, "INSERT OR REPLACE INTO state(id,data) VALUES(1,?)", -1, &statement, nil) == SQLITE_OK else { throw AppFailure(message: "Could not save work.") }
        let result = data.withUnsafeBytes { bytes -> Int32 in
            guard sqlite3_bind_blob(statement, 1, bytes.baseAddress, Int32(data.count), unsafeBitCast(-1, to: sqlite3_destructor_type.self)) == SQLITE_OK else { return SQLITE_ERROR }
            return sqlite3_step(statement)
        }
        guard result == SQLITE_DONE else { throw AppFailure(message: "Work could not be saved on this device. Try again before leaving.") }
    }
}

@MainActor final class OpsWorkStore: ObservableObject {
    @Published private(set) var cache = WorkCache()
    @Published private(set) var online = false
    @Published var error: String?
    @Published var selected = ""
    private var database: WorkDatabase?
    private var busy = false
    private var sending = false
    var board: JSONValue { cache.snapshots[selected]?["board"] ?? cache.boards.first { $0["id"].string == selected } ?? .null }
    var cards: [JSONValue] { cache.snapshots[selected]?["cards"].array ?? [] }
    func open(_ session: AppSession) {
        guard database == nil else { return }
        do {
            // The Hub currently exposes one owner workspace; use its authenticated profile scope.
            let identity = session.profile.first("id", "userId", "email", "name")
            guard !identity.isEmpty else { throw AppFailure(message: "Sign in to load saved work.") }
            var scope = Data((session.surface.host + ":" + identity).utf8).base64EncodedString().replacingOccurrences(of: "/", with: "_")
#if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--uitest-fixtures") { scope = "fixture-" + UUID().uuidString }
#endif
            let database = try WorkDatabase(scope: scope); cache = try database.read(); self.database = database
            selected = cache.boards.first?["id"].string ?? ""
        } catch { self.error = error.localizedDescription }
    }
    private func save(_ next: WorkCache) throws {
        guard let database else { throw AppFailure(message: "The local work cache is unavailable.") }
        try database.write(next); cache = next
    }
    func refresh(_ session: AppSession) async {
        guard !busy, database != nil else { return }; busy = true; defer { busy = false }
        do {
            let inventory = try await session.get("/api/ops/boards")
            var next = cache; next.boards = inventory["boards"].array; try save(next)
            if !cache.boards.contains(where: { $0["id"].string == selected }) { selected = cache.boards.first?["id"].string ?? "" }
            let id = selected
            if !id.isEmpty {
                if let snapshot = cache.snapshots[id] {
                    var more = true; var pages = 0
                    while more && pages < 20 {
                        let current = cache.snapshots[id] ?? snapshot
                        let changes = try await session.get("/api/ops/boards/\(try opsSafePathID(id))/changes", query: ["after": current["eventsCursor"].string, "epoch": current["epoch"].string])
                        var updated = cache
                        if !updated.apply(boardID: id, changes: changes) { try await snapshotBoard(id, session); break }
                        try save(updated); more = changes["hasMore"].bool; pages += 1
                    }
                } else { try await snapshotBoard(id, session) }
            }
            online = true; error = nil; await flush(session)
        } catch { online = false; if !Task.isCancelled { self.error = error.localizedDescription } }
    }
    private func snapshotBoard(_ id: String, _ session: AppSession) async throws {
        var cards: [JSONValue] = []; var after = ""; var first: JSONValue = .null
        repeat {
            let page = try await session.get("/api/ops/boards/\(try opsSafePathID(id))/snapshot", query: ["afterId": after, "limit": "100"])
            if first == .null { first = page }
            guard page["epoch"] == first["epoch"] else { throw AppFailure(message: "The board reset during refresh. Retrying shortly.") }
            cards += page["cards"].array
            let cursor = page["nextCursor"].string
            guard cursor.isEmpty || cursor != after else { throw AppFailure(message: "The board returned a repeated page.") }
            after = cursor
        } while !after.isEmpty
        var fields = first.object; fields["cards"] = .array(cards)
        var next = cache; next.replace(boardID: id, snapshot: .object(fields)); try save(next)
    }
    func submit(type: String, card: JSONValue = .null, payload: [String: JSONValue], authority: Bool = false, session: AppSession) async -> Bool {
        guard !authority || online else { error = "Reconnect to confirm approval or start and stop runs."; return false }
        guard !authority || !sending else { error = "Wait for the current action to finish, then confirm again."; return false }
        do {
            let intent = WorkIntent(boardID: selected, type: type, card: card, payload: payload, authority: authority)
            var next = cache; next.pending.append(intent); try save(next)
            await flush(session, authorizedNow: authority ? intent.id : nil)
            return true
        } catch { self.error = error.localizedDescription; return false }
    }
    func rememberDetail(_ key: String, value: JSONValue) {
        do { var next = cache; next.details[key] = value; try save(next) } catch { self.error = error.localizedDescription }
    }
    func discard(_ id: String) {
        do { var next = cache; next.pending.removeAll { $0.id == id }; try save(next) } catch { self.error = error.localizedDescription }
    }
    private func flush(_ session: AppSession, authorizedNow: String? = nil) async {
        guard !sending else { return }; sending = true; defer { sending = false }
        for intent in cache.pending where intent.issue == nil {
            do {
                let receipt: JSONValue
                if intent.authority && authorizedNow != intent.id {
                    // An uncertain authority command is receipt-only. Never start it on reconnect.
                    receipt = try await session.get("/api/ops/commands/\(try opsSafePathID(intent.id))")
                } else {
                    if intent.body["type"]?.string == "board.create" {
                        var body = intent.body["payload"]?.object ?? [:]; body["commandId"] = .string(intent.id)
                        let result = try await session.post("/api/ops/boards", body)
                        receipt = .object(["status": .string("accepted"), "board": result["board"]])
                    } else {
                        receipt = try await session.post("/api/ops/boards/\(try opsSafePathID(intent.boardID))/commands", intent.body)
                    }
                }
                var next = cache; next.acknowledge(intent, receipt: receipt); try save(next)
            } catch {
                if let failure = error as? AppFailure, let status = failure.statusCode, (400..<500).contains(status), status != 408, status != 429 {
                    var next = cache
                    if let i = next.pending.firstIndex(where: { $0.id == intent.id }) {
                        next.pending[i].issue = status == 409 ? "Conflict: \(failure.message)" : failure.message
                        do { try save(next) } catch { self.error = error.localizedDescription; return }
                    }
                } else { online = false; self.error = error.localizedDescription; return }
            }
        }
    }
}
