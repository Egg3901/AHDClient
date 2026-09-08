import SwiftUI
import WidgetKit

struct BriefingEntry: TimelineEntry {
  let date: Date
  let saved: SavedBriefing?
}

struct BriefingProvider: TimelineProvider {
  func placeholder(in context: Context) -> BriefingEntry { BriefingEntry(date: Date(), saved: nil) }
  func getSnapshot(in context: Context, completion: @escaping (BriefingEntry) -> Void) {
    completion(BriefingEntry(date: Date(), saved: context.isPreview ? nil : BriefingStore.read()))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<BriefingEntry>) -> Void) {
    BriefingStore.refresh { saved in
      let now = Date()
      // A later entry clears expired stats even if the OS delays networking.
      let expiry = max(now.addingTimeInterval(1), (saved?.updatedAt ?? now).addingTimeInterval(86400))
      completion(Timeline(entries: [BriefingEntry(date: now, saved: saved), BriefingEntry(date: expiry, saved: nil)],
        policy: .after(now.addingTimeInterval(1800))))
    }
  }
}

struct BriefingWidgetView: View {
  let entry: BriefingEntry
  let section: String
  @Environment(\.widgetFamily) var family
  private let gold = Color(red: 0.9, green: 0.76, blue: 0.48)
  private let background = Color(red: 0.078, green: 0.078, blue: 0.11)

  private func number(_ value: Double?, suffix: String = "") -> String {
    guard let value = value, value.isFinite else { return "Unavailable" }
    let units: [(Double, String)] = [(1e9, "B"), (1e6, "M"), (1e4, "K")]
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.maximumFractionDigits = 1
    for (threshold, symbol) in units where abs(value) >= threshold {
      let divisor = symbol == "K" ? 1000 : threshold
      return (formatter.string(from: NSNumber(value: value / divisor)) ?? "0") + symbol + suffix
    }
    return (formatter.string(from: NSNumber(value: value)) ?? "0") + suffix
  }

  private var title: String {
    if section == "profile" { return entry.saved?.data.name ?? "Profile" }
    if section == "corporation" { return entry.saved?.data.corpNav?.name ?? "Corporation" }
    return "Your election"
  }

  private var rows: [(String, String)] {
    guard let data = entry.saved?.data else { return [] }
    if section == "profile" {
      let currency = data.homeCurrency.map { " \($0)" } ?? ""
      if data.isImperial == true { return [("Personal cash", number(data.personalHomeLiquid, suffix: currency))] }
      return [("Actions", number(data.actions)), ("Campaign funds", number(data.funds, suffix: currency)),
        ("Cash", number(data.personalHomeLiquid, suffix: currency)), ("Favorability", number(data.favorability, suffix: "%"))]
    }
    if section == "election", let election = data.electionStats {
      var result = [("Vote share", number(election.myVotePct, suffix: "%")), ("Margin", number(election.marginPct, suffix: " pp"))]
      if election.isMultiSeat == true { result.append(("Projected seats", number(election.seatsProjected))) }
      return result
    }
    if section == "corporation", let corp = data.corpNav {
      let currency = corp.liquidCurrencyCode.map { " \($0)" } ?? ""
      return [("Share price", number(corp.sharePrice, suffix: currency)), ("Change", number(corp.priceChange1h, suffix: "%")),
        ("Capital", number(corp.liquidCapital, suffix: currency))]
    }
    return []
  }

  private var emptyMessage: String {
    guard let saved = entry.saved else { return "Open AHDClient and sign in to Multiplayer." }
    if saved.data.status == "no-character" { return "Choose a character in the app." }
    if section == "election" { return "No election tally available yet." }
    return "Your character does not lead a corporation."
  }

  private var content: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("AHD · MULTIPLAYER").font(.system(size: 9, weight: .semibold)).foregroundColor(.secondary)
      Text(title).font(.headline).lineLimit(1).minimumScaleFactor(0.75)
      if rows.isEmpty {
        Text(emptyMessage).font(.caption).foregroundColor(.secondary)
      } else {
        ForEach(Array(rows.prefix(family == .systemSmall ? 2 : 4).enumerated()), id: \.offset) { _, row in
          HStack { Text(row.0).foregroundColor(.secondary); Spacer(); Text(row.1).foregroundColor(gold).monospacedDigit() }
            .font(.caption).lineLimit(1).minimumScaleFactor(0.65)
        }
      }
      Spacer(minLength: 0)
      if let saved = entry.saved {
        HStack(spacing: 3) { Text("Updated"); Text(saved.updatedAt, style: .relative); Text("ago") }
          .font(.system(size: 9)).foregroundColor(.secondary).lineLimit(1)
      }
    }
    .padding(14).foregroundColor(Color(red: 0.95, green: 0.93, blue: 0.9))
    .privacySensitive()
    .widgetURL(URL(string: "ahdclient://briefing/\(section)"))
  }

  var body: some View {
    if #available(iOSApplicationExtension 17.0, *) {
      content.containerBackground(background, for: .widget)
    } else { content.background(background) }
  }
}

struct AHDProfileWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "AHDProfile", provider: BriefingProvider()) { BriefingWidgetView(entry: $0, section: "profile") }
      .configurationDisplayName("AHD Profile").description("Actions, campaign funds and personal cash.")
      .supportedFamilies([.systemSmall, .systemMedium])
  }
}
struct AHDElectionWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "AHDElection", provider: BriefingProvider()) { BriefingWidgetView(entry: $0, section: "election") }
      .configurationDisplayName("AHD Election").description("Your vote share, margin and projected seats.")
      .supportedFamilies([.systemSmall, .systemMedium])
  }
}
struct AHDCorporationWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "AHDCorporation", provider: BriefingProvider()) { BriefingWidgetView(entry: $0, section: "corporation") }
      .configurationDisplayName("AHD Corporation").description("Share price, price change and liquid capital.")
      .supportedFamilies([.systemSmall, .systemMedium])
  }
}

@main
struct AHDWidgets: WidgetBundle {
  var body: some Widget { AHDProfileWidget(); AHDElectionWidget(); AHDCorporationWidget() }
}
