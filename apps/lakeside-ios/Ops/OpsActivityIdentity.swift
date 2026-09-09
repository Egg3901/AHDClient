import SwiftUI
import LakesideCore

/// Activity is a state signal, never a completion percentage.
struct OpsActivityMark: View {
    let state: String
    var size: CGFloat = 24
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var visible = false
    @State private var inViewport = true
    private var running: Bool { ["running", "streaming", "executing"].contains(state) }
    private var animated: Bool { running && visible && inViewport && scenePhase == .active && !reduceMotion }
    private var color: Color {
        if ["failed", "blocked", "awaiting_permission", "waiting"].contains(state) { return .orange }
        if ["completed", "saved", "verified"].contains(state) { return OpsTheme.mint }
        return running ? OpsTheme.sky : .secondary
    }
    var body: some View {
        Group {
            if animated {
                TimelineView(.animation(minimumInterval: 1.0 / 12.0)) { timeline in
                    let phase = timeline.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 3) / 3
                    ZStack {
                        Circle().stroke(color.opacity(0.18), lineWidth: 1)
                        Circle().trim(from: 0, to: 0.28).stroke(color.opacity(0.8), style: StrokeStyle(lineWidth: 1.5, lineCap: .round)).rotationEffect(.degrees(phase * 360))
                        face
                        Circle().fill(color.opacity(0.8)).frame(width: 3, height: 3).offset(y: -size * 0.38).rotationEffect(.degrees(-phase * 360))
                    }
                }
            } else {
                ZStack {
                    Circle().stroke(color.opacity(0.25), lineWidth: 1)
                    if ["completed", "saved", "verified", "failed", "blocked", "awaiting_permission", "waiting"].contains(state) {
                        Image(systemName: symbol).font(.system(size: size * 0.43, weight: .semibold)).foregroundStyle(color)
                    } else { face }
                }
            }
        }.frame(width: size, height: size).accessibilityHidden(true)
            .background {
                GeometryReader { geometry in
                    Color.clear
                        .onAppear { inViewport = geometry.frame(in: .global).intersects(UIScreen.main.bounds) }
                        .onChange(of: geometry.frame(in: .global)) { _, frame in inViewport = frame.intersects(UIScreen.main.bounds) }
                }
            }
            .onAppear { visible = true }.onDisappear { visible = false }
    }
    private var face: some View {
        RoundedRectangle(cornerRadius: size * 0.10).strokeBorder(color.opacity(0.9), lineWidth: 1)
            .frame(width: size * 0.50, height: size * 0.38)
            .overlay {
                HStack(spacing: size * 0.12) {
                    Circle().fill(color).frame(width: max(1.3, size * 0.07), height: max(1.3, size * 0.07))
                    Circle().fill(color).frame(width: max(1.3, size * 0.07), height: max(1.3, size * 0.07))
                }
            }
    }
    private var symbol: String {
        if ["completed", "saved", "verified"].contains(state) { return "checkmark" }
        if ["failed", "blocked"].contains(state) { return "exclamationmark" }
        if ["awaiting_permission", "waiting"].contains(state) { return "hand.raised.fill" }
        return running ? "sparkle" : "circle.fill"
    }
}

struct OpsActivityBadge: View {
    let state: String
    let label: String
    var compact = false
    var body: some View {
        HStack(spacing: compact ? 6 : 9) {
            OpsActivityMark(state: state, size: compact ? 17 : 26)
            Text(label).font(compact ? .caption2.weight(.medium) : .caption.weight(.medium)).lineLimit(2)
        }.foregroundStyle(["running", "streaming", "executing"].contains(state) ? OpsTheme.sky : Color.secondary)
    }
}

struct OpsLiveActivitySheet: View {
    @ObservedObject var model: OpsWorkspaceModel
    @Environment(\.dismiss) private var dismiss
    private var running: Bool { !model.streamingID.isEmpty && model.connected }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    OpsActivityBadge(state: running ? "running" : "idle", label: model.streamingID.isEmpty ? "Reply finished" : model.connected ? "Ops is working" : "Reconnecting")
                    if !model.activity.isEmpty { Text(model.activity).font(.callout).foregroundStyle(.secondary) }
                    if model.liveActions.isEmpty { Text("No tool activity reported for this reply yet.").font(.callout).foregroundStyle(.secondary) }
                    OpsActivity(actions: model.liveActions, startsExpanded: true, active: running)
                }.padding(24).frame(maxWidth: .infinity, alignment: .leading)
            }.opsScreen().navigationTitle("Live activity").navigationBarTitleDisplayMode(.inline)
                .toolbar { Button("Done") { dismiss() } }
        }
    }
}
