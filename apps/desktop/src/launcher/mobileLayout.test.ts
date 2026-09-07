import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./launcher.css", import.meta.url), "utf8");

describe("mobile launcher layout", () => {
  it("reserves a separate masthead row for account and settings controls", () => {
    expect(css).toMatch(
      /@media \(max-width: 700px\)[\s\S]*?\.launcher-mast\s*\{[^}]*padding-top:\s*58px;/,
    );
  });
});
