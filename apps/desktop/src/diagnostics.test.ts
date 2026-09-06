import { describe, expect, it } from "vitest";
import { buildDiagnosticReport } from "./diagnostics";

describe("diagnostic reports", () => {
  it("redacts usernames and world names and bounds logs", () => {
    const report = buildDiagnosticReport("stalled", "C:\\Users\\rainf\\failure", [
      ...Array.from({ length: 70 }, (_, index) => `line ${index}`),
      "C:\\Users\\rainf\\AppData\\worlds\\my-private-save\\mongod.exe",
    ]);
    const json = JSON.stringify(report);
    expect(json).not.toContain("rainf");
    expect(json).not.toContain("my-private-save");
    expect(report.logLines).toHaveLength(60);
  });
});
