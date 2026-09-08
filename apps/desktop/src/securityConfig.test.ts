import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import tauriConfig from "../src-tauri/tauri.conf.json";
import desktopPackage from "../package.json";
import rootPackage from "../../../package.json";
import defaultCapability from "../src-tauri/capabilities/default.json";
import onlineCapability from "../src-tauri/capabilities/online.json";
import gameCapability from "../src-tauri/capabilities/game.json";
import mobileCapability from "../src-tauri/capabilities/mobile.json";
import briefingCapability from "../src-tauri/capabilities/briefing.json";
import androidConfig from "../src-tauri/tauri.android.conf.json";
import iosConfig from "../src-tauri/tauri.ios.conf.json";

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(join(here, relative), "utf8");

describe("desktop security configuration", () => {
  it("limits PiP to the local briefing and its read-only commands", () => {
    expect(briefingCapability.webviews).toEqual(["briefing"]);
    expect("remote" in briefingCapability).toBe(false);
    expect([...briefingCapability.permissions].sort()).toEqual([
      "core:default", "allow-get-briefing", "allow-open-briefing-page", "allow-set-briefing-pinned",
    ].sort());
    expect(read("../src-tauri/src/briefing.rs")).toContain(".redirects(0)");
  });
  it("ships a local-only CSP for the launcher window", () => {
    expect(tauriConfig.app.security.csp).toEqual({
      "default-src": "'self'",
      "connect-src": "ipc: http://ipc.localhost",
      "img-src": "'self' asset: http://asset.localhost data:",
      "style-src": "'self' 'unsafe-inline'",
    });
  });

  it("keeps both remote-content windows capability-empty", () => {
    expect(defaultCapability.webviews).toEqual(["main"]);
    expect("windows" in defaultCapability).toBe(false);
    expect(onlineCapability.webviews).toEqual(["online", "online-embedded"]);
    expect(onlineCapability.permissions).toEqual([]);
    expect(gameCapability.webviews).toEqual(["game", "game-embedded"]);
    expect(gameCapability.permissions).toEqual([]);
    for (const capability of [
      defaultCapability,
      onlineCapability,
      gameCapability,
    ]) {
      expect("remote" in capability).toBe(false);
    }
  });

  it("gives the launcher no filesystem or shell access of its own", () => {
    const permissions = defaultCapability.permissions as Array<
      string | { identifier: string }
    >;
    const identifiers = permissions.map((p) =>
      typeof p === "string" ? p : p.identifier,
    );
    expect(
      identifiers.filter(
        (id) => id.startsWith("fs:") || id.startsWith("shell:"),
      ),
    ).toEqual([]);
    for (const command of [
      "game-start",
      "game-stop",
      "game-request",
      "open-game-window",
      "list-worlds",
    ]) {
      expect(identifiers).toContain(`allow-${command}`);
    }
  });

  it("pins the game window to its own loopback port in Rust", () => {
    const rust = read("../src-tauri/src/desktop.rs");
    expect(rust).toMatch(/fn is_local_game_url\(/);
    expect(rust).toMatch(/WebviewWindowBuilder::new\(&app, "game"/);
    expect(rust).toMatch(/"--parent-pid"/);
    expect(rust).toMatch(/"--no-browser"/);
  });

  it("keeps the local game and its windows off the mobile build", () => {
    const rust = read("../src-tauri/src/lib.rs");
    expect(rust).toMatch(/#\[cfg\(desktop\)\]\s*mod desktop;/);
    expect(rust).toMatch(/#\[cfg\(mobile\)\]\s*mod mobile;/);
    const cargo = read("../src-tauri/Cargo.toml");
    const desktopOnly = cargo.split(
      "[target.'cfg(not(any(target_os = \"android\", target_os = \"ios\")))'.dependencies]",
    )[1];
    expect(desktopOnly).toBeDefined();
    for (const plugin of [
      "tauri-plugin-shell",
      "tauri-plugin-updater",
      "tauri-plugin-process",
      "tauri-plugin-fs",
      "tauri-plugin-dialog",
      "tauri-plugin-window-state",
    ]) {
      expect(desktopOnly).toContain(plugin);
    }
  });

  it("gives the mobile webview only the online, account and diagnostics commands", () => {
    expect(mobileCapability.platforms).toEqual(["android", "iOS"]);
    expect(mobileCapability.webviews).toEqual(["main"]);
    expect("remote" in mobileCapability).toBe(false);
    expect([...mobileCapability.permissions].sort()).toEqual(
      [
        "core:default",
        "allow-open-online-window",
        "allow-open-help-destination",
        "allow-linked-account",
        "allow-link-account",
        "allow-submit-diagnostics",
        "allow-get-push-status",
        "allow-configure-push",
        "allow-get-briefing",
        "allow-open-briefing-page",
      ].sort(),
    );
    expect(defaultCapability.platforms).toEqual(["linux", "macOS", "windows"]);
  });

  it("strips the sidecar, game resources and updater from mobile bundles", () => {
    for (const config of [androidConfig, iosConfig]) {
      expect(config.app.windows).toEqual([]);
      expect(config.bundle.externalBin).toBeNull();
      expect(config.bundle.resources).toBeNull();
      expect(config.bundle.createUpdaterArtifacts).toBe(false);
      expect(config.plugins.updater).toBeNull();
    }
    expect(androidConfig.bundle.android.minSdkVersion).toBe(24);
    expect(iosConfig.bundle.iOS.minimumSystemVersion).toBe("15.0");
    const mobileRust = read("../src-tauri/src/mobile.rs");
    expect(mobileRust).toMatch(/fn is_app_origin\(/);
    expect(mobileRust).toMatch(/is_online_navigation_allowed\(url\)/);
    expect(mobileRust).toContain("ahdclient://launcher");
  });

  it("generates the canonical logo into both native mobile projects", () => {
    const workflow = read("../../../.github/workflows/release-mobile.yml");
    const iconCommand = "icon src/assets/ahd-logo.png --ios-color '#ffffff'";
    expect(workflow.split(iconCommand)).toHaveLength(3);
    expect(workflow.indexOf("ios init --ci")).toBeLessThan(workflow.lastIndexOf(iconCommand));
    expect(workflow).toContain("sips -g hasAlpha");
  });
});

describe("desktop platform configuration", () => {
  it("keeps release versions and the changelog synchronized", () => {
    const cargoVersion = read("../src-tauri/Cargo.toml").match(
      /^version\s*=\s*"([^"]+)"/m,
    )?.[1];
    expect(rootPackage.version).toBe(desktopPackage.version);
    expect(tauriConfig.version).toBe(desktopPackage.version);
    expect(cargoVersion).toBe(desktopPackage.version);
    expect(read("../../../CHANGELOG.md")).toContain(
      `## [${desktopPackage.version}]`,
    );
  });

  it("bundles Node as a sidecar and the game as a resource", () => {
    expect(tauriConfig.bundle.externalBin).toEqual(["binaries/ahd-node"]);
    expect(tauriConfig.bundle.resources).toEqual({ "resources/game": "game" });
    expect(tauriConfig.app.windows[0]?.backgroundColor).toBe("#14141c");
    expect(tauriConfig.bundle.macOS.hardenedRuntime).toBe(false);
  });

  it("stages the game before every native bundle", () => {
    const workflow = read("../../../.github/workflows/release-desktop.yml");
    expect(workflow).toContain("Egg3901/AHDGame");
    expect(workflow).toContain("scripts/prepare-game.mjs");
    for (const needle of [
      "ubuntu-22.04",
      "windows-latest",
      "macos-latest",
      "--bundles appimage,deb",
      "--bundles nsis",
      "--bundles app,dmg",
      "actions/upload-artifact@v4",
      "ahdclient-windows-x86_64",
      "bundle/nsis/*.exe",
    ]) {
      expect(workflow).toContain(needle);
    }
    expect(workflow).not.toContain("uploadWorkflowArtifacts");
    expect(workflow).toContain("APPLE_SIGNING_IDENTITY: ${{ startsWith(matrix.platform, 'macos') && '-' || '' }}");
    expect(workflow).toContain("console.log('ahd-node-jit-ok')");
    expect(workflow).toContain("-name '*.app.tar.gz'");
    expect(workflow).toContain("tar -xzf \"$archive\"");
  });

  it("retains signed updater artifacts for every desktop platform", () => {
    const workflow = read("../../../.github/workflows/release-desktop.yml");
    const manifestGenerator = read(
      "../../../scripts/generate-update-manifest.mjs",
    );
    expect(tauriConfig.bundle.createUpdaterArtifacts).toBe(true);
    expect(workflow).toContain("bundle/appimage/*.AppImage.sig");
    expect(workflow).toContain("bundle/macos/*.app.tar.gz");
    expect(workflow).toContain("bundle/macos/*.app.tar.gz.sig");
    expect(workflow).toContain("bundle/nsis/*.exe.sig");
    for (const platform of [
      "windows-x86_64",
      "linux-x86_64",
      "linux-aarch64",
      "darwin-x86_64",
      "darwin-aarch64",
    ]) {
      expect(manifestGenerator).toContain(platform);
    }
  });

  it("tests the Rust target with a staged sidecar", () => {
    const workflow = read("../../../.github/workflows/verify-rust.yml");
    expect(workflow).toContain("libwebkit2gtk-4.1-dev");
    expect(workflow).toContain("prepare-game.mjs --node-only");
    expect(workflow).toContain(
      "cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml",
    );
  });

  it("keeps blocking CI on the bounded fast suite", () => {
    const workflow = read("../../../.github/workflows/verify.yml");
    expect(rootPackage.scripts["verify"]).toContain("test:ci");
    expect(workflow).toContain("npm run verify");
  });

  it("builds Android and iOS bundles in their own workflow", () => {
    const workflow = read("../../../.github/workflows/release-mobile.yml");
    for (const needle of [
      "ubuntu-22.04",
      "macos-latest",
      "android build --apk --aab",
      "ios build --export-method app-store-connect",
      "ios build --ci --target aarch64-sim --no-sign",
      "ahdclient-android",
      "ahdclient-ios",
    ]) {
      expect(workflow).toContain(needle);
    }
    expect(workflow).toContain("Remove signed iOS material");
    expect(workflow).not.toContain("name: ahdclient-ios\n");
  });
});
