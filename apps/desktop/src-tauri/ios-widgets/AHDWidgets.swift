import SwiftUI
import UIKit
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
  private let ink = Color(red: 0.09, green: 0.08, blue: 0.12)
  private let red = Color(red: 0.63, green: 0.10, blue: 0.14)
  private let gain = Color(red: 0.36, green: 0.78, blue: 0.48)
  private let loss = Color(red: 0.93, green: 0.38, blue: 0.36)

  private var accent: Color {
    section == "election" ? Color(red: 0.42, green: 0.62, blue: 0.86) :
      section == "corporation" || section == "stocks" ? gold : Color(red: 0.86, green: 0.30, blue: 0.32)
  }

  private var sectionName: String {
    section == "profile" ? "Profile" : section == "election" ? "Election" : section == "stocks" ? "Stocks" : "Corporation"
  }

  private func number(_ value: Double?, suffix: String = "") -> String {
    guard let value = value, value.isFinite else { return "–" }
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
      return watched.tickerSymbol.map { "$\($0.uppercased())" } ?? watched.name
    }
    if section == "corporation" { return entry.saved?.data.corpNav?.name ?? "Corporation" }
    return "Your election"
  }

  /// The identity line under the name, like the page mastheads.
  private var subtitle: String {
    if section == "stocks", let watched = entry.saved?.data.marketWatch?.first { return watched.name }
    if section == "corporation", let ticker = entry.saved?.data.corpNav?.tickerSymbol, !ticker.isEmpty {
      return "$\(ticker.uppercased())"
    }
    if section == "election", let election = entry.saved?.data.electionStats {
      let parts = [election.electionType, election.state ?? election.countryId].compactMap { $0 }.filter { !$0.isEmpty }
      if !parts.isEmpty { return parts.joined(separator: " · ") }
    }
    return sectionName
  }

  private var identityImage: UIImage? {
    guard let bytes = entry.saved?.images?[section == "profile" || section == "election" ? "avatar" : section] else { return nil }
    return UIImage(data: bytes)
  }

  private var monogram: String {
    let words = title.replacingOccurrences(of: "$", with: "").split(separator: " ").prefix(2)
    let letters = words.compactMap(\.first)
    return letters.isEmpty ? "A" : String(letters).uppercased()
  }

  /// The one large figure, its label, and an optional signed change.
  private var hero: (label: String, value: String, change: Double?)? {
    guard let data = entry.saved?.data else { return nil }
    if section == "profile" {
      let currency = data.homeCurrency.map { " \($0)" } ?? ""
      if data.isImperial == true { return ("Personal cash", number(data.personalHomeLiquid, suffix: currency), nil) }
      let actions = data.actionCap.map { "\(number(data.actions)) / \(number($0))" } ?? number(data.actions)
      return ("Actions", actions, nil)
    }
    if section == "election", let election = data.electionStats {
      return ("Vote share", number(election.myVotePct, suffix: "%"), nil)
    }
    if section == "stocks", let watched = data.marketWatch?.first {
      let currency = watched.liquidCurrencyCode.map { " \($0)" } ?? ""
      return ("Quote", number(watched.sharePrice, suffix: currency), nil)
    }
    if section == "corporation", let corp = data.corpNav {
      let currency = corp.liquidCurrencyCode.map { " \($0)" } ?? ""
      return ("Share price", number(corp.sharePrice, suffix: currency), corp.priceChange1h)
    }
    return nil
  }

  /// The labelled figures beside or under the hero.
  private var figures: [(String, String)] {
    guard let data = entry.saved?.data else { return [] }
    if section == "profile" {
      if data.isImperial == true { return [] }
      let currency = data.homeCurrency.map { " \($0)" } ?? ""
      return [("Campaign funds", number(data.funds, suffix: currency)), ("Cash", number(data.personalHomeLiquid, suffix: currency)),
        ("Favorability", number(data.favorability, suffix: "%"))]
    }
    if section == "election", let election = data.electionStats {
      var result = [("Margin", number(election.marginPct, suffix: " pp"))]
      if election.isMultiSeat == true {
        let seats = election.totalSeats.map { "\(number(election.seatsProjected)) / \(number($0))" } ?? number(election.seatsProjected)
        result.append(("Projected seats", seats))
      }
      return result
    }
    if section == "stocks", let watched = data.marketWatch?.first {
      return [("Shares owned", number(watched.ownedShares))]
    }
    if section == "corporation", let corp = data.corpNav {
      let currency = corp.liquidCurrencyCode.map { " \($0)" } ?? ""
      return [("Capital", number(corp.liquidCapital, suffix: currency)), ("Marketing", number(corp.marketingStrength))]
    }
    return []
  }

  private var emptyMessage: String {
    guard let saved = entry.saved else { return "Open the app and sign in to multiplayer." }
    if saved.data.status == "no-character" { return "Choose a character in the app." }
    if section == "election" { return "No election tally yet." }
    if section == "stocks" { return "No watched stocks yet." }
    return "Your character does not lead a corporation."
  }

  private var mark: some View {
    Group {
      if let image = UIImage(named: "ahd-mark") {
        Image(uiImage: image).resizable().scaledToFit()
      } else {
        Text("AHD").font(.system(size: 9, weight: .black, design: .serif)).foregroundColor(cream.opacity(0.7))
      }
    }.frame(width: 18, height: 18).opacity(0.9)
  }

  private func identity(size: CGFloat) -> some View {
    let round = section == "profile" || section == "election"
    let shape = RoundedRectangle(cornerRadius: round ? size / 2 : size * 0.22, style: .continuous)
    return ZStack {
      if let image = identityImage {
        Image(uiImage: image).resizable().scaledToFill()
      } else if entry.saved == nil, let markImage = UIImage(named: "ahd-mark") {
        Image(uiImage: markImage).resizable().scaledToFit()
      } else {
        LinearGradient(colors: [accent.opacity(0.85), red], startPoint: .topLeading, endPoint: .bottomTrailing)
        Text(monogram).font(.system(size: size * 0.36, weight: .semibold, design: .serif)).foregroundColor(cream)
      }
    }
    .frame(width: size, height: size)
    .clipShape(shape)
    .overlay(shape.stroke(Color.white.opacity(0.14), lineWidth: 0.5))
  }

  private var header: some View {
    HStack(alignment: .center, spacing: 8) {
      identity(size: family == .systemSmall ? 30 : 36)
      VStack(alignment: .leading, spacing: 1) {
        Text(title).font(.system(size: family == .systemSmall ? 14 : 16, weight: .semibold, design: .serif))
          .foregroundColor(cream).lineLimit(1).minimumScaleFactor(0.7)
        Text(subtitle.uppercased()).font(.system(size: 8, weight: .semibold)).tracking(0.6)
          .foregroundColor(accent).lineLimit(1)
      }
      Spacer(minLength: 2)
      if family != .systemSmall { mark }
    }
  }

  private func label(_ text: String) -> some View {
    Text(text.uppercased()).font(.system(size: 8, weight: .medium)).tracking(0.4)
      .foregroundColor(cream.opacity(0.5)).lineLimit(1)
  }

  private func heroView(_ hero: (label: String, value: String, change: Double?)) -> some View {
    VStack(alignment: .leading, spacing: 1) {
      label(hero.label)
      HStack(alignment: .firstTextBaseline, spacing: 5) {
        Text(hero.value).font(.system(size: family == .systemSmall ? 20 : 24, weight: .semibold, design: .rounded))
          .monospacedDigit().foregroundColor(cream).lineLimit(1).minimumScaleFactor(0.55)
        if let change = hero.change, change.isFinite {
          Text((change >= 0 ? "+" : "") + number(change, suffix: "%"))
            .font(.system(size: 11, weight: .semibold)).monospacedDigit()
            .foregroundColor(change >= 0 ? gain : loss).lineLimit(1)
        }
      }
    }
  }

  /// One table row: label left, value right, like the profile standing table.
  private func figure(_ item: (String, String)) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 6) {
      label(item.0)
      Spacer(minLength: 4)
      Text(item.1).font(.system(size: 12, weight: .medium)).monospacedDigit()
        .foregroundColor(cream).lineLimit(1).minimumScaleFactor(0.6)
    }
  }

  private var rule: some View { Rectangle().fill(Color.white.opacity(0.1)).frame(height: 0.5) }

  @ViewBuilder private var footer: some View {
    if let saved = entry.saved {
      HStack(spacing: 3) {
        Circle().fill(gain.opacity(0.85)).frame(width: 4, height: 4)
        Text(saved.updatedAt, style: .relative)
      }.font(.system(size: 8, weight: .medium)).foregroundColor(cream.opacity(0.45)).lineLimit(1)
    } else {
      Text("TAP TO OPEN").font(.system(size: 8, weight: .bold)).tracking(0.5).foregroundColor(gold.opacity(0.8))
    }
  }

  @ViewBuilder private var body_: some View {
    if let hero = hero {
      if family == .systemSmall {
        VStack(alignment: .leading, spacing: 5) {
          header
          Spacer(minLength: 0)
          heroView(hero)
          if let first = figures.first { rule; figure(first) }
          footer
        }
      } else {
        VStack(alignment: .leading, spacing: 7) {
          header
          rule
          HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
              heroView(hero)
              Spacer(minLength: 0)
              footer
            }.frame(maxWidth: .infinity, alignment: .leading)
            if !figures.isEmpty {
              Rectangle().fill(Color.white.opacity(0.1)).frame(width: 0.5)
              VStack(alignment: .leading, spacing: 7) {
                ForEach(Array(figures.prefix(3).enumerated()), id: \.offset) { _, item in figure(item) }
                Spacer(minLength: 0)
              }.frame(maxWidth: .infinity, alignment: .leading)
            }
          }
        }
      }
    } else {
      VStack(alignment: .leading, spacing: 8) {
        header
        if family != .systemSmall { rule }
        Text(emptyMessage).font(.system(size: 11, weight: .medium)).foregroundColor(cream.opacity(0.7))
          .lineLimit(3).fixedSize(horizontal: false, vertical: true)
        Spacer(minLength: 0)
        footer
      }
    }
  }

  private var backdrop: some View {
    ZStack {
      LinearGradient(colors: [navy, ink], startPoint: .topLeading, endPoint: .bottomTrailing)
      RadialGradient(colors: [accent.opacity(0.16), .clear], center: .topLeading, startRadius: 0, endRadius: 180)
    }
  }

  var body: some View {
    // On iOS 17+ the backdrop is the container background, so it fills the
    // whole rounded widget and the system margins inset only the content.
    if #available(iOSApplicationExtension 17.0, *) {
      body_
        .privacySensitive()
        .widgetURL(URL(string: "ahdclient://briefing/\(section)"))
        .containerBackground(for: .widget) { backdrop }
    } else {
      body_
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(backdrop)
        .privacySensitive()
        .widgetURL(URL(string: "ahdclient://briefing/\(section)"))
    }
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
