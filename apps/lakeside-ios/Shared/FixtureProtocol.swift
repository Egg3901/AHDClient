#if DEBUG
import Foundation

/// Isolated UI-test transport. It never contacts a server and is absent in Release.
final class FixtureProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let url = request.url else { return }
        let isAsk = url.host?.hasPrefix("ask.") == true
        var value: Any = ["error": "No test fixture for this endpoint"]
        var status = 200
        switch url.path {
        case "/api/me":
            let expectedName = isAsk ? "ask_session" : url.host?.hasPrefix("hub.") == true ? "agency_session" : "ops_session"
            let cookie = request.value(forHTTPHeaderField: "Cookie") ?? ""
            guard ["ui-test-session", "fixture-login"].contains(where: { cookie == expectedName + "=" + $0 }) else {
                deliver(Data("{\"error\":\"Fixture requires session cookie\"}".utf8), url: url, status: 401, type: "application/json"); return
            }
            value = isAsk ? ["identity": ["username": "Test operator"], "entitlement": ["allowed": true, "label": "Staff"], "usage": ["used": 46.5, "limit": 200, "remaining": 153.5, "mcpLimit": 40, "mcpRemaining": 12, "vizLimit": 10, "vizRemaining": 8, "resetAt": 1788912000000, "tier": "Staff"]] : ["email": "operator@example.test", "role": "admin"]
        case "/api/ops/bootstrap": value = ["cursor": 0, "conversation": ["id": 1], "conversations": [["id": 1, "title": "Build the studio hub"]], "workers": [["id": "worker-1", "name": "Export repair", "brief": "Repair and verify the export flow.", "job_status": "completed", "runtime_provider": "codex", "permissions": [], "result": "Export fixed. All checks passed."]]]
        case "/api/chat/turns": value = ["turns": [["id": 1, "role": "owner", "body": "Help me build the studio hub.", "status": "done"], ["id": 2, "role": "assistant", "body": "The export worker has finished. I am checking the changes before accepting them.", "status": "done", "route": ["label": "Muse"], "actions": [["name": "bash", "label": "Run export checks", "command": "npm test", "output": "All 12 checks passed", "state": "completed"]]]]]
        case "/api/ops/events":
            deliver(Data(": connected\n\n".utf8), url: url, status: 200, type: "text/event-stream", finish: false); return
        case "/api/ops/workers/worker-1": value = ["worker": ["brief": "Repair and verify the export flow.", "result": "Export fixed. All checks passed."]]
        case "/api/ops/providers": value = ["providers": [["id": "codex", "label": "Codex", "status": "available"], ["id": "muse", "label": "Muse", "status": "available"], ["id": "grok", "label": "Grok", "status": "available"]]]
        case "/api/ops/usage": value = ["providers": [["provider": "codex", "attempts": 3, "input_tokens": 12000, "output_tokens": 3000, "unmeasured_token_attempts": 1]]]
        case "/api/ops/memory": value = ["body": "Keep each implementation worker in a separate worktree. Verify results before accepting them.", "version": "fixture-version"]
        case "/api/nextcost": value = ["cost": 0.5, "followup": 1, "followupsLeft": 2]
        case "/api/conversation/share": value = ["ok": true, "url": "https://example.test/shared-conversation"]
        case "/api/conversations":
            value = isAsk ? ["conversations": [["id": "fixture-conversation", "title": "How does inflation work?", "updated": 1788825600000]]] : ["conversations": [["id": 1, "title": "Build the studio hub"]], "conversation": ["id": 1]]
        case "/api/ops/workspaces": value = ["workspaces": [["workspaceId": "w1", "title": "Studio hub", "isolation": "worktree"]]]
        case "/api/ops/files": value = ["entries": [["name": "app.swift", "path": "app.swift", "directory": false]]]
        case "/api/ops/files/read": value = ["content": "// Studio hub\nlet version = \"1.3.0\"", "size": 40]
        case "/api/ops/files/diff": value = ["content": "-let version = 1.2\n+let version = 1.3"]
        case "/api/ops/workers/worker-1/activity": value = ["content": "Ran export checks. All 12 checks passed.", "updateCount": 3]
        case "/api/schedules": value = ["schedules": [["id": 1, "title": "Morning review", "brief": "Review overnight activity", "cadence": "daily", "enabled": 1]]]
        case "/api/tasks": value = ["tasks": [["id": 1, "title": "Review deployment", "status": "completed", "brief": "Check the release"]]]
        case "/api/tasks/1": value = ["task": ["id": 1, "status": "completed", "result": "Release verified."]]

        case "/api/games": value = ["games": [["id": "ahd", "name": "A House Divided"]]]
        case "/api/map/render":
            let svg = ##"<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760"><rect width="1200" height="760" fill="#111827"/><path d="M100 160 L480 100 L540 500 L180 550 Z" fill="#38bdf8"/><path d="M560 180 L990 130 L1060 580 L600 500 Z" fill="#21c8a0"/><text x="80" y="70" fill="#ffffff" font-size="32">Fixture regions</text></svg>"##
            deliver(Data(svg.utf8), url: url, status: 200, type: "image/svg+xml"); return
        case "/api/conversation": value = ["turns": [["id": 42, "question": "How does inflation work?", "answer": "## Inflation\n\nPrices respond to supply and demand.", "citations": [["label": "Economy reference", "url": "https://example.test/economy"]]]]]
            if ProcessInfo.processInfo.arguments.contains("--uitest-visuals") {
                let answer = #"""
```mermaid
xychart-beta
 title "GDP growth"
 x-axis ["US", "UK", "France"]
 y-axis "Percent" -2 --> 5
 bar [-1.5, 4, 2.2]
```

```ahd-map
{"title":"Fixture regions","scope":"world","metric":"Growth","unit":"%","regions":[{"id":"US","label":"United States","value":2},{"id":"GB","label":"United Kingdom","value":4}]}
```
"""#
                value = ["turns": [["id": 42, "question": "Show the economy", "answer": answer]]]
            }
        case "/api/ask":
            let body = #"""
event: meta
data: {"convId":"fixture-conversation","reqId":"fixture-request","status":"Reading sources"}

event: delta
data: "A partial draft"

event: done
data: {"convId":"fixture-conversation","answerId":43,"answer":"Verified final answer from the server.","usage":{"used":47,"limit":200,"remaining":153,"mcpLimit":40,"mcpRemaining":11,"vizLimit":10,"vizRemaining":8},"citations":[{"label":"Verified source","url":"https://example.test/source"}]}

"""# + "\n"
            deliver(Data(body.utf8), url: url, status: 200, type: "text/event-stream"); return
        case "/api/status": value = ["services": [["id": "game", "name": "Game server", "current": "operational", "latencyMs": 42, "uptime24h": 99.9, "history": [["date": "2026-09-07", "pct": 99.9]]]]]
        case "/api/game/summary": value = ["turn": 123, "year": 1960, "activePlayers": 42]
        case "/api/code/sessions": value = ["sessions": [["sessionId": "tmux:test-agent", "tmuxName": "test-agent", "title": "Test agent", "statusLine": "Waiting for input", "needsInput": true, "provider": "codex", "usage": ["percent": 72, "direction": "remaining", "detail": "Weekly plan"]]]]
        case "/api/code/tmux/test-agent/capture": value = ["transcript": ["turns": [["user": "Check the deployment", "blocks": [["type": "text", "text": "Deployment checks passed."]]]]]]
        case "/api/code/tmux/test-agent/message": value = ["ok": true, "queued": true]
        case "/api/tickets": value = ["items": [["_id": "ticket-1", "ticketNumber": 123, "title": "Example ticket", "description": "A reproducible issue", "status": "open"]], "page": 1, "totalPages": 1]
        case "/api/logout", "/auth/logout", "/api/answer/feedback", "/api/ask/stop": value = ["ok": true]
        default: status = 404
        }
        deliver((try? JSONSerialization.data(withJSONObject: value)) ?? Data(), url: url, status: status, type: "application/json")
    }
    private func deliver(_ data: Data, url: URL, status: Int, type: String, finish: Bool = true) {
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": type])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data); if finish { client?.urlProtocolDidFinishLoading(self) }
    }
    override func stopLoading() {}
}
#endif
