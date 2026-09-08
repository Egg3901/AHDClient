// swift-tools-version:5.3
import PackageDescription

let package = Package(
  name: "tauri-plugin-briefing-widgets",
  platforms: [.iOS(.v15)],
  products: [.library(name: "tauri-plugin-briefing-widgets", type: .static, targets: ["tauri-plugin-briefing-widgets"])],
  dependencies: [.package(name: "Tauri", path: "../.tauri/tauri-api")],
  targets: [.target(name: "tauri-plugin-briefing-widgets", dependencies: [.byName(name: "Tauri")], path: "Sources")]
)
