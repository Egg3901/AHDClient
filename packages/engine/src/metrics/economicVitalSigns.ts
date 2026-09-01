/**
 * Economic vital signs — port of src/lib/economy/economicVitalSigns.ts
 * computeEconomicVitalSigns (simplified for solo's available inputs).
 *
 * Mainline's vital signs aggregate 10+ collections (commodity flows,
 * exchange snapshots, bonds, wealth, money supply, ledger reconciliation,
 * sourcing, etc.) into a diagnostic snapshot with 48-turn window medians and
 * coverage accounting. Solo ports the *scoring shapes* for the inputs it has
 * (corporations, commodity prices, bonds, exchangeRates, budgets) and marks
 * blocked inputs with named blockers.
 *
 * Blocked inputs:
 *  - E12_COMMODITY_FLOWS: requires CommodityFlow ledger (solo has only global prices)
 *  - E13_SOURCING: requires CommoditySourcingDoc
 *  - E14_LEDGER_RECONCILIATION: requires ledger reconciliation pipeline
 *  - E15_SHARE_ORDERS: requires share order book
 *  - E16_WEALTH_SNAPSHOTS: requires WealthListSnapshot collection
 *  - E17_NPP_FUNNEL: requires NppMarketEntryFunnel diagnostics
 *
 * Stored on WorldState.economicVitalSigns (latest) and vitalSignsHistory (rolling 48).
 *
 * Sources:
 *  - src/lib/economy/economicVitalSigns.ts ECONOMIC_VITAL_SIGNS_WINDOW_TURNS 48
 *  - src/lib/economy/economicVitalSigns.ts computeEconomicVitalSigns signatures
 *  - src/lib/db/types/economicVitalSigns.ts EconomicVitalSigns type
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";

export const ECONOMIC_VITAL_SIGNS_WINDOW_TURNS = 48 as const;

export interface EconomicMetric {
  value: number | null;
  observations: number;
  basis: string;
}

export interface VitalSignsHistoryRow {
  turn: number;
  depthToMarketCap: number | null;
  twoSidedListingShare: number | null;
  activeTradedListingShare: number | null;
  sovereignNoHolderBondShare: number | null;
}

export interface EconomicVitalSigns {
  turn: number;
  generatedAt: string;
  goods: {
    medianPriceMultiple: EconomicMetric;
    scarcityProxy: EconomicMetric;
  };
  firms: {
    listings: number;
    marketCapHhi: EconomicMetric;
    topFourMarketCapShare: EconomicMetric;
  };
  competition: {
    medianSellerHhi: EconomicMetric | null;
  };
  money: {
    currenciesObserved: number;
    medianInflationPct: EconomicMetric;
  };
  securities: {
    sovereignNoHolderBondShare: EconomicMetric;
  };
  coverage: {
    coverageStartTurn: number;
    windowTurnsExpected: number;
    windowTurnsObserved: number;
    windowCoverageShare: number | null;
    missingTurns: number[];
  };
  measurement: {
    confidence: "low" | "medium" | "high";
    reasons: string[];
  };
}

function metric(value: number | null, observations: number, basis: string): EconomicMetric {
  return { value: value == null || !Number.isFinite(value) ? null : value, observations, basis };
}

function median(values: number[]): number | null {
  const sorted = values.filter((v) => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function ratio(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

function gini(values: number[]): number | null {
  const sorted = values.filter((v) => typeof v === "number" && Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  const total = sorted.reduce((s, v) => s + v, 0);
  if (sorted.length === 0 || total <= 0) return null;
  let weighted = 0;
  for (let i = 0; i < sorted.length; i++) weighted += (i + 1) * sorted[i]!;
  return (2 * weighted) / (sorted.length * total) - (sorted.length + 1) / sorted.length;
}

function concentration(values: number[]): { hhi: number | null; topFourShare: number | null } {
  const positive = values.filter((v) => typeof v === "number" && Number.isFinite(v) && v > 0).sort((a, b) => b - a);
  const total = positive.reduce((s, v) => s + v, 0);
  if (total <= 0) return { hhi: null, topFourShare: null };
  return {
    hhi: positive.reduce((s, v) => s + Math.pow((v / total) * 100, 2), 0),
    topFourShare: positive.slice(0, 4).reduce((s, v) => s + v, 0) / total,
  };
}

export function computeEconomicVitalSigns(world: WorldState, turn: number, nowIso: string, history: VitalSignsHistoryRow[]): EconomicVitalSigns {
  // Goods: median price multiple from commodity globalPrice/basePrice
  const priceMultiples: number[] = [];
  for (const state of Object.values(world.commodityPrices)) {
    if (state.basePrice > 0 && state.globalPrice > 0) priceMultiples.push(state.globalPrice / state.basePrice);
  }
  const scarcityProxyValues: number[] = priceMultiples.map((m) => Math.max(0, (m - 1) / (m + 1)));

  // Firms: from corporations (market cap proxy = liquidCapital + revenue)
  const marketCaps = Object.values(world.corporations).map((c) => Math.max(0, (c as unknown as { liquidCapital?: number }).liquidCapital ?? c.revenue ?? 0) || 1);
  const firmConc = concentration(marketCaps);

  // Bonds: sovereign no-holder share
  const bonds = Object.values(world.bonds);
  const sovereignBonds = bonds.filter((b) => (b as unknown as { issuerType: string }).issuerType === "sovereign");
  const noHolderCount = sovereignBonds.filter((b) => ((b as unknown as { holders?: Array<{ units: number }> }).holders ?? []).filter((h) => h.units > 0).length === 0).length;
  const sovereignNoHolder = metric(ratio(noHolderCount, sovereignBonds.length), sovereignBonds.length, "unmatured_bond_count");

  // Money: inflation median from countries
  const inflations = Object.values(world.countries).map((c) => c.economy.inflationRate * 100).filter((v) => Number.isFinite(v));
  const medianInflation = median(inflations);

  // Coverage
  const windowStart = Math.max(1, turn - ECONOMIC_VITAL_SIGNS_WINDOW_TURNS + 1);
  const observed = new Set<number>([turn, ...history.map((r) => r.turn).filter((t) => t >= windowStart && t <= turn)]);
  const coverageStartTurn = observed.size > 0 ? Math.min(...observed) : turn;
  const windowTurnsExpected = turn - coverageStartTurn + 1;
  const missingTurns: number[] = [];
  for (let c = coverageStartTurn; c <= turn; c++) if (!observed.has(c)) { missingTurns.push(c); if (missingTurns.length >= ECONOMIC_VITAL_SIGNS_WINDOW_TURNS) break; }

  const measurementReasons: string[] = [];
  if (missingTurns.length > 0) measurementReasons.push(`window_missing_${missingTurns.length}_turns`);
  if (world.commodityPriceHistory && Object.keys(world.commodityPriceHistory).length === 0) measurementReasons.push("commodity_price_history_unavailable");
  measurementReasons.push("E12_COMMODITY_FLOWS_blocked", "E13_SOURCING_blocked", "E14_LEDGER_RECONCILIATION_blocked");

  const confidence: EconomicVitalSigns["measurement"]["confidence"] = measurementReasons.length === 0 ? "high" : measurementReasons.some((r) => r.includes("unavailable")) ? "low" : "medium";

  return {
    turn,
    generatedAt: nowIso,
    goods: {
      medianPriceMultiple: metric(median(priceMultiples), priceMultiples.length, "global_price_over_base"),
      scarcityProxy: metric(median(scarcityProxyValues), scarcityProxyValues.length, "price_multiple_scarcity_proxy"),
    },
    firms: {
      listings: marketCaps.length,
      marketCapHhi: metric(firmConc.hhi, marketCaps.length, "corp_market_cap_proxy"),
      topFourMarketCapShare: metric(firmConc.topFourShare, marketCaps.length, "corp_market_cap_proxy"),
    },
    competition: { medianSellerHhi: null },
    money: {
      currenciesObserved: Object.keys(world.exchangeRates).length,
      medianInflationPct: metric(medianInflation, inflations.length, "country_inflation_median"),
    },
    securities: { sovereignNoHolderBondShare: sovereignNoHolder },
    coverage: {
      coverageStartTurn,
      windowTurnsExpected,
      windowTurnsObserved: observed.size,
      windowCoverageShare: ratio(observed.size, windowTurnsExpected),
      missingTurns,
    },
    measurement: { confidence, reasons: measurementReasons },
  };
}

export function snapshotEconomicVitalSigns(world: WorldState): void {
  const turn = world.meta.turn;
  const nowIso = world.meta.date;
  const snapshot = computeEconomicVitalSigns(world, turn, nowIso, world.vitalSignsHistory);
  world.economicVitalSigns = snapshot;
  // Append to history narrow projection
  world.vitalSignsHistory.push({
    turn,
    depthToMarketCap: null,
    twoSidedListingShare: null,
    activeTradedListingShare: null,
    sovereignNoHolderBondShare: snapshot.securities.sovereignNoHolderBondShare.value,
  });
  if (world.vitalSignsHistory.length > ECONOMIC_VITAL_SIGNS_WINDOW_TURNS) {
    world.vitalSignsHistory.splice(0, world.vitalSignsHistory.length - ECONOMIC_VITAL_SIGNS_WINDOW_TURNS);
  }
}

export const economicVitalSignsPhase: TurnPhase = {
  name: "economicVitalSigns",
  run(world) {
    snapshotEconomicVitalSigns(world);
  },
};
