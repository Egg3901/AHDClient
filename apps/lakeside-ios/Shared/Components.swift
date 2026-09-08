import SwiftUI
import LakesideCore

struct FailureBanner: View {
    let message: String
    var body: some View { Label(message, systemImage: "exclamationmark.triangle").font(.callout).foregroundStyle(.red).padding().frame(maxWidth: .infinity, alignment: .leading) }
}

struct NativeMarkdown: View {
    let text: String
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                if block.code {
                    ScrollView(.horizontal) { Text(block.text).font(.system(.footnote, design: .monospaced)).padding(12) }
                        .background(.quaternary, in: RoundedRectangle(cornerRadius: 10))
                } else if block.text.hasPrefix("# ") {
                    Text(inline(String(block.text.dropFirst(2)))).font(.title2.bold())
                } else if block.text.hasPrefix("## ") {
                    Text(inline(String(block.text.dropFirst(3)))).font(.title3.bold())
                } else if block.text.hasPrefix("### ") {
                    Text(inline(String(block.text.dropFirst(4)))).font(.headline)
                } else if block.text.split(separator: "\n").filter({ $0.contains("|") }).count >= 2 {
                    table(block.text)
                } else { Text(inline(block.text)).frame(maxWidth: .infinity, alignment: .leading) }
            }
        }.textSelection(.enabled)
    }
    private func inline(_ value: String) -> AttributedString {
        (try? AttributedString(markdown: value, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(value)
    }
    private struct Block { var text: String; var code: Bool }
    private var blocks: [Block] {
        var result: [Block] = []; var lines: [String] = []; var code = false
        for line in text.components(separatedBy: "\n") {
            if line.hasPrefix("```") {
                if !lines.isEmpty { result.append(Block(text: lines.joined(separator: "\n"), code: code)); lines = [] }
                code.toggle()
            } else if line.isEmpty && !code {
                if !lines.isEmpty { result.append(Block(text: lines.joined(separator: "\n"), code: false)); lines = [] }
            } else { lines.append(line) }
        }
        if !lines.isEmpty { result.append(Block(text: lines.joined(separator: "\n"), code: code)) }
        return result
    }
    private func table(_ text: String) -> some View {
        let rows = text.components(separatedBy: "\n").filter { line in
            !line.trimmingCharacters(in: CharacterSet(charactersIn: "| :-\t")).isEmpty
        }
        return ScrollView(.horizontal) {
            Grid(alignment: .leading, horizontalSpacing: 20, verticalSpacing: 12) {
                ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                    GridRow {
                        ForEach(Array(row.split(separator: "|", omittingEmptySubsequences: true).enumerated()), id: \.offset) { _, cell in
                            Text(inline(String(cell).trimmingCharacters(in: .whitespaces))).fontWeight(index == 0 ? .semibold : .regular)
                                .frame(maxWidth: 280, alignment: .leading)
                        }
                    }
                }
            }.padding(12)
        }.background(.quaternary, in: RoundedRectangle(cornerRadius: 10))
    }
}

struct JSONDetail: View {
    let title: String
    let value: JSONValue
    var body: some View {
        List {
            if !value.object.isEmpty {
                ForEach(value.object.keys.sorted(), id: \.self) { key in
                    let field = value[key]
                    if !field.object.isEmpty || !field.array.isEmpty {
                        NavigationLink(key) { JSONDetail(title: key, value: field) }
                    } else {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(key).font(.caption).foregroundStyle(.secondary)
                            if field.string.count > 120 { NativeMarkdown(text: field.string) }
                            else { Text(field == .null ? "None" : field.string).textSelection(.enabled) }
                        }.padding(.vertical, 3)
                    }
                }
            } else if !value.array.isEmpty {
                ForEach(Array(value.array.enumerated()), id: \.offset) { index, item in
                    NavigationLink(item.first("title", "name", "label", "date").nonempty ?? "Item \(index + 1)") { JSONDetail(title: "Details", value: item) }
                }
            } else { Text(value.string.nonempty ?? value.pretty).textSelection(.enabled) }
        }.navigationTitle(title).navigationBarTitleDisplayMode(.inline)
    }
}

extension String { var nonempty: String? { isEmpty ? nil : self } }

struct AccountView: View {
    @EnvironmentObject private var session: AppSession
    @State private var signingOut = false
    var body: some View {
        List {
            Section("Account") {
                Text(session.profile.first("email", "role").nonempty ?? session.profile["identity"].first("username", "email", "id"))
                if !session.profile["entitlement"]["label"].string.isEmpty { LabeledContent("Access", value: session.profile["entitlement"]["label"].string) }
                if !session.profile["usage"].object.isEmpty { NavigationLink("Daily allowance") { JSONDetail(title: "Daily allowance", value: session.profile["usage"]) } }
                Button("Sign out", role: .destructive) { signingOut = true; Task { await session.signOut(); signingOut = false } }.disabled(signingOut)
            }
            Section {
                LabeledContent("App", value: session.surface.title)
                LabeledContent("Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")
                Text("Connected to \(session.surface.host)").foregroundStyle(.secondary)
            }
        }.navigationTitle("Account")
    }
}
