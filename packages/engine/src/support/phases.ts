/**
 * W19 support model phase cluster (7 phases).
 * Ports mainline src/simulation/phases/turnPhaseRegistry.ts demographicsAndPartySetup
 * + support/election sections. All phases are deterministic pure mutations on WorldState.
 * Wire together in phases/registry.ts.
 *
 * Each phase cites its mainline source.
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import { DEFAULT_CANDIDATE_SUPPORT, SUPPORT_DECAY_PER_TURN } from "./constants.js";
import { decaySupport, tickSupportAccrual } from "./support.js";
import { applyTurnoutDecay, applyBoost, calculateAlignmentMultiplier, getVoterGroups, DEFAULT_GOTV_CATEGORY, DOLLARS_PER_TURNOUT_POINT_DEFAULT, calculateGOTVSpend, calculateNationalGOTVBoost } from "./turnout.js";
import { computePartyRevenue } from "../actions/fundGenerationPhase.js";
import { computeDriftDeltas, computeDecayDeltas } from "./regDrift.js";
import { decayPressure } from "./pressure.js";
import { filterEligiblePriorityRegions } from "./priorityRegion.js";

// ---------------------------------------------------------------------------
// supportDecay
// Source: src/lib/turn/elections/supportDecay.ts processSupportDecay
// Regress toward 50 by 0.5 per turn, clamped [0,100], active candidates only.
// ---------------------------------------------------------------------------
export const supportDecayPhase: TurnPhase = {
  name: "supportDecay",
  run(world: WorldState) {
    for (const cand of Object.values(world.candidateSupports)) {
      if (cand.status !== "active") continue;
      if (!Number.isFinite(cand.support)) continue;
      const next = decaySupport(cand.support);
      // snap handling via regressToward; still clamp defensive
      cand.support = Math.max(0, Math.min(100, next));
    }
  },
};

// ---------------------------------------------------------------------------
// supportAccrual
// Source: src/lib/turn/elections/supportAccrual.ts processSupportAccrualTick
// Each queued entry contributes amountPerTurn, decrements turnsRemaining, pruned.
// Support clamped [0,100].
// ---------------------------------------------------------------------------
export const supportAccrualPhase: TurnPhase = {
  name: "supportAccrual",
  run(world: WorldState) {
    for (const cand of Object.values(world.candidateSupports)) {
      if (cand.status !== "active") continue;
      if (!cand.supportAccrual || cand.supportAccrual.length === 0) continue;
      const { newAccrual, delta } = tickSupportAccrual(cand.supportAccrual);
      if (delta !== 0) {
        cand.support = Math.max(0, Math.min(100, cand.support + delta));
      }
      cand.supportAccrual = newAccrual;
    }
  },
};

// ---------------------------------------------------------------------------
// turnoutDecay
// Source: src/lib/utils/turnoutDecay.ts applyDecay + src/lib/turn/demographicTurnoutTurn.ts applyDecayToAllStates
// 2% decay per turn, threshold 0.01 snaps to 0, per-region per-group.
// ---------------------------------------------------------------------------
export const turnoutDecayPhase: TurnPhase = {
  name: "turnoutDecay",
  run(world: WorldState) {
    for (const rt of Object.values(world.regionTurnouts)) {
      for (const category of Object.keys(rt.modifiers)) {
        const groups = rt.modifiers[category];
        if (!groups || typeof groups !== "object") continue;
        for (const group of Object.keys(groups)) {
          const cur = groups[group]!;
          groups[group] = applyTurnoutDecay(cur);
        }
      }
      rt.lastDecayAppliedTurn = world.meta.turn;
    }
  },
};

// ---------------------------------------------------------------------------
// partyGOTV
// Source: src/lib/turn/demographicTurnoutTurn.ts processPartyGOTV
// W34: now uses real revenue via computePartyRevenue (derived from fundGeneration
// per-member generation * tax). Replaces the W19 stubRevenueFromOrgPs PORT-STUB.
// GOTV percent is 10% (midpoint of mainline 0-25% slider). Boost distributed via
// national per-region division (totalSpend / numRegions) * alignment, then
// applyBoost with diminishing returns.
// Cited: src/lib/turn/demographicTurnoutTurn.ts calculatePartyRevenueFromContext
// and src/lib/utils/fundGeneration.ts projectCharacterGeneration.
// ---------------------------------------------------------------------------
export const partyGOTVPhase: TurnPhase = {
  name: "partyGOTV",
  run(world: WorldState) {
    const regions = Object.values(world.regions);
    const regionCountByCountry = new Map<string, number>();
    for (const r of regions) regionCountByCountry.set(r.countryId, (regionCountByCountry.get(r.countryId) ?? 0) + 1);

    for (const party of Object.values(world.parties)) {
      const revenue = computePartyRevenue(world, party.id);
      if (revenue <= 0) continue;
      const spend = calculateGOTVSpend(revenue, 10, 0); // 10% GOTV allocation
      if (spend <= 0) continue;
      const numRegions = regionCountByCountry.get(party.countryId) ?? 0;
      if (numRegions === 0) continue;

      const voterGroups = getVoterGroups(party.countryId);
      // Eligible groups within 2 points on both axes
      const eligible = voterGroups.filter((g) => {
        // party position -> group lean distance check
        const ok = Math.abs(party.economicPosition - g.economicLean) <= 2 && Math.abs(party.socialPosition - g.socialLean) <= 2;
        return ok;
      });
      if (eligible.length === 0) continue;

      for (const group of eligible) {
        const align = calculateAlignmentMultiplier(party.economicPosition, party.socialPosition, group.economicLean, group.socialLean);
        const boost = calculateNationalGOTVBoost(spend, numRegions, DOLLARS_PER_TURNOUT_POINT_DEFAULT, align);
        if (boost === 0) continue;
        // Apply to each region of this party's country
        for (const region of regions) {
          if (region.countryId !== party.countryId) continue;
          const rt = world.regionTurnouts[region.id];
          if (!rt) continue;
          // Ensure category exists
          if (!rt.modifiers[DEFAULT_GOTV_CATEGORY]) rt.modifiers[DEFAULT_GOTV_CATEGORY] = {};
          if (!(group.id in rt.modifiers[DEFAULT_GOTV_CATEGORY])) rt.modifiers[DEFAULT_GOTV_CATEGORY][group.id] = 0;
          applyBoost(rt.modifiers, DEFAULT_GOTV_CATEGORY, group.id, boost);
        }
      }
    }
  },
};

// ---------------------------------------------------------------------------
// regDriftDecay
// Source: src/lib/turn/partyOrg/regDriftDecay.ts processRegDriftDecay
// Drift (up-only) then decay per region, pooled across parties.
// Uses partyRegions + electoratePools.
// ---------------------------------------------------------------------------
export const regDriftDecayPhase: TurnPhase = {
  name: "regDriftDecay",
  run(world: WorldState) {
    // Group partyRegions by regionId
    const byRegion = new Map<string, Array<{ key: string; partyId: string; org: number; reg: number }>>();
    for (const [key, pr] of Object.entries(world.partyRegions)) {
      const arr = byRegion.get(pr.regionId);
      const entry = { key, partyId: pr.partyId, org: pr.organization, reg: pr.registration };
      if (arr) arr.push(entry);
      else byRegion.set(pr.regionId, [entry]);
    }

    for (const [regionId, entries] of byRegion) {
      const pool = world.electoratePools[regionId];
      if (!pool) continue;

      // Build PartyView list for helpers
      const views = entries.map((e) => ({ rowId: e.key, partyId: e.partyId, orgPct: e.org, regPct: e.reg }));

      const drift = computeDriftDeltas(views);
      const driftResidual = drift.poolResidual;
      // Apply drift deltas to partyRegions
      for (const d of drift.partyDeltas) {
        const pr = world.partyRegions[d.rowId];
        if (pr) pr.registration = Math.max(0, Math.min(100, d.newReg));
      }
      // Rebuild views post-drift for decay
      const postDriftViews = entries.map((e) => {
        const updated = world.partyRegions[e.key]!;
        return { rowId: e.key, partyId: e.partyId, orgPct: updated.organization, regPct: updated.registration };
      });
      const decay = computeDecayDeltas(postDriftViews);
      for (const d of decay.partyDeltas) {
        const pr = world.partyRegions[d.rowId];
        if (pr) pr.registration = Math.max(0, Math.min(100, d.newReg));
      }

      // Pool updates: drift residual + decay poolDelta
      // PORT-STUB: mainline caps drift gain by remaining pool capacity and
      // handles overflow; solo applies without cap since pool sizes are small
      // and invariant is maintained via clamping; residual already bounded by rate.
      const totalPoolDeltaIndependent = decay.poolDelta.independent;
      const totalPoolDeltaUnregistered = decay.poolDelta.unregistered;
      // Drift residual is negative when parties gained (pool loses); positive when?
      // Drift residual is -netParty; decay poolDelta is positive (pool gains) when eligible empty.
      // Net pool change = residual (drift) + decay delta; but drift's pool loss corresponds to party gain.
      // mainline's pool handling splits via independentBias; for drift we mirror that:
      // if residual <0, take from pool split proportionally; if >0, add split.
      // For simplicity apply residual split by bias when residual !=0 and decay didn't already cover.
      let dIndependent = totalPoolDeltaIndependent;
      let dUnregistered = totalPoolDeltaUnregistered;
      if (driftResidual !== 0) {
        // Split drift residual across buckets with bias (negative means take)
        const bias = 1.5;
        if (driftResidual > 0) {
          const denom = bias + 1;
          dIndependent += (driftResidual * bias) / denom;
          dUnregistered += driftResidual / denom;
        } else {
          const take = -driftResidual;
          const availInd = Math.max(0, pool.independent);
          const availUnreg = Math.max(0, pool.unregistered);
          const totalAvail = availInd + availUnreg;
          const actualTake = Math.min(take, totalAvail);
          // Split take proportionally with bias, then overflow handling
          let fromInd = Math.min(availInd, (actualTake * bias) / (bias + 1));
          let fromUnreg = Math.min(availUnreg, actualTake / (bias + 1));
          let shortfall = actualTake - fromInd - fromUnreg;
          if (shortfall > 0) {
            const extraInd = Math.min(shortfall, availInd - fromInd);
            fromInd += extraInd;
            shortfall -= extraInd;
            fromUnreg += Math.min(shortfall, availUnreg - fromUnreg);
          }
          dIndependent -= fromInd;
          dUnregistered -= fromUnreg;
        }
      }
      pool.independent = Math.max(0, Math.min(100, pool.independent + dIndependent));
      pool.unregistered = Math.max(0, Math.min(100, pool.unregistered + dUnregistered));
    }
  },
};

// ---------------------------------------------------------------------------
// pressureDecay
// Source: src/lib/turn/politicalStrength/pressureDecay.ts
// ---------------------------------------------------------------------------
export const pressureDecayPhase: TurnPhase = {
  name: "pressureDecay",
  run(world: WorldState) {
    for (const pp of Object.values(world.partyPressures)) {
      if (pp.value <= 0) continue;
      pp.value = decayPressure(pp.value);
    }
  },
};

// ---------------------------------------------------------------------------
// priorityRegionDecay
// Source: src/lib/turn/politicalStrength/priorityRegionDecay.ts
// Evicts regions where organization == 0 or row missing.
// ---------------------------------------------------------------------------
export const priorityRegionDecayPhase: TurnPhase = {
  name: "priorityRegionDecay",
  run(world: WorldState) {
    for (const party of Object.values(world.parties)) {
      const cluster = party.priorityRegion;
      if (!cluster || !cluster.regionIds || cluster.regionIds.length === 0) continue;
      // Build org map for this party's regions
      const orgByRegion = new Map<string, number>();
      for (const rid of cluster.regionIds) {
        const key = `${rid}:${party.id}`;
        const pr = world.partyRegions[key];
        orgByRegion.set(rid, pr ? pr.organization : 0);
      }
      const { eligible } = filterEligiblePriorityRegions(cluster.regionIds, orgByRegion);
      if (eligible.length !== cluster.regionIds.length) {
        cluster.regionIds = eligible;
      }
    }
  },
};

export const SUPPORT_PHASES = [
  turnoutDecayPhase,
  partyGOTVPhase,
  regDriftDecayPhase,
  pressureDecayPhase,
  priorityRegionDecayPhase,
  supportAccrualPhase,
  supportDecayPhase,
] as const;
