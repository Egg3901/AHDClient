import Foundation
import SwiftUI
import UIKit
import WebKit

// Answer rendering. Ports the Ask site's markdown shaping (desktop
// markdown.tsx) to native views: headings, paragraphs with inline styling and
// links, bullet and numbered lists, quotes, code, tables, rules, Ask's
// `ahd-map` maps and the mermaid bar, line and pie charts it generates.

struct NativeAskListItem: Hashable {
  let indent: Int
  let marker: String
  let text: String
}

struct NativeAskChart: Hashable {
  enum Kind: Hashable { case bar, line, pie }
  let kind: Kind
  let title: String
  let axisLabel: String
  let labels: [String]
  let series: [[Double]]
}

enum NativeAskBlock: Hashable {
  case heading(Int, String)
  case paragraph(String)
  case bullets([NativeAskListItem])
  case numbered([NativeAskListItem])
  case quote(String)
  case code(String, String)
  case table([String], [Bool], [[String]])
  case rule
  case map(String)
  case chart(NativeAskChart)
  case diagram(String)
}

enum NativeAskMarkdown {
  static let gameOrigin = "https://ahousedividedgame.com"

  // MARK: Blocks

  static func parse(_ source: String) -> [NativeAskBlock] {
    var blocks: [NativeAskBlock] = []
    let parts = source.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "```")
    for (index, part) in parts.enumerated() {
      if index % 2 == 1 {
        // An unterminated fence while streaming: show it as code for now.
        let newline = part.firstIndex(of: "\n")
        let language = newline.map { part[part.startIndex..<$0].trimmingCharacters(in: .whitespaces).lowercased() } ?? ""
        let body = newline.map { String(part[part.index(after: $0)...]) } ?? part
        let code = body.hasSuffix("\n") ? String(body.dropLast()) : body
        let closed = index < parts.count - 1
        switch language {
        case "ahd-map":
          blocks.append(closed ? .map(code) : .code("", "Preparing map"))
        case "mermaid", "mmd":
          if !closed {
            blocks.append(.code("", "Preparing chart"))
          } else if let parsedChart = chart(from: code) {
            blocks.append(.chart(parsedChart))
          } else {
            blocks.append(.diagram(code))
          }
        default:
          blocks.append(.code(language, code))
        }
        continue
      }
      blocks.append(contentsOf: prose(part))
    }
    return blocks
  }

  private enum LineKind { case blank, heading, rule, quote, bullet, ordered, table, text }

  private static func kind(_ line: String) -> LineKind {
    let trimmed = line.trimmingCharacters(in: .whitespaces)
    if trimmed.isEmpty { return .blank }
    if trimmed.range(of: "^#{1,6}\\s+\\S", options: .regularExpression) != nil { return .heading }
    if trimmed.range(of: "^(?:-{3,}|\\*{3,}|_{3,})$", options: .regularExpression) != nil { return .rule }
    if trimmed.hasPrefix(">") { return .quote }
    if trimmed.range(of: "^[-*+]\\s+", options: .regularExpression) != nil { return .bullet }
    if trimmed.range(of: "^\\d{1,3}[.)]\\s+", options: .regularExpression) != nil { return .ordered }
    if trimmed.hasPrefix("|") && trimmed.dropFirst().contains("|") { return .table }
    return .text
  }

  private static func prose(_ text: String) -> [NativeAskBlock] {
    var blocks: [NativeAskBlock] = []
    let lines = text.components(separatedBy: "\n")
    var index = 0
    func indentLevel(_ line: String) -> Int {
      let spaces = line.prefix { $0 == " " || $0 == "\t" }.reduce(0) { $0 + ($1 == "\t" ? 4 : 1) }
      return min(3, spaces / 2)
    }
    while index < lines.count {
      let line = lines[index]
      switch kind(line) {
      case .blank:
        index += 1
      case .heading:
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        let level = trimmed.prefix { $0 == "#" }.count
        let content = trimmed.drop { $0 == "#" }.trimmingCharacters(in: .whitespaces)
        blocks.append(.heading(level, content.trimmingCharacters(in: CharacterSet(charactersIn: "# "))))
        index += 1
      case .rule:
        blocks.append(.rule)
        index += 1
      case .quote:
        var quoted: [String] = []
        while index < lines.count, kind(lines[index]) == .quote {
          let trimmed = lines[index].trimmingCharacters(in: .whitespaces).dropFirst()
          quoted.append(trimmed.hasPrefix(" ") ? String(trimmed.dropFirst()) : String(trimmed))
          index += 1
        }
        blocks.append(.quote(quoted.joined(separator: "\n")))
      case .bullet, .ordered:
        let ordered = kind(line) == .ordered
        var items: [NativeAskListItem] = []
        while index < lines.count {
          let current = lines[index]
          let currentKind = kind(current)
          if currentKind == .bullet || currentKind == .ordered {
            // A switch between bullets and numbers at the top level starts a new list.
            if indentLevel(current) == 0 && (currentKind == .ordered) != ordered && !items.isEmpty { break }
            let trimmed = current.trimmingCharacters(in: .whitespaces)
            let markerRange = trimmed.range(of: currentKind == .ordered ? "^\\d{1,3}[.)]\\s+" : "^[-*+]\\s+", options: .regularExpression)
            let marker = markerRange.map { String(trimmed[$0]).trimmingCharacters(in: .whitespaces) } ?? ""
            let body = markerRange.map { String(trimmed[$0.upperBound...]) } ?? trimmed
            items.append(NativeAskListItem(indent: indentLevel(current), marker: currentKind == .ordered ? marker.replacingOccurrences(of: ")", with: ".") : "", text: body))
            index += 1
          } else if currentKind == .text, !items.isEmpty, current.hasPrefix("  ") {
            // A wrapped continuation line belongs to the previous item.
            let last = items.removeLast()
            items.append(NativeAskListItem(indent: last.indent, marker: last.marker, text: last.text + " " + current.trimmingCharacters(in: .whitespaces)))
            index += 1
          } else {
            break
          }
        }
        blocks.append(ordered ? .numbered(items) : .bullets(items))
      case .table:
        var rows: [String] = []
        while index < lines.count, kind(lines[index]) == .table {
          rows.append(lines[index])
          index += 1
        }
        if let parsedTable = table(rows) {
          blocks.append(parsedTable)
        } else {
          blocks.append(.paragraph(rows.joined(separator: "\n")))
        }
      case .text:
        var paragraph: [String] = []
        while index < lines.count, kind(lines[index]) == .text {
          paragraph.append(lines[index].trimmingCharacters(in: .whitespaces))
          index += 1
        }
        blocks.append(.paragraph(paragraph.joined(separator: "\n")))
      }
    }
    return blocks
  }

  private static func cells(_ line: String) -> [String] {
    var trimmed = line.trimmingCharacters(in: .whitespaces)
    if trimmed.hasPrefix("|") { trimmed.removeFirst() }
    if trimmed.hasSuffix("|") { trimmed.removeLast() }
    // Escaped pipes stay inside their cell.
    let placeholder = "\u{1F}"
    return trimmed.replacingOccurrences(of: "\\|", with: placeholder).components(separatedBy: "|").map {
      $0.replacingOccurrences(of: placeholder, with: "|").trimmingCharacters(in: .whitespaces)
    }
  }

  private static func table(_ lines: [String]) -> NativeAskBlock? {
    guard lines.count >= 2 else { return nil }
    let separator = cells(lines[1])
    guard !separator.isEmpty, separator.allSatisfy({ $0.range(of: "^:?-{1,}:?$", options: .regularExpression) != nil }) else { return nil }
    let header = cells(lines[0])
    let rows = lines.dropFirst(2).map { row -> [String] in
      var values = cells(row)
      if values.count < header.count { values += Array(repeating: "", count: header.count - values.count) }
      return Array(values.prefix(header.count))
    }
    let alignments = header.indices.map { column -> Bool in
      if column < separator.count, separator[column].hasSuffix(":") { return true }
      let values = rows.map { $0[column] }.filter { !$0.isEmpty }
      return !values.isEmpty && values.allSatisfy(isNumeric)
    }
    return .table(header, alignments, rows)
  }

  static func isNumeric(_ value: String) -> Bool {
    value.range(of: "^[+\\-▲▼]?\\s?[$£€¥]?[\\d,]+(?:\\.\\d+)?\\s?(?:%|[kKmMbBtT]n?|pts?)?$", options: .regularExpression) != nil
  }

  /// Desktop fmtCell: thousands separators for long integers and an arrow for
  /// signed percentages.
  static func formatCell(_ cell: String) -> String {
    let text = cell.trimmingCharacters(in: .whitespaces)
    if text.range(of: "^[+-]?\\d{7,}$", options: .regularExpression) != nil, let value = Int(text) {
      let formatter = NumberFormatter()
      formatter.numberStyle = .decimal
      return formatter.string(from: NSNumber(value: value)) ?? text
    }
    if text.range(of: "^[+-]\\d[\\d.,]*%", options: .regularExpression) != nil {
      return (text.hasPrefix("+") ? "▲ " : "▼ ") + text.dropFirst()
    }
    return cell
  }

  // MARK: Inline

  /// Bold, italic, code and links. Relative links and route-like code spans
  /// (`/elections`) point at the game.
  static func inline(_ text: String) -> AttributedString {
    let prepared = text.replacingOccurrences(of: "\\]\\((/[^)\\s]*)\\)", with: "](\(gameOrigin)$1)", options: .regularExpression)
    let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
    var attributed = (try? AttributedString(markdown: prepared, options: options)) ?? AttributedString(text)
    var routes: [(Range<AttributedString.Index>, URL)] = []
    for run in attributed.runs {
      guard let intent = run.inlinePresentationIntent, intent.contains(.code), run.link == nil else { continue }
      let value = String(attributed[run.range].characters)
      if value.range(of: "^/[a-z0-9][a-z0-9\\-/_]*$", options: .regularExpression) != nil, let url = URL(string: gameOrigin + value) {
        routes.append((run.range, url))
      }
    }
    for (range, url) in routes { attributed[range].link = url }
    return attributed
  }

  /// Plain text for VoiceOver and copy, with markdown symbols removed.
  static func plain(_ text: String) -> String {
    String(inline(text).characters)
  }

  // MARK: Charts

  static func chart(from source: String) -> NativeAskChart? {
    let lines = source.components(separatedBy: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    guard let first = lines.first else { return nil }
    if first.hasPrefix("xychart") { return xyChart(lines) }
    if first.hasPrefix("pie") { return pie(lines) }
    return nil
  }

  private static func quoted(_ text: String) -> String? {
    guard let range = text.range(of: "\"(?:[^\"\\\\]|\\\\.)*\"", options: .regularExpression) else { return nil }
    let literal = String(text[range])
    if let data = literal.data(using: .utf8),
       let decoded = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) as? String {
      return decoded
    }
    return String(literal.dropFirst().dropLast())
  }

  private static func array(_ text: String) -> [Any]? {
    guard let start = text.firstIndex(of: "["), let end = text.lastIndex(of: "]"), start < end,
          let data = String(text[start...end]).data(using: .utf8) else { return nil }
    return try? JSONSerialization.jsonObject(with: data) as? [Any]
  }

  private static func xyChart(_ lines: [String]) -> NativeAskChart? {
    var title = ""
    var axis = ""
    var labels: [String] = []
    var series: [[Double]] = []
    var hasLine = false
    var hasBar = false
    for line in lines.dropFirst() {
      if line.hasPrefix("title") {
        title = quoted(line) ?? String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
      } else if line.hasPrefix("x-axis") {
        labels = (array(line) ?? []).map { "\($0)" }
      } else if line.hasPrefix("y-axis") {
        axis = quoted(line) ?? ""
      } else if line.hasPrefix("bar") || line.hasPrefix("line") {
        let values = (array(line) ?? []).compactMap { ($0 as? NSNumber)?.doubleValue }
        guard !values.isEmpty else { continue }
        if line.hasPrefix("line") { hasLine = true } else { hasBar = true }
        series.append(values)
      }
    }
    guard !series.isEmpty else { return nil }
    let count = series.map(\.count).max() ?? 0
    if labels.count < count { labels += (labels.count..<count).map { "\($0 + 1)" } }
    return NativeAskChart(kind: hasLine && !hasBar ? .line : .bar, title: title, axisLabel: axis,
                          labels: Array(labels.prefix(count)), series: series.map { Array($0.prefix(count)) })
  }

  private static func pie(_ lines: [String]) -> NativeAskChart? {
    let title = quoted(lines[0]) ?? ""
    var labels: [String] = []
    var values: [Double] = []
    for line in lines.dropFirst() {
      guard let label = quoted(line), let colon = line.lastIndex(of: ":"),
            let value = Double(line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)), value >= 0 else { continue }
      labels.append(label)
      values.append(value)
    }
    guard !values.isEmpty, values.reduce(0, +) > 0 else { return nil }
    return NativeAskChart(kind: .pie, title: title, axisLabel: "", labels: labels, series: [values])
  }

  static func number(_ value: Double) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.maximumFractionDigits = abs(value) >= 100 ? 0 : (abs(value) >= 10 ? 1 : 2)
    return formatter.string(from: NSNumber(value: value)) ?? String(value)
  }
}

// MARK: - Views

/// Renders a whole answer.
struct NativeAskAnswerView: View {
  let text: String
  let model: NativeAskModel

  var body: some View {
    let blocks = NativeAskMarkdown.parse(text)
    VStack(alignment: .leading, spacing: 14) {
      ForEach(Array(blocks.enumerated()), id: \.offset) { item in
        NativeAskBlockView(block: item.element, model: model)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .modifier(NativeAskLinkRouting(model: model))
  }
}

/// iOS 16 lets the sheet decide where a tapped link goes: game pages load in
/// the app, everything else opens in Safari. iOS 15 uses the system default.
private struct NativeAskLinkRouting: ViewModifier {
  let model: NativeAskModel

  @ViewBuilder func body(content: Content) -> some View {
    if #available(iOS 16.0, *) {
      content.environment(\.openURL, OpenURLAction { url in
        model.open(url)
        return .handled
      })
    } else {
      content
    }
  }
}

struct NativeAskBlockView: View {
  let block: NativeAskBlock
  let model: NativeAskModel

  static func headingFont(_ level: Int) -> Font {
    if level <= 1 { return Font.title2.weight(.bold) }
    if level == 2 { return Font.title3.weight(.semibold) }
    return Font.headline
  }

  var body: some View {
    switch block {
    case .heading(let level, let text):
      Text(NativeAskMarkdown.inline(text))
        .font(Self.headingFont(level))
        .padding(.top, level <= 2 ? 6 : 2)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityAddTraits(.isHeader)
    case .paragraph(let text):
      Text(NativeAskMarkdown.inline(text))
        .font(.body)
        .lineSpacing(3)
        .fixedSize(horizontal: false, vertical: true)
        .textSelection(.enabled)
    case .bullets(let items):
      NativeAskListView(items: items, ordered: false)
    case .numbered(let items):
      NativeAskListView(items: items, ordered: true)
    case .quote(let text):
      HStack(alignment: .top, spacing: 12) {
        RoundedRectangle(cornerRadius: 2, style: .continuous)
          .fill(Color.accentColor.opacity(0.7))
          .frame(width: 3)
        Text(NativeAskMarkdown.inline(text))
          .font(.callout)
          .foregroundColor(.secondary)
          .fixedSize(horizontal: false, vertical: true)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(.vertical, 2)
      .fixedSize(horizontal: false, vertical: true)
    case .code(let language, let code):
      NativeAskCodeView(language: language, code: code)
    case .table(let header, let alignments, let rows):
      NativeAskTableView(header: header, rightAligned: alignments, rows: rows)
    case .rule:
      Divider().padding(.vertical, 4)
    case .map(let spec):
      NativeAskMapView(spec: spec, model: model)
    case .chart(let chart):
      NativeAskChartView(chart: chart)
    case .diagram(let source):
      NativeAskDiagramFallback(source: source)
    }
  }
}

private struct NativeAskListView: View {
  let items: [NativeAskListItem]
  let ordered: Bool
  @ScaledMetric(relativeTo: .body) private var markerWidth: CGFloat = 22

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      ForEach(Array(items.enumerated()), id: \.offset) { item in
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          if ordered {
            Text(item.element.marker.isEmpty ? "\(item.offset + 1)." : item.element.marker)
              .font(.body.monospacedDigit())
              .foregroundColor(.secondary)
              .frame(minWidth: markerWidth, alignment: .trailing)
          } else {
            Text(item.element.indent == 0 ? "\u{2022}" : "\u{25E6}")
              .font(.body.weight(.bold))
              .foregroundColor(.accentColor)
              .frame(width: markerWidth * 0.6, alignment: .center)
          }
          Text(NativeAskMarkdown.inline(item.element.text))
            .font(.body)
            .lineSpacing(2)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.leading, CGFloat(item.element.indent) * 18)
      }
    }
  }
}

private struct NativeAskCodeView: View {
  let language: String
  let code: String

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if !language.isEmpty {
        Text(language.uppercased())
          .font(.caption2.weight(.semibold))
          .foregroundColor(.secondary)
          .padding(.horizontal, 12)
          .padding(.top, 8)
      }
      ScrollView(.horizontal, showsIndicators: false) {
        Text(code)
          .font(.system(.footnote, design: .monospaced))
          .textSelection(.enabled)
          .padding(12)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color(.secondarySystemBackground)))
  }
}

private struct NativeAskTableView: View {
  let header: [String]
  let rightAligned: [Bool]
  let rows: [[String]]
  @ScaledMetric(relativeTo: .subheadline) private var charWidth: CGFloat = 8.6

  private var widths: [CGFloat] {
    header.indices.map { column in
      let longest = ([header[column]] + rows.map { column < $0.count ? NativeAskMarkdown.formatCell($0[column]) : "" })
        .map { NativeAskMarkdown.plain($0).count + ($0.hasPrefix("▲") || $0.hasPrefix("▼") ? 1 : 0) }.max() ?? 4
      return min(260, max(72, CGFloat(longest) * charWidth + 32))
    }
  }

  var body: some View {
    let widths = self.widths
    ScrollView(.horizontal, showsIndicators: false) {
      VStack(alignment: .leading, spacing: 0) {
        row(header, widths: widths, isHeader: true)
          .background(Color(.tertiarySystemFill))
        ForEach(Array(rows.enumerated()), id: \.offset) { item in
          Divider()
          row(item.element, widths: widths, isHeader: false)
        }
      }
      .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color(.separator), lineWidth: 0.5))
      .padding(.vertical, 1)
    }
  }

  private func row(_ values: [String], widths: [CGFloat], isHeader: Bool) -> some View {
    HStack(alignment: .top, spacing: 0) {
      ForEach(Array(values.enumerated()), id: \.offset) { cell in
        let right = cell.offset < rightAligned.count && rightAligned[cell.offset]
        let text = isHeader ? cell.element : NativeAskMarkdown.formatCell(cell.element)
        Text(NativeAskMarkdown.inline(text))
          .font(isHeader ? Font.footnote.weight(.semibold) : Font.subheadline.monospacedDigit())
          .foregroundColor(isHeader ? .secondary : trendColor(text))
          .multilineTextAlignment(right ? .trailing : .leading)
          .lineLimit(right ? 1 : nil)
          .minimumScaleFactor(right ? 0.75 : 1)
          .fixedSize(horizontal: false, vertical: true)
          .frame(width: cell.offset < widths.count ? widths[cell.offset] - 24 : 80, alignment: right ? .trailing : .leading)
          .padding(.horizontal, 12)
          .padding(.vertical, isHeader ? 8 : 10)
      }
    }
  }

  private func trendColor(_ text: String) -> Color {
    if text.hasPrefix("▲") { return Color(.systemGreen) }
    if text.hasPrefix("▼") { return Color(.systemRed) }
    return .primary
  }
}

private struct NativeAskDiagramFallback: View {
  let source: String
  @State private var expanded = false

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Label("This diagram can't be drawn here yet.", systemImage: "chart.xyaxis.line")
        .font(.footnote)
        .foregroundColor(.secondary)
      DisclosureGroup("Show diagram source", isExpanded: $expanded) {
        NativeAskCodeView(language: "", code: source)
      }
      .font(.footnote)
    }
  }
}

// MARK: Charts

private let nativeAskChartColors: [Color] = [
  NativeAskTint.color, Color(.systemBlue), Color(.systemTeal), Color(.systemOrange),
  Color(.systemPurple), Color(.systemGreen), Color(.systemIndigo), Color(.systemPink),
]

struct NativeAskChartView: View {
  let chart: NativeAskChart

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      if !chart.title.isEmpty {
        Text(chart.title).font(.subheadline.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
      }
      switch chart.kind {
      case .bar: bars
      case .line: NativeAskLineChart(chart: chart)
      case .pie: NativeAskPieChart(chart: chart)
      }
      if !chart.axisLabel.isEmpty && chart.kind != .pie {
        Text(chart.axisLabel).font(.caption).foregroundColor(.secondary)
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color(.secondarySystemBackground)))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(accessibilitySummary))
  }

  private var accessibilitySummary: String {
    let values = chart.labels.enumerated().map { index, label in
      let numbers = chart.series.compactMap { index < $0.count ? NativeAskMarkdown.number($0[index]) : nil }
      return "\(label): \(numbers.joined(separator: ", "))"
    }
    return "Chart. \(chart.title). " + values.joined(separator: "; ")
  }

  private var bars: some View {
    let all = chart.series.flatMap { $0 }
    let low = min(0, all.min() ?? 0)
    let high = max(0, all.max() ?? 0)
    let span = max(high - low, 1e-9)
    return VStack(alignment: .leading, spacing: 10) {
      ForEach(Array(chart.labels.enumerated()), id: \.offset) { item in
        VStack(alignment: .leading, spacing: 4) {
          Text(item.element).font(.caption).foregroundColor(.secondary).lineLimit(1)
          ForEach(Array(chart.series.enumerated()), id: \.offset) { series in
            let value = item.offset < series.element.count ? series.element[item.offset] : 0
            HStack(spacing: 8) {
              GeometryReader { geo in
                let zero = CGFloat((0 - low) / span) * geo.size.width
                let end = CGFloat((value - low) / span) * geo.size.width
                ZStack(alignment: .leading) {
                  Capsule().fill(Color(.tertiarySystemFill))
                  Capsule()
                    .fill(nativeAskChartColors[series.offset % nativeAskChartColors.count])
                    .frame(width: max(4, abs(end - zero)))
                    .offset(x: min(zero, end))
                }
              }
              .frame(height: chart.series.count > 1 ? 8 : 12)
              Text(NativeAskMarkdown.number(value))
                .font(.caption.monospacedDigit().weight(.medium))
                .frame(minWidth: 44, alignment: .trailing)
            }
          }
        }
      }
    }
  }
}

private struct NativeAskLineChart: View {
  let chart: NativeAskChart

  var body: some View {
    let all = chart.series.flatMap { $0 }
    let low = all.min() ?? 0
    let high = all.max() ?? 1
    let span = max(high - low, 1e-9)
    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .top, spacing: 6) {
        VStack(alignment: .trailing) {
          Text(NativeAskMarkdown.number(high))
          Spacer()
          Text(NativeAskMarkdown.number(low))
        }
        .font(.caption2.monospacedDigit())
        .foregroundColor(.secondary)
        GeometryReader { geo in
          ZStack {
            ForEach(0..<3, id: \.self) { step in
              Path { path in
                let y = geo.size.height * CGFloat(step) / 2
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: geo.size.width, y: y))
              }
              .stroke(Color(.separator), style: StrokeStyle(lineWidth: 0.5, dash: [3, 3]))
            }
            ForEach(Array(chart.series.enumerated()), id: \.offset) { series in
              let points = series.element.enumerated().map { index, value in
                CGPoint(x: series.element.count > 1 ? geo.size.width * CGFloat(index) / CGFloat(series.element.count - 1) : geo.size.width / 2,
                        y: geo.size.height * (1 - CGFloat((value - low) / span)))
              }
              let color = nativeAskChartColors[series.offset % nativeAskChartColors.count]
              Path { path in
                guard let first = points.first else { return }
                path.move(to: first)
                points.dropFirst().forEach { path.addLine(to: $0) }
              }
              .stroke(color, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
              ForEach(Array(points.enumerated()), id: \.offset) { point in
                Circle().fill(color).frame(width: 6, height: 6).position(point.element)
              }
            }
          }
        }
        .frame(height: 160)
      }
      HStack {
        Text(chart.labels.first ?? "")
        Spacer()
        if chart.labels.count > 2 { Text(chart.labels[chart.labels.count / 2]) }
        Spacer()
        Text(chart.labels.count > 1 ? chart.labels[chart.labels.count - 1] : "")
      }
      .font(.caption2)
      .foregroundColor(.secondary)
      .lineLimit(1)
    }
  }
}

private struct NativeAskPieChart: View {
  let chart: NativeAskChart

  var body: some View {
    let values = chart.series.first ?? []
    let total = max(values.reduce(0, +), 1e-9)
    HStack(alignment: .center, spacing: 18) {
      ZStack {
        ForEach(Array(values.enumerated()), id: \.offset) { item in
          let start = values.prefix(item.offset).reduce(0, +) / total
          let end = start + item.element / total
          Circle()
            .trim(from: CGFloat(start), to: CGFloat(end))
            .stroke(nativeAskChartColors[item.offset % nativeAskChartColors.count], style: StrokeStyle(lineWidth: 26))
            .rotationEffect(.degrees(-90))
        }
      }
      .frame(width: 110, height: 110)
      .padding(13)
      VStack(alignment: .leading, spacing: 6) {
        ForEach(Array(chart.labels.enumerated()), id: \.offset) { item in
          HStack(spacing: 8) {
            Circle().fill(nativeAskChartColors[item.offset % nativeAskChartColors.count]).frame(width: 9, height: 9)
            Text(item.element).font(.caption).lineLimit(2)
            Spacer(minLength: 4)
            if item.offset < values.count {
              Text("\(Int((values[item.offset] / total * 100).rounded()))%")
                .font(.caption.monospacedDigit())
                .foregroundColor(.secondary)
            }
          }
        }
      }
    }
  }
}

// MARK: Maps

/// An `ahd-map` block. The service renders the map to SVG; it is shown as an
/// image inside a WebKit view with scripts off, so nothing in the SVG runs.
struct NativeAskMapView: View {
  let spec: String
  let model: NativeAskModel
  @State private var svg: String?
  @State private var failed = false
  @State private var expanded = false

  private var title: String {
    guard let data = spec.data(using: .utf8),
          let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return "Map" }
    return (object["title"] as? String) ?? (object["metric"] as? String) ?? "Map"
  }

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color(red: 17 / 255, green: 24 / 255, blue: 39 / 255))
      if let svg {
        NativeAskSVGView(svg: svg, zoomable: false)
          .allowsHitTesting(false)
          .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        VStack {
          HStack {
            Spacer()
            Image(systemName: "arrow.up.left.and.arrow.down.right")
              .font(.caption.weight(.semibold))
              .foregroundColor(.white)
              .padding(8)
              .background(Circle().fill(Color.black.opacity(0.45)))
              .padding(10)
          }
          Spacer()
        }
        .accessibilityHidden(true)
      } else if failed {
        VStack(spacing: 8) {
          Image(systemName: "map").font(.title2)
          Text("This map could not be shown.").font(.footnote)
          Button("Try again") { Task { await load() } }
            .font(.footnote.weight(.semibold))
            .buttonStyle(.bordered)
            .tint(.white)
        }
        .foregroundColor(.white.opacity(0.8))
      } else {
        VStack(spacing: 10) {
          ProgressView().tint(.white)
          Text("Drawing map").font(.footnote).foregroundColor(.white.opacity(0.7))
        }
      }
    }
    .aspectRatio(1200 / 760, contentMode: .fit)
    .frame(maxWidth: .infinity)
    .contentShape(Rectangle())
    .onTapGesture { if svg != nil { expanded = true } }
    .task(id: spec) { await load() }
    .sheet(isPresented: $expanded) {
      NativeAskMapDetail(title: title, svg: svg ?? "")
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("Map: \(title)"))
    .accessibilityHint(Text(svg == nil ? "" : "Opens the map full screen"))
    .accessibilityAddTraits(svg == nil ? [] : .isButton)
  }

  private func load() async {
    failed = false
    do {
      svg = try await model.renderMap(spec)
    } catch is CancellationError {
      return
    } catch {
      if !Task.isCancelled { failed = true }
    }
  }
}

private struct NativeAskMapDetail: View {
  let title: String
  let svg: String
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationView {
      NativeAskSVGView(svg: svg, zoomable: true)
        .background(Color(red: 17 / 255, green: 24 / 255, blue: 39 / 255).ignoresSafeArea())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
        }
    }
    .navigationViewStyle(.stack)
  }
}

struct NativeAskSVGView: UIViewRepresentable {
  let svg: String
  let zoomable: Bool

  func makeCoordinator() -> Coordinator { Coordinator() }

  func makeUIView(context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .nonPersistent()
    configuration.defaultWebpagePreferences.allowsContentJavaScript = false
    configuration.dataDetectorTypes = []
    let view = WKWebView(frame: .zero, configuration: configuration)
    view.isOpaque = false
    view.backgroundColor = .clear
    view.scrollView.backgroundColor = .clear
    view.scrollView.isScrollEnabled = zoomable
    view.scrollView.bounces = zoomable
    view.scrollView.contentInsetAdjustmentBehavior = .never
    view.navigationDelegate = context.coordinator
    view.accessibilityElementsHidden = !zoomable
    return view
  }

  func updateUIView(_ view: WKWebView, context: Context) {
    guard context.coordinator.loaded != svg else { return }
    context.coordinator.loaded = svg
    let encoded = Data(svg.utf8).base64EncodedString()
    let scale = zoomable ? "minimum-scale=1,maximum-scale=5,user-scalable=yes" : "maximum-scale=1,user-scalable=no"
    let html = """
    <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,\(scale)">
    <style>html,body{margin:0;padding:0;background:transparent;height:100%}body{display:flex;align-items:center;justify-content:center}img{width:100%;height:auto;display:block}</style>
    </head><body><img alt="" src="data:image/svg+xml;base64,\(encoded)"></body></html>
    """
    view.loadHTMLString(html, baseURL: nil)
  }

  final class Coordinator: NSObject, WKNavigationDelegate {
    var loaded: String?

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
      // Only the inline document itself may load.
      let scheme = navigationAction.request.url?.scheme ?? "about"
      decisionHandler(scheme == "about" || scheme == "data" ? .allow : .cancel)
    }
  }
}
