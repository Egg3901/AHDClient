import { invoke } from "@tauri-apps/api/core";
import { game } from "./worlds.js";
import { deserializeQueue, maybeBuildAndQueue, serializeQueue, validateReport } from "./simulationStatistics.js";
import type { StatisticsQueue } from "./simulationStatistics.js";

const KEY = "ahdclient.statistics.queue.v1";
let consent = false;
let consentSync = Promise.resolve();
let sending = false;
let collecting = false;
const recorded = new Map<string, number>();
function load(): StatisticsQueue {
  try { return deserializeQueue(localStorage.getItem(KEY), Date.now()); }
  catch { return { pending: [] }; }
}
function save(queue: StatisticsQueue): void {
  try { localStorage.setItem(KEY, serializeQueue(queue)); } catch { /* A full disk must not block gameplay. */ }
}
export function setStatisticsConsent(enabled: boolean): Promise<void> {
  consent = enabled;
  if (!enabled) {
    recorded.clear();
    try { localStorage.removeItem(KEY); } catch { /* Native consent still blocks sending. */ }
  }
  consentSync = consentSync.catch(() => {}).then(() => invoke<void>("set_statistics_consent", { enabled: consent }));
  return consentSync;
}
export async function flushStatistics(): Promise<void> {
  if (!consent || sending) return;
  sending = true;
  try {
    await consentSync;
    for (const item of load().pending) {
      if (!consent) break;
      const checked = validateReport(item.report);
      if (!checked.ok) continue;
      await invoke("submit_statistics", { report: checked.report });
      // A late opt-out must not recreate the queue that the user just cleared.
      if (!consent) break;
      save({ pending: load().pending.filter((entry) => entry.id !== item.id) });
    }
  } catch { /* Offline: leave unsent reports bounded by the queue TTL. */ }
  finally { sending = false; }
}
export async function captureStatistics(slot: string, force = false): Promise<void> {
  if (!consent || collecting) return;
  collecting = true;
  try {
    const status = await game.singleplayerStatus();
    if (!consent || status.turn === null || recorded.get(slot) === status.turn || (!force && status.turn % 12 !== 0)) return;
    const input: unknown = await game.request("GET", "/api/singleplayer/statistics");
    if (!consent) return;
    const queued = maybeBuildAndQueue(load(), consent, input, Date.now(), { appVersion: "2.0.1" });
    if (queued.accepted) { save(queued.queue); recorded.set(slot, status.turn); }
    void flushStatistics();
  } catch { /* Statistics are optional and never block saving or turn completion. */ }
  finally { collecting = false; }
}
