/**
 * Prospecting + extraction contract constants.
 * Ports src/lib/constants/prospecting.ts verbatim — no invented numbers.
 * CONTRACT_DEFAULT_MISSED_PAYMENTS/CONTRACT_OFFER_EXPIRY_TURNS are NOT
 * redeclared here: W1 already ported both into commodity/constants.ts
 * (contractSettlement's own scope) and this module re-exports them so there
 * is exactly one source of truth for each constant.
 */
import { CONTRACT_DEFAULT_MISSED_PAYMENTS, CONTRACT_OFFER_EXPIRY_TURNS } from "../commodity/constants.js";

export { CONTRACT_DEFAULT_MISSED_PAYMENTS, CONTRACT_OFFER_EXPIRY_TURNS };

/**
 * Source: src/lib/constants/corporations.ts RD_INNOVATION_SCORE_THRESHOLD = 200.
 * Declared locally: solo's Corporation (corporation/types.ts) has no rdScore
 * field — R&D/innovation scoring is a later wave. Corp-initiated surveys
 * (prospectCorpSuccessChance/prospectCorpRdMult below) are consequently
 * PORT-STUB unreachable in solo today (see types.ts ProspectingSurvey file
 * doc); the formulas are kept real rather than deleted so a future rdScore
 * wave only has to wire the input, not re-derive the math.
 */
const RD_INNOVATION_SCORE_THRESHOLD = 200;

// Source: src/lib/constants/turnTime.ts TURNS_PER_YEAR = 48 (redeclared per-module,
// same convention as banking/constants.ts and bonds/constants.ts).
export const TURNS_PER_YEAR = 48;

// ── Prospecting ──────────────────────────────────────────────────────
// Source: src/lib/constants/prospecting.ts
export const PROSPECT_DURATION_TURNS = 12; // Turns from launch to resolution (12 = one quarter at 48/yr)
export const PROSPECT_BASE_COST_ANCHOR = 500_000; // Base survey cost before escalation
export const PROSPECT_GOVT_SUCCESS_CHANCE = 0.5; // Flat government success chance
export const PROSPECT_GOVT_RD_MULT = 1.5; // Government yield multiplier
export const PROSPECT_YIELD_MIN = 0.03; // Uniform yield band min as fraction of current capacity
export const PROSPECT_YIELD_MAX = 0.08; // Uniform yield band max
export const PROSPECT_MAX_GAIN_FRACTION = 0.2; // Hard cap on single survey gain: 20% of current capacity
export const PROSPECT_MAX_ACTIVE_PER_INITIATOR = 3; // Max active surveys per initiator

/**
 * Cost escalation multiplier: min(4, 1 + 0.5 x priorSuccessCount)
 * Source: prospectCostMultiplier in src/lib/constants/prospecting.ts
 */
export function prospectCostMultiplier(priorSuccessCount: number): number {
  return Math.min(4, 1 + 0.5 * Math.max(0, priorSuccessCount));
}

export function prospectCostAnchor(priorSuccessCount: number): number {
  return PROSPECT_BASE_COST_ANCHOR * prospectCostMultiplier(priorSuccessCount);
}

/**
 * Corp success chance: 0.25 + 0.55 x min(1, rdScore/200)
 * Source: prospectCorpSuccessChance in src/lib/constants/prospecting.ts.
 * Unused today (no corp-initiated surveys in solo — see types.ts file doc)
 * but kept real (not PORT-STUB) since corp rdScore is a scalar this module
 * can already accept as a plain parameter with no missing dependency.
 */
export function prospectCorpSuccessChance(rdScore: number): number {
  return 0.25 + 0.55 * Math.min(1, Math.max(0, rdScore) / RD_INNOVATION_SCORE_THRESHOLD);
}

/**
 * Corp yield multiplier: 1 + min(1, rdScore/200)
 * Source: prospectCorpRdMult in src/lib/constants/prospecting.ts
 */
export function prospectCorpRdMult(rdScore: number): number {
  return 1 + Math.min(1, Math.max(0, rdScore) / RD_INNOVATION_SCORE_THRESHOLD);
}

// ── Extraction contracts ────────────────────────────────────────────
export const GOVT_CONTRACT_MAX_TOTAL_SHARE = 0.75; // Ceiling per (region, resource), all issuers combined
export const CONTRACT_ROYALTY_RATE_MIN = 0;
export const CONTRACT_ROYALTY_RATE_MAX = 0.02;
export const CONTRACT_TERM_TURNS_MIN = 24;
export const CONTRACT_TERM_TURNS_MAX = 480;
export const CONTRACT_SHARE_MIN = 0.01;
export const CONTRACT_SHARE_MAX = 0.75;

// ── Era scaling ─────────────────────────────────────────────────────
// Source: src/lib/constants/prospecting.ts ProspectEraScaling + PROSPECT_ERA_ANCHORS
export interface ProspectEraScaling {
  success: number;
  yield: number;
  duration: number;
}

const PROSPECT_ERA_ANCHORS: Array<{ year: number } & ProspectEraScaling> = [
  { year: 1953, success: 0.6, yield: 1.6, duration: 1.5 },
  { year: 1979, success: 0.8, yield: 1.3, duration: 1.25 },
  { year: 1991, success: 0.9, yield: 1.15, duration: 1.1 },
  { year: 2019, success: 1, yield: 1, duration: 1 },
];

const NEUTRAL_ERA_SCALING: ProspectEraScaling = { success: 1, yield: 1, duration: 1 };

export function prospectEraScaling(year: number | null | undefined): ProspectEraScaling {
  if (year == null || !Number.isFinite(year)) return NEUTRAL_ERA_SCALING;
  const a = PROSPECT_ERA_ANCHORS;
  if (year <= a[0]!.year) return { success: a[0]!.success, yield: a[0]!.yield, duration: a[0]!.duration };
  const last = a[a.length - 1]!;
  if (year >= last.year) return { success: last.success, yield: last.yield, duration: last.duration };
  for (let i = 1; i < a.length; i++) {
    if (year <= a[i]!.year) {
      const t = (year - a[i - 1]!.year) / (a[i]!.year - a[i - 1]!.year);
      const lerp = (lo: number, hi: number) => lo + (hi - lo) * t;
      return {
        success: lerp(a[i - 1]!.success, a[i]!.success),
        yield: lerp(a[i - 1]!.yield, a[i]!.yield),
        duration: lerp(a[i - 1]!.duration, a[i]!.duration),
      };
    }
  }
  return NEUTRAL_ERA_SCALING;
}

export function prospectDurationTurns(year: number | null | undefined): number {
  return Math.max(1, Math.round(PROSPECT_DURATION_TURNS * prospectEraScaling(year).duration));
}

// ── Depletion (P3b) ──────────────────────────────────────────────────
// Source: src/lib/extraction/depletion.ts

/**
 * Turns of extraction AT THE FULL PER-TURN CEILING a deposit holds before it
 * is exhausted (reserves = resources[r] * DEPOSIT_RESERVE_TURNS). 40 game
 * years, same calibration mainline ships.
 */
export const DEPOSIT_RESERVE_TURNS = 40 * TURNS_PER_YEAR;

export interface DepletableCapacityDoc {
  resources: Partial<Record<import("../commodity/constants.js").ExtractableResource, number>>;
  extractedUnits?: Partial<Record<import("../commodity/constants.js").ExtractableResource, number>> | null;
}

export function depositReservesUnits(
  doc: DepletableCapacityDoc,
  r: import("../commodity/constants.js").ExtractableResource,
): number {
  const perTurn = doc.resources?.[r] ?? 0;
  return perTurn > 0 ? perTurn * DEPOSIT_RESERVE_TURNS : 0;
}

export function depositRemainingUnits(
  doc: DepletableCapacityDoc,
  r: import("../commodity/constants.js").ExtractableResource,
): number {
  const extracted = doc.extractedUnits?.[r] ?? 0;
  return Math.max(0, depositReservesUnits(doc, r) - Math.max(0, extracted));
}

/** The per-turn ceiling to ration against, after depletion. */
export function depletedCapacityPerTurn(
  doc: DepletableCapacityDoc,
  r: import("../commodity/constants.js").ExtractableResource,
): number {
  const perTurn = doc.resources?.[r] ?? 0;
  if (!(perTurn > 0)) return 0;
  return Math.min(perTurn, depositRemainingUnits(doc, r));
}
