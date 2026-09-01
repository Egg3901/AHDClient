import type { TurnPhase } from "./types.js";
import {
  GAP_CLOSURE,
  GROWTH_RATE_MAX,
  GROWTH_RATE_MIN,
  GROWTH_SHOCK_PCT,
  INFLATION_BASE_TARGET,
  INFLATION_FISCAL_COEFF_DEFICIT,
  INFLATION_FISCAL_COEFF_SURPLUS,
  INFLATION_GDP_COEFF_DOWN,
  INFLATION_GDP_COEFF_UP,
  INFLATION_INERTIA,
  INFLATION_MAX,
  INFLATION_MAX_PER_TURN_DELTA,
  INFLATION_MEAN_REVERSION_COEFF,
  INFLATION_MIN,
  INFLATION_NAIRU,
  INFLATION_SHOCK_PCT,
  INFLATION_TREND_GDP_GROWTH,
  INFLATION_UNEMPLOYMENT_COEFF_DOWN,
  INFLATION_UNEMPLOYMENT_COEFF_UP,
  OKUN_COEFFICIENT_DOWN,
  OKUN_COEFFICIENT_UP,
  OUTPUT_GAP_BOUND,
  TURNS_PER_YEAR,
  UNEMPLOYMENT_INERTIA,
  UNEMPLOYMENT_MAX,
  UNEMPLOYMENT_MIN,
  WEEKS_PER_YEAR,
  NEUTRAL_GDP_GROWTH,
  TFP_BASELINE,
} from "../economy/macroConstants.js";
import {
  annualizedGrowthRate,
  computeLaborForce,
  NEUTRAL_LABOR_PARTICIPATION,
  potentialGrowth,
} from "../demographics/laborForce.js";

// ── Pure helpers (exported for golden-value tests) ─────────────────────

/**
 * Advance the output gap by one turn and derive integrated gdpGrowth.
 * Formula: source /root/projects/AHDGame/src/lib/metricEngine/outputGap.ts advanceOutputGap
 */
export function advanceOutputGap(
  prevGap: number,
  sectorSignal: number,
  potential: number,
  turnsPerYear: number,
): { gap: number; gdpGrowth: number; impulse: number } {
  const g0 = Number.isFinite(prevGap) ? prevGap : 0;
  const sector = Number.isFinite(sectorSignal) ? sectorSignal : 0;
  const pot = Number.isFinite(potential) ? potential : 0;
  const impulse = sector - pot;
  const rawGap = g0 + (impulse - GAP_CLOSURE * g0) / turnsPerYear;
  const gap = Math.max(OUTPUT_GAP_BOUND[0], Math.min(OUTPUT_GAP_BOUND[1], rawGap));
  const gdpGrowth = pot + (gap - g0) * turnsPerYear;
  return { gap, gdpGrowth, impulse };
}

/**
 * Okun's law target for unemployment.
 * Formula: source /root/projects/AHDGame/src/lib/metricEngine/registry/economic.ts unemploymentNode
 */
export function okunTarget(
  prevUnemploymentPct: number,
  gdpGrowthPct: number,
  potentialPct: number,
): number {
  const gdpDeviation = gdpGrowthPct - potentialPct;
  const coeff = gdpDeviation > 0 ? OKUN_COEFFICIENT_DOWN : OKUN_COEFFICIENT_UP;
  const raw = prevUnemploymentPct - gdpDeviation * coeff;
  return Math.max(UNEMPLOYMENT_MIN, Math.min(UNEMPLOYMENT_MAX, raw));
}

/**
 * Fiscal term from budget deficit/surplus.
 * Source: src/lib/budget/inflation.ts calculateInflationWithBreakdown deficitPct logic
 *  FISCAL_COEFF_DEFICIT=0.15 (deficit inflationary), FISCAL_COEFF_SURPLUS=0.08 (surplus deflationary),
 *  clamp deficitPct to [-30,50] before coeff.
 */
export function computeFiscalTerm(surplus: number, gdp: number): number {
  if (!Number.isFinite(surplus) || !Number.isFinite(gdp) || gdp <= 0) return 0;
  const surplusToGdp = surplus / gdp;
  const deficitPctRaw = -surplusToGdp * 100;
  const deficitPct = Math.max(-30, Math.min(50, deficitPctRaw));
  const coeff = deficitPct >= 0
    ? INFLATION_FISCAL_COEFF_DEFICIT // source: inflation.ts FISCAL_COEFF_DEFICIT 0.15
    : INFLATION_FISCAL_COEFF_SURPLUS; // source: inflation.ts FISCAL_COEFF_SURPLUS 0.08
  return deficitPct * coeff;
}

/**
 * Simplified country-level inflation.
 * Pure core of /root/projects/AHDGame/src/lib/budget/inflation.ts calculateInflationWithBreakdown
 * with neutral values for every input that requires unported systems except the fiscal term,
 * which is now wired from real budget state (deficit/GDP) per W2.
 */
export function computeInflation(
  previousInflationPct: number,
  unemploymentPct: number,
  gdpGrowthPct: number,
  surplus: number = 0,
  gdp: number = 0,
): number {
  // Central bank primeRate vs neutral — PORT-STUB neutral 0 monetary term
  // Tariff cost-push — PORT-STUB at baseline (0)
  // Wage growth — PORT-STUB at baseline (0)
  // Commodity/forex/savings/housing/policy/moneySupply — all PORT-STUB 0
  // Fiscal term is now real (deficit/GDP), not stubbed.

  const target = INFLATION_BASE_TARGET;

  // 1. Demand-pull (Phillips curve) — two-sided
  // source: inflation.ts
  const uGap = INFLATION_NAIRU - unemploymentPct;
  const unemploymentTerm =
    uGap >= 0 ? uGap * INFLATION_UNEMPLOYMENT_COEFF_UP : uGap * INFLATION_UNEMPLOYMENT_COEFF_DOWN;

  const gGap = gdpGrowthPct - INFLATION_TREND_GDP_GROWTH;
  const gdpTerm = gGap >= 0 ? gGap * INFLATION_GDP_COEFF_UP : gGap * INFLATION_GDP_COEFF_DOWN;

  const fiscalTerm = computeFiscalTerm(surplus, gdp);

  const raw = target + unemploymentTerm + gdpTerm + fiscalTerm; // stubs for tariffs/wage/commodity/forex/savings remain 0

  // Inertia smoothing — source: inflation.ts
  const smoothedRaw = INFLATION_INERTIA * previousInflationPct + (1 - INFLATION_INERTIA) * raw;

  // Mean-reversion pull toward target — source: inflation.ts
  const meanReversion = INFLATION_MEAN_REVERSION_COEFF * (target - smoothedRaw);
  const smoothed = smoothedRaw + meanReversion;

  // Per-turn delta clamp — source: inflation.ts
  const delta = smoothed - previousInflationPct;
  const clampedDelta = Math.max(
    -INFLATION_MAX_PER_TURN_DELTA,
    Math.min(INFLATION_MAX_PER_TURN_DELTA, delta),
  );
  const clamped = previousInflationPct + clampedDelta;

  return Math.max(INFLATION_MIN, Math.min(INFLATION_MAX, Math.round(clamped * 100) / 100));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export const macroCountryTurnPhase: TurnPhase = {
  name: "macroCountryTurn",
  run(world, rng) {
    const ids = Object.keys(world.countries).sort();
    for (const id of ids) {
      const country = world.countries[id]!;
      const econ = country.economy;

      // Ensure outputGap exists for pre-v2 worlds that bypassed migration in tests.
      if (!Number.isFinite(econ.outputGap)) econ.outputGap = 0;

      const prevGap = econ.outputGap;
      const prevGrowthPct = econ.growthRate * 100;
      const prevUnempPct = econ.unemploymentRate * 100;
      const prevInflPct = econ.inflationRate * 100;

      // ── Growth via output gap ─────────────────────────────────────
      // PORT-STUB: sector signal replaces missing realized-revenue delta
      // (mainline src/lib/turn/gdpGrowth.ts computeRealizedRevenueGrowthRate /
      //  computeTrailingRevenueGrowthRate). Neutral value: previous growth plus
      //  small RNG shock, so the gap integration has an impulse without
      //  corporations/sectors/trade. Cite gdpGrowth.ts + outputGap.ts.
      const sectorNoise = (rng.next() - 0.5) * GROWTH_SHOCK_PCT;
      const sectorSignal = clamp(
        prevGrowthPct + sectorNoise,
        -10,
        15,
      );
      // Labor force → potential growth (real laborForce replacing the PORT-STUB).
      // Source: src/lib/metricEngine/potentialGrowth.ts computeLaborForce +
      // potentialGrowth (Solow LEVEL form). Labor participation is 62.5% default;
      // workingAge and militaryService come from demographics flows (per-region).
      // Capital stock growth and TFP basket remain PORT-STUB (0 / TFP_BASELINE)
      // until those systems land — stub comment names what remains.
      const regionIds = Object.values(world.regions)
        .filter((r) => r.countryId === id)
        .map((r) => r.id);
      let totalLaborForce = 0;
      let prevTotalLaborForce = 0;
      let hasLabor = false;
      for (const rid of regionIds) {
        const region = world.regions[rid];
        if (!region) continue;
        const lf = computeLaborForce(
          (region as unknown as { workingAgePopulation?: number }).workingAgePopulation ?? Math.round((region.population ?? 0) * 0.58),
          (region as unknown as { militaryServicePopulation?: number }).militaryServicePopulation ?? 0,
          NEUTRAL_LABOR_PARTICIPATION,
        );
        // Update live laborForces map (authoritative)
        if ((world as unknown as { laborForces?: Record<string, number> }).laborForces) {
          const prev = (world as unknown as { laborForces: Record<string, number> }).laborForces[rid] ?? lf;
          prevTotalLaborForce += prev;
          (world as unknown as { laborForces: Record<string, number> }).laborForces[rid] = Math.round(lf);
        }
        totalLaborForce += lf;
        hasLabor = true;
      }
      // Annualized labor growth from this turn vs prior total
      const gL = hasLabor && prevTotalLaborForce > 0
        ? annualizedGrowthRate(totalLaborForce, prevTotalLaborForce, TURNS_PER_YEAR)
        : 0;
      const gK = 0; // PORT-STUB: capital stock growth (needs advanceCapitalStock per region)
      const tfp = TFP_BASELINE; // PORT-STUB: TFP basket (needs rdIntensity/skill/infra/urbanization)
      const potential = hasLabor ? potentialGrowth(gL, gK, tfp) : NEUTRAL_GDP_GROWTH;
      const step = advanceOutputGap(prevGap, sectorSignal, potential, TURNS_PER_YEAR);
      const newGrowth = clamp(step.gdpGrowth / 100, GROWTH_RATE_MIN, GROWTH_RATE_MAX);

      // ── Unemployment via Okun's law ───────────────────────────────
      // Formula: source gdpGrowth.ts + registry/economic.ts unemploymentNode
      const targetUnemp = okunTarget(prevUnempPct, step.gdpGrowth, potential);
      // Inertia EMA: source gdpGrowth.ts UNEMPLOYMENT_INERTIA + registry/economic.ts
      const newUnempPctRaw =
        UNEMPLOYMENT_INERTIA * prevUnempPct + (1 - UNEMPLOYMENT_INERTIA) * targetUnemp;
      const newUnempPct = clamp(newUnempPctRaw, UNEMPLOYMENT_MIN, UNEMPLOYMENT_MAX);

      // ── Inflation ─────────────────────────────────────────────────
      // Formula: source budget/inflation.ts calculateInflationWithBreakdown
      // Fiscal term is now real: deficit/GDP from budget.surplus/gdp via FISCAL_COEFF_*
      // (source: inflation.ts FISCAL_COEFF_DEFICIT 0.15, FISCAL_COEFF_SURPLUS 0.08).
      // Monetary/tariffs/wage/commodity/forex/savings/housing/policy/moneySupply remain neutral.
      // Cite inflation.ts.
      const budget = world.budgets?.[id];
      const surplus = budget?.surplus ?? 0;
      const gdpForFiscal = budget?.gdp ?? econ.gdp;
      let newInflPct = computeInflation(prevInflPct, newUnempPct, step.gdpGrowth, surplus, gdpForFiscal);
      // Small RNG shock for deterministic variation (kept bounded by the
      // per-turn clamp already applied; shock is added after so it stays
      // within overall INFLATION_MIN/MAX).
      const inflShock = (rng.next() - 0.5) * INFLATION_SHOCK_PCT;
      newInflPct = clamp(
        Math.round((newInflPct + inflShock) * 100) / 100,
        INFLATION_MIN,
        INFLATION_MAX,
      );

      // ── GDP compounding ───────────────────────────────────────────
      // Weekly compounding from annualized growthRate:
      // gdp *= 1 + growthRate / WEEKS_PER_YEAR
      // Placeholder used WEEKS_PER_YEAR=52; mainline annualizes by TURNS_PER_YEAR=48
      // but compounding interval is the game turn (1 week). Cite placeholder +
      // constants/turnTime.ts.
      const gdpGrowthFactor = 1 + newGrowth / WEEKS_PER_YEAR;
      const newGdp = econ.gdp * gdpGrowthFactor;

      // ── Commit ────────────────────────────────────────────────────
      econ.outputGap = Math.round(step.gap * 1000) / 1000;
      econ.growthRate = Math.round(newGrowth * 10000) / 10000;
      econ.unemploymentRate = Math.round((newUnempPct / 100) * 10000) / 10000;
      econ.inflationRate = Math.round((newInflPct / 100) * 10000) / 10000;
      econ.gdp = Number.isFinite(newGdp) && newGdp > 0 ? Math.round(newGdp * 100) / 100 : econ.gdp;
    }
  },
};

// Back-compat export — deprecated alias for the rename.
export const macroEconomyPhase = macroCountryTurnPhase;
