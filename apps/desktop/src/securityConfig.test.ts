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

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(join(here, relative), "utf8");

describe("desktop security configuration", () => {
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
    for (const capability of [defaultCapability, onlineCapability, gameCapability]) {
      expect("remote" in capability).toBe(false);
    }
  });

  it("gives the launcher no filesystem or shell access of its own", () => {
    const permissions = defaultCapability.permissions as Array<string | { identifier: string }>;
    const identifiers = permissions.map((p) => (typeof p === "string" ? p : p.identifier));
    expect(identifiers.filter((id) => id.startsWith("fs:") || id.startsWith("shell:"))).toEqual([]);
    for (const command of ["game-start", "game-stop", "game-request", "open-game-window", "list-worlds"]) {
      expect(identifiers).toContain(`allow-${command}`);
    }
  });

  it("pins the game window to its own loopback port in Rust", () => {
    const rust = read("../src-tauri/src/lib.rs");
    expect(rust).toMatch(/fn is_local_game_url\(/);
    expect(rust).toMatch(/WebviewWindowBuilder::new\(&app, "game"/);
    expect(rust).toMatch(/"--parent-pid"/);
    expect(rust).toMatch(/"--no-browser"/);
  });
});

describe("desktop platform configuration", () => {
  it("keeps release versions and the changelog synchronized", () => {
    const cargoVersion = read("../src-tauri/Cargo.toml").match(/^version\s*=\s*"([^"]+)"/m)?.[1];
    expect(rootPackage.version).toBe(desktopPackage.version);
    expect(tauriConfig.version).toBe(desktopPackage.version);
    expect(cargoVersion).toBe(desktopPackage.version);
    expect(read("../../../CHANGELOG.md")).toContain(`## [${desktopPackage.version}]`);
  });

  it("bundles Node as a sidecar and the game as a resource", () => {
    expect(tauriConfig.bundle.externalBin).toEqual(["binaries/ahd-node"]);
    expect(tauriConfig.bundle.resources).toEqual({ "resources/game": "game" });
    expect(tauriConfig.app.windows[0]?.backgroundColor).toBe("#14141c");
  });

  it("stages the game before every native bundle", () => {
    const workflow = read("../../../.github/workflows/release-desktop.yml");
    expect(workflow).toContain("Egg3901/AHDGame");
    expect(workflow).toContain("scripts/prepare-game.mjs");
    for (const needle of ["ubuntu-22.04", "windows-latest", "macos-latest", "--bundles appimage,deb", "--bundles nsis", "--bundles dmg", "actions/upload-artifact@v4", "ahdclient-windows-x86_64", "bundle/nsis/*.exe"]) {
      expect(workflow).toContain(needle);
    }
    expect(workflow).not.toContain("uploadWorkflowArtifacts");
  });

  it("tests the Rust target with a staged sidecar", () => {
    const workflow = read("../../../.github/workflows/verify-rust.yml");
    expect(workflow).toContain("libwebkit2gtk-4.1-dev");
    expect(workflow).toContain("prepare-game.mjs --node-only");
    expect(workflow).toContain("cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml");
  });

  it("keeps blocking CI on the bounded fast suite", () => {
    const workflow = read("../../../.github/workflows/verify.yml");
    expect(rootPackage.scripts["verify"]).toContain("test:ci");
    expect(workflow).toContain("npm run verify");
  });

  it("has no Android target left", () => {
    expect(Object.keys(desktopPackage.scripts).some((s) => s.startsWith("android:"))).toBe(false);
  });
});
