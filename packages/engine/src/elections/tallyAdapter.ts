import type { WorldRng } from "../rng.js";
import type { WorldState } from "../types.js";
import type { ElectionRecord } from "./types.js";
import { accumulateVoteTurn } from "../electionEngine/tally/accumulateVoteTurn.js";
import { initElectionVoteTally } from "../electionEngine/tally/initElectionVoteTally.js";
import type {
  AccumulateVoteTurnInput,
  TallyCandidateInput,
  TallyDerivedInputs,
  TallyInput,
  TallyStatePartyOrgInput,
  TallyTurnoutInput,
} from "../electionEngine/tally/types.js";
import { enrichCandidates } from "../electionEngine/candidateEnrichment.js";
import type { StateDemographics as EngineStateDemographics } from "../electionEngine/types.js";
import { aggregateFundsByParty } from "../electionEngine/fundsByParty.js";
import { campaignKey } from "../campaigns/lifecycle.js";

/**
 * W21c tally wiring: feeds the ported accumulateVoteTurn from WorldState.
 * US races run the real mainline vote math against W16 demographics.
 * Races whose state lacks demographic tables (UK/RU/DD until W39) return
 * false and stay on the stub accumulator.
 */

function worldNow(world: WorldState): Date {
  return new Date(`${world.meta.date}T00:00:00Z`);
}

/**
 * Turnout resolution from demographic tables. Mainline's resolveTurnout is
 * caller-supplied in the pure tally; this derivation mirrors its semantics:
 * per-group turnout percentages, pool = VEP share weighted by category weight
 * and group turnout. PORT-STUB-DERIVED: replaced verbatim if/when
 * resolveTurnout itself is ported.
 */
function deriveTurnout(world: WorldState, stateId: string): TallyTurnoutInput | null {
  const demo = world.stateDemographics[stateId];
  const region = world.regions[stateId];
  if (!demo || !region) return null;
  const vep = region.votingEligiblePopulation ?? region.population ?? 0;
  const byGroup: Record<string, number> = {};
  let weighted = 0;
  let weightSum = 0;
  for (const [groupId, group] of Object.entries(demo.groups)) {
    const turnout = typeof group.turnout === "number" ? group.turnout : 55;
    byGroup[groupId] = turnout;
    const wgt = demo.categoryWeights[groupId] ?? 0;
    weighted += wgt * turnout;
    weightSum += wgt;
  }
  const avgTurnout = weightSum > 0 ? weighted / weightSum : 55;
  return { totalPool: Math.round((vep * avgTurnout) / 100), byGroup };
}

function derivedInputs(world: WorldState, rec: ElectionRecord): TallyDerivedInputs {
  const incumbentSeatShareByParty = new Map<string, number>();
  const leg = world.legislatures[rec.countryId];
  const chamber = leg?.chambers.find((c) => c.key === rec.chamberKey);
  if (chamber) {
    const held = Object.values(chamber.composition.seatsByParty).reduce((a, b) => a + b, 0);
    if (held > 0) {
      for (const [pid, seats] of Object.entries(chamber.composition.seatsByParty)) {
        incumbentSeatShareByParty.set(pid, seats / held);
      }
    }
  }
  // W26: fundsByParty now reads the real per-turn campaign spend
  // (Campaign.spendThisTurn via campaigns/phases.ts), exactly mirroring
  // mainline's getFundsByPartyForElection (which reads the `campaigns`
  // collection's spendThisTurn, not a raw funds stock). Ported verbatim via
  // electionEngine/fundsByParty.ts aggregateFundsByParty. Races without
  // campaigns (isCampaignEligible.ts gates which races get one) correctly
  // yield an empty map, same as mainline where no Campaign doc exists.
  const fundsByParty = aggregateFundsByParty(
    rec.candidates.map((cand) => ({
      party: cand.partyId,
      spendThisTurn: world.campaigns[campaignKey(rec.id, cand.id)]?.spendThisTurn ?? 0,
    })),
  );
  return {
    // PORT-STUB: no approval system yet; mainline neutral.
    approvalPct: 50,
    fundsByParty,
    incumbentSeatShareByParty,
    govExecutive: null,
    president: null,
  } as TallyDerivedInputs;
}

/** Returns true when the real tally ran; false = caller falls back to the stub. */
export function realAccumulate(world: WorldState, rng: WorldRng, rec: ElectionRecord): boolean {
  const stateId = rec.state;
  if (!stateId) return false;
  const demoRaw = world.stateDemographics[stateId];
  const region = world.regions[stateId];
  if (!demoRaw || !region) return false;
  const turnout = deriveTurnout(world, stateId);
  if (!turnout) return false;

  const now = worldNow(world);
  const candidates: TallyCandidateInput[] = rec.candidates.map((c) => {
    const support = world.candidateSupports?.[c.id]?.support;
    return {
      _id: c.id,
      electionId: rec.id,
      ...(c.id === "player" ? { characterId: "player" } : { nppId: c.id }),
      characterName: c.name,
      party: c.partyId,
      status: "active",
      isNPP: c.isNPP,
      support: typeof support === "number" ? support : 50,
    };
  });

  let tallyState = rec.tallyState as TallyInput | undefined;
  if (!tallyState) {
    const init = initElectionVoteTally({ electionId: rec.id, candidates, state: stateId, now });
    tallyState = init.tally;
  }

  const statePartyOrgs: TallyStatePartyOrgInput[] = [];
  for (const [key, pr] of Object.entries(world.partyRegions)) {
    if (!key.startsWith(`${stateId}:`)) continue;
    statePartyOrgs.push({
      stateId,
      partyId: pr.partyId,
      organization: pr.organization,
      registration: pr.registration,
    });
  }

  // World demographics persist lastUpdated as an ISO string for JSON safety;
  // the tally contract mirrors the Mongo doc with a Date.
  const demographics = { ...demoRaw, lastUpdated: new Date(demoRaw.lastUpdated) } as unknown as EngineStateDemographics;
  const categories = world.demographicCategories?.[rec.countryId] ?? [];

  const enriched = enrichCandidates(
    candidates.map((c) => ({
      _id: c._id,
      electionId: c.electionId,
      // Enrichment requires characterId; NPPs use their own id (nppId also set).
      characterId: c.characterId ?? c._id,
      nppId: c.nppId ?? null,
      characterName: c.characterName,
      party: c.party,
      isNPP: c.isNPP ?? true,
    })),
    {
      parties: Object.values(world.parties)
        .filter((p) => p.countryId === rec.countryId)
        .map((p) => ({
          sequentialId: p.id,
          name: p.name,
          color: p.color ?? "#888888",
          countryId: p.countryId,
          economicPosition: p.economicPosition,
          socialPosition: p.socialPosition,
        })),
    } as unknown as Parameters<typeof enrichCandidates>[1],
  );

  const input: AccumulateVoteTurnInput = {
    election: {
      _id: rec.id,
      countryId: rec.countryId,
      electionType: rec.electionType,
      state: stateId,
      startTurn: rec.startTurn,
      endTurn: rec.endTurn,
      primaryEndTurn: rec.primaryEndTurn,
      totalSeats: rec.totalSeats,
      endTime: new Date(now.getTime() + (rec.endTurn - world.meta.turn) * 3600_000),
      createdAt: now,
    },
    candidates,
    tally: tallyState,
    state: {
      _id: stateId,
      countryId: rec.countryId,
      name: region.name,
      population: region.population ?? 0,
      votingEligiblePopulation: region.votingEligiblePopulation ?? null,
      votingSystem: "fptp",
    },
    demographics,
    categories: categories as unknown as AccumulateVoteTurnInput["categories"],
    statePartyOrgs,
    turnout,
    enriched,
    turnNumber: world.meta.turn,
    now,
    derived: derivedInputs(world, rec),
    rng,
    isGeneralElection: world.meta.turn > rec.primaryEndTurn,
  };

  const result = accumulateVoteTurn(input);
  if (!result) return false;
  rec.tallyState = result.tally as unknown as ElectionRecord["tallyState"];
  rec.tally = { ...result.newTotals };
  return true;
}
