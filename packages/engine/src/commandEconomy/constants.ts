/**
 * Command-economy regime model — solo port of src/lib/constants/commandEconomy.ts
 * (the marketization-dial subset relevant to 1953 RU/DD) and
 * src/lib/economy/twoCircuitMoney.ts.
 *
 * AHD is a general-equilibrium MARKET simulator, but the USSR and the GDR were
 * quantity-planned SHORTAGE economies: a fixed, non-convertible official
 * currency; an administered price/inflation path; a passive monobank; soft
 * budget constraints; two-circuit money; and a repressed second economy. The
 * regime is not a switch but a DIAL — `marketizationLevel` (0 fully command →
 * 100 fully market), stored per country on WorldState.commandEconomy and
 * drifted every turn (see phases.ts).
 *
 * Solo doctrine deviation from mainline: mainline ships this behind
 * `commandEconomyEnabled` (default OFF); solo ships it ON — RU and DD are
 * literally command economies in 1953, and per solo doctrine (minimize
 * feature flags, ship correct mechanics on) there is no reason to gate a
 * historically-accurate 1953 world behind a flag nobody would ever leave off.
 * Every `enabled` parameter mainline threads through these functions is
 * therefore dropped; the functions below assume the feature is always on.
 */

/** Fully-market marketization level (dial at 100). */
export const MARKET_LEVEL = 100;
/** Below this the economy is fully command (all planned subsystems active). */
export const COMMAND_CEILING = 30;
/** Below this (and >= COMMAND_CEILING) the economy is dual-track. */
export const DUAL_TRACK_CEILING = 70;

type MarketizationStep = { throughYear: number; level: number };

/**
 * Per-country marketization trajectory (1953-relevant subset only — mainline's
 * table also carries CN/PL/HU/CS/BG/RO/YU/UKR/BLR/BAL, none of which are
 * playable in Rotunda). Source: constants/commandEconomy.ts MARKETIZATION_SCHEDULE.
 *  - RU: Soviet ruble, command through the 1991 dissolution.
 *  - DD: East Germany, command until the Oct 1990 reunification.
 */
export const MARKETIZATION_SCHEDULE: Record<string, MarketizationStep[]> = {
  RU: [{ throughYear: 1991, level: 10 }],
  DD: [{ throughYear: 1990, level: 10 }],
};

/**
 * The era-schedule marketization level for a country/year — the SEED value a
 * fresh world (or a country with no live drift yet) starts from. Absent from
 * the schedule (every non-RU/DD country) → always fully market.
 */
export function scheduledMarketizationLevel(countryId: string, currentYear: number): number {
  const steps = MARKETIZATION_SCHEDULE[countryId];
  if (!steps || !Number.isFinite(currentYear)) return MARKET_LEVEL;
  for (const step of steps) {
    if (currentYear <= step.throughYear) return step.level;
  }
  return MARKET_LEVEL;
}

/** True when ANY planned machinery is active (command OR dual-track band). */
export function isPlannedEconomy(marketizationLevel: number): boolean {
  return marketizationLevel < DUAL_TRACK_CEILING;
}

/** True when the country is FULLY COMMAND (below COMMAND_CEILING). */
export function isCommandEconomy(marketizationLevel: number): boolean {
  return marketizationLevel < COMMAND_CEILING;
}

/**
 * Share of an economy's activity governed by the PLAN rather than the market
 * (1 at full command → 0 at the dual-track ceiling and above).
 */
export function plannedShare(marketizationLevel: number): number {
  if (marketizationLevel >= DUAL_TRACK_CEILING) return 0;
  return Math.max(0, Math.min(1, 1 - marketizationLevel / DUAL_TRACK_CEILING));
}

// ── Endogenous marketization drift ──────────────────────────────────────────

/**
 * Per-turn drift weights (Δlevel = w_bm·blackMarketPressure +
 * w_soe·(SOE_PERF_BASELINE − soePerf) + w_pol·policyStance).
 * Source: constants/commandEconomy.ts MARKETIZATION_DRIFT_WEIGHTS (P3 values).
 */
export const MARKETIZATION_DRIFT_WEIGHTS = {
  blackMarket: 0.22,
  soePerformance: 0.18,
  policyStance: 0.12,
} as const;

/** Baseline SOE plan-fulfillment (1.0 = on plan). Source: economy/soe.ts SOE_PERF_BASELINE. */
export const SOE_PERF_BASELINE = 1.0;

/**
 * The signed per-turn change in marketization level (before clamping), from
 * the three free drivers. PORT-STUB: `soePerf` is always SOE_PERF_BASELINE in
 * solo (no per-SOE plan-fulfillment tracking — see phases.ts file doc), so
 * this term is always exactly 0; black-market pressure and policy stance are
 * both real, wired inputs.
 */
export function marketizationDrift(
  blackMarketPressure: number,
  soePerf: number,
  policyStance: number,
  weights: typeof MARKETIZATION_DRIFT_WEIGHTS = MARKETIZATION_DRIFT_WEIGHTS,
): number {
  const clamp = (v: number, lo: number, hi: number) =>
    !Number.isFinite(v) ? lo : Math.min(hi, Math.max(lo, v));
  const bm = clamp(blackMarketPressure, 0, 1);
  const perf = Number.isFinite(soePerf) ? soePerf : SOE_PERF_BASELINE;
  const pol = clamp(policyStance, -1, 1);
  return (
    weights.blackMarket * bm +
    weights.soePerformance * (SOE_PERF_BASELINE - perf) +
    weights.policyStance * pol
  );
}

/** Per-turn restoring-pull rate toward the era schedule. Source: MARKETIZATION_GRAVITY_RATE. */
export const MARKETIZATION_GRAVITY_RATE = 0.004;
/** Hard cap on the gravity term's magnitude per turn. Source: MARKETIZATION_GRAVITY_MAX_STEP. */
export const MARKETIZATION_GRAVITY_MAX_STEP = 0.02;

/**
 * A weak restoring pull from the live level back toward the era schedule —
 * gravity, not rails: a small, saturating force, never an assignment, and
 * capped below what the free drivers can sustain (history is beatable).
 */
export function marketizationGravity(level: number, scheduledLevel: number): number {
  if (!Number.isFinite(level) || !Number.isFinite(scheduledLevel)) return 0;
  const pull = MARKETIZATION_GRAVITY_RATE * (scheduledLevel - level);
  return Math.max(-MARKETIZATION_GRAVITY_MAX_STEP, Math.min(MARKETIZATION_GRAVITY_MAX_STEP, pull));
}

/** Apply a drift to a stored level, clamped to [0, MARKET_LEVEL]. */
export function driftMarketizationLevel(level: number, drift: number): number {
  const base = Number.isFinite(level) ? level : MARKET_LEVEL;
  const d = Number.isFinite(drift) ? drift : 0;
  return Math.max(0, Math.min(MARKET_LEVEL, base + d));
}

// ── NPP-brain Gosbank defaults ───────────────────────────────────────────────
// Source: constants/commandEconomy.ts NPP_DEFAULT_*. Solo has no player Gosbank
// directive panel and no per-country commandStance (governmentFormations in
// mainline) beyond the governingPartyId Rotunda already tracks (W23) — every
// planned country runs on these constants except reformism, which is REAL
// (see governmentReformismFromEconomicPosition below).
export const NPP_DEFAULT_CREDIT_AGGRESSIVENESS = 0.55;
export const NPP_DEFAULT_BUDGET_SOFTNESS = 0.85;
export const NPP_DEFAULT_REFORMISM = 0;
export const NPP_DEFAULT_INTERNAL_REPRESSION = 0.5;
/** Source: commandEconomyTurn.ts globalTolerance fallback (GameConfig has no solo equivalent). */
export const NPP_DEFAULT_SECOND_ECONOMY_TOLERANCE = 0.3;

/**
 * Map a government's signed reformism [-1 hardline orthodox … +1 reformist] to
 * a DEFAULT internal-repression level in [0, 1]. Orthodox governments repress
 * the second economy (moderate-to-high); reformist governments let it breathe.
 */
export function internalRepressionFromReformism(reformism: number | null | undefined): number {
  const r =
    typeof reformism === "number" && Number.isFinite(reformism)
      ? Math.max(-1, Math.min(1, reformism))
      : 0;
  return Math.max(0, Math.min(1, NPP_DEFAULT_INTERNAL_REPRESSION - 0.5 * r));
}

/**
 * The LIVE government-reformism signal in [-1, 1], from the governing party's
 * economic position (−5 command-left … +5 market-right → −1 … +1).
 * Source: constants/commandEconomy.ts governmentReformismFromEconomicPosition.
 */
export function governmentReformismFromEconomicPosition(
  economicPosition: number | null | undefined,
): number | undefined {
  if (typeof economicPosition !== "number" || !Number.isFinite(economicPosition)) return undefined;
  return Math.max(-1, Math.min(1, economicPosition / 5));
}

/**
 * The policy stance in [-1, 1] feeding the marketization drift's w_pol term:
 * GOVERNMENT reformism (real, weight 0.6) blended with GOSBANK posture
 * (restrained credit + hard budgets = reformist; both PORT-STUB NPP defaults
 * in solo, weight 0.4). Source: constants/commandEconomy.ts computePolicyStance.
 */
export const POLICY_GOV_WEIGHT = 0.6;
export const POLICY_GOSBANK_WEIGHT = 0.4;

export function computePolicyStance(
  reformism: number,
  creditAggressiveness: number,
  budgetSoftness: number,
): number {
  const clamp = (v: number, lo: number, hi: number) =>
    !Number.isFinite(v) ? lo : Math.min(hi, Math.max(lo, v));
  const r = clamp(reformism, -1, 1);
  const ca = clamp(creditAggressiveness, 0, 1);
  const bs = clamp(budgetSoftness, 0, 1);
  const gosbank = clamp(-(ca - 0.5 + (bs - 0.5)), -1, 1);
  return clamp(POLICY_GOV_WEIGHT * r + POLICY_GOSBANK_WEIGHT * gosbank, -1, 1);
}

// ── Two-circuit money (wage-fund cap) ───────────────────────────────────────
// Source: src/lib/economy/twoCircuitMoney.ts wageFundConstrainedGrowth. Models
// the Soviet non-cash/cash split at the MACRO level: a wage-fund ceiling on
// nominal wage growth for planned economies, rather than splitting every
// wallet into two circuits.

/** Slack the plan allows wages above real output growth (percentage points). */
export const WAGE_FUND_SLACK_PP = 2;

/**
 * Wage growth actually permitted under the two-circuit wage fund. Only ever
 * LOWERS wage growth (the fund is a ceiling, never a floor).
 */
export function wageFundConstrainedGrowth(
  wageGrowth: number,
  realGoodsGrowth: number,
  plannedShareValue: number,
): number {
  const finite = (v: number, fb: number) => (Number.isFinite(v) ? v : fb);
  const wage = finite(wageGrowth, 0);
  const goods = finite(realGoodsGrowth, 0);
  const share = Math.min(1, Math.max(0, finite(plannedShareValue, 0)));
  const cap = goods + WAGE_FUND_SLACK_PP;
  if (wage <= cap) return wage;
  return wage - share * (wage - cap);
}
