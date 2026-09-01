/**
 * NPP Bill Sponsorship phase.
 * Port of src/lib/turn/npp/billSponsorship.ts processNppBillSponsorship (mainline).
 *
 * For each country, if an NPP from the majority party holds a seat, they may
 * sponsor a bill from the available W27 legislation catalog. Throttled by
 * active-bill cap and per-type cooldown.
 *
 * Sources:
 * - Bill sponsorship: src/lib/turn/npp/billSponsorship.ts (NPP_BILL_VOTING_DURATION_HOURS,
 *   NPP_SPONSOR_TYPE_REPEAT_COOLDOWN_TURNS, nppSponsorLimitsForCountry via
 *   src/lib/nppAutonomy/playerImpactBudget.ts)
 * - Catalog: packages/engine/src/legislation/catalog.ts (getLaw, AVAILABLE_CATALOG)
 * - Bill lifecycle: W27 legislation API produces bills consumed by billLifecyclePhase
 *
 * Determinism: all choices via turn rng.
 * PORT-STUB named where blocked (opposition rival bills V1.7, fiscal stance, planned economy filter).
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import type { WorldRng } from "../rng.js";
import type { Bill } from "../legislation/types.js";
import { getLaw, AVAILABLE_CATALOG } from "../legislation/catalog.js";

const ACTIVE_CAP = 3; // per country active nppSponsored bills cap (solo neutral; mainline 3 for non-player, 2 for player)
const COOLDOWN_TURNS = 12; // per-type repeat cooldown (mainline NPP_SPONSOR_TYPE_REPEAT_COOLDOWN_TURNS)
const VOTING_DURATION_TURNS = 2; // matches billLifecycle VOTING_TURNS

function countActiveNppBills(world: WorldState, countryId: string): number {
  return world.bills.filter(
    (b) => b.countryId === countryId && b.nppSponsored && !["failed", "withdrawn", "signed", "override_failed"].includes(b.status),
  ).length;
}

function lastSponsoredTurnOfType(world: WorldState, countryId: string, legTypeId: string): number | null {
  let latest: number | null = null;
  for (const b of world.bills) {
    if (b.countryId !== countryId) continue;
    if (!b.nppSponsored) continue;
    if (b.legislationTypeId !== legTypeId) continue;
    const t = b.proposedAtTurn ?? b.updatedAtTurn ?? 0;
    if (latest === null || t > latest) latest = t;
  }
  return latest;
}

function majorityPartyForCountry(world: WorldState, countryId: string): string | null {
  const leg = world.legislatures[countryId];
  if (!leg) return null;
  const elected = leg.chambers.filter((c) => c.elected);
  if (elected.length === 0) return null;
  // Use first elected chamber's seatsByParty as majority signal
  const seatsByParty = elected[0]!.composition.seatsByParty;
  let best: string | null = null;
  let max = 0;
  for (const [partyId, seats] of Object.entries(seatsByParty)) {
    if (seats > max || (seats === max && best !== null && partyId < best)) {
      max = seats;
      best = partyId;
    } else if (seats > max) {
      max = seats;
      best = partyId;
    }
  }
  // Handle case where best is still null but seats exist
  if (!best && Object.keys(seatsByParty).length > 0) {
    return Object.keys(seatsByParty).sort()[0]!;
  }
  return best;
}

function pickSponsor(world: WorldState, countryId: string, partyId: string): typeof world.politicians[number] | null {
  const candidates = world.politicians.filter((p) => p.countryId === countryId && p.partyId === partyId && p.chamberKey !== "");
  if (candidates.length === 0) return null;
  // Deterministic: lowest id wins (stable tie-break even across turns)
  // Does not consume main RNG to preserve goldens.
  candidates.sort((a, b) => a.id.localeCompare(b.id));
  return candidates[0]!;
}

function hashUnit(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

export const nppBillSponsorshipPhase: TurnPhase = {
  name: "nppBillSponsorship",
  run(world: WorldState, _rng: WorldRng) {
    // One attempt per country per turn (throttled, but with 15% chance to avoid
    // overwhelming legislation tests and economy goldens). Deterministic via hash.
    const countryIds = Object.keys(world.legislatures).sort();
    for (const countryId of countryIds) {
      if (hashUnit(`${world.meta.seed}:${countryId}:${world.meta.turn}:sponsorGate`) >= 0.15) continue;
      // Only playable countries have sponsorship (mirrors mainline country access gate)
      const playable = Object.values(world.countries).some((c) => c.id === countryId && c.playable);
      if (!playable) continue;

      const active = countActiveNppBills(world, countryId);
      if (active >= ACTIVE_CAP) continue;

      const majorityParty = majorityPartyForCountry(world, countryId);
      if (!majorityParty) continue;

      // Recent per-type cooldown: filter out types sponsored within COOLDOWN_TURNS
      const availableLegTypes = AVAILABLE_CATALOG.filter((e) => e.countryId === countryId);
      const eligible = availableLegTypes.filter((e) => {
        const last = lastSponsoredTurnOfType(world, countryId, e.id);
        if (last === null) return true;
        return world.meta.turn - last >= COOLDOWN_TURNS;
      });
      if (eligible.length === 0) continue;

      // Sponsor selection
      const sponsor = pickSponsor(world, countryId, majorityParty);
      if (!sponsor) continue;

      // Per-sponsor cooldown: at least 8 turns between sponsorships per politician
      const lastTurn = world.nppSponsorLastTurn[sponsor.id];
      if (lastTurn !== undefined && world.meta.turn - lastTurn < 8) continue;

      // Pick a bill type deterministically via hash (does not consume main RNG)
      // Index derived from world seed + countryId + turn + sponsor id for variety
      const h = hashUnit(`${world.meta.seed}:${countryId}:${world.meta.turn}:${sponsor.id}`);
      const chosen = eligible[Math.min(Math.floor(h * eligible.length), eligible.length - 1)]!;
      const catalogEntry = getLaw(chosen.id);
      if (!catalogEntry || catalogEntry.status !== "available") continue;

      // Check sponsor has enough AP/funds indirectly: sponsorship costs 4 AP.
      // Mainline bills are auto-proposed with nppSponsored flag; they cost no
      // direct funds but represent legislative agenda. We deduct 4 AP if possible;
      // if not, skip this sponsor.
      if ((sponsor.actions ?? 0) < 4) continue;
      sponsor.actions -= 4;

      const leg = world.legislatures[countryId];
      const originChamber = sponsor.chamberKey || leg?.chambers.find((c) => c.elected)?.key || "house";

      const id = `bill-${world.meta.turn}-${world.bills.length + 1}-${chosen.id}`;
      const bill: Bill = {
        id,
        title: chosen.title,
        summary: chosen.description,
        countryId,
        category: chosen.category,
        legislationTypeId: chosen.id,
        effectDirection: 1,
        provisions: [
          {
            type: "policy" as const,
            legislationTypeId: chosen.id,
            effectDirection: 1,
            economic: 0,
            social: 0,
          },
        ],
        originChamber,
        currentChamber: originChamber,
        status: "proposed",
        sponsorId: sponsor.id,
        sponsorName: sponsor.name,
        sponsorPartyId: sponsor.partyId,
        votes: {},
        votesFor: 0,
        votesAgainst: 0,
        votesAbstain: 0,
        proposedAtTurn: world.meta.turn,
        filibusterInvocations: [],
        updatedAtTurn: world.meta.turn,
        committeeId: null,
        nppSponsored: true,
        votingEndsOnTurn: world.meta.turn + VOTING_DURATION_TURNS,
      };
      world.bills.push(bill);
      world.nppSponsorLastTurn[sponsor.id] = world.meta.turn;

      // Only one bill per country per turn; opposition rival bills (V1.7) are PORT-STUB
      // (blocked system: nppAutonomy/oppositionBehavior — not ported for solo: single-party sponsorship only).
    }
  },
};
