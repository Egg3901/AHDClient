import { describe, expect, it } from "vitest";
import {
  MAX_QUEUE_LENGTH,
  MAX_REPORT_JSON_BYTES,
  REPORT_TTL_MS,
  REPORT_VERSION,
  buildStatisticsReport,
  createEmptyQueue,
  createReportId,
  deserializeQueue,
  drainDueReports,
  enqueueValidatedReport,
  maybeBuildAndQueue,
  parseAppMajorVersion,
  pruneExpiredReports,
  serializeQueue,
  setConsentEnabled,
  validateReport,
} from "./simulationStatistics.js";

const NOW = 1_700_000_000_000;

interface MutableInput {
  setup: {
    era: string;
    mode: string;
    difficulty: string;
    autonomy: string;
    featureFlags: Record<string, boolean>;
  };
  metrics: {
    revenueBySector: Record<string, number>;
    [key: string]: number | Record<string, number>;
  };
  turn: number;
}

function validInput(): MutableInput {
  return {
    setup: {
      era: "2019",
      mode: "worldsim",
      difficulty: "normal",
      autonomy: "v4",
      featureFlags: { forexEnabled: true, rpgStatsEnabled: false },
    },
    metrics: {
      partyCount: 120,
      democracyCountryCount: 24,
      autocracyCountryCount: 6,
      corporationCount: 40,
      totalCorporationEmployment: 5_000_000,
      totalCorporationRevenue: 1_200_000_000,
      revenueBySector: { energy: 500_000_000, technology: 700_000_000 },
      gdpTotal: 80_000_000_000,
      gdpPerCapita: 12000,
      tradeVolume: 9_000_000_000,
      unemploymentRatePercent: 5.5,
      inflationRatePercent: 2.1,
      totalPopulation: 8_000_000_000,
      averageStability: 62.5,
      minStability: 10,
      maxStability: 95,
    },
    turn: 12,
  };
}

function builtReport() {
  const built = buildStatisticsReport(validInput(), { nowMs: NOW, appVersion: "2.0.1" });
  if (!built.ok) throw new Error(`setup failed: ${built.errors.join("; ")}`);
  return built.report;
}

describe("buildStatisticsReport", () => {
  it("builds a versioned report with major version metadata only", () => {
    const built = buildStatisticsReport(validInput(), { nowMs: NOW, appVersion: "2.0.1" });
    if (!built.ok) throw new Error(built.errors.join("; "));
    expect(built.report.version).toBe(REPORT_VERSION);
    expect(built.report.createdAt).toBe("2023-11-14T00:00:00.000Z");
    expect(built.report.appMajorVersion).toBe(2);
    expect(built.report.setup.mode).toBe("worldsim");
    expect(built.report.metrics.partyCount).toBe(120);
    const json = JSON.stringify(built.report);
    expect(json).not.toContain("2.0.1");
    expect(json.length).toBeLessThanOrEqual(MAX_REPORT_JSON_BYTES);
  });

  it("accepts each allowlisted mode and parses major versions", () => {
    for (const mode of ["normal", "head-of-state", "worldsim"]) {
      const input = validInput();
      input.setup.mode = mode;
      const built = buildStatisticsReport(input, { nowMs: NOW });
      expect(built.ok).toBe(true);
    }
    expect(parseAppMajorVersion("2.0.1")).toBe(2);
    expect(parseAppMajorVersion("v10.3")).toBe(10);
    expect(parseAppMajorVersion(null)).toBeNull();
    expect(parseAppMajorVersion("next")).toBeNull();
  });

  it("rejects names, account ids, save data, identifiers, and nested extras", () => {
    const cases: Array<Record<string, unknown>> = [
      { displayName: "someone" },
      { accountId: "abc" },
      { saveData: "..." },
      { notes: "free text" },
    ];
    for (const extra of cases) {
      const built = buildStatisticsReport({ ...validInput(), ...extra }, { nowMs: NOW });
      expect(built.ok).toBe(false);
    }
    const withIds = validInput();
    (withIds.setup as Record<string, unknown>)["countryIds"] = ["usa"];
    expect(buildStatisticsReport(withIds, { nowMs: NOW }).ok).toBe(false);

    const withParty = validInput();
    (withParty.metrics as Record<string, unknown>)["partyNames"] = ["x"];
    expect(buildStatisticsReport(withParty, { nowMs: NOW }).ok).toBe(false);

    const withCorp = validInput();
    (withCorp.metrics as Record<string, unknown>)["corporationId"] = "c1";
    expect(buildStatisticsReport(withCorp, { nowMs: NOW }).ok).toBe(false);
  });

  it("rejects non finite values, out of range numbers, and bad shapes", () => {
    const badMode = validInput();
    badMode.setup.mode = "sandbox";
    expect(buildStatisticsReport(badMode, { nowMs: NOW }).ok).toBe(false);

    for (const metrics of [
      { partyCount: Number.NaN },
      { partyCount: Number.POSITIVE_INFINITY },
      { partyCount: -1 },
      { partyCount: 1.5 },
      { totalPopulation: 1e12 },
      { averageStability: 101 },
      { unemploymentRatePercent: -5 },
      { minStability: 80, maxStability: 20 },
    ]) {
      const input = validInput();
      Object.assign(input.metrics, metrics);
      const built = buildStatisticsReport(input, { nowMs: NOW });
      expect(built.ok).toBe(false);
    }

    const badFlag = validInput();
    badFlag.setup.featureFlags = { corporations: "yes" } as unknown as Record<string, boolean>;
    expect(buildStatisticsReport(badFlag, { nowMs: NOW }).ok).toBe(false);

    const badSectors: Record<string, number> = {};
    for (let i = 0; i < 40; i++) badSectors[`sector-${i}`] = 1;
    const overSized = validInput();
    overSized.metrics.revenueBySector = badSectors;
    expect(buildStatisticsReport(overSized, { nowMs: NOW }).ok).toBe(false);
  });
});

describe("consent gating", () => {
  it("does not build or queue while consent is disabled", () => {
    const result = maybeBuildAndQueue(createEmptyQueue(), false, validInput(), NOW);
    expect(result.accepted).toBe(false);
    expect(result.reportId).toBeNull();
    expect(result.queue.pending).toHaveLength(0);
  });

  it("clears all pending reports on opt out", () => {
    const queued = maybeBuildAndQueue(createEmptyQueue(), true, validInput(), NOW);
    expect(queued.queue.pending).toHaveLength(1);
    const cleared = setConsentEnabled(queued.queue, false);
    expect(cleared.pending).toHaveLength(0);
    expect(queued.queue.pending).toHaveLength(1);
  });

  it("applies a late opt out at drain time via a fresh consent check", () => {
    const queued = maybeBuildAndQueue(createEmptyQueue(), true, validInput(), NOW);
    const blocked = drainDueReports(queued.queue, false, NOW + 1000);
    expect(blocked.due).toHaveLength(0);
    expect(blocked.queue.pending).toHaveLength(1);
    const allowed = drainDueReports(queued.queue, true, NOW + 1000);
    expect(allowed.due).toHaveLength(1);
    expect(allowed.queue.pending).toHaveLength(0);
  });
});

describe("queue bounds, TTL, and persistence", () => {
  it("prunes expired reports and bounds the queue by dropping the oldest", () => {
    let queue = createEmptyQueue();
    const first = maybeBuildAndQueue(queue, true, validInput(), NOW);
    queue = first.queue;
    const pruned = pruneExpiredReports(queue, NOW + REPORT_TTL_MS + 1);
    expect(pruned.pending).toHaveLength(0);

    queue = createEmptyQueue();
    for (let i = 0; i < MAX_QUEUE_LENGTH + 3; i++) {
      const report = builtReport();
      const enqueued = enqueueValidatedReport(queue, report, NOW + i, `id-${i}`);
      queue = enqueued.queue;
      if (i >= MAX_QUEUE_LENGTH) expect(enqueued.droppedId).not.toBeNull();
    }
    expect(queue.pending).toHaveLength(MAX_QUEUE_LENGTH);
    expect(queue.pending[0]?.id).toBe("id-3");
  });

  it("round trips through persistence and drops corrupt or tampered entries", () => {
    const queued = maybeBuildAndQueue(createEmptyQueue(), true, validInput(), NOW);
    const text = serializeQueue(queued.queue, NOW);
    const restored = deserializeQueue(text, NOW + 1000);
    expect(restored.pending).toHaveLength(1);

    expect(deserializeQueue("not json{", NOW).pending).toHaveLength(0);
    expect(deserializeQueue(null, NOW).pending).toHaveLength(0);
    expect(deserializeQueue(JSON.stringify({ pending: "oops" }), NOW).pending).toHaveLength(0);

    const tampered = JSON.parse(text) as { pending: Array<Record<string, unknown>> };
    const entry = tampered.pending[0];
    if (entry) {
      entry["report"] = { ...(entry["report"] as object), partyCount: 5, injectedName: "mallory" };
      entry["id"] = "tampered-1";
    }
    const cleaned = deserializeQueue(JSON.stringify(tampered), NOW + 1000);
    expect(cleaned.pending).toHaveLength(0);

    const expired = deserializeQueue(text, NOW + REPORT_TTL_MS + 1);
    expect(expired.pending).toHaveLength(0);
  });

  it("revalidates before drain and never returns expired items", () => {
    const report = builtReport();
    const enqueued = enqueueValidatedReport(createEmptyQueue(), report, NOW, "keep-1");
    const bad = {
      id: "bad-1",
      report: { version: 999, setup: {}, metrics: {} },
      queuedAt: NOW,
      expiresAt: NOW + REPORT_TTL_MS,
    };
    const queue = {
      pending: [...enqueued.queue.pending, bad as unknown as (typeof enqueued.queue.pending)[number]],
    };
    const drained = drainDueReports(queue, true, NOW + 1000);
    expect(drained.due.map((d) => d.id)).toEqual(["keep-1"]);
    expect(drained.queue.pending).toHaveLength(0);

    const late = drainDueReports(enqueued.queue, true, NOW + REPORT_TTL_MS + 1);
    expect(late.due).toHaveLength(0);
  });

  it("rejects invalid reports at enqueue time without touching the queue", () => {
    const queue = createEmptyQueue();
    const refused = enqueueValidatedReport(queue, { version: 1, nope: true }, NOW);
    expect(refused.accepted).toBe(false);
    expect(refused.queue.pending).toHaveLength(0);
    expect(validateReport({ version: 1 }).ok).toBe(false);
  });
});

describe("autonomy allowlist", () => {
  /**
   * The client validates a report before uploading it. A tier the game accepts
   * but this set does not means a world the player was allowed to create
   * silently stops reporting — the failure is invisible from both ends.
   */
  it("accepts every tier the game defines, including v5", () => {
    for (const autonomy of ["off", "v0", "v1", "v2", "v3", "v4", "v5"]) {
      const input = validInput();
      input.setup.autonomy = autonomy;
      expect(buildStatisticsReport(input, { nowMs: NOW, appVersion: "2.0.1" }).ok).toBe(true);
    }
  });

  it("still refuses a tier that does not exist", () => {
    const input = validInput();
    input.setup.autonomy = "v6";
    expect(buildStatisticsReport(input, { nowMs: NOW, appVersion: "2.0.1" }).ok).toBe(false);
  });
});

describe("identifier hygiene", () => {
  it("emits no stable installation identifier and unique per report ids", () => {
    const report = builtReport();
    const json = JSON.stringify(report);
    expect(json).not.toMatch(/install|machine|device|user|account/i);
    const a = createReportId(NOW);
    const b = createReportId(NOW);
    expect(a).not.toBe(b);
    expect(builtReport().createdAt).toBe("2023-11-14T00:00:00.000Z");
  });
});
