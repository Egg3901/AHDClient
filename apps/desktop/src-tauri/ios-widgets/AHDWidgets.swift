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
  private let gold = Color(red: 0.91, green: 0.72, blue: 0.32)
  private let cream = Color(red: 0.97, green: 0.94, blue: 0.86)
  private let navy = Color(red: 0.035, green: 0.055, blue: 0.09)
  private let red = Color(red: 0.63, green: 0.10, blue: 0.14)

  private var accent: Color {
    section == "election" ? Color(red: 0.24, green: 0.45, blue: 0.68) :
      section == "corporation" ? gold : red
  }

  private var sectionName: String {
    section == "profile" ? "Profile" : section == "election" ? "Election" : section == "stocks" ? "Stocks" : "Corporation"
  }

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
    if section == "stocks", let watched = entry.saved?.data.marketWatch?.first {
      return watched.tickerSymbol.map { "$\($0)" } ?? watched.name
    }
    if section == "corporation" { return entry.saved?.data.corpNav?.name ?? "Corporation" }
    return "Your election"
  }

  private var identityURL: URL? {
    let value = section == "stocks" ? entry.saved?.data.marketWatch?.first?.logoUrl
      : section == "corporation" ? entry.saved?.data.corpNav?.logoUrl : entry.saved?.data.avatarUrl
    return value.flatMap(URL.init(string:))
  }

  private var monogram: String {
    let words = title.split(separator: " ").prefix(2)
    let letters = words.compactMap(\.first)
    return letters.isEmpty ? "A" : String(letters).uppercased()
  }

  private var subtitle: String {
    if section == "stocks", let watched = entry.saved?.data.marketWatch?.first { return watched.name }
    if section == "corporation", let ticker = entry.saved?.data.corpNav?.tickerSymbol, !ticker.isEmpty {
      return "$\(ticker.uppercased())"
    }
    return sectionName
  }

  private var rows: [(String, String)] {
    guard let data = entry.saved?.data else { return [] }
    if section == "profile" {
      let currency = data.homeCurrency.map { " \($0)" } ?? ""
      if data.isImperial == true { return [("Personal cash", number(data.personalHomeLiquid, suffix: currency))] }
      let actions = data.actionCap.map { "\(number(data.actions)) / \(number($0))" } ?? number(data.actions)
      return [("Actions", actions), ("Campaign funds", number(data.funds, suffix: currency)),
        ("Cash", number(data.personalHomeLiquid, suffix: currency)), ("Favorability", number(data.favorability, suffix: "%"))]
    }
    if section == "election", let election = data.electionStats {
      var result = [("Vote share", number(election.myVotePct, suffix: "%")), ("Margin", number(election.marginPct, suffix: " pp"))]
      if election.isMultiSeat == true { result.append(("Projected seats", number(election.seatsProjected))) }
      return result
    }
    if section == "stocks", let watched = data.marketWatch?.first {
      let currency = watched.liquidCurrencyCode.map { " \($0)" } ?? ""
      return [("Quote", number(watched.sharePrice, suffix: currency)), ("Owned", number(watched.ownedShares))]
    }
    if section == "corporation", let corp = data.corpNav {
      let currency = corp.liquidCurrencyCode.map { " \($0)" } ?? ""
      return [("Share price", number(corp.sharePrice, suffix: currency)), ("Change", number(corp.priceChange1h, suffix: "%")),
        ("Capital", number(corp.liquidCapital, suffix: currency)), ("Marketing", number(corp.marketingStrength))]
    }
    return []
  }

  private var emptyMessage: String {
    guard let saved = entry.saved else { return "Open AHDClient and sign in to Multiplayer." }
    if saved.data.status == "no-character" { return "Choose a character in the app." }
    if section == "election" { return "No election tally available yet." }
    return "Your character does not lead a corporation."
  }

  private func identityImage(size: CGFloat) -> some View {
    AsyncImage(url: identityURL) { phase in
      if case .success(let image) = phase {
        image.resizable().scaledToFill()
      } else {
        ZStack {
          LinearGradient(colors: [accent.opacity(0.8), red], startPoint: .topLeading, endPoint: .bottomTrailing)
          Text(monogram).font(.system(size: size * 0.32, weight: .bold, design: .serif)).foregroundColor(cream)
        }
      }
    }
    .frame(width: size, height: size)
    .clipShape(RoundedRectangle(cornerRadius: size * 0.25, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: size * 0.25, style: .continuous).stroke(Color.white.opacity(0.12)))
  }

  private func metricTile(_ row: (String, String)) -> some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(row.0.uppercased()).font(.system(size: 7, weight: .semibold)).tracking(0.35)
        .foregroundColor(cream.opacity(0.48)).lineLimit(1)
      Text(row.1).font(.system(size: 13, weight: .semibold)).foregroundColor(cream)
        .monospacedDigit().lineLimit(1).minimumScaleFactor(0.62)
    }
    .frame(maxWidth: .infinity, minHeight: 35, alignment: .leading)
    .padding(.horizontal, 9).padding(.vertical, 7)
    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.white.opacity(0.055)))
  }

  private var content: some View {
    ZStack {
      LinearGradient(colors: [navy, Color(red: 0.09, green: 0.08, blue: 0.12)], startPoint: .topLeading, endPoint: .bottomTrailing)
      VStack(alignment: .leading, spacing: 9) {
        HStack(spacing: 10) {
          identityImage(size: family == .systemSmall ? 38 : 44)
          VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.system(size: 16, weight: .bold, design: .serif)).foregroundColor(cream)
              .lineLimit(1).minimumScaleFactor(0.7)
            Text(subtitle.uppercased()).font(.system(size: 8, weight: .bold)).tracking(0.65).foregroundColor(accent)
          }
          Spacer(minLength: 4)
          Text("AHD").font(.system(size: 10, weight: .black, design: .serif)).foregroundColor(cream.opacity(0.72))
        }
        if rows.isEmpty {
          HStack(alignment: .top, spacing: 7) {
            Image(systemName: "person.crop.circle.badge.exclamationmark").foregroundColor(accent)
            Text(emptyMessage).font(.system(size: 11, weight: .medium)).foregroundColor(cream.opacity(0.72)).fixedSize(horizontal: false, vertical: true)
          }
        } else {
          if family == .systemSmall {
            VStack(spacing: 6) {
              ForEach(Array(rows.prefix(2).enumerated()), id: \.offset) { _, row in
                metricTile(row)
              }
            }
          } else {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 7), GridItem(.flexible())], spacing: 7) {
              ForEach(Array(rows.prefix(4).enumerated()), id: \.offset) { _, row in
                metricTile(row)
              }
            }
          }
        }
        Spacer(minLength: 0)
        if let saved = entry.saved {
          HStack(spacing: 4) {
            Circle().fill(Color.green.opacity(0.85)).frame(width: 5, height: 5)
            Text("Updated"); Text(saved.updatedAt, style: .relative); Text("ago")
          }.font(.system(size: 8, weight: .medium)).foregroundColor(cream.opacity(0.5)).lineLimit(1)
        } else {
          Text("TAP TO OPEN MULTIPLAYER").font(.system(size: 8, weight: .bold)).tracking(0.5).foregroundColor(gold.opacity(0.8))
        }
      }.padding(12)
    }
    .privacySensitive()
    .widgetURL(URL(string: "ahdclient://briefing/\(section)"))
  }

  var body: some View {
    if #available(iOSApplicationExtension 17.0, *) {
      content.containerBackground(navy, for: .widget)
    } else { content.background(navy) }
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
struct AHDStocksWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "AHDStocks", provider: BriefingProvider()) { BriefingWidgetView(entry: $0, section: "stocks") }
      .configurationDisplayName("AHD Stocks").description("A market-style quote for your corporation.")
      .supportedFamilies([.systemSmall, .systemMedium])
  }
}

@main
struct AHDWidgets: WidgetBundle {
  var body: some Widget { AHDProfileWidget(); AHDElectionWidget(); AHDCorporationWidget(); AHDStocksWidget() }
}
