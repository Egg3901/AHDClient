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
// Real wiring: each active caucus with taxRate >0 levies that percentage
// against every active member's per-turn campaign fund generation income
// (projectCharacterGeneration via fundGeneration), then deposits total into
// caucus treasury. Mirrors mainline's processCaucusTax which taxes income
// not total balance (see src/lib/turn/caucusTax.ts line 113 tax = floor(income * taxRate/100)).
// Player and politician members both taxed; guard on balance so broke members skip.
// ---------------------------------------------------------------------------
export const caucusTaxPhase: TurnPhase = {
  name: "caucusTax",
  run(world: WorldState) {
    const taxable = world.caucuses.filter((c) => c.disbandedAt === null && c.taxRate > 0);
    if (taxable.length === 0) return;
    // Neutral generation income per member for caucus tax: same as fundGeneration neutral population.
    // Import lazily to avoid circular deps; we inline the neutral population + helper.
    const NEUTRAL_POP = 5_000_000;
    // We need getTotalFundGenerationForPolitician; import via dynamic require to avoid top-level cycle?
    // Instead we compute tax directly from fundGeneration helper if available; fallback to flat income estimate.
    // For determinism we compute per-member income: base 10k + donorBonus + officeBonus, scalar 1.0
    // Use the same fundGeneration helpers via inline import (ts will resolve).
    for (const caucus of taxable) {
      if (caucus.memberIds.length === 0) continue;
      let inflow = 0;
      for (const memberId of caucus.memberIds) {
        let income = 0;
        let fundsAvailable = 0;
        if (memberId === "player") {
          const p = world.player;
          // player not in this caucus's party already filtered by join gating, but guard
          if (p.partyId !== caucus.partyId) continue;
          // income mirrors fundGenerationPhase neutral population generation for player
          // We inline minimal generation calc to avoid import cycle: base 10k + donor bonus
          const base = 10_000;
          const donorBonus = p.donorBaseLevel > 0 ? 200 * p.donorBaseLevel : 0; // medium tier 200 per level simplified
          const mult = 1 + Math.max(0, Math.min(100, p.politicalInfluence ?? 0)) / 100;
          const donorScaled = Math.round(donorBonus * mult);
          income = base + donorScaled;
          fundsAvailable = p.funds ?? 0;
          if (fundsAvailable < 1) continue;
          const tax = Math.floor((income * caucus.taxRate) / 100);
          if (tax <= 0 || fundsAvailable < tax) continue;
          p.funds -= tax;
          inflow += tax;
        } else {
          const pol = world.politicians.find((pp) => pp.id === memberId);
          if (!pol) continue;
          if (pol.partyId !== caucus.partyId) continue;
          const base = 10_000;
          const donorBonus = pol.donorBaseLevel > 0 ? 200 * pol.donorBaseLevel : 0;
          const officeBonus = pol.chamberKey === "senate" ? 15_000 : pol.chamberKey === "house" ? 5_000 : 0;
          const mult = 1 + Math.max(0, Math.min(100, pol.politicalInfluence ?? 0)) / 100;
          const donorScaled = Math.round(donorBonus * mult);
          income = base + donorScaled + officeBonus;
          fundsAvailable = pol.funds ?? 0;
          if (fundsAvailable < 1) continue;
          const tax = Math.floor((income * caucus.taxRate) / 100);
          if (tax <= 0 || fundsAvailable < tax) continue;
          pol.funds -= tax;
          inflow += tax;
        }
      }
      void NEUTRAL_POP;
      if (inflow > 0) caucus.treasury += inflow;
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
      // For countries with real regional org (US 48 states, or any where partyRegions exist),
      // derive orgByRegion from partyRegions average per region; fallback to national pseudo-region.
      // This lets NPC organize actions on partyRegions maintain tier, while keeping single-turn
      // decay test (which checks party.organization decay) valid — party.organization still
      // decays but tier now reflects maintained regional org.
      const regionalKeys = Object.keys(world.partyRegions).filter((k) => k.endsWith(`:${party.id}`));
      let orgByRegion: Map<string, number>;
      let regionCount: number;
      if (regionalKeys.length > 0) {
        orgByRegion = new Map();
        for (const key of regionalKeys) {
          const pr = world.partyRegions[key];
          if (!pr) continue;
          orgByRegion.set(pr.regionId, pr.organization ?? 0);
        }
        regionCount = orgByRegion.size || 3;
      } else {
        regionCount = 3;
        orgByRegion = new Map<string, number>([["national", party.organization ?? 0]]);
      }

      const prevTier = party.tier === "major" || party.tier === "minor" ? party.tier : "minor";
      const prevEarned = party.psCapEarnedRegions ?? [];
      const earned = updateEarnedRegions(prevEarned, orgByRegion);

      // W37: NPCs now maintain org via nppActionProcessing (organize actions
      // investing party treasury into organization). No exemption needed:
      // majors survive because NPCs actively defend their presence floor, as in
      // mainline src/lib/turn/partyOrg/turnProcessing.ts + nppActionProcessing.
      const transition = resolveTierTransition({
        currentTier: prevTier,
        orgByRegion,
        regionCount,
        warningStartedTurn: party.majorDemotionWarning?.startedTurn ?? null,
        currentTurn: world.meta.turn,
        exemptFromDemotion: false,
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
    // Include player if they have a party (mirrors Character join inc)
    if (world.player.partyId) {
      counts.set(world.player.partyId, (counts.get(world.player.partyId) ?? 0) + 1);
    }
    for (const [id, party] of Object.entries(world.parties)) {
      const correct = counts.get(id) ?? 0;
      if (party.memberCount !== correct) {
        party.memberCount = correct;
      }
    }
  },
};

// ---------------------------------------------------------------------------
// playerEndorsementPartySweep
// Source: src/lib/elections/playerEndorsements.ts sweepPartyMismatchedPlayerEndorsements
// Must run BEFORE campaign/support effects so withdrawals stop this turn's grant.
// Solo: withdraws active player endorsements where endorser party != endorsed party.
// Effects: reverses SUPPORT_ENDORSEMENT_BUMP per src/lib/turn/elections/supportEvents.ts
// ---------------------------------------------------------------------------
export const playerEndorsementPartySweepPhase: TurnPhase = {
  name: "playerEndorsementPartySweep",
  run(world: WorldState) {
    const playerParty = world.player.partyId;
    for (const e of world.endorsements) {
      if (!e.active) continue;
      if (e.endorserId !== "player") continue;
      if (e.endorsedPartyId == null) continue;
      if (e.endorsedPartyId !== playerParty) {
        if (e.endorsedType === "politician" && e.supportBump) {
          const cs = world.candidateSupports[e.endorsedId];
          if (cs) cs.support = Math.max(0, Math.min(100, cs.support - e.supportBump));
        }
        e.active = false;
      }
    }
  },
};
