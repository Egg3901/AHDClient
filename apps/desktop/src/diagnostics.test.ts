import { describe, expect, it, vi } from "vitest";

const invoke = vi.fn<(command: string, args?: unknown) => Promise<void>>(async () => undefined);
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: unknown) => invoke(command, args),
}));
import {
  buildDiagnosticReport,
  clearDiagnostics,
  diagnosticEntries,
  recordDiagnostic,
  submitAutomaticDiagnostics,
} from "./diagnostics";

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

  it("redacts identities and credentials before retaining console output", () => {
    clearDiagnostics();
    recordDiagnostic("error", {
      email: "player@example.com",
      authorization: "Bearer private-token",
      password: "hunter2",
      displayName: "Real Name",
      accessToken: "abc123",
    });
    const json = JSON.stringify(diagnosticEntries());
    expect(json).not.toContain("player@example.com");
    expect(json).not.toContain("private-token");
    expect(json).not.toContain("hunter2");
    expect(json).not.toContain("Real Name");
    expect(json).not.toContain("abc123");
    expect(json).toContain("[email]");
    expect(json).toContain("[redacted]");
  });

  it("keeps only the latest 200 console entries", () => {
    clearDiagnostics();
    for (let index = 0; index < 205; index += 1) recordDiagnostic("log", `line ${index}`);
    expect(diagnosticEntries()).toHaveLength(200);
    expect(diagnosticEntries()[0]?.message).toBe("line 5");
  });

  it("automatically sends one redacted copy of a repeated failure", async () => {
    invoke.mockClear();
    const message = "C:\\Users\\private-name\\update failed";
    await expect(submitAutomaticDiagnostics("error", message)).resolves.toBe(true);
    await expect(submitAutomaticDiagnostics("error", message)).resolves.toBe(false);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(invoke.mock.calls)).not.toContain("private-name");
  });
});
