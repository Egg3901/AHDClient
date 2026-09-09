import SwiftUI
import LakesideCore

/// A small Lakeside operator. Poses describe reported activity, never progress.
struct OpsActivityMark: View {
    let state: String
    var size: CGFloat = 24
    var activity = ""
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var visible = false
    @State private var inViewport = true
    private var running: Bool { ["running", "streaming", "executing"].contains(state) }
    private var animated: Bool { running && size >= 28 && visible && inViewport && scenePhase == .active && !reduceMotion }
    private var color: Color {
        if ["failed", "blocked", "awaiting_permission", "waiting"].contains(state) { return .orange }
        if ["completed", "saved", "verified"].contains(state) { return OpsTheme.mint }
        return ["stale", "reconnecting", "recorded"].contains(state) ? .secondary : OpsTheme.sky
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
            let t = time.truncatingRemainder(dividingBy: 60)
            let moving = time != 0 && running
            let bob = moving ? sin(t * 3) * 0.7 : 0
            let glance = moving ? sin(t * (pose == "reading" ? 2.4 : 1.2)) * 2 : 0
            let blink = moving && sin(t * 1.7) > 0.97
            let eyeHeight = blink ? 1.0 : running ? 4.0 : 2.5
            func stroke(_ points: [CGPoint], width: CGFloat = 1.6, tint: Color? = nil) {
                var path = Path(); if let first = points.first { path.move(to: first) }
                for point in points.dropFirst() { path.addLine(to: point) }
                context.stroke(path, with: .color(tint ?? color), style: StrokeStyle(lineWidth: width, lineCap: .round, lineJoin: .round))
            }
            func box(_ rect: CGRect, radius: CGFloat, fill: Color, outline: Bool = false) {
                let path = Path(roundedRect: rect, cornerRadius: radius)
                context.fill(path, with: .color(fill))
                if outline { context.stroke(path, with: .color(color), lineWidth: 1.4) }
            }
            // Twin peaks make the silhouette Lakeside's, without a loading ring.
            stroke([CGPoint(x: 16, y: 10 + bob), CGPoint(x: 19, y: 3 + bob), CGPoint(x: 24, y: 8 + bob), CGPoint(x: 29, y: 3 + bob), CGPoint(x: 32, y: 10 + bob)])
            box(CGRect(x: 9, y: 10 + bob, width: 30, height: 22), radius: 8, fill: OpsTheme.raised, outline: true)
            box(CGRect(x: 15 + glance, y: 18 + bob, width: 4, height: eyeHeight), radius: 1.8, fill: color)
            box(CGRect(x: 28 + glance, y: 18 + bob, width: 4, height: eyeHeight), radius: 1.8, fill: color)
            stroke([CGPoint(x: 21, y: 27 + bob), CGPoint(x: 26, y: 27 + bob)], width: 1.2)
            box(CGRect(x: 16, y: 33, width: 16, height: 9), radius: 4, fill: color.opacity(0.13), outline: true)
            if pose == "typing" {
                box(CGRect(x: 7, y: 40, width: 34, height: 7), radius: 2, fill: OpsTheme.raised, outline: true)
                for x in [12.0, 18, 24, 30, 36] { stroke([CGPoint(x: x, y: 43), CGPoint(x: x + 1, y: 43)], width: 1) }
                let tap = moving ? sin(t * 12) * 2.3 : 0
                box(CGRect(x: 11, y: 35 + tap, width: 8, height: 5), radius: 2, fill: color)
                box(CGRect(x: 29, y: 35 - tap, width: 8, height: 5), radius: 2, fill: color)
            } else if pose == "reading" || pose == "checking" {
                box(CGRect(x: 24, y: 30, width: 17, height: 17), radius: 2, fill: OpsTheme.surface, outline: true)
                for y in [34.0, 38, 42] { stroke([CGPoint(x: 28, y: y), CGPoint(x: 37, y: y)], width: 1, tint: color.opacity(0.55)) }
                box(CGRect(x: 11, y: 34 + bob, width: 7, height: 5), radius: 2, fill: color)
                if pose == "checking" {
                    let scan = moving ? sin(t * 2.5) * 2 : 0
                    let lens = Path(ellipseIn: CGRect(x: 25 + scan, y: 31, width: 8, height: 8))
                    context.stroke(lens, with: .color(OpsTheme.mint), lineWidth: 1.5)
                    stroke([CGPoint(x: 32 + scan, y: 38), CGPoint(x: 36 + scan, y: 42)], tint: OpsTheme.mint)
                } else { box(CGRect(x: 38, y: 36, width: 6, height: 5), radius: 2, fill: color) }
            } else if pose == "thinking" {
                box(CGRect(x: 30, y: 28 + bob, width: 7, height: 5), radius: 2.5, fill: color)
                stroke([CGPoint(x: 12, y: 34), CGPoint(x: 10, y: 40)])
            } else {
                stroke([CGPoint(x: 12, y: 34), CGPoint(x: 10, y: 40)])
                stroke([CGPoint(x: 36, y: 34), CGPoint(x: 38, y: 40)])
                if ["completed", "saved", "verified"].contains(state) {
                    stroke([CGPoint(x: 32, y: 38), CGPoint(x: 36, y: 42), CGPoint(x: 43, y: 33)], width: 2)
                } else if ["awaiting_permission", "waiting", "failed", "blocked"].contains(state) {
                    stroke([CGPoint(x: 43, y: 24), CGPoint(x: 43, y: 30)], width: 2)
                    box(CGRect(x: 42, y: 34, width: 2, height: 2), radius: 1, fill: color)
                }
            }
        }
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
    var body: some View {
        HStack(spacing: compact ? 6 : 9) {
            OpsActivityMark(state: state, size: compact ? 22 : 44, activity: label)
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
                    OpsActivityBadge(state: running ? "running" : "idle", label: model.streamingID.isEmpty ? "Reply finished" : running ? "Ops is working" : "Reconnecting")
                    if !model.activity.isEmpty { Text(model.activity).font(.callout).foregroundStyle(.secondary) }
                    if model.liveActions.isEmpty { Text("No tool activity reported for this reply yet.").font(.callout).foregroundStyle(.secondary) }
                    OpsActivity(actions: model.liveActions, startsExpanded: true, active: running)
                }.padding(24).frame(maxWidth: .infinity, alignment: .leading)
            }.opsScreen().navigationTitle("Live activity").navigationBarTitleDisplayMode(.inline)
                .toolbar { Button("Done") { dismiss() } }
        }
    }
}
