/**
 * Desktop updater. The plugin is imported here so the webview pays the
 * load cost at startup, not on the first click.
 *
 * Windows: download() only fetches the installer. install() launches NSIS
 * and exits this process. Never call downloadAndInstall(); that would exit
 * as soon as the download finished, before Restart to update.
 * Linux/macOS: install() replaces files in place; relaunch() is required
 * after the player confirms.
 */
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import desktopPackage from "../package.json";
import { submitAutomaticDiagnostics } from "./diagnostics.js";

export const UPDATE_CHECK_TIMEOUT_MS = 15_000;

export type UpdaterSnapshot =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current" }
  | {
      kind: "downloading";
      version: string;
      notes: string;
      received: number;
      total: number | null;
    }
  | { kind: "ready"; version: string; notes: string }
  | { kind: "installing"; version: string }
  | { kind: "error"; message: string };

type Listener = () => void;

const CHECK_OPTIONS = { timeout: UPDATE_CHECK_TIMEOUT_MS };
const UPDATE_RESTART_KEY = "ahdclient.update.restart";

let snapshot: UpdaterSnapshot = { kind: "idle" };
let pending: Update | null = null;
let inFlight: Promise<void> | null = null;
const listeners = new Set<Listener>();

export function isWindowsUserAgent(userAgent: string): boolean {
  return /\bWindows\b/i.test(userAgent);
}

function windowsHost(): boolean {
  return typeof navigator !== "undefined" && isWindowsUserAgent(navigator.userAgent);
}

function emit(next: UpdaterSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function getUpdaterSnapshot(): UpdaterSnapshot {
  return snapshot;
}

export function subscribeUpdater(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetUpdaterForTests(): void {
  snapshot = { kind: "idle" };
  pending = null;
  inFlight = null;
  listeners.clear();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function notesFor(update: Update): string {
  return update.body ?? "A new AHDClient and paired game build are ready.";
}

async function downloadUpdate(update: Update): Promise<void> {
  let received = 0;
  let total: number | null = null;
  emit({
    kind: "downloading",
    version: update.version,
    notes: notesFor(update),
    received: 0,
    total: null,
  });
  await update.download((event: DownloadEvent) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? null;
      received = 0;
    } else if (event.event === "Progress") {
      received += event.data.chunkLength;
    }
    emit({
      kind: "downloading",
      version: update.version,
      notes: notesFor(update),
      received,
      total,
    });
  });
  emit({ kind: "ready", version: update.version, notes: notesFor(update) });
}

async function runCheck(): Promise<void> {
  auditPreviousRestart();
  emit({ kind: "checking" });
  try {
    const update = await check(CHECK_OPTIONS);
    if (!update) {
      pending = null;
      emit({ kind: "current" });
      return;
    }
    pending = update;
    await downloadUpdate(update);
  } catch (error) {
    pending = null;
    emit({ kind: "error", message: errorMessage(error) });
  }
}

export function startBackgroundUpdateCheck(): Promise<void> {
  if (inFlight) return inFlight;
  if (snapshot.kind === "downloading" || snapshot.kind === "ready" || snapshot.kind === "installing") {
    return Promise.resolve();
  }
  inFlight = runCheck().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export function checkForUpdatesNow(): Promise<void> {
  if (snapshot.kind === "downloading" || snapshot.kind === "installing") {
    return inFlight ?? Promise.resolve();
  }
  if (snapshot.kind === "ready") return Promise.resolve();
  return startBackgroundUpdateCheck();
}

export async function confirmRestartToUpdate(): Promise<void> {
  if (snapshot.kind !== "ready" || !pending) {
    throw new Error("No downloaded update is ready to install.");
  }
  const update = pending;
  emit({ kind: "installing", version: update.version });
  try {
    try {
      localStorage.setItem(UPDATE_RESTART_KEY, JSON.stringify({
        from: desktopPackage.version,
        to: update.version,
        requestedAt: Date.now(),
      }));
    } catch {
      // The installer still works when webview storage is unavailable.
    }
    // Windows: this call starts the passive NSIS installer and then exits the
    // app. Its visible progress window closes the long blank interval, while
    // restartAfterInstall makes NSIS own the one reliable relaunch.
    // download() has already completed, so this is the first moment the
    // process is allowed to quit for an update.
    await update.install({ restartAfterInstall: true });
    pending = null;
    if (!windowsHost()) {
      await relaunch();
    }
  } catch (error) {
    pending = null;
    const message = errorMessage(error);
    emit({ kind: "error", message });
    void submitAutomaticDiagnostics("error", `Desktop update install failed: ${message}`);
  }
}

function auditPreviousRestart(): void {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(UPDATE_RESTART_KEY);
    if (!raw) return;
    localStorage.removeItem(UPDATE_RESTART_KEY);
    const attempt = JSON.parse(raw) as { from?: string; to?: string; requestedAt?: number };
    if (attempt.to === desktopPackage.version) return;
    if (typeof attempt.requestedAt !== "number" || Date.now() - attempt.requestedAt > 7 * 86_400_000) return;
    void submitAutomaticDiagnostics(
      "error",
      `Desktop updater returned on ${desktopPackage.version} after requesting ${String(attempt.to ?? "unknown")}.`,
    );
  } catch {
    try { localStorage.removeItem(UPDATE_RESTART_KEY); } catch { /* unavailable */ }
  }
}
