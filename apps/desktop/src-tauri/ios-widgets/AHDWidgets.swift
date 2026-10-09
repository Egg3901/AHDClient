import SwiftUI
import UIKit
import WidgetKit

struct BriefingEntry: TimelineEntry {
  let date: Date
  let saved: SavedBriefing?
}

struct BriefingProvider: TimelineProvider {
  func placeholder(in context: Context) -> BriefingEntry { BriefingEntry(date: Date(), saved: .sample) }
  func getSnapshot(in context: Context, completion: @escaping (BriefingEntry) -> Void) {
    // The widget gallery shows example figures; real stats appear once added.
    completion(BriefingEntry(date: Date(), saved: context.isPreview ? .sample : BriefingStore.read()))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<BriefingEntry>) -> Void) {
    BriefingStore.refresh { saved in
      let now = Date()
      // A later entry clears expired stats even if the OS delays networking.
      let expiry = max(now.addingTimeInterval(1), (saved?.updatedAt ?? now).addingTimeInterval(86400))
      var entries = [BriefingEntry(date: now, saved: saved)]
      var refresh = now.addingTimeInterval(1800)
      if let next = saved?.data.nextTurn, next > now, next < expiry {
        // Flip the countdown at turn time, then fetch once the turn has had a
        // few minutes to finish processing.
        entries.append(BriefingEntry(date: next, saved: saved))
        refresh = min(refresh, max(next.addingTimeInterval(300), now.addingTimeInterval(600)))
      }
      entries.append(BriefingEntry(date: expiry, saved: nil))
      completion(Timeline(entries: entries, policy: .after(refresh)))
    }
  }
}

extension SavedBriefing {
  /// Example figures for the widget gallery and loading placeholder only.
  static var sample: SavedBriefing {
    var data = BriefingStatus()
    data.status = "ready"
    data.name = "Your character"
    data.actions = 7
    data.actionCap = 15
    data.funds = 48_200
    data.personalHomeLiquid = 1_250_000
    data.homeCurrency = "USD"
    data.politicalInfluence = 64
    data.favorability = 52
    data.electionStats = BriefingStatus.ElectionStats(electionId: "000000000000000000000000",
      electionType: "Senate", countryId: "US", state: "Ohio", myVotePct: 47.8, marginPct: 2.4,
      history: [41, 43.5, 44, 46.2, 45.9, 47.8].enumerated().map {
        BriefingStatus.ElectionPoint(turn: Double($0.offset), pct: $0.element, seats: nil)
      })
    data.corpNav = BriefingStatus.CorporationStats(sequentialId: 1, name: "Example Industries",
      tickerSymbol: "EXI", sharePrice: 18.4, priceChange1h: 3.2, liquidCapital: 2_400_000,
      liquidCurrencyCode: "USD", marketingStrength: 41,
      history: [15.1, 15.8, 16.4, 16.1, 17.2, 18.4].enumerated().map {
        BriefingStatus.CorporationPoint(turn: Double($0.offset), sharePrice: $0.element,
          marketingStrength: 41, liquidCapital: 2_400_000)
      })
    data.marketWatch = [
      BriefingStatus.MarketWatchItem(sequentialId: 1, name: "Example Industries", logoUrl: nil,
        tickerSymbol: "EXI", sharePrice: 18.4, liquidCurrencyCode: "USD", ownedShares: 1200),
      BriefingStatus.MarketWatchItem(sequentialId: 2, name: "Lakeside Rail", logoUrl: nil,
        tickerSymbol: "LKR", sharePrice: 6.75, liquidCurrencyCode: "USD", ownedShares: 400),
      BriefingStatus.MarketWatchItem(sequentialId: 3, name: "Northern Steel", logoUrl: nil,
        tickerSymbol: "NST", sharePrice: 31.2, liquidCurrencyCode: "USD", ownedShares: 90),
    ]
    data.turnBriefing = [
      BriefingStatus.TurnChange(category: "election", label: "Vote share", value: 47.8, delta: 1.9,
        unit: "percent", href: "/elections"),
      BriefingStatus.TurnChange(category: "markets", label: "Share price", value: 18.4, delta: 1.2,
        unit: "currency", href: "/corporation/1"),
      BriefingStatus.TurnChange(category: "corporation", label: "Liquid capital", value: 2_400_000,
        delta: -85_000, unit: "currency", href: "/corporation/1"),
    ]
    data.turn = BriefingStatus.TurnClock(current: 50, date: "March 1953, Week 2",
      nextAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(23 * 60)), active: true)
    data.inbox = BriefingStatus.InboxCounts(unread: 3, mail: 1)
    return SavedBriefing(updatedAt: Date(), sessionId: "", data: data)
  }
}

private enum Palette {
  static let gold = Color(red: 0.91, green: 0.72, blue: 0.32)
  static let cream = Color(red: 0.97, green: 0.94, blue: 0.86)
  static let navy = Color(red: 0.035, green: 0.055, blue: 0.09)
  static let ink = Color(red: 0.09, green: 0.08, blue: 0.12)
  static let red = Color(red: 0.63, green: 0.10, blue: 0.14)
  static let gain = Color(red: 0.36, green: 0.78, blue: 0.48)
  static let loss = Color(red: 0.93, green: 0.38, blue: 0.36)
  static let blue = Color(red: 0.42, green: 0.62, blue: 0.86)
}

private enum Format {
  static func number(_ value: Double?, suffix: String = "") -> String {
    guard let value = value, value.isFinite else { return "n/a" }
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

  static func signed(_ value: Double, suffix: String = "") -> String {
    (value > 0 ? "+" : "") + number(value, suffix: suffix)
  }

  static func currency(_ code: String?) -> String { code.map { " \($0)" } ?? "" }

  /// A turn change in its own unit. Vote share moves in percentage points.
  static func change(_ item: BriefingStatus.TurnChange, currency code: String?) -> (value: String, delta: String) {
    switch item.unit {
    case "currency": return (number(item.value, suffix: currency(code)), signed(item.delta, suffix: currency(code)))
    case "percent": return (number(item.value, suffix: "%"), signed(item.delta, suffix: " pp"))
    default: return (number(item.value), signed(item.delta))
    }
  }
}

/// A line through recent values, scaled to its own range, with a soft fill.
private struct Sparkline: View {
  let values: [Double]
  let color: Color

  private func path(in size: CGSize, closed: Bool) -> Path {
    let points = Array(values.filter(\.isFinite).suffix(12))
    var path = Path()
    guard points.count >= 2, let low = points.min(), let high = points.max() else { return path }
    let spread = max(high - low, 0.0001)
    for (index, value) in points.enumerated() {
      let x = size.width * CGFloat(index) / CGFloat(points.count - 1)
      let y = size.height * (1 - CGFloat((value - low) / spread)) * 0.9 + size.height * 0.05
      if index == 0 { path.move(to: CGPoint(x: x, y: y)) } else { path.addLine(to: CGPoint(x: x, y: y)) }
    }
    if closed {
      path.addLine(to: CGPoint(x: size.width, y: size.height))
      path.addLine(to: CGPoint(x: 0, y: size.height))
      path.closeSubpath()
    }
    return path
  }

  var body: some View {
    GeometryReader { geometry in
      ZStack {
        path(in: geometry.size, closed: true)
          .fill(LinearGradient(colors: [color.opacity(0.28), color.opacity(0)], startPoint: .top, endPoint: .bottom))
        path(in: geometry.size, closed: false)
          .stroke(color, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
      }
    }
  }
}

private enum Accessory { case circular, rectangular, inline }

private struct Row {
  let title: String
  let detail: String
  let value: String
  let change: String?
  let positive: Bool
  let path: String?
}

struct BriefingWidgetView: View {
  let entry: BriefingEntry
  let section: String
  @Environment(\.widgetFamily) var family

  private var data: BriefingStatus? { entry.saved?.data }
  private var isSmall: Bool { family == .systemSmall }
  private var isLarge: Bool { family == .systemLarge }

  private var accessory: Accessory? {
    if #available(iOSApplicationExtension 16.0, *) {
      switch family {
      case .accessoryCircular: return .circular
      case .accessoryRectangular: return .rectangular
      case .accessoryInline: return .inline
      default: return nil
      }
    }
    return nil
  }

  private var accent: Color {
    section == "election" ? Palette.blue :
      section == "corporation" || section == "stocks" ? Palette.gold :
      section == "overview" ? Palette.cream : Color(red: 0.86, green: 0.30, blue: 0.32)
  }

  private var sectionName: String {
    switch section {
    case "profile": return "Profile"
    case "election": return "Election"
    case "stocks": return "Stocks"
    case "overview": return "Overview"
    default: return "Corporation"
    }
  }

  private var title: String {
    if section == "profile" || section == "overview" { return data?.name ?? sectionName }
    if section == "stocks" {
      if !isSmall, let count = data?.marketWatch?.count, count > 1 { return "Your holdings" }
      if let watched = data?.marketWatch?.first { return watched.tickerSymbol.map { "$\($0.uppercased())" } ?? watched.name }
    }
    if section == "corporation" { return data?.corpNav?.name ?? "Corporation" }
    return "Your election"
  }

  /// The identity line under the name, like the page mastheads.
  private var subtitle: String {
    if section == "overview", let turn = data?.turn {
      return ["Turn \(Int(turn.current))", turn.date].compactMap { $0 }.joined(separator: " · ")
    }
    if section == "stocks", let watched = data?.marketWatch {
      if !isSmall && watched.count > 1 { return "\(watched.count) companies" }
      if let first = watched.first { return first.name }
    }
    if section == "corporation", let ticker = data?.corpNav?.tickerSymbol, !ticker.isEmpty {
      return "$\(ticker.uppercased())"
    }
    if section == "election", let election = data?.electionStats {
      let parts = [election.electionType, election.state ?? election.countryId].compactMap { $0 }.filter { !$0.isEmpty }
      if !parts.isEmpty { return parts.joined(separator: " · ") }
    }
    return sectionName
  }

  private var identityImage: UIImage? {
    let key = section == "corporation" || section == "stocks" ? section : "avatar"
    guard let bytes = entry.saved?.images?[key] else { return nil }
    return UIImage(data: bytes)
  }

  private var monogram: String {
    let words = title.replacingOccurrences(of: "$", with: "").split(separator: " ").prefix(2)
    let letters = words.compactMap(\.first)
    return letters.isEmpty ? "A" : String(letters).uppercased()
  }

  /// How far the vote share moved in the latest recorded turn.
  private var voteChange: Double? {
    guard let history = data?.electionStats?.history, history.count >= 2 else { return nil }
    let delta = history[history.count - 1].pct - history[history.count - 2].pct
    return delta.isFinite && delta != 0 ? delta : nil
  }

  /// The one large figure, its label, and an optional signed change.
  private var hero: (label: String, value: String, change: String?, positive: Bool)? {
    guard let data = data, data.status != "no-character" else { return nil }
    switch section {
    case "profile", "overview":
      if data.isImperial == true {
        return ("Personal cash", Format.number(data.personalHomeLiquid, suffix: Format.currency(data.homeCurrency)), nil, true)
      }
      let actions = data.actionCap.map { "\(Format.number(data.actions)) / \(Format.number($0))" } ?? Format.number(data.actions)
      return ("Actions", actions, nil, true)
    case "election":
      guard let election = data.electionStats else { return nil }
      return ("Vote share", Format.number(election.myVotePct, suffix: "%"),
        voteChange.map { Format.signed($0, suffix: " pp") }, (voteChange ?? 0) >= 0)
    case "stocks":
      guard let watched = data.marketWatch?.first else { return nil }
      return ("Quote", Format.number(watched.sharePrice, suffix: Format.currency(watched.liquidCurrencyCode)), nil, true)
    default:
      guard let corp = data.corpNav else { return nil }
      let change = corp.priceChange1h.flatMap { $0.isFinite ? $0 : nil }
      return ("Share price", Format.number(corp.sharePrice, suffix: Format.currency(corp.liquidCurrencyCode)),
        change.map { Format.signed($0, suffix: "%") }, (change ?? 0) >= 0)
    }
  }

  private var inboxText: String? {
    guard let inbox = data?.inbox else { return nil }
    return inbox.unread > 0 ? "\(Format.number(inbox.unread)) unread" : "All read"
  }

  /// The labelled figures beside or under the hero.
  private var figures: [(String, String)] {
    guard let data = data else { return [] }
    let money = Format.currency(data.homeCurrency)
    switch section {
    case "profile":
      if data.isImperial == true { return [] }
      return [("Campaign funds", Format.number(data.funds, suffix: money)),
        ("Cash", Format.number(data.personalHomeLiquid, suffix: money)),
        ("Favorability", Format.number(data.favorability, suffix: "%")),
        ("Influence", Format.number(data.politicalInfluence))]
    case "overview":
      var result = [(String, String)]()
      if let inbox = inboxText { result.append(("Inbox", inbox)) }
      if let mail = data.inbox?.mail { result.append(("Mail", mail > 0 ? "\(Format.number(mail)) unread" : "All read")) }
      if data.isImperial != true { result.append(("Campaign funds", Format.number(data.funds, suffix: money))) }
      result.append(("Cash", Format.number(data.personalHomeLiquid, suffix: money)))
      return result
    case "election":
      guard let election = data.electionStats else { return [] }
      var result = [("Margin", Format.signed(election.marginPct ?? .nan, suffix: " pp"))]
      if election.isMultiSeat == true {
        let seats = election.totalSeats.map { "\(Format.number(election.seatsProjected)) / \(Format.number($0))" }
          ?? Format.number(election.seatsProjected)
        result.append(("Projected seats", seats))
      }
      if let end = election.endTurn, end.isFinite {
        if let now = data.turn?.current, end > now {
          let left = Int(end - now)
          result.append(("Polls close", left == 1 ? "Next turn" : "In \(left) turns"))
        } else {
          result.append(("Polls close", "Turn \(Int(end))"))
        }
      }
      return result
    case "stocks":
      guard let watched = data.marketWatch?.first else { return [] }
      var result = [("Shares owned", Format.number(watched.ownedShares))]
      if let price = watched.sharePrice, price.isFinite {
        result.append(("Holding value", Format.number(price * watched.ownedShares, suffix: Format.currency(watched.liquidCurrencyCode))))
      }
      return result
    default:
      guard let corp = data.corpNav else { return [] }
      let money = Format.currency(corp.liquidCurrencyCode)
      return [("Capital", Format.number(corp.liquidCapital, suffix: money)), ("Marketing", Format.number(corp.marketingStrength))]
    }
  }

  private var chartValues: [Double] {
    if section == "election" { return data?.electionStats?.history?.map(\.pct) ?? [] }
    if section == "corporation" { return data?.corpNav?.history?.map(\.sharePrice) ?? [] }
    return []
  }

  private var chartLabel: String { section == "election" ? "Vote share, recent turns" : "Share price, recent turns" }

  private var holdingRows: [Row] {
    (data?.marketWatch ?? []).map { item in
      let money = Format.currency(item.liquidCurrencyCode)
      return Row(title: item.tickerSymbol.map { "$\($0.uppercased())" } ?? item.name,
        detail: "\(Format.number(item.ownedShares)) shares", value: Format.number(item.sharePrice, suffix: money),
        change: item.sharePrice.map { Format.number($0 * item.ownedShares, suffix: money) }, positive: true,
        path: "/corporation/\(item.sequentialId)")
    }
  }

  private var changeRows: [Row] {
    let money = data?.corpNav?.liquidCurrencyCode
    return (data?.turnBriefing ?? []).filter { item in
      switch section {
      case "corporation": return item.category != "election"
      case "election": return item.category == "election"
      default: return true
      }
    }.map { item in
      let text = Format.change(item, currency: item.category == "election" ? nil : money)
      return Row(title: item.label, detail: item.category.capitalized, value: text.value, change: text.delta,
        positive: item.delta >= 0, path: BriefingStore.gamePath(item.href))
    }
  }

  private var rows: [Row] { section == "stocks" ? holdingRows : changeRows }
  private var rowsTitle: String { section == "stocks" ? "Holdings" : "Latest turn" }

  private var emptyMessage: String {
    guard let saved = entry.saved else { return "Open the app and sign in to multiplayer." }
    if saved.data.status == "no-character" { return "Choose a character in the app." }
    if section == "election" { return "No election tally yet." }
    if section == "stocks" { return "No watched stocks yet." }
    return "Your character does not lead a corporation."
  }

  private var link: URL? {
    switch section {
    case "overview": return URL(string: "ahdclient://briefing/inbox")
    default: return URL(string: "ahdclient://briefing/\(section)")
    }
  }

  // MARK: Pieces

  private var mark: some View {
    Group {
      if let image = UIImage(named: "ahd-mark") {
        Image(uiImage: image).resizable().scaledToFit()
      } else {
        Text("AHD").font(.system(size: 9, weight: .black, design: .serif)).foregroundColor(Palette.cream.opacity(0.7))
      }
    }.frame(width: 18, height: 18).opacity(0.9)
  }

  private func identity(size: CGFloat) -> some View {
    let round = section == "profile" || section == "election" || section == "overview"
    let shape = RoundedRectangle(cornerRadius: round ? size / 2 : size * 0.22, style: .continuous)
    return ZStack {
      if let image = identityImage {
        Image(uiImage: image).resizable().scaledToFill()
      } else if entry.saved == nil, let markImage = UIImage(named: "ahd-mark") {
        Image(uiImage: markImage).resizable().scaledToFit()
      } else {
        LinearGradient(colors: [accent.opacity(0.85), Palette.red], startPoint: .topLeading, endPoint: .bottomTrailing)
        Text(monogram).font(.system(size: size * 0.36, weight: .semibold, design: .serif)).foregroundColor(Palette.cream)
      }
    }
    .frame(width: size, height: size)
    .clipShape(shape)
    .overlay(shape.stroke(Color.white.opacity(0.14), lineWidth: 0.5))
  }

  private var header: some View {
    HStack(alignment: .center, spacing: 8) {
      identity(size: isSmall ? 30 : 36)
      VStack(alignment: .leading, spacing: 1) {
        Text(title).font(.system(size: isSmall ? 14 : 16, weight: .semibold, design: .serif))
          .foregroundColor(Palette.cream).lineLimit(1).minimumScaleFactor(0.7)
        Text(subtitle.uppercased()).font(.system(size: 8, weight: .semibold)).tracking(0.6)
          .foregroundColor(accent).lineLimit(1)
      }
      Spacer(minLength: 2)
      if !isSmall { mark }
    }
  }

  private func label(_ text: String) -> some View {
    Text(text.uppercased()).font(.system(size: 8, weight: .medium)).tracking(0.4)
      .foregroundColor(Palette.cream.opacity(0.5)).lineLimit(1)
  }

  private func heroView(_ hero: (label: String, value: String, change: String?, positive: Bool)) -> some View {
    VStack(alignment: .leading, spacing: 1) {
      label(hero.label)
      HStack(alignment: .firstTextBaseline, spacing: 5) {
        Text(hero.value).font(.system(size: isSmall ? 20 : isLarge ? 28 : 24, weight: .semibold, design: .rounded))
          .monospacedDigit().foregroundColor(Palette.cream).lineLimit(1).minimumScaleFactor(0.55)
        if let change = hero.change {
          Text(change).font(.system(size: 11, weight: .semibold)).monospacedDigit()
            .foregroundColor(hero.positive ? Palette.gain : Palette.loss).lineLimit(1)
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
        .foregroundColor(Palette.cream).lineLimit(1).minimumScaleFactor(0.6)
    }
  }

  private var rule: some View { Rectangle().fill(Color.white.opacity(0.1)).frame(height: 0.5) }

  /// "Next turn 12:34" counting down live, or why there is no countdown.
  @ViewBuilder private var turnClock: some View {
    if let turn = data?.turn {
      if turn.active == false {
        Text("Turns paused")
      } else if let next = data?.nextTurn, next > entry.date {
        (Text("Next turn ") + Text(next, style: .timer)).monospacedDigit()
      } else if data?.nextTurn != nil {
        Text("Next turn running")
      }
    }
  }

  @ViewBuilder private var footer: some View {
    if let saved = entry.saved {
      HStack(spacing: 6) {
        if !isSmall, data?.turn != nil {
          turnClock.foregroundColor(Palette.cream.opacity(0.75))
          Text("·").foregroundColor(Palette.cream.opacity(0.3))
        }
        HStack(spacing: 3) {
          Circle().fill(Palette.gain.opacity(0.85)).frame(width: 4, height: 4)
          Text(saved.updatedAt, style: .relative)
        }
      }.font(.system(size: 8, weight: .medium)).foregroundColor(Palette.cream.opacity(0.45)).lineLimit(1)
    } else {
      Text("TAP TO OPEN").font(.system(size: 8, weight: .bold)).tracking(0.5).foregroundColor(Palette.gold.opacity(0.8))
    }
  }

  private func chart(height: CGFloat) -> some View {
    VStack(alignment: .leading, spacing: 3) {
      if isLarge { label(chartLabel) }
      Sparkline(values: chartValues, color: accent).frame(height: height)
    }
  }

  private func rowView(_ row: Row, compact: Bool) -> some View {
    let content = HStack(alignment: .center, spacing: 8) {
      VStack(alignment: .leading, spacing: 1) {
        Text(row.title).font(.system(size: compact ? 11 : 12, weight: .semibold)).foregroundColor(Palette.cream).lineLimit(1)
        if !compact {
          Text(row.detail.uppercased()).font(.system(size: 7, weight: .medium)).tracking(0.4)
            .foregroundColor(Palette.cream.opacity(0.5)).lineLimit(1)
        }
      }
      Spacer(minLength: 4)
      VStack(alignment: .trailing, spacing: 1) {
        Text(row.value).font(.system(size: compact ? 11 : 12, weight: .medium)).monospacedDigit()
          .foregroundColor(Palette.cream).lineLimit(1).minimumScaleFactor(0.6)
        if let change = row.change {
          Text(change).font(.system(size: 9, weight: .semibold)).monospacedDigit()
            .foregroundColor(section == "stocks" ? Palette.cream.opacity(0.55) : row.positive ? Palette.gain : Palette.loss)
            .lineLimit(1)
        }
      }
    }
    return Group {
      if let path = row.path, let url = URL(string: "ahdclient://page\(path)") {
        Link(destination: url) { content }
      } else {
        content
      }
    }
  }

  private func rowList(limit: Int, compact: Bool) -> some View {
    VStack(alignment: .leading, spacing: compact ? 4 : 6) {
      if !compact { label(rowsTitle) }
      ForEach(Array(rows.prefix(limit).enumerated()), id: \.offset) { _, row in rowView(row, compact: compact) }
    }
  }

  // MARK: Layouts

  private var countdownHero: some View {
    VStack(alignment: .leading, spacing: 1) {
      label("Next turn")
      Group {
        if data?.turn?.active == false {
          Text("Paused")
        } else if let next = data?.nextTurn, next > entry.date {
          Text(next, style: .timer)
        } else {
          Text(data?.nextTurn == nil ? "n/a" : "Running")
        }
      }
      .font(.system(size: isLarge ? 28 : 24, weight: .semibold, design: .rounded)).monospacedDigit()
      .foregroundColor(Palette.cream).lineLimit(1).minimumScaleFactor(0.55)
      if let hero = hero {
        Text("\(hero.label) \(hero.value)").font(.system(size: 10, weight: .medium)).monospacedDigit()
          .foregroundColor(Palette.cream.opacity(0.7)).lineLimit(1)
      }
    }
  }

  private var smallLayout: some View {
    VStack(alignment: .leading, spacing: 5) {
      header
      Spacer(minLength: 0)
      if let hero = hero { heroView(hero) }
      if let first = figures.first { rule; figure(first) }
      footer
    }
  }

  private var mediumLayout: some View {
    VStack(alignment: .leading, spacing: 7) {
      header
      rule
      if section == "stocks", rows.count > 1 {
        rowList(limit: 3, compact: true)
        Spacer(minLength: 0)
        footer
      } else {
        HStack(alignment: .top, spacing: 12) {
          VStack(alignment: .leading, spacing: 4) {
            if section == "overview" { countdownHero } else if let hero = hero { heroView(hero) }
            if chartValues.count >= 2 { chart(height: 18) }
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
  }

  private var largeLayout: some View {
    VStack(alignment: .leading, spacing: 9) {
      header
      rule
      HStack(alignment: .bottom, spacing: 12) {
        if section == "overview" { countdownHero } else if let hero = hero { heroView(hero) }
        Spacer(minLength: 0)
      }
      if chartValues.count >= 2 { chart(height: 54) }
      if !figures.isEmpty {
        VStack(alignment: .leading, spacing: 6) {
          ForEach(Array(figures.prefix(4).enumerated()), id: \.offset) { _, item in figure(item) }
        }
      }
      if !rows.isEmpty {
        rule
        rowList(limit: section == "stocks" ? 5 : 4, compact: false)
      }
      Spacer(minLength: 0)
      footer
    }
  }

  private var emptyLayout: some View {
    VStack(alignment: .leading, spacing: 8) {
      header
      if !isSmall { rule }
      Text(emptyMessage).font(.system(size: 11, weight: .medium)).foregroundColor(Palette.cream.opacity(0.7))
        .lineLimit(3).fixedSize(horizontal: false, vertical: true)
      Spacer(minLength: 0)
      footer
    }
  }

  @ViewBuilder private var homeScreen: some View {
    if hero == nil {
      emptyLayout
    } else if isSmall {
      smallLayout
    } else if isLarge {
      largeLayout
    } else {
      mediumLayout
    }
  }

  // MARK: Lock Screen

  @ViewBuilder private var lockScreen: some View {
    switch accessory {
    case .circular?: circular
    case .inline?: inline
    default: rectangular
    }
  }

  @ViewBuilder private var circular: some View {
    if #available(iOSApplicationExtension 16.0, *) {
      if section == "election", let share = data?.electionStats?.myVotePct, share.isFinite {
        Gauge(value: min(max(share, 0), 100), in: 0...100) {
          Text("VOTE")
        } currentValueLabel: {
          Text(Format.number(share)).privacySensitive()
        }.gaugeStyle(.accessoryCircular)
      } else if let actions = data?.actions, let cap = data?.actionCap, cap > 0, data?.isImperial != true {
        Gauge(value: min(max(actions, 0), cap), in: 0...cap) {
          Text("ACT")
        } currentValueLabel: {
          Text(Format.number(actions)).privacySensitive()
        }.gaugeStyle(.accessoryCircular)
      } else {
        ZStack {
          AccessoryWidgetBackground()
          Text("AHD").font(.system(size: 12, weight: .bold, design: .serif))
        }
      }
    }
  }

  private var inline: some View {
    Group {
      if section == "election", let hero = hero {
        Text("\(hero.label) \(hero.value)" + (hero.change.map { " \($0)" } ?? "")).privacySensitive()
      } else if let next = data?.nextTurn, next > entry.date, data?.turn?.active != false {
        Text("Next turn ") + Text(next, style: .timer)
      } else if let inbox = inboxText {
        Text("Inbox: \(inbox)").privacySensitive()
      } else {
        Text("A House Divided")
      }
    }
  }

  private var rectangular: some View {
    VStack(alignment: .leading, spacing: 1) {
      Text(section == "overview" || section == "profile" ? "A House Divided" : title)
        .font(.system(size: 13, weight: .semibold)).lineLimit(1)
      if let hero = hero {
        Text("\(hero.label) \(hero.value)" + (hero.change.map { " \($0)" } ?? ""))
          .font(.system(size: 12)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7).privacySensitive()
      } else if entry.saved == nil {
        Text("Open the app to sign in").font(.system(size: 12)).lineLimit(1)
      }
      if data?.turn != nil {
        turnClock.font(.system(size: 12)).lineLimit(1)
      } else if let inbox = inboxText {
        Text("Inbox: \(inbox)").font(.system(size: 12)).lineLimit(1).privacySensitive()
      }
    }.frame(maxWidth: .infinity, alignment: .leading)
  }

  private var backdrop: some View {
    ZStack {
      LinearGradient(colors: [Palette.navy, Palette.ink], startPoint: .topLeading, endPoint: .bottomTrailing)
      RadialGradient(colors: [accent.opacity(0.16), .clear], center: .topLeading, startRadius: 0, endRadius: 180)
    }
  }

  var body: some View {
    if accessory != nil {
      // Lock Screen widgets use the system's tinted material, not the card.
      if #available(iOSApplicationExtension 17.0, *) {
        lockScreen.widgetURL(link).containerBackground(for: .widget) { Color.clear }
      } else {
        lockScreen.widgetURL(link)
      }
    } else if #available(iOSApplicationExtension 17.0, *) {
      // On iOS 17+ the backdrop is the container background, so it fills the
      // whole rounded widget and the system margins inset only the content.
      homeScreen
        .privacySensitive()
        .widgetURL(link)
        .containerBackground(for: .widget) { backdrop }
    } else {
      homeScreen
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(backdrop)
        .privacySensitive()
        .widgetURL(link)
    }
  }
}

/// Home Screen sizes plus the Lock Screen sizes on iOS 16 and later.
private func families(_ home: [WidgetFamily], circular: Bool = false, inline: Bool = false) -> [WidgetFamily] {
  var result = home
  if #available(iOSApplicationExtension 16.0, *) {
    if circular { result.append(.accessoryCircular) }
    result.append(.accessoryRectangular)
    if inline { result.append(.accessoryInline) }
  }
  return result
}

struct AHDOverviewWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "AHDOverview", provider: BriefingProvider()) { BriefingWidgetView(entry: $0, section: "overview") }
      .configurationDisplayName("AHD Overview").description("Next turn countdown, actions, unread inbox and mail, and the latest turn's changes.")
      .supportedFamilies(families([.systemMedium, .systemLarge], inline: true))
  }
}
struct AHDProfileWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "AHDProfile", provider: BriefingProvider()) { BriefingWidgetView(entry: $0, section: "profile") }
      .configurationDisplayName("AHD Profile").description("Actions, campaign funds, cash, favorability and influence.")
      .supportedFamilies(families([.systemSmall, .systemMedium, .systemLarge], circular: true, inline: true))
  }
}
struct AHDElectionWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "AHDElection", provider: BriefingProvider()) { BriefingWidgetView(entry: $0, section: "election") }
      .configurationDisplayName("AHD Election").description("Vote share and its trend, margin, projected seats and when polls close.")
      .supportedFamilies(families([.systemSmall, .systemMedium, .systemLarge], circular: true, inline: true))
  }
}
struct AHDCorporationWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "AHDCorporation", provider: BriefingProvider()) { BriefingWidgetView(entry: $0, section: "corporation") }
      .configurationDisplayName("AHD Corporation").description("Share price and its trend, liquid capital and marketing.")
      .supportedFamilies(families([.systemSmall, .systemMedium, .systemLarge]))
  }
}
struct AHDStocksWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "AHDStocks", provider: BriefingProvider()) { BriefingWidgetView(entry: $0, section: "stocks") }
      .configurationDisplayName("AHD Stocks").description("Quotes and holding values for the companies you own shares in.")
      .supportedFamilies(families([.systemSmall, .systemMedium, .systemLarge]))
  }
}

@main
struct AHDWidgets: WidgetBundle {
  var body: some Widget {
    AHDOverviewWidget(); AHDProfileWidget(); AHDElectionWidget(); AHDCorporationWidget(); AHDStocksWidget()
  }
}
