import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const scriptsDirectory = join(dirname(fileURLToPath(import.meta.url)), "../scripts");
const generatorFiles = readdirSync(scriptsDirectory)
  .filter((file) => file.startsWith("generate") && file.endsWith(".ts"))
  .sort();

describe("content generator sources", () => {
  it.each(generatorFiles)("keeps %s reproducible and checkout-independent", (file) => {
    const source = readFileSync(join(scriptsDirectory, file), "utf8");

    expect(source).not.toMatch(/\/root\//);
    expect(source).not.toMatch(/new Date\(\)|Date\.now\(\)/);
  });

  it("keeps generator code inside the content package typecheck", () => {
    const tsconfigPath = join(scriptsDirectory, "../tsconfig.json");
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8")) as { include?: string[] };

    expect(tsconfig.include).toContain("scripts");
  });
});
