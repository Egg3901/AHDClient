/**
 * Country-level macro constants — faithful copies from mainline AHDGame.
 * Every nontrivial formula or constant cites its source file.
 */

// ── Calendar ───────────────────────────────────────────────────────────
// Source: /root/projects/AHDGame/src/lib/constants/turnTime.ts
// Mainline uses 48 turns per year (hourly cron in production). Our world
// runs weekly (52 turns/yr for GDP compounding) but annualization math
// follows mainline's 48 for formula parity.
export const TURNS_PER_YEAR = 48; // source: turnTime.ts TURNS_PER_YEAR
export const WEEKS_PER_YEAR = 52; // source: legacy macroEconomy.ts placeholder (weekly compounding)

// ── Growth ─────────────────────────────────────────────────────────────
// Source: /root/projects/AHDGame/src/lib/turn/gdpGrowth.ts
export const NEUTRAL_GDP_GROWTH = 2.0; // source: gdpGrowth.ts NEUTRAL_GDP_GROWTH

// Source: /root/projects/AHDGame/src/lib/metricEngine/outputGap.ts
export const GAP_CLOSURE = 1.5; // source: outputGap.ts GAP_CLOSURE
export const OUTPUT_GAP_BOUND: readonly [number, number] = [-15, 15]; // source: outputGap.ts OUTPUT_GAP_BOUND

// Source: /root/projects/AHDGame/src/lib/turn/gdpGrowth.ts + metricEngine/registry/economic.ts
// Mainline sectorGrowth node bounds translate to annual % [-10, 15].
// The placeholder clamped growthRate to [-0.15, 0.15] fraction; we preserve
// that outer bound so packs never overflow, citing sectorGrowth bounds.
export const SECTOR_SIGNAL_MIN = -10; // source: gdpGrowth.ts SECTOR_SIGNAL_MIN
export const SECTOR_SIGNAL_MAX = 15; // source: gdpGrowth.ts SECTOR_SIGNAL_MAX
export const GROWTH_RATE_MIN = -0.15; // source: placeholder + sectorGrowth bounds (annual fraction)
export const GROWTH_RATE_MAX = 0.15;

// Source: /root/projects/AHDGame/src/lib/metricEngine/potentialGrowth.ts
export const TFP_BASELINE = 1.2; // source: potentialGrowth.ts TFP_BASELINE

// ── Unemployment (Okun's law) ──────────────────────────────────────────
// Source: /root/projects/AHDGame/src/lib/turn/gdpGrowth.ts
export const OKUN_COEFFICIENT_DOWN = 0.2; // source: gdpGrowth.ts OKUN_COEFFICIENT_DOWN
export const OKUN_COEFFICIENT_UP = 0.25; // source: gdpGrowth.ts OKUN_COEFFICIENT_UP
export const UNEMPLOYMENT_INERTIA = 0.85; // source: gdpGrowth.ts UNEMPLOYMENT_INERTIA
export const UNEMPLOYMENT_MIN = 1.0; // source: gdpGrowth.ts UNEMPLOYMENT_MIN (percent)
export const UNEMPLOYMENT_MAX = 15.0; // source: gdpGrowth.ts UNEMPLOYMENT_MAX (percent)

// ── Inflation ──────────────────────────────────────────────────────────
// Source: /root/projects/AHDGame/src/lib/budget/inflation.ts
export const INFLATION_BASE_TARGET = 2.0; // source: inflation.ts BASE_TARGET
export const INFLATION_TREND_GDP_GROWTH = 2.0; // source: inflation.ts TREND_GDP_GROWTH
export const INFLATION_NAIRU = 5.0; // source: inflation.ts NAIRU
export const INFLATION_UNEMPLOYMENT_COEFF_UP = 0.3; // source: inflation.ts UNEMPLOYMENT_COEFF_UP
export const INFLATION_UNEMPLOYMENT_COEFF_DOWN = 0.2; // source: inflation.ts UNEMPLOYMENT_COEFF_DOWN
export const INFLATION_GDP_COEFF_UP = 0.2; // source: inflation.ts GDP_GROWTH_COEFF_UP
export const INFLATION_GDP_COEFF_DOWN = 0.15; // source: inflation.ts GDP_GROWTH_COEFF_DOWN
export const INFLATION_NEUTRAL_RATE = 3.0; // source: inflation.ts NEUTRAL_RATE

// Source: /root/projects/AHDGame/src/lib/budget/inflation.ts (Phillips + fiscal/monetary + cost-push)
// Monetary coefficients cited but stubbed (central bank system not yet ported)
export const INFLATION_MONETARY_COEFF_LOW = 0.4; // source: inflation.ts MONETARY_COEFF_LOW
export const INFLATION_MONETARY_COEFF_HIGH = 1.2; // source: inflation.ts MONETARY_COEFF_HIGH
export const INFLATION_FISCAL_COEFF_DEFICIT = 0.15; // source: inflation.ts FISCAL_COEFF_DEFICIT
export const INFLATION_FISCAL_COEFF_SURPLUS = 0.08; // source: inflation.ts FISCAL_COEFF_SURPLUS
export const INFLATION_TARIFF_BASELINE = 3.0; // source: inflation.ts TARIFF_BASELINE
export const INFLATION_WAGE_GROWTH_BASELINE = 2.5; // source: inflation.ts WAGE_GROWTH_BASELINE

// Source: /root/projects/AHDGame/src/lib/budget/inflation.ts — dynamics
export const INFLATION_INERTIA = 0.35; // source: inflation.ts INERTIA
export const INFLATION_MEAN_REVERSION_COEFF = 0.08; // source: inflation.ts MEAN_REVERSION_COEFF
export const INFLATION_MAX_PER_TURN_DELTA = 1.5; // source: inflation.ts MAX_PER_TURN_DELTA
export const INFLATION_MIN = -2.0; // source: inflation.ts MIN_INFLATION (percent)
export const INFLATION_MAX = 100.0; // source: inflation.ts MAX_INFLATION (percent)

// ── Stochastic shock magnitudes ────────────────────────────────────────
// Not mainline constants — local tuning for the PORT-STUB sector signal noise
// (replaces missing realized-revenue delta). Kept small so RNG does not
// dominate the ported formulas.
export const GROWTH_SHOCK_PCT = 1.0; // +/-0.5pp uniform noise on sector signal (percent)
export const INFLATION_SHOCK_PCT = 0.2; // +/-0.1pp uniform noise on inflation (percent)
