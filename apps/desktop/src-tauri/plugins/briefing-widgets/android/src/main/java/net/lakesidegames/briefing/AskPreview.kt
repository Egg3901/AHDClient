package net.lakesidegames.briefing

/**
 * A canned account and chat for design review (`ahdclient://ask?preview=1`).
 * Nothing here touches the network, cookies or saved consent.
 */
internal object AskPreview {
  private const val CURRENT = "preview-senate"

  fun fill(session: AskSession) {
    val now = System.currentTimeMillis()
    val hour = 3_600_000L
    val day = 24 * hour
    session.setPreviewState(
      name = "Margaret Hale",
      quota = AskUsage(used = 3.0, limit = 10.0, remaining = 7.0, liveRemaining = 4.0, liveLimit = 5.0,
        vizRemaining = 2.0, vizLimit = 3.0, resetAt = now + 3 * hour + 20 * 60_000L, tier = null),
      list = listOf(
        AskConversationSummary("preview-turns", "Turn order cheat sheet", now - 12 * day, pinned = true),
        AskConversationSummary(CURRENT, "How Senate elections work", now - 20 * 60_000L, pinned = false),
        AskConversationSummary("preview-money", "Raising money for a campaign", now - 3 * hour, pinned = false),
        AskConversationSummary("preview-approval", "Why did my approval drop?", now - day - 2 * hour, pinned = false),
        AskConversationSummary("preview-tax", "Corporate tax and dividends", now - 3 * day, pinned = false),
        AskConversationSummary("preview-filibuster", "Filibuster rules in the Senate", now - 9 * day, pinned = false),
        AskConversationSummary("preview-start", "Best first actions for a new character", now - 40 * day, pinned = false),
      )
    )
    session.draft = ""
    fillConversation(session, CURRENT)
  }

  fun fillConversation(session: AskSession, id: String) {
    if (id != CURRENT) {
      val message = session.newMessage("What should I focus on this turn?").apply {
        answer = "Start with the actions that compound. **Fundraising** early in a cycle pays for every later campaign action, " +
          "and **policy statements** move approval slowly but last.\n\n" +
          "- Check your [character page](/character) for the actions you have left.\n" +
          "- Keep at least one action spare for events."
        answerId = 2
        model = "Sample model · Sample service"
        state = AskMessageState.DONE
      }
      session.replaceThread(id, listOf(message), 4)
      return
    }
    val seats = session.newMessage("Which parties gained the most seats last cycle?").apply {
      answer = "Two parties gained ground and one lost it. Here is the change in seats across both chambers:\n\n" +
        "```mermaid\nxychart-beta\n  title \"Seat change, last cycle\"\n" +
        "  x-axis [\"Federalist\", \"Liberty\", \"Progressive\", \"Republican\"]\n" +
        "  y-axis \"Seats\" -14 --> 14\n  bar [12, 5, -3, -14]\n```\n\n" +
        "The Federalists picked up most of their seats in close Midwest races."
      answerId = 1
      model = "Sample model · Sample service"
      liveSources = listOf("Elections", "Parties")
      feedback = "up"
      state = AskMessageState.DONE
    }
    val senate = session.newMessage("How do Senate elections work in my state?").apply {
      answer = "## Senate elections\n\n" +
        "Each state elects **two senators** to staggered six-year terms, so about a third of seats are up every cycle. " +
        "Your state's next race is open for filing now.\n\n" +
        "1. **File** for the seat during the filing window.\n" +
        "2. **Win the primary** if another member of your party files.\n" +
        "3. **Campaign** in the general election. Rallies and ads raise your share; scandals lower it.\n\n" +
        "| Stage | Turns | What counts |\n" +
        "| --- | ---: | --- |\n" +
        "| Filing | 2 | Party membership |\n" +
        "| Primary | 4 | Party support, funds |\n" +
        "| General | 6 | Approval, campaign spend |\n\n" +
        "> Tip: a strong primary result carries momentum into the general, so do not skip it when you are unopposed.\n\n" +
        "See the [elections page](/elections) for the races in your state, or ask about `campaign spending` limits."
      answerId = 3
      model = "Sample model · Sample service"
      citations = listOf(AskCitation("Elections guide", null), AskCitation("Campaign actions", null), AskCitation("Senate rules", null))
      liveSources = listOf("Your character", "Elections")
      followups = listOf("How much should I spend on my campaign?", "Who else is running in my state?", "What happens if I lose the primary?")
      state = AskMessageState.DONE
    }
    session.replaceThread(CURRENT, listOf(seats, senate), 3)
  }
}
