import SwiftUI
import LakesideCore

/// A small Lakeside operator. Poses describe reported activity, never progress.
struct OpsActivityMark: View {
    let state: String
    var size: CGFloat = 24
    var activity = ""
    var identity = "ops-lead"
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var visible = false
    @State private var inViewport = true
    private var running: Bool { ["running", "streaming", "executing"].contains(state) }
    private var animated: Bool { running && size >= 28 && visible && inViewport && scenePhase == .active && !reduceMotion }
    private var identityHash: UInt32 {
        identity.utf8.reduce(UInt32(2166136261)) { ($0 ^ UInt32($1)) &* 16777619 }
    }
    private var variant: Int { identity == "ops-lead" ? 0 : Int(identityHash % 5) }
    private var color: Color {
        let palette: [UInt32] = [0xFF7900, 0x00C978, 0x487CFF, 0xA968EC, 0xFF688A, 0xE7AA30]
        let hex = palette[identity == "ops-lead" ? 0 : Int(((identityHash >> 16) ^ (identityHash & 0xffff)) % 6)]
        return Color(red: Double((hex >> 16) & 255) / 255, green: Double((hex >> 8) & 255) / 255, blue: Double(hex & 255) / 255)
    }
    private var pose: String {
        guard running else { return "rest" }
        let text = activity.lowercased()
        if ["test", "check", "verify", "lint", "review"].contains(where: { text.contains($0) }) { return "checking" }
        if ["read", "search", "research", "fetch", "browse", "inspect"].contains(where: { text.contains($0) }) { return "reading" }
        if ["write", "edit", "patch", "build", "implement", "compile", "typing"].contains(where: { text.contains($0) }) { return "typing" }
        return "thinking"
    }
    var body: some View {
        Group {
            if animated {
                TimelineView(.animation(minimumInterval: 1.0 / 24.0)) { timeline in
                    character(time: timeline.date.timeIntervalSinceReferenceDate)
                }
            } else { character(time: 0) }
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
    private func character(time: Double) -> some View {
        Canvas { context, bounds in
            context.scaleBy(x: bounds.width / 48, y: bounds.height / 48)
            let moving = time != 0 && running
            let t = time.truncatingRemainder(dividingBy: 60)
            let wave = moving ? sin(t * (pose == "typing" ? 5 : 2.4)) : 0
            let attention = ["awaiting_permission", "failed", "blocked"].contains(state)
            let settled = ["completed", "saved", "verified"].contains(state)
            let squash = moving ? wave * 0.035 : settled ? 0.025 : 0
            context.translateBy(x: 24, y: 24 - (moving ? max(0, wave) * 1.4 : 0))
            context.rotate(by: .degrees(moving ? wave * (pose == "thinking" ? 5 : 2) : attention ? -7 : 0))
            context.scaleBy(x: 1 + squash, y: 1 - squash)
            context.translateBy(x: -24, y: -24)
            context.fill(OpsAgentBlob.path(variant: variant), with: .color(color))
            let scan = moving ? sin(t * (pose == "reading" || pose == "checking" ? 2.5 : 1.1)) * 1.5 : attention ? -1.5 : 0
            let blink = moving && sin(t * 1.7) > 0.985
            for x in [22.0, 31.0] {
                var eye = Path()
                eye.move(to: CGPoint(x: x + scan, y: 19))
                eye.addLine(to: CGPoint(x: x + scan + (blink ? 3 : 1.6), y: blink ? 19 : settled ? 21.2 : 23))
                context.stroke(eye, with: .color(.white), style: StrokeStyle(lineWidth: 2.8, lineCap: .round))
            }
        }
    }
}

/// Persistent silhouettes, independent of provider and work state.
private enum OpsAgentBlob {
    static func path(variant: Int) -> Path {
        var path = Path()
        switch variant {
        case 1:
            path.move(to: CGPoint(x: 30, y: 4))
            path.addCurve(to: CGPoint(x: 44, y: 29), control1: CGPoint(x: 34, y: 9), control2: CGPoint(x: 44, y: 19))
            path.addCurve(to: CGPoint(x: 24, y: 44), control1: CGPoint(x: 44, y: 39), control2: CGPoint(x: 35, y: 44))
            path.addCurve(to: CGPoint(x: 5, y: 26), control1: CGPoint(x: 12, y: 44), control2: CGPoint(x: 3, y: 37))
            path.addCurve(to: CGPoint(x: 30, y: 4), control1: CGPoint(x: 8, y: 14), control2: CGPoint(x: 24, y: 6))
        case 2:
            path.move(to: CGPoint(x: 22, y: 5))
            path.addCurve(to: CGPoint(x: 44, y: 25), control1: CGPoint(x: 35, y: 2), control2: CGPoint(x: 44, y: 13))
            path.addCurve(to: CGPoint(x: 25, y: 43), control1: CGPoint(x: 45, y: 39), control2: CGPoint(x: 34, y: 45))
            path.addCurve(to: CGPoint(x: 4, y: 28), control1: CGPoint(x: 12, y: 42), control2: CGPoint(x: 2, y: 41))
            path.addCurve(to: CGPoint(x: 22, y: 5), control1: CGPoint(x: 5, y: 15), control2: CGPoint(x: 9, y: 8))
        case 3:
            path.move(to: CGPoint(x: 18, y: 6))
            path.addQuadCurve(to: CGPoint(x: 30, y: 6), control: CGPoint(x: 24, y: 1))
            path.addLine(to: CGPoint(x: 42, y: 18))
            path.addQuadCurve(to: CGPoint(x: 42, y: 30), control: CGPoint(x: 47, y: 24))
            path.addLine(to: CGPoint(x: 30, y: 42))
            path.addQuadCurve(to: CGPoint(x: 18, y: 42), control: CGPoint(x: 24, y: 47))
            path.addLine(to: CGPoint(x: 6, y: 30))
            path.addQuadCurve(to: CGPoint(x: 6, y: 18), control: CGPoint(x: 1, y: 24))
        case 4:
            path.move(to: CGPoint(x: 24, y: 8))
            path.addCurve(to: CGPoint(x: 40, y: 24), control1: CGPoint(x: 43, y: -2), control2: CGPoint(x: 50, y: 16))
            path.addCurve(to: CGPoint(x: 24, y: 40), control1: CGPoint(x: 50, y: 43), control2: CGPoint(x: 32, y: 50))
            path.addCurve(to: CGPoint(x: 8, y: 24), control1: CGPoint(x: 5, y: 50), control2: CGPoint(x: -2, y: 32))
            path.addCurve(to: CGPoint(x: 24, y: 8), control1: CGPoint(x: -2, y: 5), control2: CGPoint(x: 16, y: -2))
        default:
            path.move(to: CGPoint(x: 21, y: 3.75))
            path.addQuadCurve(to: CGPoint(x: 27, y: 3.75), control: CGPoint(x: 24, y: 1.5))
            path.addLine(to: CGPoint(x: 40.5, y: 11.25))
            path.addQuadCurve(to: CGPoint(x: 44.25, y: 17.25), control: CGPoint(x: 44.25, y: 13.5))
            path.addLine(to: CGPoint(x: 44.25, y: 32.25))
            path.addQuadCurve(to: CGPoint(x: 41.25, y: 38.25), control: CGPoint(x: 44.25, y: 36))
            path.addLine(to: CGPoint(x: 27, y: 45.75))
            path.addQuadCurve(to: CGPoint(x: 21, y: 45.75), control: CGPoint(x: 24, y: 47.25))
            path.addLine(to: CGPoint(x: 6.75, y: 38.25))
            path.addQuadCurve(to: CGPoint(x: 3.75, y: 32.25), control: CGPoint(x: 3.75, y: 36))
            path.addLine(to: CGPoint(x: 3.75, y: 17.25))
            path.addQuadCurve(to: CGPoint(x: 6.75, y: 11.25), control: CGPoint(x: 3.75, y: 13.5))
        }
        path.closeSubpath()
        return path
    }
}

struct OpsAgentPressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.scaleEffect(configuration.isPressed && !reduceMotion ? 0.98 : 1)
            .opacity(configuration.isPressed ? 0.88 : 1)
            .animation(reduceMotion ? nil : .spring(response: 0.22, dampingFraction: 0.65), value: configuration.isPressed)
    }
}

struct OpsActivityBadge: View {
    let state: String
    let label: String
    var compact = false
    var activity = ""
    var identity = "ops-lead"
    var body: some View {
        HStack(spacing: compact ? 6 : 9) {
            OpsActivityMark(state: state, size: compact ? 22 : 44, activity: activity.nonempty ?? label, identity: identity)
            Text(label).font(compact ? .caption2.weight(.medium) : .callout.weight(.medium)).lineLimit(2)
        }.foregroundStyle(["running", "streaming", "executing"].contains(state) ? OpsTheme.sky : Color.secondary)
    }
}

struct OpsLiveActivitySheet: View {
    @ObservedObject var model: OpsWorkspaceModel
    @Environment(\.dismiss) private var dismiss
    private var running: Bool { model.replyIsLive }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    OpsActivityBadge(state: running ? "running" : "idle", label: model.streamingID.isEmpty ? "Reply finished" : running ? "Ops is working" : "Reconnecting", activity: model.activity)
                    if !model.activity.isEmpty { Text(model.activity).font(.callout).foregroundStyle(.secondary) }
                    if model.liveActions.isEmpty { Text("No tool activity reported for this reply yet.").font(.callout).foregroundStyle(.secondary) }
                    OpsActivity(actions: model.liveActions, startsExpanded: true, active: running)
                }.padding(24).frame(maxWidth: .infinity, alignment: .leading)
            }.opsScreen().navigationTitle("Live activity").navigationBarTitleDisplayMode(.inline)
                .toolbar { Button("Done") { dismiss() } }
        }
    }
}
