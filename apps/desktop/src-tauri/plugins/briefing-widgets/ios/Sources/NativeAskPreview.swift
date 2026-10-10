import Foundation

/// Screenshot mode. Launch with `-AHDAskPreview [state]` and the sheet opens
/// over the launcher with a canned conversation and no account. States:
/// conversation (default), history, empty, streaming, consent, signedout,
/// quota. Only map rendering touches the network (it is public).
enum NativeAskPreview {
  static let states: Set<String> = ["conversation", "history", "empty", "streaming", "consent", "signedout", "quota"]

  static func requestedState(_ arguments: [String] = ProcessInfo.processInfo.arguments) -> String? {
    guard let index = arguments.firstIndex(of: "-AHDAskPreview") else { return nil }
    let next = arguments.index(after: index)
    if next < arguments.endIndex, states.contains(arguments[next].lowercased()) { return arguments[next].lowercased() }
    return "conversation"
  }

  /// `-AHDAskAppearance light|dark` renders the preview in that appearance.
  static func requestedAppearance(_ arguments: [String] = ProcessInfo.processInfo.arguments) -> String? {
    guard let index = arguments.firstIndex(of: "-AHDAskAppearance") else { return nil }
    let next = arguments.index(after: index)
    guard next < arguments.endIndex else { return nil }
    let value = arguments[next].lowercased()
    return value == "light" || value == "dark" ? value : nil
  }

  private static let mainID = "preview-main"

  @MainActor static func load(_ state: String, into model: NativeAskModel) {
    let now = Date()
    model.signedIn = state != "signedout"
    model.connected = state != "signedout"
    model.accountName = "Senator Hale"
    model.recipients = NativeAskConsent.fallback
    model.consented = state != "consent"
    model.historyLoaded = true
    model.usage = NativeAskUsage(used: state == "quota" ? 10 : 3, limit: 10, remaining: state == "quota" ? 0 : 7,
                                 liveLimit: 5, liveRemaining: 4, chartLimit: 3, chartRemaining: 2,
                                 resetAt: (now.timeIntervalSince1970 + 5 * 3600 + 12 * 60) * 1000, tier: "Player", followupCost: 0.5)
    model.conversations = [
      NativeAskConversation(id: mainID, title: "Party standing and where to campaign", updated: now.addingTimeInterval(-120), isPrivate: false),
      NativeAskConversation(id: "preview-2", title: "How do action points work?", updated: now.addingTimeInterval(-26 * 3600), isPrivate: false),
      NativeAskConversation(id: "preview-3", title: "Getting a budget bill through the Senate", updated: now.addingTimeInterval(-2 * 86_400), isPrivate: false),
      NativeAskConversation(id: "preview-4", title: "Corporate tax and dividends", updated: now.addingTimeInterval(-5 * 86_400), isPrivate: false),
      NativeAskConversation(id: "preview-5", title: "Is my screenshot of the vote right?", updated: now.addingTimeInterval(-8 * 86_400), isPrivate: true),
      NativeAskConversation(id: "preview-6", title: "When is the next Senate election?", updated: now.addingTimeInterval(-12 * 86_400), isPrivate: false),
    ]
    switch state {
    case "empty", "consent", "signedout":
      break
    case "streaming":
      model.conversationID = mainID
      var first = sampleTurns(now)[0]
      first.followups = []
      var live = NativeAskTurn(id: "preview-live", question: "Which states should I hold a rally in this turn?")
      live.state = .streaming
      live.status = "Reading the latest polls"
      live.lookups = 3
      live.answer = "## Best rally targets this turn\n\nRallies pay off most where a race is within **3 points** and turnout is falling. Three states fit:\n\n- **Georgia**, where"
      model.turns = [first, live]
      model.sending = true
    default:
      model.conversationID = mainID
      model.turns = sampleTurns(now)
      model.followupsLeft = 3
      if state == "quota" { model.turns = Array(model.turns.prefix(1)) }
    }
    if state == "history" {
      Task { @MainActor in
        try? await Task.sleep(nanoseconds: 1_200_000_000)
        model.showingHistory = true
      }
    }
  }

  @MainActor static func open(_ conversation: NativeAskConversation, into model: NativeAskModel) {
    model.conversationID = conversation.id
    if conversation.id == mainID {
      model.turns = sampleTurns(Date())
      return
    }
    var turn = NativeAskTurn(id: "preview-\(conversation.id)", question: conversation.title)
    turn.answer = "This is a preview of a saved conversation. In the app, the full answer loads here."
    turn.model = "Gemini 2.5 Flash · Google"
    turn.answerID = 2
    turn.sentAt = conversation.updated ?? Date()
    model.turns = [turn]
    model.followupsLeft = 4
  }

  static func sampleTurns(_ now: Date) -> [NativeAskTurn] {
    var party = NativeAskTurn(id: "preview-1", question: "How is my party doing, and where should I campaign next?")
    party.answer = """
    ## Where your party stands

    Your party holds **142 of 435 seats** in the House and polls at **31.4%** nationally, up 2.1 points since the last election.

    | State | Your share | Change |
    | --- | ---: | ---: |
    | Pennsylvania | 38.2% | +3.4% |
    | Ohio | 35.9% | +1.8% |
    | Georgia | 27.5% | -2.2% |
    | Arizona | 24.1% | -0.6% |

    ### Where to campaign

    1. **Georgia** gives the best return: two close House seats and falling turnout.
    2. **Arizona** has a Senate race inside 2 points, so one rally can move it.
    3. Hold **Pennsylvania** with a fundraiser rather than a rally.

    > Campaign actions cost action points. You have 6 left this turn.

    See the [elections page](/elections) for every race.
    """
    party.model = "Gemini 2.5 Flash · Google"
    party.usedLive = true
    party.liveSources = ["Elections", "Polling"]
    party.citations = [
      NativeAskCitation(label: "Campaigning and rallies", path: "", url: URL(string: "https://ahousedividedgame.com/wiki")),
      NativeAskCitation(label: "How elections are scored", path: "", url: nil),
    ]
    party.answerID = 1
    party.feedback = "up"
    party.sentAt = now.addingTimeInterval(-300)

    var growth = NativeAskTurn(id: "preview-2", question: "Show GDP growth by country on a map")
    growth.answer = """
    Here is real GDP growth over the last four turns.

    ```ahd-map
    {"scope":"world","title":"GDP growth, last four turns","metric":"GDP growth","unit":"%","palette":"good","regions":[{"id":"US","label":"United States","value":2.8},{"id":"UK","label":"United Kingdom","value":1.6},{"id":"DE","label":"West Germany","value":3.9},{"id":"JP","label":"Japan","value":5.2},{"id":"FR","label":"France","value":2.4},{"id":"IT","label":"Italy","value":2.1},{"id":"BR","label":"Brazil","value":4.4},{"id":"CN","label":"China","value":3.1}]}
    ```

    ```mermaid
    xychart-beta
      title "GDP growth by country"
      x-axis ["Japan", "Brazil", "West Germany", "China", "United States", "France"]
      y-axis "Growth (%)" 0 --> 6
      bar [5.2, 4.4, 3.9, 3.1, 2.8, 2.4]
    ```

    **Japan** leads on export demand. The **United Kingdom** trails because its central bank rate is the highest in the group.
    """
    growth.model = "Gemini 2.5 Flash · Google"
    growth.usedLive = true
    growth.liveSources = ["Economy"]
    growth.answerID = 2
    growth.followups = [
      "Why is the United Kingdom growing slowly?",
      "Compare unemployment in the same countries",
      "What would a rate cut do to UK growth?",
    ]
    growth.sentAt = now.addingTimeInterval(-120)
    return [party, growth]
  }
}
