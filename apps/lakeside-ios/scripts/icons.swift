import AppKit
import Foundation

for (folder, mark) in [("Ask", "AskMark"), ("Ops", "LakesideMark")] {
    let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent(folder + "/Assets.xcassets")
    let destination = root.appendingPathComponent("AppIcon.appiconset")
    try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024, bitsPerSample: 8,
        samplesPerPixel: 3, hasAlpha: false, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    NSColor(calibratedRed: 10/255, green: 15/255, blue: 20/255, alpha: 1).setFill()
    NSBezierPath(rect: NSRect(x: 0, y: 0, width: 1024, height: 1024)).fill()
    let image = NSImage(contentsOfFile: "Shared/BrandAssets.xcassets/" + mark + ".imageset/Mark.png")!
    image.draw(in: NSRect(x: 192, y: 288, width: 640, height: 640))
    let text = folder.uppercased() as NSString
    let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 112, weight: .bold),
        .foregroundColor: NSColor(calibratedRed: 234/255, green: 240/255, blue: 246/255, alpha: 1), .kern: 15]
    let size = text.size(withAttributes: attributes)
    text.draw(at: NSPoint(x: (1024 - size.width) / 2, y: 132), withAttributes: attributes)
    NSGraphicsContext.restoreGraphicsState()
    try bitmap.representation(using: .png, properties: [:])!.write(to: destination.appendingPathComponent("Icon.png"))
    let content: [String: Any] = ["images": [["filename": "Icon.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"]], "info": ["author": "xcode", "version": 1]]
    try JSONSerialization.data(withJSONObject: content, options: [.prettyPrinted, .sortedKeys]).write(to: destination.appendingPathComponent("Contents.json"))
    try Data("{\"info\":{\"author\":\"xcode\",\"version\":1}}".utf8).write(to: root.appendingPathComponent("Contents.json"))
}
