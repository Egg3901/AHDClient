import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./launcher.css", import.meta.url), "utf8");

describe("mobile launcher layout", () => {
  it("reserves a separate masthead row for account and settings controls", () => {
    expect(css).toMatch(
      /@media \(max-width: 700px\)[\s\S]*?\.launcher-mast\s*\{[^}]*padding-top:\s*58px;/,
    );
  });

  it("lets the backdrop reach the screen edges and keeps content in the safe areas", () => {
    const phone = css.slice(css.indexOf("@media (max-width: 700px)"));
    expect(phone).toMatch(/\.launcher-footer\s*\{[^}]*position:\s*static;[^}]*background:\s*transparent;/);
    expect(phone).toMatch(/\.launcher-footer\s*\{[^}]*env\(safe-area-inset-bottom\)/);
    expect(phone).toMatch(/\.launcher-stage\s*\{[^}]*env\(safe-area-inset-left\)[^}]*\}/);
    expect(phone).toMatch(/\.launcher-settings\s*\{\s*top:\s*0;\s*right:\s*0;/);
  });
});
