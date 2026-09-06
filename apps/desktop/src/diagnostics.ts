import { invoke } from "@tauri-apps/api/core";
import desktopPackage from "../package.json";

export type DiagnosticReason = "cancelled" | "error" | "stalled";

const redact = (line: string): string => line
  .replace(/C:\\Users\\[^\\\s]+/gi, "C:\\Users\\[redacted]")
  .replace(/\/Users\/[^/\s]+/g, "/Users/[redacted]")
  .replace(/\/home\/[^/\s]+/g, "/home/[redacted]")
  .replace(/(worlds[\\/])[^\\/\s]+/gi, "$1[world]")
  .slice(0, 500);

export function buildDiagnosticReport(reason: DiagnosticReason, message: string, lines: readonly string[]) {
  return {
    schemaVersion: 1,
    clientVersion: desktopPackage.version,
    reason,
    message: redact(message),
    logLines: lines.slice(-60).map(redact),
    occurredAt: new Date().toISOString(),
  } as const;
}

export async function submitDiagnostics(reason: DiagnosticReason, message: string, lines: readonly string[]): Promise<void> {
  await invoke("submit_diagnostics", { report: buildDiagnosticReport(reason, message, lines) });
}
