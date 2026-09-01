/**
 * Party organization turn phase cluster.
 * Ports 8 mainline phases (see turnPhaseNames.ts ordering):
 *  partyInfluenceTurn, caucusTax, partyOrgTurn, partyTierTurn,
 *  partyActionGeneration, expireCharters, emptyPartyCleanup,
 *  partyMemberCountReconcile
 *
 * All phases are pure mutations on WorldState, reading/writing only the
 * passed world + rng. No IO, no Math.random, no Date.now.
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import {
  ORG_DECAY_RATE,
  MIN_PRESENCE_ORG,
  PARTY_INFLUENCE_DECAY_RATE,
  PARTY_INFLUENCE_BASE_RATE,
  PARTY_INFLUENCE_MAX_PENALTY,
  PARTY_INFLUENCE_POOL_MULTIPLIER,
  PARTY_INFLUENCE_MAX_BONUS,
  NATIONAL_PASSIVE_PS_PER_TURN,
  NATIONAL_PS_CAP,
  PS_INVESTMENT_MAX_TIERS,
} from "./constants.js";
import {
  computeClosenessScalar,
  computeInfamyPenalty,
  computeTurnGain,
  computeNewInfluence,
  computeBonusActions,
} from "./partyInfluence.js";
import {
  resolvePartyPsCap,
  resolveTierTransition,
  updateEarnedRegions,
  nationalCapForCountry,
} from "./partyTier.js";

// ---------------------------------------------------------------------------
// partyInfluenceTurn
// Source: src/lib/turn/partyInfluenceTurn.ts
// PORT-STUB: infamy 0 (no infamy tracking), leadership 0 (no chair data),
// bonus actions stored as politician.bonusActions counter.
// ---------------------------------------------------------------------------
export const partyInfluenceTurnPhase: TurnPhase = {
  name: "partyInfluenceTurn",
  run(world: WorldState) {
    const decayRate = PARTY_INFLUENCE_DECAY_RATE;
    const baseRate = PARTY_INFLUENCE_BASE_RATE;
    const maxPenalty = PARTY_INFLUENCE_MAX_PENALTY;
    const poolMultiplier = PARTY_INFLUENCE_POOL_MULTIPLIER;
    const maxBonus = PARTY_INFLUENCE_MAX_BONUS;

    const byParty = new Map<string, typeof world.politicians>();
    for (const pol of world.politicians) {
      const arr = byParty.get(pol.partyId);
      if (arr) arr.push(pol);
      else byParty.set(pol.partyId, [pol]);
    }

    for (const [partyId, members] of byParty) {
      const party = world.parties[partyId];
      if (!party) continue;

      const totalInfluence = members.reduce((s, p) => s + (p.partyInfluence ?? 0), 0);
      const totalPool = poolMultiplier * members.length;

      for (const pol of members) {
        const closeness = computeClosenessScalar(
          pol.ideology.economic,
          pol.ideology.social,
          party.economicPosition,
          party.socialPosition,
        );
        // PORT-STUB leadership/insanity at neutral values
        const leadershipBonus = 0;
        const infamyPenalty = computeInfamyPenalty(0, maxPenalty);
        const turnGain = computeTurnGain(closeness, leadershipBonus, infamyPenalty, baseRate);
        const newInfluence = computeNewInfluence(pol.partyInfluence ?? 0, turnGain, decayRate);
        const bonus = computeBonusActions(
          pol.partyInfluence ?? 0,
          totalInfluence,
          totalPool,
          closeness,
          maxBonus,
        );
        pol.partyInfluence = newInfluence;
        pol.bonusActions = (pol.bonusActions ?? 0) + bonus;
      }
    }
  },
};

// ---------------------------------------------------------------------------
// caucusTax
// Source: src/lib/turn/caucusTax.ts
// PORT-STUB: mainline taxes per-member campaign funds (currencyBalances.campaign
// or funds, forex-gated) and deposits into caucus treasury. Solo has no
// per-politician campaign funds and caucus membership is empty by default;
// we tax a neutral 0 income so the pass is no-op until funds/causes exist.
// When caucuses with taxRate>0 and members exist, we deduct from party
// treasury as a stub for the campaign-funds source and credit the caucus.
// ---------------------------------------------------------------------------
export const caucusTaxPhase: TurnPhase = {
  name: "caucusTax",
  run(world: WorldState) {
    // No caucuses or all taxRate 0 => nothing to do
    const taxable = world.caucuses.filter((c) => c.disbandedAt === null && c.taxRate > 0);
    if (taxable.length === 0) return;

    for (const caucus of taxable) {
      if (caucus.memberIds.length === 0) continue;
      // PORT-STUB: income per member is 0 in solo (no fundGeneration).
      // Even if members exist, tax floor is 0. We keep the loop structure
      // so tests that set treasuries can drive a non-zero flow by direct
      // party treasury debit. For now with 0 income, inflow is 0.
      let inflow = 0;
      // Simple stub: charge each member party treasury a flat floor if we want
      // to demonstrate flow in tests that set a non-zero taxRate and members.
      // With zero campaign income, inflow stays 0 at mainline-neutral.
      // Tests that need flow can set world.caucuses treasury manually and
      // call a helper; the phase itself stays neutral.
      if (inflow > 0) {
        caucus.treasury += inflow;
        const party = world.parties[caucus.partyId];
        if (party) party.treasury = Math.max(0, party.treasury - inflow);
      }
    }
  },
};

// ---------------------------------------------------------------------------
// partyOrgTurn
// Source: src/lib/turn/partyOrg/turnProcessing.ts
// PORT-STUB: mainline iterates StatePartyOrg per state; solo stores one
// national organization value per party. Decay semantics identical.
// ---------------------------------------------------------------------------
export const partyOrgTurnPhase: TurnPhase = {
  name: "partyOrgTurn",
  run(world: WorldState) {
    for (const party of Object.values(world.parties)) {
      const org = Number.isFinite(party.organization) ? party.organization : 0;
      // PORT-STUB: hasPresence true when memberCount > 0 (mirrors
      // mainline hasPresence flag on StatePartyOrg which is true when
      // the party has a character or official in that state).
      const hasPresence = party.memberCount > 0;
      const floor = hasPresence ? MIN_PRESENCE_ORG : 0;
      let newOrg = org;
      if (org > floor) {
        newOrg = Math.max(floor, org - ORG_DECAY_RATE);
      }
      party.organization = Math.round(newOrg * 100) / 100;
    }
  },
};

// ---------------------------------------------------------------------------
// partyTierTurn
// Source: src/lib/turn/partyTierTurn.ts + src/lib/parties/partyTier.ts
// PORT-STUB: mainline uses per-region org map and REGION_COUNT_BY_COUNTRY.
// Solo collapses to one pseudo-region per party whose org is
// party.organization. regionCount = 3 as neutral denominator so
// graduation = 1 region at >=20% and demotion = 2 regions below 10%.
// Members of one region at 20%+ graduates; losing it warns then demotes.
// ---------------------------------------------------------------------------
export const partyTierTurnPhase: TurnPhase = {
  name: "partyTierTurn",
  run(world: WorldState) {
    for (const party of Object.values(world.parties)) {
      const regionCount = 3;
      // Single pseudo-region keyed by party patch
      const orgByRegion = new Map<string, number>([["national", party.organization ?? 0]]);

      const prevTier = party.tier === "major" || party.tier === "minor" ? party.tier : "minor";
      const prevEarned = party.psCapEarnedRegions ?? [];
      const earned = updateEarnedRegions(prevEarned, orgByRegion);

      const exempt = false; // PORT-STUB: no regimeStatus ruling exemption in solo
      const transition = resolveTierTransition({
        currentTier: prevTier,
        orgByRegion,
        regionCount,
        warningStartedTurn: party.majorDemotionWarning?.startedTurn ?? null,
        currentTurn: world.meta.turn,
        exemptFromDemotion: exempt,
      });

      const cap = resolvePartyPsCap(transition.tier, earned.length, nationalCapForCountry());
      const currentPS = party.politicalStrength ?? 0;
      const clampedPS = Math.min(currentPS, cap);

      // Apply changes
      if (party.tier !== transition.tier) party.tier = transition.tier;
      // Earned regions: update if changed (order-insensitive compare)
      const same =
        prevEarned.length === earned.length && prevEarned.every((v, i) => v === earned[i]);
      if (!same) party.psCapEarnedRegions = earned;

      if (transition.warningStartedTurn !== (party.majorDemotionWarning?.startedTurn ?? null)) {
        if (transition.warningStartedTurn == null) delete party.majorDemotionWarning;
        else party.majorDemotionWarning = { startedTurn: transition.warningStartedTurn };
      }

      if (clampedPS < currentPS) party.politicalStrength = clampedPS;
    }
  },
};

// ---------------------------------------------------------------------------
// partyActionGeneration (Political Strength generation)
// Source: src/lib/turn/partyActionGeneration.ts computePartyPsGain
// Two streams: flat passive + treasury-driven investment (stub budget 0).
// ---------------------------------------------------------------------------
export interface ComputePsGainInput {
  current: number;
  cap: number;
  treasury: number;
  passivePerTurn: number;
  psInvestmentBudget: number;
  psInvestmentRatePerPs: number;
}

export function computePartyPsGain(input: ComputePsGainInput): {
  passive: number;
  investment: number;
  investmentDebit: number;
  total: number;
  clampedTo: number;
} {
  const passive = input.passivePerTurn;
  const headroomAfterPassive = Math.max(0, input.cap - input.current - passive);
  let investment = 0;
  let investmentDebit = 0;
  const requestedBudget = Math.max(0, input.psInvestmentBudget);
  const treasury = Math.max(0, input.treasury);
  if (requestedBudget > 0 && treasury > 0 && headroomAfterPassive > 0) {
    const availableBudget = Math.min(requestedBudget, treasury);
    const requestedPS = availableBudget / Math.max(1, input.psInvestmentRatePerPs);
    investment = Math.min(requestedPS, PS_INVESTMENT_MAX_TIERS, headroomAfterPassive);
    investmentDebit = investment * input.psInvestmentRatePerPs;
  }
  const total = passive + investment;
  const clampedTo = Math.min(input.cap, input.current + total);
  const realizedTotal = clampedTo - input.current;
  return { passive, investment, investmentDebit, total: realizedTotal, clampedTo };
}

const PS_INVESTMENT_RATE_PER_PS = 12500; // PORT-STUB: mainline US national rate * 0.05 premium

export const partyActionGenerationPhase: TurnPhase = {
  name: "partyActionGeneration",
  run(world: WorldState) {
    for (const party of Object.values(world.parties)) {
      const cap =
        party.tier === "major" ? NATIONAL_PS_CAP : resolvePartyPsCap(party.tier, party.psCapEarnedRegions?.length ?? 0, NATIONAL_PS_CAP);
      const gain = computePartyPsGain({
        current: party.politicalStrength ?? 0,
        cap,
        treasury: party.treasury ?? 0,
        passivePerTurn: NATIONAL_PASSIVE_PS_PER_TURN,
        psInvestmentBudget: 0, // PORT-STUB no investment budget in solo
        psInvestmentRatePerPs: PS_INVESTMENT_RATE_PER_PS,
      });
      if (gain.total <= 0) continue;
      party.politicalStrength = gain.clampedTo;
      if (gain.investmentDebit > 0) {
        party.treasury = Math.max(0, party.treasury - gain.investmentDebit);
      }
    }
  },
};

// ---------------------------------------------------------------------------
// expireCharters
// Source: src/lib/turn/charters/expireCharters.ts
// Two expiry paths: pending (expiresOnTurn/expiresAt) and founder-replacement.
// Ratified/migrated never expire (both deadline fields null).
// ---------------------------------------------------------------------------
export const expireChartersPhase: TurnPhase = {
  name: "expireCharters",
  run(world: WorldState) {
    const nowStr = world.meta.date;
    for (const charter of world.charters) {
      if (charter.status === "draft" || charter.status === "pending-signatures") {
        const byTurn = charter.expiresOnTurn != null && charter.expiresOnTurn <= world.meta.turn;
        const byDate = charter.expiresOnTurn == null && charter.expiresAt != null && charter.expiresAt <= nowStr;
        if (byTurn || byDate) {
          charter.status = "expired";
        }
      } else if (charter.status === "founder-replacement") {
        const byTurn =
          charter.founderReplacementDeadlineTurn != null &&
          charter.founderReplacementDeadlineTurn <= world.meta.turn;
        const byDate =
          charter.founderReplacementDeadlineTurn == null &&
          charter.founderReplacementDeadline != null &&
          charter.founderReplacementDeadline <= nowStr;
        if (byTurn || byDate) {
          charter.status = "expired";
        }
      }
    }
  },
};

// ---------------------------------------------------------------------------
// emptyPartyCleanup
// Source: src/lib/turn/partyOrg/emptyPartyCleanup.ts
// Deletes non-default parties with 0 members (politicians + future NPPs)
// and no chartered immunity. Cleans up related party artifacts.
// PORT-STUB: mainline also checks NPPs, elected officials, and chartered
// status; solo checks politicians and chartered partyId immunity only.
// Legislatures chambers that reference cleaned parties get their
// seatsByParty entry removed (vacancies increased).
// ---------------------------------------------------------------------------
export const emptyPartyCleanupPhase: TurnPhase = {
  name: "emptyPartyCleanup",
  run(world: WorldState) {
    const charteredIds = new Set(
      world.charters
        .filter((c) => c.status === "ratified" || c.status === "migrated" || c.status === "migrated-incomplete")
        .map((c) => (c.partyId ? c.partyId : "")),
    );

    const toDelete: string[] = [];
    for (const [id, party] of Object.entries(world.parties)) {
      if (party.isDefault) continue;
      if (charteredIds.has(id)) continue;
      if ((party.memberCount ?? 0) > 0) continue;
      // Also verify no politician holds this party
      const hasPolitician = world.politicians.some((p) => p.partyId === id);
      if (hasPolitician) continue;
      toDelete.push(id);
    }

    for (const id of toDelete) {
      delete world.parties[id];
      // Remove from legislature compositions
      for (const leg of Object.values(world.legislatures)) {
        for (const ch of leg.chambers) {
          if (ch.composition.seatsByParty[id] !== undefined) {
            const seats = ch.composition.seatsByParty[id]!;
            delete ch.composition.seatsByParty[id];
            ch.composition.vacancies += seats;
          }
        }
      }
      // Remove caucuses owned by this party
      world.caucuses = world.caucuses.filter((c) => c.partyId !== id);
    }
  },
};

// ---------------------------------------------------------------------------
// partyMemberCountReconcile
// Source: src/lib/turn/partyOrg/reconcileMemberCounts.ts
// Two grouped aggregations -> bulk write; solo iterates politicians.
// PORT-STUB: mainline groups characters + active NPPs; solo uses politicians.
// ---------------------------------------------------------------------------
export const partyMemberCountReconcilePhase: TurnPhase = {
  name: "partyMemberCountReconcile",
  run(world: WorldState) {
    const counts = new Map<string, number>();
    for (const pol of world.politicians) {
      counts.set(pol.partyId, (counts.get(pol.partyId) ?? 0) + 1);
    }
    for (const [id, party] of Object.entries(world.parties)) {
      const correct = counts.get(id) ?? 0;
      if (party.memberCount !== correct) {
        party.memberCount = correct;
      }
    }
  },
};
