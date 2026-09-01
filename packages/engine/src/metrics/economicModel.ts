/**
 * Economic model classification — port of src/lib/turn/economicModelTurn.ts,
 * src/lib/economicModels/classify.ts, src/lib/economicModels/hysteresis.ts,
 * and src/lib/constants/economicModels.ts.
 *
 * Each COUNTRY has one named economic model (not per-region; regions inherit
 * via effect channels). Each turn the classifier blends sector revenue mix,
 * federal spending shares, and flagship-law tags into an affinity per model,
 * drifts scores with SCORE_INERTIA (0.9), picks the leader, and applies
 * hysteresis (SWITCH_MARGIN 5, SWITCH_TURNS 48, GRACE_DECAY 1, DOMINANCE_FLOOR 30)
 * before writing the national-scope doc.
 *
 * Mainline's sector revenue comes from sectorRevenueTaxProvider (sectorRevenues).
 * Solo uses corporation revenue per sectorType (plus stubs for unowned).
 *
 * PORT-STUB blocked inputs with named blockers (no invented numbers):
 *  - E03_UNOWNED_SECTORS: unowned sector revenue not modeled in solo (no unownedSectors collection)
 *  - E04_ENACTED_LAW_TAGS: flagship law tags not modeled (require law taxonomy)
 *  - E05_NATIONAL_CORP_OWNERSHIP: stateOwnershipShare for State-Capitalist lever
 *
 * Sources:
 *  - src/lib/constants/economicModels.ts (archetypes, weights, thresholds)
 *  - src/lib/economicModels/classify.ts (sectorSignal, spendSignal, lawSignal, affinity, driftScore)
 *  - src/lib/economicModels/hysteresis.ts transition
 *  - src/lib/turn/economicModelTurn.ts processEconomicModelTurn, spendingShares, classifyAndTransition
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";

export type EconomicModelId =
  | "militaryIndustrial"
  | "techInnovation"
  | "financialized"
  | "industrialPowerhouse"
  | "resourceExtraction"
  | "agrarian"
  | "serviceConsumer"
  | "socialMarket"
  | "stateCapitalist"
  | "mixed";

export const ECONOMIC_MODEL_IDS: readonly EconomicModelId[] = [
  "militaryIndustrial",
  "techInnovation",
  "financialized",
  "industrialPowerhouse",
  "resourceExtraction",
  "agrarian",
  "serviceConsumer",
  "socialMarket",
  "stateCapitalist",
  "mixed",
] as const;

export interface EconomicModelState {
  current: EconomicModelId;
  intensity: number;
  scores: Record<EconomicModelId, number>;
  drivers?: { sector: number; spend: number; law: number } | undefined;
  challenger?: { modelId: EconomicModelId; turnsLeading: number } | undefined;
  lastUpdated: string;
}

// Tuning constants (sources cited per const, matching mainline)
export const PRIMARY_WEIGHT = 3; // source: economicModels.ts PRIMARY_WEIGHT
export const SECONDARY_WEIGHT = 1; // source: economicModels.ts SECONDARY_WEIGHT
export const AFFINITY_WEIGHTS = { sector: 0.4, spend: 0.4, law: 0.2 } as const; // source: AFFINITY_WEIGHTS
export const SCORE_INERTIA = 0.9; // source: SCORE_INERTIA
export const DOMINANCE_FLOOR = 30; // source: DOMINANCE_FLOOR
export const SWITCH_MARGIN = 5; // source: SWITCH_MARGIN
export const SWITCH_TURNS = 48; // source: SWITCH_TURNS
export const GRACE_DECAY = 1; // source: GRACE_DECAY
export const STATE_CAPITALIST_OWNERSHIP_THRESHOLD = 0.67; // source: STATE_CAPITALIST_OWNERSHIP_THRESHOLD

export interface EconomicModelArchetype {
  id: EconomicModelId;
  name: string;
  primarySector: string | null;
  secondarySectors: string[];
  spendingSignature: Record<string, number>;
  lawSignature: string[];
}

export const MODEL_ARCHETYPES: Record<EconomicModelId, EconomicModelArchetype> = {
  militaryIndustrial: {
    id: "militaryIndustrial",
    name: "Military-Industrial Complex",
    primarySector: "defense",
    secondarySectors: ["ordnance", "electronics"],
    spendingSignature: { defense: 1.0 },
    lawSignature: [],
  },
  techInnovation: {
    id: "techInnovation",
    name: "Tech Innovation",
    primarySector: "electronics",
    secondarySectors: ["software", "network_services"],
    spendingSignature: { education: 0.6, infrastructure: 0.4 },
    lawSignature: [],
  },
  financialized: {
    id: "financialized",
    name: "Financialized",
    primarySector: "financial_services",
    secondarySectors: ["consulting_services", "real_estate_services"],
    spendingSignature: { other: 1.0 },
    lawSignature: [],
  },
  industrialPowerhouse: {
    id: "industrialPowerhouse",
    name: "Industrial Powerhouse",
    primarySector: "steel",
    secondarySectors: ["vehicles", "chemicals"],
    spendingSignature: { infrastructure: 1.0 },
    lawSignature: [],
  },
  resourceExtraction: {
    id: "resourceExtraction",
    name: "Resource Extraction",
    primarySector: "oil",
    secondarySectors: ["coal", "iron"],
    spendingSignature: { other: 1.0 },
    lawSignature: [],
  },
  agrarian: {
    id: "agrarian",
    name: "Agrarian",
    primarySector: "food",
    secondarySectors: ["fertilizers", "timber"],
    spendingSignature: { agriculture: 1.0 },
    lawSignature: [],
  },
  serviceConsumer: {
    id: "serviceConsumer",
    name: "Service Consumer",
    primarySector: "retail",
    secondarySectors: ["healthcare_services", "entertainment_services"],
    spendingSignature: { healthcare: 0.5, welfare: 0.5 },
    lawSignature: [],
  },
  socialMarket: {
    id: "socialMarket",
    name: "Social Market",
    primarySector: null,
    secondarySectors: [],
    spendingSignature: { welfare: 0.5, healthcare: 0.3, education: 0.2 },
    lawSignature: [],
  },
  stateCapitalist: {
    id: "stateCapitalist",
    name: "State Capitalist",
    primarySector: "energy",
    secondarySectors: ["steel", "chemicals"],
    spendingSignature: { other: 1.0 },
    lawSignature: [],
  },
  mixed: {
    id: "mixed",
    name: "Mixed",
    primarySector: null,
    secondarySectors: [],
    spendingSignature: {},
    lawSignature: [],
  },
};

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }

function sectorSignal(a: EconomicModelArchetype, revenueByType: Record<string, number>, totalRevenue: number): number {
  if (!a.primarySector || totalRevenue <= 0) return 0;
  const primaryRev = revenueByType[a.primarySector] ?? 0;
  const secRev = a.secondarySectors.reduce((s, t) => s + (revenueByType[t] ?? 0), 0);
  const weighted = PRIMARY_WEIGHT * primaryRev + SECONDARY_WEIGHT * secRev;
  return clamp01(weighted / (PRIMARY_WEIGHT * totalRevenue));
}

function spendSignal(a: EconomicModelArchetype, spendingShare: Record<string, number>): number {
  const keys = Object.keys(a.spendingSignature);
  const sigTotal = keys.reduce((s, k) => s + a.spendingSignature[k]!, 0);
  if (sigTotal <= 0) return 0;
  const overlap = keys.reduce((s, k) => s + (spendingShare[k] ?? 0) * a.spendingSignature[k]!, 0);
  return clamp01(overlap / sigTotal);
}

function lawSignal(a: EconomicModelArchetype, activeLawTags: Set<string>): number {
  if (a.lawSignature.length === 0) return 0;
  return a.lawSignature.filter((t) => activeLawTags.has(t)).length / a.lawSignature.length;
}

function affinity(sector: number, spend: number, law: number): number {
  return AFFINITY_WEIGHTS.sector * sector + AFFINITY_WEIGHTS.spend * spend + AFFINITY_WEIGHTS.law * law;
}

function driftScore(prevScore: number, affinity01: number): number {
  return SCORE_INERTIA * prevScore + (1 - SCORE_INERTIA) * (100 * affinity01);
}

function spendingShares(byCategory: Record<string, number> | undefined): Record<string, number> {
  if (!byCategory) return {};
  const total = Object.values(byCategory).reduce((s, v) => s + (v || 0), 0);
  if (total <= 0) return {};
  const out: Record<string, number> = {};
  for (const [cat, v] of Object.entries(byCategory)) out[cat] = (v || 0) / total;
  return out;
}

export function classifyCountry(
  prev: EconomicModelState | undefined,
  revenueByType: Record<string, number>,
  totalRevenue: number,
  spendShare: Record<string, number>,
  activeLawTags: Set<string>,
  seedModel: EconomicModelId | undefined,
  nowIso: string,
): EconomicModelState {
  const scores: Record<EconomicModelId, number> = {} as Record<EconomicModelId, number>;
  const signals: Record<EconomicModelId, { sector: number; spend: number; law: number }> = {} as Record<EconomicModelId, { sector: number; spend: number; law: number }>;
  const affinities: Record<EconomicModelId, number> = {} as Record<EconomicModelId, number>;
  for (const id of ECONOMIC_MODEL_IDS) {
    if (id === "mixed") continue;
    const arch = MODEL_ARCHETYPES[id];
    const s = sectorSignal(arch, revenueByType, totalRevenue);
    const sp = spendSignal(arch, spendShare);
    const l = lawSignal(arch, activeLawTags);
    const aff = affinity(s, sp, l);
    signals[id] = { sector: s, spend: sp, law: l };
    affinities[id] = aff;
    const prevScore = prev?.scores[id] ?? aff * 100;
    scores[id] = driftScore(prevScore, aff);
  }
  scores.mixed = 0;
  signals.mixed = { sector: 0, spend: 0, law: 0 };
  affinities.mixed = 0;

  let leader: EconomicModelId = ECONOMIC_MODEL_IDS[0]!;
  let best = -1;
  for (const id of ECONOMIC_MODEL_IDS) {
    if (id === "mixed") continue;
    if ((scores[id] ?? 0) > best) { best = scores[id]!; leader = id; }
  }
  // If leader below floor and no prev, cold start to seed or mixed; else hysteresis decides
  const prevCurrent = prev?.current;
  let current: EconomicModelId;
  let challenger = prev?.challenger;
  if (!prev) {
    current = seedModel ?? (scores[leader]! >= DOMINANCE_FLOOR ? leader : "mixed");
  } else {
    // Hysteresis
    if ((scores[leader] ?? 0) < DOMINANCE_FLOOR) {
      current = "mixed";
      challenger = undefined;
    } else if (leader === prevCurrent) {
      if (challenger) {
        const tl = Math.max(0, challenger.turnsLeading - GRACE_DECAY);
        challenger = tl > 0 ? { modelId: challenger.modelId, turnsLeading: tl } : undefined;
      }
      current = prevCurrent!;
    } else {
      let ch = !challenger || challenger.modelId !== leader
        ? { modelId: leader, turnsLeading: 0 }
        : { ...challenger };
      if ((scores[leader] ?? 0) >= (scores[prevCurrent!] ?? 0) + SWITCH_MARGIN) {
        ch = { ...ch, turnsLeading: ch.turnsLeading + 1 };
      } else {
        ch = { ...ch, turnsLeading: Math.max(0, ch.turnsLeading - GRACE_DECAY) };
      }
      if (ch.turnsLeading >= SWITCH_TURNS) { current = leader; challenger = undefined; }
      else if (ch.turnsLeading === 0) { current = prevCurrent!; challenger = undefined; }
      else { current = prevCurrent!; challenger = ch; }
    }
  }
  const intensity = Math.max(0, Math.min(100, scores[current] ?? 0));
  return {
    current,
    intensity: Math.round(intensity * 100) / 100,
    scores,
    drivers: signals[current],
    challenger,
    lastUpdated: nowIso,
  };
}

function seedForCountry(countryId: string, era: string): EconomicModelId | undefined {
  const is1991Era = era < "2005";
  // Mirrored from COUNTRY_CONFIGS seedEconomicModel — only US differs by era in test fixtures
  if (countryId === "US") return is1991Era ? "militaryIndustrial" : "techInnovation";
  if (countryId === "UK") return "financialized";
  if (countryId === "RU") return "stateCapitalist";
  if (countryId === "DD") return "stateCapitalist";
  return undefined;
}

export function computeEconomicModels(world: WorldState): void {
  const nowIso = world.meta.date;
  // Roll up revenue by type from corporations
  const revenueByCountry: Record<string, Record<string, number>> = {};
  const totalByCountry: Record<string, number> = {};
  for (const corp of Object.values(world.corporations)) {
    const cid = corp.countryId;
    const t = (corp as unknown as { sectorType?: string }).sectorType ?? "retail";
    revenueByCountry[cid] ??= {};
    revenueByCountry[cid]![t] = (revenueByCountry[cid]![t] ?? 0) + (corp.revenue ?? 0);
    totalByCountry[cid] = (totalByCountry[cid] ?? 0) + (corp.revenue ?? 0);
  }
  for (const countryId of Object.keys(world.countries).sort()) {
    const prev = world.economicModels[countryId];
    const revByType = revenueByCountry[countryId] ?? {};
    const total = totalByCountry[countryId] ?? 0;
    // Spending shares from budget (if absent, empty)
    const budget = world.budgets[countryId];
    const spendShare = spendingShares(budget?.spending?.byCategory);
    const activeLawTags = new Set<string>(); // E04 blocked: no law taxonomy
    const seed = seedForCountry(countryId, world.meta.era);
    world.economicModels[countryId] = classifyCountry(prev, revByType, total, spendShare, activeLawTags, seed, nowIso);
  }
}

export const economicModelPhase: TurnPhase = {
  name: "economicModel",
  run(world) {
    computeEconomicModels(world);
  },
};
