import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import tauriConfig from "../src-tauri/tauri.conf.json";
import desktopPackage from "../package.json";
import rootPackage from "../../../package.json";
import defaultCapability from "../src-tauri/capabilities/default.json";
import onlineCapability from "../src-tauri/capabilities/online.json";

describe("desktop security configuration", () => {
  it("ships a local-only CSP for the singleplayer window", () => {
    expect(tauriConfig.app.security.csp).toEqual({
      "default-src": "'self'",
      "connect-src": "ipc: http://ipc.localhost",
      "img-src": "'self' asset: http://asset.localhost data:",
      "style-src": "'self' 'unsafe-inline'",
    });
  });

  it("keeps the remote multiplayer window capability-empty", () => {
    expect(onlineCapability.windows).toEqual(["online"]);
    expect(onlineCapability.permissions).toEqual([]);
    expect("remote" in defaultCapability).toBe(false);
    expect("remote" in onlineCapability).toBe(false);
  });

  it("keeps persistent filesystem permissions scoped to managed saves", () => {
    const permissions = defaultCapability.permissions as Array<
      string | { identifier: string; allow?: Array<{ path: string }> }
    >;
    expect(permissions.filter((permission) => typeof permission === "string" && permission.startsWith("fs:"))).toEqual([]);

    const filesystemPermissions = permissions.filter(
      (permission): permission is { identifier: string; allow?: Array<{ path: string }> } =>
        typeof permission !== "string" && permission.identifier.startsWith("fs:"),
    );
    expect(filesystemPermissions.length).toBeGreaterThan(0);
    for (const permission of filesystemPermissions) {
      expect(permission.allow?.every(({ path }) => path === "$APPDATA/saves" || path.startsWith("$APPDATA/saves/"))).toBe(true);
    }
  });
});

describe("desktop platform configuration", () => {
  it("keeps release versions and the changelog synchronized", () => {
    const sourceDirectory = dirname(fileURLToPath(import.meta.url));
    const cargoManifest = readFileSync(join(sourceDirectory, "../src-tauri/Cargo.toml"), "utf8");
    const changelog = readFileSync(join(sourceDirectory, "../../../CHANGELOG.md"), "utf8");
    const cargoVersion = cargoManifest.match(/^version\s*=\s*"([^"]+)"/m)?.[1];

    expect(rootPackage.version).toBe(desktopPackage.version);
    expect(tauriConfig.version).toBe(desktopPackage.version);
    expect(cargoVersion).toBe(desktopPackage.version);
    expect(changelog).toContain(`## [${desktopPackage.version}]`);
  });

  it("builds native bundles on Linux, Windows, and macOS runners", () => {
    expect(tauriConfig.bundle.targets).toBe("all");
    expect(tauriConfig.app.windows[0]?.backgroundColor).toBe("#14141c");

    const sourceDirectory = dirname(fileURLToPath(import.meta.url));
    const workflow = readFileSync(join(sourceDirectory, "../../../.github/workflows/release-desktop.yml"), "utf8");
    expect(workflow).toContain("ubuntu-22.04");
    expect(workflow).toContain("windows-latest");
    expect(workflow).toContain("macos-latest");
    expect(workflow).toContain("--bundles appimage,deb");
    expect(workflow).toContain("--bundles nsis");
    expect(workflow).toContain("--bundles dmg");
  });

  it("tests the desktop Rust target before merge", () => {
    const sourceDirectory = dirname(fileURLToPath(import.meta.url));
    const workflow = readFileSync(join(sourceDirectory, "../../../.github/workflows/verify.yml"), "utf8");
    expect(workflow).toContain("libwebkit2gtk-4.1-dev");
    expect(workflow).toContain("dtolnay/rust-toolchain@stable");
    expect(workflow).toContain("cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml");
  });

  it("keeps a reproducible Android project and build commands", () => {
    const sourceDirectory = dirname(fileURLToPath(import.meta.url));
    const rustHost = readFileSync(join(sourceDirectory, "../src-tauri/src/lib.rs"), "utf8");
    const androidManifest = readFileSync(
      join(sourceDirectory, "../src-tauri/gen/android/app/src/main/AndroidManifest.xml"),
      "utf8",
    );
    const workflow = readFileSync(
      join(sourceDirectory, "../../../.github/workflows/verify-android.yml"),
      "utf8",
    );
    expect(desktopPackage.scripts["android:init"]).toBe("tauri android init");
    expect(desktopPackage.scripts["android:dev"]).toBe("tauri android dev");
    expect(desktopPackage.scripts["android:build:apk"]).toBe("tauri android build --apk");
    expect(desktopPackage.scripts["android:build:aab"]).toBe("tauri android build --aab");
    expect(existsSync(join(sourceDirectory, "../src-tauri/gen/android/gradlew"))).toBe(true);
    expect(existsSync(join(sourceDirectory, "../../../.github/workflows/verify-android.yml"))).toBe(true);
    expect(workflow).toContain('"platforms;android-36"');
    expect(workflow).toContain('"build-tools;36.0.0"');
    expect(workflow).toContain('"ndk;27.0.12077973"');
    expect(workflow).not.toContain("npm exec vitest");
    expect(workflow).toContain("npm test --workspace apps/desktop");
    expect(workflow).toContain("npm test --workspace packages/content");
    expect(workflow).toContain("npm test --workspace packages/engine -- --run src/engine.test.ts");
    expect(rustHost).toMatch(
      /#\[cfg\(mobile\)\][\s\S]*?fn open_online_window[\s\S]*?get_webview_window\("main"\)[\s\S]*?\.navigate\(url\)/,
    );
    expect(androidManifest).toContain('android:roundIcon="@mipmap/ic_launcher_round"');
    expect(androidManifest).not.toContain("LEANBACK_LAUNCHER");
  });

  it("keeps launcher effects inside the local security boundary", () => {
    const sourceDirectory = dirname(fileURLToPath(import.meta.url));
    const launcher = readFileSync(join(sourceDirectory, "launcher/Launcher.tsx"), "utf8");
    const globe = readFileSync(join(sourceDirectory, "launcher/CommandGlobe.tsx"), "utf8");
    const logo = readFileSync(join(sourceDirectory, "assets/ahd-logo.png"));
    expect(launcher).not.toContain("fetch(");
    expect(launcher).toContain('import ahdLogo from "../assets/ahd-logo.png";');
    expect(launcher).toContain('import desktopPackage from "../../package.json";');
    expect(launcher).toContain('className="launcher-logo" src={ahdLogo} alt=""');
    expect(launcher).toContain("AHDClient {desktopPackage.version}");
    expect(launcher).not.toContain("AHDClient 0.9.0");
    expect(launcher).not.toContain("StreakField");
    expect(createHash("sha256").update(logo).digest("hex")).toBe(
      "1a7fe54f33c781d6b7741277a20a9e800ca5525a0fbea790a7109c3e119f66a9",
    );
    expect(globe).toContain('window.addEventListener("resize", handleResize);');
    expect(globe).toContain('window.removeEventListener("resize", handleResize);');
    expect(globe).not.toContain('fillStyle = "#0a0e12"');
  });

  it("keeps the 1.0.1 launcher and save safeguards wired", () => {
    const sourceDirectory = dirname(fileURLToPath(import.meta.url));
    const app = readFileSync(join(sourceDirectory, "App.tsx"), "utf8");
    const launcher = readFileSync(join(sourceDirectory, "launcher/Launcher.tsx"), "utf8");
    const savesScreen = readFileSync(join(sourceDirectory, "saves/SavesScreen.tsx"), "utf8");

    expect(launcher).toContain('const MODE_STORAGE_KEY = "ahdclient.launcher.mode";');
    expect(launcher).toContain('const ERA_STORAGE_KEY = "ahdclient.launcher.era";');
    expect(launcher).toContain("continueBusy");
    expect(app).toContain('window.addEventListener("beforeunload", warnBeforeUnload);');
    expect(app).toContain("QUICK_SAVE_SLOT");
    expect(app).toContain('(e.ctrlKey || e.metaKey) && e.key.toLocaleLowerCase() === "s"');
    expect(savesScreen).toContain('type="search"');
    expect(savesScreen).toContain("preferredSaveSlot");
  });
});
