import Foundation

#if canImport(FoundationModels)
import FoundationModels
#endif

enum AskProvider: String, CaseIterable, Identifiable, Hashable {
    case server
    case appleOnDevice

    var id: String { rawValue }

    var title: String {
        switch self {
        case .server:
            return "Ask server"
        case .appleOnDevice:
            return "Apple on-device"
        }
    }
}

enum AppleFoundationModelProvider {
    static var isAvailable: Bool {
#if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            return SystemLanguageModel.default.isAvailable
        }
#endif
        return false
    }

    static var availabilityMessage: String {
#if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            return SystemLanguageModel.default.isAvailable
                ? "Apple on-device"
                : "Apple on-device is unavailable on this device or in this region."
        }
#endif
        return "Apple on-device requires iOS 26 or later."
    }

    static func respond(question: String, history: [String], gameName: String, gameSubject: String, gameEvidence: String,
                        length: String, style: String, mode: String) async throws -> String {
#if canImport(FoundationModels)
        guard #available(iOS 26.0, *) else {
            throw AppFailure(message: "Apple on-device answers require iOS 26 or later.")
        }

        guard SystemLanguageModel.default.isAvailable else {
            throw AppFailure(message: availabilityMessage)
        }

        let session = LanguageModelSession(instructions: """
        You are Lakeside Ask's on-device assistant. The user wants a useful answer about a game.
        Follow the answer and safety rules in the request. Never claim access to live game state.
        """)

        let prompt = AppleFoundationModelPrompt.make(
            question: question,
            history: history,
            gameName: gameName,
            gameSubject: gameSubject,
            gameEvidence: gameEvidence,
            length: length,
            style: style,
            mode: mode
        )

        let response = try await session.respond(to: prompt)
        let answer = response.content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !answer.isEmpty else {
            throw AppFailure(message: "Apple on-device returned an empty answer.")
        }
        return answer
#else
        throw AppFailure(message: "Apple on-device answers require an iOS 26 SDK and a supported device.")
#endif
    }
}
