import XCTest
@testable import LakesideOps

@MainActor final class SubmissionTests: XCTestCase {
    func testRetryReusesReceiptAndAcceptedMessageSurvivesRefreshFailure() async {
        SubmissionProtocol.reset()
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [SubmissionProtocol.self]
        let session = AppSession(.hub, configuration: config)
        let model = OpsWorkspaceModel()
        model.conversation = "1"
        let first = await model.send("Check the export", session)
        XCTAssertFalse(first)
        let second = await model.send("Check the export", session)
        XCTAssertTrue(second, "An accepted message must clear the composer even if refreshing turns fails")
        let ids = SubmissionProtocol.ids()
        XCTAssertEqual(ids.count, 2)
        XCTAssertFalse(ids.first?.isEmpty ?? true)
        XCTAssertEqual(ids.first, ids.last, "Retrying the same message must not dispatch twice")
        XCTAssertEqual(model.error, "Message accepted. Reconnecting to the conversation.")
        let third = await model.send("Another task", session)
        XCTAssertTrue(third)
        XCTAssertNotEqual(SubmissionProtocol.ids().last, ids.first)
    }
}

private final class SubmissionProtocol: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    private static var requestIDs: [String] = []
    static func reset() { lock.lock(); defer { lock.unlock() }; requestIDs = [] }
    static func ids() -> [String] { lock.lock(); defer { lock.unlock() }; return requestIDs }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let url = request.url else { return }
        var status = 503
        var body = "{\"error\":\"Fixture connection interrupted\"}"
        if url.path == "/api/chat/send" {
            var data = request.httpBody ?? Data()
            if data.isEmpty, let stream = request.httpBodyStream {
                stream.open(); defer { stream.close() }
                var buffer = [UInt8](repeating: 0, count: 1024)
                while stream.hasBytesAvailable {
                    let count = stream.read(&buffer, maxLength: buffer.count)
                    if count <= 0 { break }
                    data.append(contentsOf: buffer.prefix(count))
                }
            }
            let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            Self.lock.lock()
            Self.requestIDs.append(payload?["requestId"] as? String ?? "")
            let count = Self.requestIDs.count
            Self.lock.unlock()
            if count > 1 { status = 200; body = "{\"ok\":true}" }
        }
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
