import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import tauriConfig from "../src-tauri/tauri.conf.json";
import desktopPackage from "../package.json";
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
  it("builds native bundles on Linux, Windows, and macOS runners", () => {
    expect(tauriConfig.bundle.targets).toBe("all");

    const sourceDirectory = dirname(fileURLToPath(import.meta.url));
    const workflow = readFileSync(join(sourceDirectory, "../../../.github/workflows/release-desktop.yml"), "utf8");
    expect(workflow).toContain("ubuntu-22.04");
    expect(workflow).toContain("windows-latest");
    expect(workflow).toContain("macos-latest");
    expect(workflow).toContain("--bundles appimage,deb");
    expect(workflow).toContain("--bundles nsis");
    expect(workflow).toContain("--bundles dmg");
  });

  it("keeps a reproducible Android project and build commands", () => {
    const sourceDirectory = dirname(fileURLToPath(import.meta.url));
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
  });
});
