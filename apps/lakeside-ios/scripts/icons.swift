import AppKit
import Foundation

for (folder, symbol, accent) in [
    ("Ask", "bubble.left.and.text.bubble.right.fill", NSColor.systemTeal),
    ("Ops", "waveform.path.ecg", NSColor.systemCyan)
] {
    let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent(folder + "/Assets.xcassets")
    let destination = root.appendingPathComponent("AppIcon.appiconset")
    try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024, bitsPerSample: 8,
        samplesPerPixel: 3, hasAlpha: false, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    NSColor(calibratedRed: 0.025, green: 0.07, blue: 0.13, alpha: 1).setFill()
    NSBezierPath(rect: NSRect(x: 0, y: 0, width: 1024, height: 1024)).fill()
    accent.withAlphaComponent(0.12).setFill()
    NSBezierPath(ovalIn: NSRect(x: 120, y: 120, width: 784, height: 784)).fill()
    let configuration = NSImage.SymbolConfiguration(pointSize: 450, weight: .medium)
        .applying(NSImage.SymbolConfiguration(paletteColors: [accent]))
    let image = NSImage(systemSymbolName: symbol, accessibilityDescription: nil)!.withSymbolConfiguration(configuration)!
    let aspect = image.size.width / image.size.height
    let width = min(620.0, 540.0 * aspect); let height = width / aspect
    image.draw(in: NSRect(x: (1024 - width) / 2, y: (1024 - height) / 2, width: width, height: height))
    NSGraphicsContext.restoreGraphicsState()
    try bitmap.representation(using: .png, properties: [:])!.write(to: destination.appendingPathComponent("Icon.png"))
    let content: [String: Any] = ["images": [["filename": "Icon.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"]], "info": ["author": "xcode", "version": 1]]
    try JSONSerialization.data(withJSONObject: content, options: [.prettyPrinted, .sortedKeys]).write(to: destination.appendingPathComponent("Contents.json"))
    try Data("{\"info\":{\"author\":\"xcode\",\"version\":1}}".utf8).write(to: root.appendingPathComponent("Contents.json"))
}
