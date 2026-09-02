/**
 * Politician generation — deterministic NPC office-holders for legislatures.
 *
 * Sources (READ-ONLY mainline at /root/projects/AHDGame):
 * - Ideology jitter: src/lib/npp/generator.ts `generatePolicyPositions` (lines 419-465).
 *   At quality 0, varianceFactor = Math.max(0.5, 2 - (0+20)/25) = 1.2, and
 *   economic = clamp(base + randomInRange(-varianceFactor, varianceFactor), -5, 5)
 *   social   = clamp(base + randomInRange(-varianceFactor, varianceFactor), -5, 5)
 *   rounded to 1 decimal. We port that at fixed quality 0 for founding seats.
 * - Bounds and clamp: same file `clamp(value, -5, 5)` and `randomInRange(min,max)`.
 * - Age: mainline NPP has no age field (src/lib/db/types/npp.ts, generator.ts —
 *   no age anywhere). We add age locally as uniform int 30..72 via WorldRng.
 * - Names: packages/engine/src/npp/nameGenerator.ts (already ported), via WorldRng.
 *
 * Skipped attributes with no consumer yet (present in mainline NPP but not needed
 * to seat a chamber; listed for later waves): personality (loyalty/ambition/
 * stubbornness), ethnicity + portrait/avatarUrl, favorability, politicalInfluence,
 * funds/currencyBalances/lineOfCredit, archetypeApprovals, influenceState,
 * electionCooldowns, borderKey/tintColor, factionId, isTechnocrat/technocratRole,
 * sequentialId/nextSequentialId bookkeeping, homeState/statePartyOrg quality,
 * domainPositions per legislation type, and campaign/economic defaults.
 *
 * Population scope (this wave): for each playable country, every elected chamber
 * (chamber.elected === true) that has allocated seats (seatsByParty entry >0)
 * gets that many Politicians. Vacancies stay vacant. Appointed chambers
 * (elected === false) and subnational elected chambers (e.g. US stateSenate,
 * UK regionalCouncil, RU republicSupremeSoviet, DD landAssembly) stay empty
 * this wave — the former are not legislatively elected, the latter are province/
 * republic level and will be populated in a later wave. All randomness flows
 * through the world-creation rng passed into `createPoliticiansForWorld`.
 */

import type { WorldRng } from "./rng.js";
import type { Politician, PoliticianIdeology } from "./types.js";
import { generateNpcNameAndGender } from "./npp/nameGenerator.js";

// ---- ideology helpers (ported) ----

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function randomInRange(rng: WorldRng, min: number, max: number): number {
  return rng.next() * (max - min) + min;
}

/**
 * Jitter around the party position.
 * Port of mainline generatePolicyPositions jitter at quality 0:
 *   varianceFactor = Math.max(0.5, 2 - (quality+20)/25) -> 1.2
 *   economic/social = clamp(base + uniform(-varianceFactor, +varianceFactor), -5, 5)
 *   rounded to 1 decimal.
 */
export function jitterIdeology(
  rng: WorldRng,
  baseEconomic: number,
  baseSocial: number,
): PoliticianIdeology {
  const varianceFactor = 1.2; // quality 0 case
  const economic = clamp(baseEconomic + randomInRange(rng, -varianceFactor, varianceFactor), -5, 5);
  const social = clamp(baseSocial + randomInRange(rng, -varianceFactor, varianceFactor), -5, 5);
  // Normalize -0 to 0 so JSON round-trip (which stringifies -0 as 0) preserves deep equality
  return {
    economic: Math.round(economic * 10) / 10 || 0,
    social: Math.round(social * 10) / 10 || 0,
  };
}

// ---- age ----

/**
 * Age distribution for newly seated politicians.
 * Mainline has no NPP age (see generator.ts / db/types/npp.ts — no age field).
 * We use a uniform integer in [30, 72] — plausible parliamentary age band,
 * deterministic via WorldRng.int.
 */
export function randomAge(rng: WorldRng): number {
  return rng.int(30, 72);
}

// ---- single politician ----

function hashUnit(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}
function personalityForId(id: string): Politician["personality"] {
  // Deterministic via hash of id, not RNG, so world creation RNG state is
  // unchanged (preserves goldens for commodity etc). Matches save migration.
  const loyalty = Math.round(hashUnit(`${id}:loyalty`) * 100);
  const ambition = Math.round(hashUnit(`${id}:ambition`) * 100);
  const stubbornness = Math.round(hashUnit(`${id}:stubbornness`) * 100);
  return { loyalty, ambition, stubbornness };
}

export function generatePolitician(
  rng: WorldRng,
  opts: {
    id: string;
    countryId: string;
    partyId: string;
    chamberKey: string;
    era: string | null;
    partyEconomic: number;
    partySocial: number;
  },
): Politician {
  const { name, gender } = generateNpcNameAndGender(rng, opts.countryId, opts.era);
  const ideology = jitterIdeology(rng, opts.partyEconomic, opts.partySocial);
  const age = randomAge(rng);
  const personality = personalityForId(opts.id);
  return {
    id: opts.id,
    name,
    gender,
    countryId: opts.countryId,
    partyId: opts.partyId,
    chamberKey: opts.chamberKey,
    ideology,
    age,
    partyInfluence: 0,
    bonusActions: 0,
    actions: 25,
    funds: 0,
    donorBaseLevel: 0,
    politicalInfluence: 0,
    favorability: 50,
    infamy: 0,
    actionCooldowns: {},
    personality,
    cash: 0,
  };
}

// ---- world population ----

export interface PoliticianGenerationContext {
  legislatures: Record<string, { countryId: string; chambers: Array<{ key: string; elected: boolean; composition: { seatsByParty: Record<string, number> } }> }>;
  parties: Record<string, { id: string; countryId: string; economicPosition: number; socialPosition: number }>;
  /** Playable country ids for this world/era (from pack). */
  playableCountryIds: Set<string>;
  /** Era id for name gating (US pool Era gating). */
  era: string;
}

/**
 * Populate politicians for every allocated seat in elected chambers of playable
 * countries. Deterministic: iterates countries and chambers in sorted order,
 * parties in sorted order, and draws from `rng` sequentially. Vacancies are
 * ignored. Appointed chambers (elected === false) produce no politicians.
 *
 * Note: subnational elected chambers (US stateSenate, UK regionalCouncil,
 * RU republicSupremeSoviet, DD landAssembly) have no allocated seats in any
 * shipped pack (1953 carries them as all-vacant; the 1979/1991/2019 packs
 * don't model that third chamber at all — see their provenance headers), so
 * they naturally stay empty; appointed uppers (UK lords, DD staatsrat) are
 * skipped by the elected check regardless.
 */
export function createPoliticiansForWorld(
  rng: WorldRng,
  ctx: PoliticianGenerationContext,
): Politician[] {
  const out: Politician[] = [];
  const perCountryCounter = new Map<string, number>();

  // Sorted country keys for determinism
  const countryIds = [...ctx.playableCountryIds].sort();
  for (const countryId of countryIds) {
    const leg = ctx.legislatures[countryId];
    if (!leg) continue;
    // Chambers in definition order is deterministic already, but sort by key
    // to avoid pack-order dependence if packs ever reorder chambers.
    const chambers = [...leg.chambers].sort((a, b) => a.key.localeCompare(b.key));
    for (const chamber of chambers) {
      if (!chamber.elected) continue;
      const entries = Object.entries(chamber.composition.seatsByParty).sort(([a], [b]) => a.localeCompare(b));
      for (const [partyId, count] of entries) {
        const party = ctx.parties[partyId];
        // Defensive: skip unknown party ids (should not happen; seat-sum invariant ensures it)
        if (!party) continue;
        for (let i = 0; i < count; i++) {
          const seq = (perCountryCounter.get(countryId) ?? 0) + 1;
          perCountryCounter.set(countryId, seq);
          const id = `${countryId}-${seq}`;
          out.push(
            generatePolitician(rng, {
              id,
              countryId,
              partyId,
              chamberKey: chamber.key,
              era: ctx.era,
              partyEconomic: party.economicPosition,
              partySocial: party.socialPosition,
            }),
          );
        }
      }
    }
  }
  return out;
}
