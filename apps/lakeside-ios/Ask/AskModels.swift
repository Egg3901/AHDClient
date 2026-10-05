import SwiftUI
import UIKit
import LakesideCore

/// Where the player's permission for outside AI services is stored.
enum AskConsentStore {
    static let key = "lakeside.ask.aiConsent"
    static let privacyURL = URL(string: "https://ask.lakesidegames.net/privacy")

    static func granted(_ recipients: [AIRecipient]) -> Bool {
        UserDefaults.standard.string(forKey: key) == AIConsent.signature(recipients)
    }
    static func grant(_ recipients: [AIRecipient]) {
        UserDefaults.standard.set(AIConsent.signature(recipients), forKey: key)
    }
    static func withdraw() {
        UserDefaults.standard.removeObject(forKey: key)
    }
    /// True when permission was given for an earlier list of services.
    static var hasEarlierGrant: Bool { UserDefaults.standard.string(forKey: key) != nil }
}

/// Endpoints added in Ask 3.0.0. Each one is hidden when the server answers
/// 404, so the app keeps working against older servers.
@MainActor final class AskFeatures: ObservableObject {
    enum State: Equatable { case unknown, available, unavailable }
    @Published var watches: State = .unknown
    @Published var reports: State = .unknown
    @Published var watchItems: [JSONValue] = []
    @Published var watchLimit: Int?
    @Published var watchEvents: [JSONValue] = []
    @Published var reportItems: [JSONValue] = []

    func refresh(_ session: AppSession) async {
        let watchList = await load(session, "/api/watches")
        let reportList = await load(session, "/api/reports")
        apply(watchList, state: \.watches) { value in applyWatches(value) }
        apply(reportList, state: \.reports) { value in reportItems = value["reports"].array }
    }

    func refreshWatches(_ session: AppSession) async throws {
        let value = try await session.get("/api/watches")
        watches = .available
        applyWatches(value)
    }

    private func applyWatches(_ value: JSONValue) {
        watchItems = value["watches"].array
        watchLimit = value["limit"].number.map { Int($0) }
        watchEvents = value["events"].array
    }

    func refreshReports(_ session: AppSession) async throws {
        let value = try await session.get("/api/reports")
        reports = .available
        reportItems = value["reports"].array
    }

    private enum Outcome { case value(JSONValue), missing, failed }

    private func load(_ session: AppSession, _ path: String) async -> Outcome {
        do { return .value(try await session.get(path)) }
        catch {
            if error.failureKind == .some(.notFound) { return .missing }
            return .failed
        }
    }

    private func apply(_ outcome: Outcome, state: ReferenceWritableKeyPath<AskFeatures, State>, update: (JSONValue) -> Void) {
        switch outcome {
        case .value(let value): self[keyPath: state] = .available; update(value)
        case .missing: self[keyPath: state] = .unavailable
        case .failed: break
        }
    }
}

struct ChatTurn: Identifiable {
    var id: String
    var question: String
    var answer: String
    var citations: [JSONValue] = []
    var liveSources: [JSONValue] = []
    var conflicts: [JSONValue] = []
    var answerID: JSONValue = .null
    var reportURL: String = ""
    var model: String = ""
    var local = false
    var stopped: StopOutcome?
    var trail: [String] = []
    var actions: [JSONValue] = []
    var metadata: JSONValue = .null
    var attachments: [JSONValue] = []

    enum StopOutcome { case confirmed, localOnly }

    /// "Model · Service" so every answer names who wrote it.
    static func modelLabel(_ value: JSONValue) -> String {
        let model = value.first("modelName", "modelId", "model")
        let provider = value["providerName"].string
        if !model.isEmpty, !provider.isEmpty, provider != model { return "\(model) · \(provider)" }
        return model
    }

    init(id: String, question: String, answer: String, attachments: [JSONValue] = []) {
        self.id = id
        self.question = question
        self.answer = answer
        self.attachments = attachments
    }

    /// A saved turn from GET /api/conversation.
    init(saved value: JSONValue) {
        let identifier = value["id"].string
        self.init(id: identifier.isEmpty ? UUID().uuidString : identifier, question: value["question"].string, answer: value["answer"].string,
                  attachments: value["attachments"].array)
        citations = value["citations"].array
        answerID = value["id"]
        model = ChatTurn.modelLabel(value)
        metadata = value
    }

    var exportTurn: ExportTurn {
        ExportTurn(question: question, answer: answer, model: model,
                   sources: (citations + liveSources).map { ExportSource(label: $0.first("label", "title", "path"), url: $0["url"].string) })
    }
}

enum AskRoute: Hashable {
    case conversation(id: String, prompt: String, live: Bool)
    case watches
    case reports
    case settings
}

/// One failure, shaped for display.
struct AskProblem: Equatable {
    var title: String
    var message: String
    var kind: FailureKind?

    init(_ error: Error) {
        kind = error.failureKind
        title = kind?.title ?? "Something went wrong"
        message = error.displayMessage
    }

    init(title: String, message: String) {
        self.title = title
        self.message = message
        kind = nil
    }

    var symbol: String {
        switch kind {
        case .some(.network): return "wifi.exclamationmark"
        case .some(.quotaExhausted), .some(.rateLimited): return "hourglass"
        case .some(.signedOut): return "person.crop.circle.badge.exclamationmark"
        default: return "exclamationmark.triangle"
        }
    }
}

struct ProblemBanner: View {
    let problem: AskProblem
    var retry: (() -> Void)?
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: problem.symbol).foregroundStyle(.orange).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(problem.title).font(.subheadline.weight(.semibold))
                Text(problem.message).font(.footnote).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                if let retry {
                    Button("Try again", action: retry).font(.footnote.weight(.semibold)).padding(.top, 2)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.orange.opacity(0.35), lineWidth: 1))
    }
}

/// Small uppercase monospaced label used for section and metadata headings.
struct AskLabel: View {
    let text: String
    var color: Color = .secondary
    var body: some View {
        Text(text.uppercased()).font(.caption2.monospaced().weight(.semibold)).tracking(0.8).foregroundStyle(color)
    }
}

enum AskAnnouncer {
    static func say(_ text: String) {
        UIAccessibility.post(notification: .announcement, argument: text)
    }
}
