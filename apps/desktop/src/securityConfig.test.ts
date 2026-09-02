import { describe, expect, it } from "vitest";
import tauriConfig from "../src-tauri/tauri.conf.json";
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
