import { mkdirSync, mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertStagedGame,
  pruneStagedGame,
  pruneForeignSharp,
  shouldKeepStagedGamePath,
} from "./prepare-game.mjs";

const scratch = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function touch(root, rel, body = "x") {
  const full = path.join(root, ...rel.split("/"));
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, body);
}

describe("prepare-game payload allowlist", () => {
  it("keeps runtime files and drops source, docs, tests and plans", () => {
    expect(shouldKeepStagedGamePath("server.js")).toBe(true);
    expect(shouldKeepStagedGamePath("launch.mjs")).toBe(true);
    expect(shouldKeepStagedGamePath(".next/static/app.js")).toBe(true);
    expect(shouldKeepStagedGamePath("node_modules/mongodb-438b504308ffa4be/index.js")).toBe(true);
    expect(shouldKeepStagedGamePath("src/data/npp-images.json")).toBe(true);
    expect(shouldKeepStagedGamePath("AGENTS.md")).toBe(false);
    expect(shouldKeepStagedGamePath("src/app/route.ts")).toBe(false);
    expect(shouldKeepStagedGamePath("src/app/route.test.ts")).toBe(false);
    expect(shouldKeepStagedGamePath("content/changelog/unreleased/plan.md")).toBe(false);
  });

  it("prunes a staged tree and requires the target sharp native", () => {
    const root = mkdtempSync(path.join(process.env.TMPDIR || tmpdir(), "ahd-stage-"));
    scratch.push(root);
    touch(root, "server.js");
    touch(root, "launch.mjs");
    touch(root, "package.json", "{}");
    touch(root, ".next/static/app.js");
    touch(root, ".next/server/app.js");
    touch(root, ".next/node_modules/mongodb-traced/README.md");
    touch(root, ".next/server/chunks/ssr.js", 'require("mongodb-438b504308ffa4be");\n');
    touch(root, "public/ahd-logo.png");
    touch(root, "node_modules/mongodb/package.json", "{}");
    touch(root, "node_modules/mongodb-438b504308ffa4be/package.json", "{}");
    touch(root, "node_modules/sharp/package.json", "{}");
    touch(root, "node_modules/@img/sharp-linux-x64/package.json", "{}");
    touch(root, "node_modules/@img/sharp-wasm32/package.json", "{}");
    touch(root, "src/data/npp-images.json", "[]");
    touch(root, "AGENTS.md");
    touch(root, "src/app/route.ts");
    touch(root, "docs/DESIGN.md");
    pruneStagedGame(root);
    expect(() => assertStagedGame(root, "x86_64-unknown-linux-gnu")).toThrow(/foreign sharp/);
    pruneForeignSharp(root, "x86_64-unknown-linux-gnu");
    expect(existsSync(path.join(root, "node_modules/@img/sharp-wasm32"))).toBe(false);
    expect(existsSync(path.join(root, "AGENTS.md"))).toBe(false);
    expect(existsSync(path.join(root, "src", "app"))).toBe(false);
    expect(existsSync(path.join(root, "docs"))).toBe(false);
    expect(existsSync(path.join(root, "server.js"))).toBe(true);
    assertStagedGame(root, "x86_64-unknown-linux-gnu");
  });

  it("fails when the Windows sharp native is missing", () => {
    const root = mkdtempSync(path.join(process.env.TMPDIR || tmpdir(), "ahd-stage-win-"));
    scratch.push(root);
    touch(root, "server.js");
    touch(root, "launch.mjs");
    touch(root, ".next/static/app.js");
    touch(root, ".next/server/app.js");
    touch(root, ".next/node_modules/mongodb-traced/README.md");
    touch(root, "public/logo.png");
    touch(root, "node_modules/mongodb/package.json", "{}");
    touch(root, "node_modules/sharp/package.json", "{}");
    touch(root, "node_modules/@img/sharp-linux-x64/package.json", "{}");
    expect(() => assertStagedGame(root, "x86_64-pc-windows-msvc")).toThrow(/sharp-win32-x64/);
  });
});
