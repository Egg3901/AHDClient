import SwiftUI
import LakesideCore

/// App Store guideline 5.1.2(i): before an Ask server question leaves the
/// device, name every outside AI service it can reach and wait for Allow.
struct AIConsentSheet: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    /// Called with true after Allow, false after Not now or Withdraw.
    var onDecision: (Bool) -> Void = { _ in }
    @State private var granted = false

    private var recipients: [AIRecipient] { AIConsent.recipients(from: session.profile) }

    /// Pinned so the decision is reachable without scrolling at any text size.
    @ViewBuilder private var decisionBar: some View {
        VStack(spacing: 8) {
            if granted {
                Button { dismiss() } label: {
                    Text("Keep using Ask").font(.body.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("ask-consent-keep")
                Button(role: .destructive) {
                    AskConsentStore.withdraw(); granted = false; onDecision(false)
                    AskAnnouncer.say("Permission withdrawn. Ask server sends nothing until you allow it again.")
                } label: {
                    Text("Withdraw permission").frame(maxWidth: .infinity, minHeight: 36)
                }
                .accessibilityIdentifier("ask-consent-withdraw")
                Text("After you withdraw, Ask server questions wait for permission again. On-device answers keep working.")
                    .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
            } else {
                Button {
                    AskConsentStore.grant(recipients); granted = true; onDecision(true); dismiss()
                } label: {
                    Text("Allow and continue").font(.body.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("ask-consent-allow")
                Button { onDecision(false); dismiss() } label: {
                    Text("Not now").frame(maxWidth: .infinity, minHeight: 36)
                }
                .accessibilityIdentifier("ask-consent-decline")
                Text("Ask server sends nothing until you allow it. You can withdraw permission in Settings.")
                    .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
        }
        .padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 8)
        .background(Brand.background)
        .overlay(alignment: .top) { Rectangle().fill(Brand.ink.opacity(0.08)).frame(height: 1) }
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Ask uses outside AI services").font(.title3.weight(.semibold))
                    Text("Ask server answers with AI models run by other companies. When you send a question, it goes to one of the services below. What they receive: the text you type, earlier messages in the same chat, attached files, and, if you ask about your own character, your own game records. Your username, email and account IDs are not sent.")
                        .font(.callout)
                    if !granted && AskConsentStore.hasEarlierGrant {
                        Label("The list of services changed since you last allowed it.", systemImage: "arrow.triangle.2.circlepath")
                            .font(.footnote).foregroundStyle(.orange)
                    }
                }.padding(.vertical, 4)
            }
            Section {
                ForEach(recipients, id: \.self) { recipient in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(recipient.name).font(.body.weight(.semibold))
                        if !recipient.detail.isEmpty { Text(recipient.detail).font(.footnote).foregroundStyle(.secondary) }
                    }.padding(.vertical, 2).accessibilityElement(children: .combine)
                }
            } header: { AskLabel(text: "Services that may receive a question · \(recipients.count)") }
            Section {
                Text("Each service has its own terms and data handling. Every answer shows which model and service wrote it. Apple on-device answers are written on this device and are never sent to these services.")
                    .font(.footnote).foregroundStyle(.secondary)
                if let url = AskConsentStore.privacyURL { Link("Ask privacy notice", destination: url) }
            }
        }
        .safeAreaInset(edge: .bottom) { decisionBar }
        .lakesideScreen()
        .navigationTitle("AI providers").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { if !granted { onDecision(false) }; dismiss() } } }
        .onAppear { granted = AskConsentStore.granted(recipients) }
    }
}
