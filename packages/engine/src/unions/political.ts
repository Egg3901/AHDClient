/**
 * Union political contributions + labour-relations political provider — W15.
 *
 * Ports two mainline modules verbatim:
 *  - src/lib/unions/unionPoliticalContributions.ts (MAX_POLITICAL_CONTRIBUTION_OF_FCF 0.5,
 *    MAX_POLITICAL_CONTRIBUTION_APPROVAL_PENALTY 5, freeCashFlowPerTurn etc.)
 *  - src/lib/unions/labourRelationsPoliticalProvider.ts (LABOUR_DISPUTE_DECAY 0.9,
 *    LABOUR_SETTLEMENT_DECAY 0.85, LABOUR_SETTLEMENT_EFFECT_TURNS 32,
 *    LABOUR_POLITICAL_CAPS economy.workerSecurity 5 / society.civicLife 3,
 *    buildLabourRelationsPoliticalNudges pure logic)
 *
 * The provider's `economy.workerSecurity` channel is services-driven
 * (servicesWorkerSecurityNudge via the same add()+clamp pipeline as the
 * bargaining campaign contribution, one capped total, not a second uncapped
 * channel). W15 has no BargainingCampaign collection yet (that wave lands
 * separately), so the turn phase below calls the services-only path of
 * buildLabourRelationsPoliticalNudges; the campaign+dispute coefficients are
 * preserved in the helper for completeness and tested via goldens, but are
 * PORT-STUB at the phase level until bargaining lands.
 *
 * Wire note (mainline→Rotunda bridge): mainline's LABOUR_POLITICAL_CAPS feed
 * src/lib/politicalMetrics via buildLabourRelationsPoliticalNudges → metricEngine.
 * Rotunda has no politicalMetrics/metricEngine port yet (see support/support.ts
 * file doc: politicalStrength is an aggregate, not the per-metric board). W15
 * therefore PORT-STUBs the wire at the phase boundary and documents the blocker:
 *   BLOCKER: union support/pressure/org (economy.workerSecurity) effect deferred
 *   until W17 politicalMetrics/metricEngine port (mainline src/lib/politicalMetrics/,
 *   src/lib/metricEngine/). The pure helper is real and tested; the phase does
 *   not yet mutate WorldState political fields.
 *
 * Source: /root/projects/AHDGame/src/lib/unions/unionPoliticalContributions.ts
 *         /root/projects/AHDGame/src/lib/unions/labourRelationsPoliticalProvider.ts
 */

import type { UnionServiceId } from "./services.js";
import { normalizeServiceIds, servicesWorkerSecurityNudge } from "./services.js";

/** Highest share of free cash flow a union may send to organizers each turn. Source: unionPoliticalContributions.ts MAX_POLITICAL_CONTRIBUTION_OF_FCF 0.5 */
export const MAX_POLITICAL_CONTRIBUTION_OF_FCF = 0.5;

/** Approval points lost when slider is at the 50% cap. Source: unionPoliticalContributions.ts MAX_POLITICAL_CONTRIBUTION_APPROVAL_PENALTY 5 */
export const MAX_POLITICAL_CONTRIBUTION_APPROVAL_PENALTY = 5;

function finiteNonNegative(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/** Stored rate, treating missing field as none and clamping into [0,0.5]. Source: unionPoliticalContributions.ts clampPoliticalContributionPct */
export function clampPoliticalContributionPct(pct: number | undefined): number {
  if (typeof pct !== "number" || !Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(MAX_POLITICAL_CONTRIBUTION_OF_FCF, pct));
}

/** Remaining operating budget: dues income minus service bill that actually ran. Source: unionPoliticalContributions.ts freeCashFlowPerTurn */
export function freeCashFlowPerTurn(duesIncome: number, servicesCost: number): number {
  return Math.max(0, finiteNonNegative(duesIncome) - finiteNonNegative(servicesCost));
}

/** Cash leaving treasury this turn at given rate. Source: unionPoliticalContributions.ts politicalContributionPerTurn */
export function politicalContributionPerTurn(
  freeCashFlow: number,
  pct: number | undefined,
): number {
  return finiteNonNegative(freeCashFlow) * clampPoliticalContributionPct(pct);
}

/** Approval points withheld for this rate. Source: unionPoliticalContributions.ts politicalContributionApprovalPenalty */
export function politicalContributionApprovalPenalty(pct: number | undefined): number {
  const clamped = clampPoliticalContributionPct(pct);
  if (clamped <= 0) return 0;
  return (clamped / MAX_POLITICAL_CONTRIBUTION_OF_FCF) * MAX_POLITICAL_CONTRIBUTION_APPROVAL_PENALTY;
}

export interface InfluenceShare {
  characterId: string;
  strength: number;
}

export interface ContributionPayout {
  characterId: string;
  amount: number;
}

/** Split a contribution pool by organizer influence. Source: unionPoliticalContributions.ts distributePoliticalContributions */
export function distributePoliticalContributions(
  total: number,
  shares: readonly InfluenceShare[],
): ContributionPayout[] {
  const amount = finiteNonNegative(total);
  if (amount <= 0) return [];
  const eligible = shares
    .filter((s) => finiteNonNegative(s.strength) > 0 && typeof s.characterId === "string")
    .slice()
    .sort((a, b) => (a.characterId < b.characterId ? -1 : a.characterId > b.characterId ? 1 : 0));
  const weight = eligible.reduce((sum, s) => sum + s.strength, 0);
  if (weight <= 0) return [];
  const out: ContributionPayout[] = [];
  let allocated = 0;
  for (let i = 0; i < eligible.length; i++) {
    const isLast = i === eligible.length - 1;
    const entry = eligible[i]!;
    const piece = isLast ? amount - allocated : amount * (entry.strength / weight);
    allocated += piece;
    if (piece > 0) out.push({ characterId: entry.characterId, amount: piece });
  }
  return out;
}

// ── Labour relations political provider ────────────────────────────────

/** Political attention fades unless a dispute escalates again. Source: labourRelationsPoliticalProvider.ts LABOUR_DISPUTE_DECAY 0.9 */
export const LABOUR_DISPUTE_DECAY = 0.9;
/** Settlement remains salient for several turns. Source: LABOUR_SETTLEMENT_DECAY 0.85 */
export const LABOUR_SETTLEMENT_DECAY = 0.85;
export const LABOUR_SETTLEMENT_EFFECT_TURNS = 32;

/** Keep labour relations subordinate to law/structural channels. Source: LABOUR_POLITICAL_CAPS */
export const LABOUR_POLITICAL_CAPS = {
  "economy.workerSecurity": 5,
  "society.civicLife": 3,
} as const;

const ESCALATION_SEVERITY: Record<string, number> = {
  none: 1,
  overtime_ban: 1.5,
  selective_strike: 2.25,
  industry_strike: 3,
};

type LabourPoliticalCampaign = {
  countryId: string;
  status: string;
  escalationLevel: string;
  mandate: { leverage: number };
  disputeStartedAtTurn?: number;
  escalationStartedAtTurn?: number;
  endedAtTurn?: number | null;
};

type LabourPoliticalUnion = {
  countryId: string;
  activeServices: readonly string[] | undefined;
  suspended?: boolean;
};

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

function ageSince(currentTurn: number, anchor: number | undefined): number {
  return Math.max(0, currentTurn - (anchor ?? currentTurn));
}

export function buildLabourRelationsPoliticalNudges(
  campaigns: readonly LabourPoliticalCampaign[],
  currentTurn: number,
  unions: readonly LabourPoliticalUnion[] = [],
): Map<string, Map<string, number>> {
  const nudges: Map<string, Map<string, number>> = new Map();

  function add(countryId: string, metricId: string, delta: number): void {
    const byMetric = nudges.get(countryId) ?? new Map<string, number>();
    byMetric.set(metricId, (byMetric.get(metricId) ?? 0) + delta);
    nudges.set(countryId, byMetric);
  }

  for (const union of unions) {
    if (union.suspended) continue;
    const nudge = servicesWorkerSecurityNudge(
      normalizeServiceIds(union.activeServices as unknown as UnionServiceId[] | undefined),
    );
    if (nudge !== 0) add(union.countryId, "economy.workerSecurity", nudge);
  }

  for (const campaign of campaigns) {
    if (campaign.status === "dispute") {
      const anchor = campaign.escalationStartedAtTurn ?? campaign.disputeStartedAtTurn;
      const salience = LABOUR_DISPUTE_DECAY ** ageSince(currentTurn, anchor);
      const severity = (ESCALATION_SEVERITY[campaign.escalationLevel] ?? 1) * salience;
      add(campaign.countryId, "economy.workerSecurity", -0.75 * severity);
      add(campaign.countryId, "society.civicLife", -0.4 * severity);
      continue;
    }
    if (campaign.status === "settled" && campaign.endedAtTurn != null) {
      const age = ageSince(currentTurn, campaign.endedAtTurn);
      if (age > LABOUR_SETTLEMENT_EFFECT_TURNS) continue;
      const salience = LABOUR_SETTLEMENT_DECAY ** age;
      const leverage = Math.max(0, Math.min(100, campaign.mandate.leverage));
      const settlementQuality = 0.75 + leverage / 200;
      add(campaign.countryId, "economy.workerSecurity", 1.5 * settlementQuality * salience);
      add(campaign.countryId, "society.civicLife", 0.75 * settlementQuality * salience);
    }
  }

  for (const byMetric of nudges.values()) {
    for (const [metricId, value] of byMetric) {
      const caps = LABOUR_POLITICAL_CAPS as Record<string, number>;
      const limit = caps[metricId] ?? 5;
      const bounded = clamp(value, limit);
      if (Math.abs(bounded) < 0.01) byMetric.delete(metricId);
      else byMetric.set(metricId, +bounded.toFixed(4));
    }
  }
  return nudges;
}
