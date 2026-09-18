/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { serializeQueue, type StatisticsQueue, type StatisticsReport } from "./simulationStatistics.js";

const { invoke, singleplayerStatus, gameRequest } = vi.hoisted(() => ({
  invoke: vi.fn(),
  singleplayerStatus: vi.fn(),
  gameRequest: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("./worlds.js", () => ({ game: { singleplayerStatus, request: gameRequest } }));

const QUEUE_KEY = "ahdclient.statistics.queue.v1";
const report: StatisticsReport = {
  version: 1 as const,
  createdAt: "2026-09-06T00:00:00.000Z",
  appMajorVersion: 2,
  setup: { era: "2023", mode: "worldsim", difficulty: "normal", autonomy: "v4", featureFlags: {} },
  metrics: {},
  turn: 12,
};
function seedQueue(): void {
  const queue: StatisticsQueue = { pending: [{ id: "r-test", report, queuedAt: Date.now(), expiresAt: Date.now() + 60_000 }] };
  localStorage.setItem(QUEUE_KEY, serializeQueue(queue));
}
async function loadDelivery() {
  vi.resetModules();
  return import("./statisticsDelivery.js");
}

describe("statistics delivery privacy races", () => {
  afterEach(() => { localStorage.clear(); vi.clearAllMocks(); });

  it("clears a collection that is pending when consent is withdrawn", async () => {
    let releaseStatus!: (value: { turn: number }) => void;
    singleplayerStatus.mockReturnValue(new Promise((resolve) => { releaseStatus = resolve; }));
    const delivery = await loadDelivery();
    await delivery.setStatisticsConsent(true);
    const collecting = delivery.captureStatistics("slot", true);
    await delivery.setStatisticsConsent(false);
    releaseStatus({ turn: 12 });
    await collecting;

    expect(localStorage.getItem(QUEUE_KEY)).toBeNull();
    expect(gameRequest).not.toHaveBeenCalled();
  });

  it("does not recreate a queue when opt out races an in-flight send", async () => {
    let releaseSend!: () => void;
    invoke.mockImplementation((command: string) => command === "submit_statistics"
      ? new Promise<void>((resolve) => { releaseSend = resolve; })
      : Promise.resolve());
    seedQueue();
    const delivery = await loadDelivery();
    await delivery.setStatisticsConsent(true);
    const sending = delivery.flushStatistics();
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith("submit_statistics", expect.anything()));
    await delivery.setStatisticsConsent(false);
    releaseSend();
    await sending;

    expect(localStorage.getItem(QUEUE_KEY)).toBeNull();
  });

  it("captures the first sample even when the turn is not a 12-turn multiple", async () => {
    invoke.mockResolvedValue(undefined);
    singleplayerStatus.mockResolvedValue({ turn: 3 });
    gameRequest.mockResolvedValue({
      setup: { era: "2019", mode: "normal", difficulty: "normal", autonomy: "v4", featureFlags: {} },
      metrics: { partyCount: 4 },
      turn: 3,
    });
    const delivery = await loadDelivery();
    await delivery.setStatisticsConsent(true);
    await delivery.captureStatistics("slot");
    expect(gameRequest).toHaveBeenCalledWith("GET", "/api/singleplayer/statistics");
    expect(invoke).toHaveBeenCalledWith("submit_statistics", expect.anything());
    gameRequest.mockClear();
    invoke.mockClear();
    singleplayerStatus.mockResolvedValue({ turn: 4 });
    await delivery.captureStatistics("slot");
    expect(gameRequest).not.toHaveBeenCalled();
    singleplayerStatus.mockResolvedValue({ turn: 12 });
    await delivery.captureStatistics("slot");
    expect(gameRequest).toHaveBeenCalled();
  });

  it("retains a bounded queue when delivery fails offline", async () => {
    invoke.mockImplementation((command: string) => command === "submit_statistics"
      ? Promise.reject(new Error("offline"))
      : Promise.resolve());
    seedQueue();
    const delivery = await loadDelivery();
    await delivery.setStatisticsConsent(true);
    await delivery.flushStatistics();

    const queued = localStorage.getItem(QUEUE_KEY);
    expect(queued).toBeTruthy();
    expect(JSON.parse(queued!).pending).toHaveLength(1);
  });
});
