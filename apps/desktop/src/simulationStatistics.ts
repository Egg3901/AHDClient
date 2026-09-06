import { FEATURE_OPTIONS } from "./screens/featureOptions.js";

/**
 * Privacy preserving aggregate statistics reports for opt in singleplayer and
 * worldsim telemetry.
 *
 * What this module is: a pure report builder plus a small local consent gated
 * queue. The parent (App / launcher wiring, owned by other agents) reads the
 * game backend, passes plain aggregates here, persists the queue string, and
 * decides if and when to transmit anything.
 *
 * What this module is not: there is no HTTP endpoint, no fetch, no transport,
 * and no claim about what any server does with a report once it leaves the
 * machine. Anonymity of a transmitted report depends on the transport and the
 * receiving end, which this file cannot see and does not model.
 *
 * Privacy rules enforced here:
 * - Explicit allowlists only. Top level, setup, and metrics accept a fixed
 *   set of keys; anything else (names, account ids, raw save data, free
 *   text, country / party / corporation identifiers, arbitrary nested keys)
 *   fails validation and no report is built.
 * - All metrics are finite numbers inside documented ranges. Non finite
 *   values (NaN, Infinity) are rejected.
 * - Bounded sizes: bounded string lengths, bounded sector / flag maps, a
 *   bounded queue, and a maximum serialized report size.
 * - No stable installation identifier is created, read, or stored. Queue
 *   item ids are random per report. Only the report schema version and the
 *   application major version (parsed from a caller supplied version string,
 *   never the full string) are recorded.
 * - Consent gates everything. Building through the queue helper with consent
 *   off builds nothing; turning consent off clears pending items; draining
 *   rechecks consent at drain time, so an opt out between enqueue and flush
 *   still blocks delivery. Callers must pass a freshly read consent value
 *   after any async gap.
 *
 * No dependencies. All functions are pure (no I/O, no network, no storage
 * access); persistence is the caller serializing the queue string.
 */

/** Schema version stamped on every report built by this module. */
export const REPORT_VERSION = 1 as const;

/** How long a queued report stays eligible for delivery. Short on purpose. */
export const REPORT_TTL_MS = 24 * 60 * 60 * 1000;

/** Maximum queued reports held locally. Enqueue past this drops the oldest. */
export const MAX_QUEUE_LENGTH = 10;

/** Maximum serialized JSON size of a single report, in bytes. */
export const MAX_REPORT_JSON_BYTES = 8192;

/** Maximum entries in the per sector revenue map. */
export const MAX_SECTOR_ENTRIES = 32;

/** Maximum feature flags recorded in world setup. */
export const MAX_FEATURE_FLAGS = 32;

/** Maximum length of a sector key or feature flag name. */
export const MAX_MAP_KEY_LENGTH = 64;

/** World setup modes this reporter accepts. Fixed allowlist. */
export const ALLOWED_MODES = ["normal", "head-of-state", "worldsim"] as const;

export type SimulationMode = (typeof ALLOWED_MODES)[number];

/** Short opaque tokens (era, difficulty, autonomy): no free text. */
const ALLOWED_ERAS = new Set(["1953", "1979", "1991", "1999", "2007", "2019", "2023"]);
const ALLOWED_DIFFICULTIES = new Set(["easy", "normal", "hard"]);
const ALLOWED_AUTONOMY = new Set(["off", "v0", "v1", "v2", "v3", "v4"]);
const ALLOWED_FLAGS = new Set<string>(FEATURE_OPTIONS.map((flag) => flag.key));
const ALLOWED_SECTORS = new Set(["financial", "media", "manufacturing", "chemical_industries", "healthcare", "retail", "automobiles", "technology", "energy", "agriculture", "real_estate", "construction", "defense", "telecommunications", "entertainment", "logistics", "extraction"]);
const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _.\-]{0,31}$/;
const MAP_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.\-]{0,63}$/;
const REPORT_ID_PATTERN = /^[A-Za-z0-9_.\-]{1,64}$/;

interface NumericSpec {
  readonly min: number;
  readonly max: number;
  readonly integer: boolean;
}

/**
 * Allowlisted numeric aggregate fields. Every key here is the only set of
 * metric names a report may carry.
 */
const NUMERIC_SPECS: Record<string, NumericSpec> = {
  nppCount: { min: 0, max: 1_000_000, integer: true },
  nppOfficeSharePercent: { min: 0, max: 100, integer: false },
  marketFillRatePercent: { min: 0, max: 100, integer: false },
  corporateLossMakingSharePercent: { min: 0, max: 100, integer: false },
  partyCount: { min: 0, max: 1_000_000, integer: true },
  democracyCountryCount: { min: 0, max: 1_000, integer: true },
  autocracyCountryCount: { min: 0, max: 1_000, integer: true },
  corporationCount: { min: 0, max: 1_000_000, integer: true },
  totalCorporationEmployment: { min: 0, max: 1e11, integer: true },
  totalCorporationRevenue: { min: 0, max: 1e15, integer: false },
  gdpTotal: { min: 0, max: 1e15, integer: false },
  gdpPerCapita: { min: 0, max: 1e9, integer: false },
  tradeVolume: { min: 0, max: 1e15, integer: false },
  unemploymentRatePercent: { min: 0, max: 100, integer: false },
  inflationRatePercent: { min: -100, max: 1000, integer: false },
  totalPopulation: { min: 0, max: 2e10, integer: true },
  averageStability: { min: 0, max: 100, integer: false },
  minStability: { min: 0, max: 100, integer: false },
  maxStability: { min: 0, max: 100, integer: false },
};

const NUMERIC_FIELDS = Object.keys(NUMERIC_SPECS);

export interface ValidatedWorldSetup {
  readonly era: string;
  readonly mode: SimulationMode;
  readonly difficulty: string;
  readonly autonomy: string;
  readonly featureFlags: Record<string, boolean>;
}

export interface ValidatedMetrics {
  readonly nppCount?: number;
  readonly nppOfficeSharePercent?: number;
  readonly marketFillRatePercent?: number;
  readonly corporateLossMakingSharePercent?: number;
  readonly partyCount?: number;
  readonly democracyCountryCount?: number;
  readonly autocracyCountryCount?: number;
  readonly corporationCount?: number;
  readonly totalCorporationEmployment?: number;
  readonly totalCorporationRevenue?: number;
  readonly revenueBySector?: Record<string, number>;
  readonly gdpTotal?: number;
  readonly gdpPerCapita?: number;
  readonly tradeVolume?: number;
  readonly unemploymentRatePercent?: number;
  readonly inflationRatePercent?: number;
  readonly totalPopulation?: number;
  readonly averageStability?: number;
  readonly minStability?: number;
  readonly maxStability?: number;
}

export interface StatisticsReport {
  readonly version: typeof REPORT_VERSION;
  readonly createdAt: string;
  /** Major version only (for example 2 from "2.0.1"). Null when unknown. */
  readonly appMajorVersion: number | null;
  readonly setup: ValidatedWorldSetup;
  readonly metrics: ValidatedMetrics;
  readonly turn: number | null;
}

export interface QueuedReport {
  readonly id: string;
  readonly report: StatisticsReport;
  readonly queuedAt: number;
  readonly expiresAt: number;
}

export interface StatisticsQueue {
  readonly pending: readonly QueuedReport[];
}

export interface BuildOptions {
  /** Epoch milliseconds used for createdAt. Defaults to Date.now(). */
  readonly nowMs?: number;
  /** Full version string ("2.0.1"); only the major number is stored. */
  readonly appVersion?: string | null;
}

export type BuildResult =
  | { readonly ok: true; readonly report: StatisticsReport }
  | { readonly ok: false; readonly errors: readonly string[] };

export interface EnqueueResult {
  readonly queue: StatisticsQueue;
  readonly accepted: boolean;
  readonly reportId: string | null;
  readonly droppedId: string | null;
  readonly errors: readonly string[];
}

export interface BuildAndQueueResult {
  readonly queue: StatisticsQueue;
  readonly accepted: boolean;
  readonly reportId: string | null;
  readonly errors: readonly string[];
}

export interface DrainResult {
  readonly queue: StatisticsQueue;
  readonly due: readonly QueuedReport[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function checkToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!TOKEN_PATTERN.test(value)) return null;
  return value;
}

/** Parse only the major number from a version string. Never echoes input. */
export function parseAppMajorVersion(version: unknown): number | null {
  if (typeof version !== "string") return null;
  const match = /^v?(\d{1,3})(?:[.\-]|$)/.exec(version.trim());
  if (!match?.[1]) return null;
  const major = Number(match[1]);
  return Number.isInteger(major) && major >= 0 && major <= 999 ? major : null;
}

/** Random per report id. Not derived from any machine or install state. */
export function createReportId(nowMs: number): string {
  const time = Number.isFinite(nowMs) ? Math.floor(nowMs) : 0;
  const rand = Math.floor(Math.random() * 2 ** 31).toString(36);
  return `r-${time.toString(36)}-${rand}`;
}

const TOP_LEVEL_KEYS = new Set(["setup", "metrics", "turn", "version", "createdAt", "appMajorVersion"]);
const SETUP_KEYS = new Set(["era", "mode", "difficulty", "autonomy", "featureFlags"]);
const METRIC_KEYS = new Set([...NUMERIC_FIELDS, "revenueBySector"]);

function rejectUnknownKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, where: string, errors: string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`rejected key "${key}" in ${where}: not on the allowlist`);
  }
}

function checkNumericField(
  metrics: Record<string, unknown>,
  field: string,
  spec: NumericSpec,
  out: Record<string, number>,
  errors: string[],
): void {
  const raw = metrics[field];
  if (raw === undefined) return;
  if (!isFiniteNumber(raw)) {
    errors.push(`metric "${field}" must be a finite number`);
    return;
  }
  if (spec.integer && !Number.isInteger(raw)) {
    errors.push(`metric "${field}" must be an integer`);
    return;
  }
  if (raw < spec.min || raw > spec.max) {
    errors.push(`metric "${field}" out of range [${spec.min}, ${spec.max}]`);
    return;
  }
  out[field] = raw;
}

function checkSectorMap(value: unknown, errors: string[]): Record<string, number> | null {
  if (!isRecord(value)) {
    errors.push('metric "revenueBySector" must be an object of sector to revenue');
    return null;
  }
  const keys = Object.keys(value);
  if (keys.length > MAX_SECTOR_ENTRIES) {
    errors.push(`metric "revenueBySector" exceeds ${MAX_SECTOR_ENTRIES} sectors`);
    return null;
  }
  const out: Record<string, number> = {};
  for (const key of keys) {
    if (!ALLOWED_SECTORS.has(key)) {
      errors.push(`rejected sector key "${key}": not an allowlisted token`);
      continue;
    }
    const amount = value[key];
    if (!isFiniteNumber(amount) || amount < 0 || amount > 1e15) {
      errors.push(`sector "${key}" revenue must be a finite number in [0, 1e15]`);
      continue;
    }
    out[key] = amount;
  }
  return out;
}

function checkFeatureFlags(value: unknown, errors: string[]): Record<string, boolean> | null {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    errors.push("setup.featureFlags must be an object of flag name to boolean");
    return null;
  }
  const keys = Object.keys(value);
  if (keys.length > MAX_FEATURE_FLAGS) {
    errors.push(`setup.featureFlags exceeds ${MAX_FEATURE_FLAGS} flags`);
    return null;
  }
  const out: Record<string, boolean> = {};
  for (const key of keys) {
    if (!ALLOWED_FLAGS.has(key)) {
      errors.push(`rejected feature flag "${key}": not an allowlisted token`);
      continue;
    }
    const flag = value[key];
    if (typeof flag !== "boolean") {
      errors.push(`feature flag "${key}" must be a boolean`);
      continue;
    }
    out[key] = flag;
  }
  return out;
}

function checkTurn(value: unknown, errors: string[]): number | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1_000_000) {
    errors.push('turn must be an integer in [0, 1000000] or null');
    return undefined;
  }
  return value;
}

/**
 * Strict revalidation of a report shaped value. Used both after building
 * and before any drain or deserialization is trusted. Unknown keys anywhere
 * fail the report; nothing unallowlisted is ever copied through.
 */
export function validateReport(input: unknown): BuildResult {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["report must be an object"] };
  rejectUnknownKeys(input, TOP_LEVEL_KEYS, "report", errors);

  if (input["version"] !== REPORT_VERSION) errors.push(`report version must be ${REPORT_VERSION}`);

  const createdAt = input["createdAt"];
  if (typeof createdAt !== "string" || !Number.isFinite(Date.parse(createdAt))) {
    errors.push("report createdAt must be an ISO date string");
  }

  const major = input["appMajorVersion"];
  if (major !== null && major !== undefined) {
    if (typeof major !== "number" || !Number.isInteger(major) || major < 0 || major > 999) {
      errors.push("report appMajorVersion must be an integer in [0, 999] or null");
    }
  }

  let setup: ValidatedWorldSetup | null = null;
  const rawSetup = input["setup"];
  if (!isRecord(rawSetup)) {
    errors.push("report setup must be an object");
  } else {
    rejectUnknownKeys(rawSetup, SETUP_KEYS, "setup", errors);
    const era = checkToken(rawSetup["era"]);
    if (era === null || !ALLOWED_ERAS.has(era)) errors.push("setup.era must be a short token (1-32 chars, letters/digits/space/underscore/dot/dash)");
    const mode = rawSetup["mode"];
    if (mode !== "normal" && mode !== "head-of-state" && mode !== "worldsim") {
      errors.push('setup.mode must be one of "normal", "head-of-state", "worldsim"');
    }
    const difficulty = checkToken(rawSetup["difficulty"]);
    if (difficulty === null || !ALLOWED_DIFFICULTIES.has(difficulty)) errors.push("setup.difficulty must be a short token (1-32 chars)");
    const autonomy = checkToken(rawSetup["autonomy"]);
    if (autonomy === null || !ALLOWED_AUTONOMY.has(autonomy)) errors.push("setup.autonomy must be a short token (1-32 chars)");
    const flags = checkFeatureFlags(rawSetup["featureFlags"], errors);
    if (era !== null && (mode === "normal" || mode === "head-of-state" || mode === "worldsim") && difficulty !== null && autonomy !== null && flags !== null) {
      setup = { era, mode, difficulty, autonomy, featureFlags: flags };
    }
  }

  let metrics: ValidatedMetrics | null = null;
  const rawMetrics = input["metrics"];
  if (rawMetrics === undefined) {
    metrics = {};
  } else if (!isRecord(rawMetrics)) {
    errors.push("report metrics must be an object");
  } else {
    rejectUnknownKeys(rawMetrics, METRIC_KEYS, "metrics", errors);
    const out: Record<string, number> = {};
    for (const field of NUMERIC_FIELDS) {
      const spec = NUMERIC_SPECS[field];
      if (spec) checkNumericField(rawMetrics, field, spec, out, errors);
    }
    let sectors: Record<string, number> | undefined;
    if (rawMetrics["revenueBySector"] !== undefined) {
      const checked = checkSectorMap(rawMetrics["revenueBySector"], errors);
      if (checked === null) {
        sectors = undefined;
      } else {
        sectors = checked;
      }
    }
    const min = out["minStability"];
    const max = out["maxStability"];
    if (min !== undefined && max !== undefined && min > max) {
      errors.push("metrics minStability must not exceed maxStability");
    }
    metrics = sectors === undefined ? { ...out } : { ...out, revenueBySector: sectors };
  }

  const turn = checkTurn(input["turn"], errors);

  if (setup === null || metrics === null || turn === undefined) {
    return { ok: false, errors };
  }
  if (errors.length > 0) return { ok: false, errors };

  const report: StatisticsReport = {
    version: REPORT_VERSION,
    createdAt: createdAt as string,
    appMajorVersion: major === undefined ? null : (major as number | null),
    setup,
    metrics,
    turn,
  };
  let size = 0;
  try {
    size = JSON.stringify(report).length;
  } catch {
    return { ok: false, errors: ["report is not JSON serializable"] };
  }
  if (size > MAX_REPORT_JSON_BYTES) {
    return { ok: false, errors: [`report exceeds ${MAX_REPORT_JSON_BYTES} bytes serialized`] };
  }
  return { ok: true, report };
}

/**
 * Build a report from untrusted caller input. Only allowlisted fields are
 * read; every other key (identifiers, names, text, nested extras) fails the
 * build instead of being copied. Returns errors, never throws.
 */
export function buildStatisticsReport(input: unknown, options?: BuildOptions): BuildResult {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["input must be an object"] };
  const allowedInput = new Set(["setup", "metrics", "turn"]);
  rejectUnknownKeys(input, allowedInput, "input", errors);
  if (errors.length > 0) return { ok: false, errors };

  const nowMs = options?.nowMs ?? Date.now();
  if (!Number.isFinite(nowMs)) return { ok: false, errors: ["nowMs must be finite"] };

  const candidate = {
    version: REPORT_VERSION,
    createdAt: new Date(Math.floor(nowMs / 86_400_000) * 86_400_000).toISOString(),
    appMajorVersion: parseAppMajorVersion(options?.appVersion ?? null),
    setup: input["setup"] ?? null,
    metrics: input["metrics"] ?? {},
    turn: input["turn"] ?? null,
  };
  return validateReport(candidate);
}

/** Empty queue. Consent by default is off; the parent owns the persisted flag. */
export function createEmptyQueue(): StatisticsQueue {
  return { pending: [] };
}

/**
 * Apply a consent change. Opt out (false) clears every pending report.
 * Returns a new queue; the input is not mutated.
 */
export function setConsentEnabled(queue: StatisticsQueue, enabled: boolean): StatisticsQueue {
  if (enabled) return { pending: [...queue.pending] };
  return { pending: [] };
}

function asQueue(value: unknown): StatisticsQueue | null {
  if (!isRecord(value)) return null;
  if (!Array.isArray(value["pending"])) return null;
  return { pending: value["pending"] as QueuedReport[] };
}

/** Drop expired entries. Pure; returns a new queue. */
export function pruneExpiredReports(queue: StatisticsQueue, nowMs: number): StatisticsQueue {
  const now = Number.isFinite(nowMs) ? nowMs : 0;
  return { pending: queue.pending.filter((item) => isRecord(item) && item["expiresAt"] !== undefined && typeof item["expiresAt"] === "number" && item["expiresAt"] > now) };
}

function isFresh(item: QueuedReport, nowMs: number): boolean {
  return Number.isFinite(item.queuedAt) && Number.isFinite(item.expiresAt) && item.expiresAt > nowMs;
}

/**
 * Queue an already built report. The report is revalidated here, so a
 * corrupted or tampered object can never enter the queue. Expired entries
 * are pruned first; past the bound the oldest entry is dropped.
 */
export function enqueueValidatedReport(
  queue: StatisticsQueue,
  report: unknown,
  nowMs: number,
  id?: string,
): EnqueueResult {
  if (!Number.isFinite(nowMs)) {
    return { queue, accepted: false, reportId: null, droppedId: null, errors: ["nowMs must be finite"] };
  }
  const checked = validateReport(report);
  if (!checked.ok) {
    return { queue, accepted: false, reportId: null, droppedId: null, errors: [...checked.errors] };
  }
  const fresh = pruneExpiredReports(queue, nowMs).pending.filter((item) => validateReport(item.report).ok);
  let reportId = typeof id === "string" && REPORT_ID_PATTERN.test(id) ? id : createReportId(nowMs);
  if (fresh.some((item) => item.id === reportId)) reportId = createReportId(nowMs + 1);
  const next = [
    ...fresh,
    { id: reportId, report: checked.report, queuedAt: Math.floor(nowMs), expiresAt: Math.floor(nowMs) + REPORT_TTL_MS },
  ];
  let droppedId: string | null = null;
  while (next.length > MAX_QUEUE_LENGTH) {
    const dropped = next.shift();
    if (dropped) droppedId = dropped.id;
  }
  return { queue: { pending: next }, accepted: true, reportId, droppedId, errors: [] };
}

/**
 * Build and queue in one step. With consent off nothing is built and nothing
 * is queued. This is the helper the parent wires to its consent flag.
 */
export function maybeBuildAndQueue(
  queue: StatisticsQueue,
  consentEnabled: boolean,
  input: unknown,
  nowMs: number,
  options?: BuildOptions,
): BuildAndQueueResult {
  if (!consentEnabled) {
    return { queue, accepted: false, reportId: null, errors: ["consent disabled: report not built or queued"] };
  }
  const built = buildStatisticsReport(input, { nowMs, appVersion: options?.appVersion ?? null });
  if (!built.ok) {
    return { queue, accepted: false, reportId: null, errors: [...built.errors] };
  }
  const enqueued = enqueueValidatedReport(queue, built.report, nowMs);
  return { queue: enqueued.queue, accepted: enqueued.accepted, reportId: enqueued.reportId, errors: [...enqueued.errors] };
}

/** Serialize the queue for local persistence. Only valid reports are kept. */
export function serializeQueue(queue: StatisticsQueue, nowMs?: number): string {
  const now = nowMs ?? Date.now();
  const clean = pruneExpiredReports(queue, now).pending.filter((item) => validateReport(item.report).ok);
  return JSON.stringify({ version: 1, pending: clean.slice(0, MAX_QUEUE_LENGTH) });
}

/**
 * Restore a persisted queue. Never throws: corrupt JSON, wrong shapes, and
 * invalid or expired entries all yield fewer (or zero) pending items.
 * Every restored report is revalidated before it is trusted.
 */
export function deserializeQueue(serialized: unknown, nowMs: number): StatisticsQueue {
  const now = Number.isFinite(nowMs) ? nowMs : 0;
  if (typeof serialized !== "string") return createEmptyQueue();
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return createEmptyQueue();
  }
  const holder = asQueue(parsed);
  if (!holder) return createEmptyQueue();
  const pending: QueuedReport[] = [];
  for (const item of holder.pending) {
    if (!isRecord(item)) continue;
    if (typeof item["id"] !== "string" || !REPORT_ID_PATTERN.test(item["id"])) continue;
    if (!isFiniteNumber(item["queuedAt"]) || !isFiniteNumber(item["expiresAt"])) continue;
    if ((item["expiresAt"] as number) <= now || (item["expiresAt"] as number) > (item["queuedAt"] as number) + REPORT_TTL_MS || (item["queuedAt"] as number) > now) continue;
    const checked = validateReport(item["report"]);
    if (!checked.ok) continue;
    pending.push({
      id: item["id"] as string,
      report: checked.report,
      queuedAt: Math.floor(item["queuedAt"] as number),
      expiresAt: Math.floor(item["expiresAt"] as number),
    });
    if (pending.length >= MAX_QUEUE_LENGTH) break;
  }
  return { pending };
}

/**
 * Take due reports for delivery. Consent is checked again here with a
 * freshly read value: opt out yields nothing and leaves the queue alone
 * (the opt out path clears it via setConsentEnabled). Entries are
 * revalidated and expired ones are dropped, never returned. Returned
 * entries are removed from the queue.
 */
export function drainDueReports(
  queue: StatisticsQueue,
  consentEnabled: boolean,
  nowMs: number,
  limit?: number,
): DrainResult {
  if (!consentEnabled) return { queue, due: [] };
  const now = Number.isFinite(nowMs) ? nowMs : 0;
  const cap = limit === undefined ? MAX_QUEUE_LENGTH : limit;
  if (!Number.isInteger(cap) || cap <= 0) return { queue: pruneExpiredReports(queue, now), due: [] };
  const due: QueuedReport[] = [];
  const rest: QueuedReport[] = [];
  for (const item of queue.pending) {
    if (!isRecord(item)) continue;
    const candidate: QueuedReport = item as QueuedReport;
    if (!isFresh(candidate, now)) continue;
    if (validateReport(candidate.report).ok !== true) continue;
    if (due.length < cap) due.push(candidate);
    else rest.push(candidate);
  }
  return { queue: { pending: rest }, due };
}
