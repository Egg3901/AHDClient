import type { WorldState } from "../types.js";
import { LOWER_CHAMBER_PER_REGION, SUBNATIONAL_CHAMBER_PER_REGION, JP_SANGIIN_SEATS } from "../government/constants.js";

/**
 * Deterministically assign US seat geography (state + senate class) to seated
 * politicians. Mainline tracks seats per state natively; solo's v4 politician
 * generation predates the states layer, so geography is assigned by sorted
 * fill: states in id order each take their apportioned number of house members
 * (politician id order), then two senators with the state's class pair.
 * Idempotent: politicians that already carry a state are left alone.
 */
export function assignUsSeatGeography(world: WorldState): void {
  const states = Object.values(world.regions ?? {})
    .filter((r) => r.countryId === "US" && typeof r.houseSeats === "number")
    .sort((a, b) => a.id.localeCompare(b.id));
  if (states.length === 0) return;

  const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

  const house = world.politicians
    .filter((p) => p.countryId === "US" && p.chamberKey === "house" && p.electedState === undefined)
    .sort(byId);
  let hi = 0;
  for (const st of states) {
    for (let k = 0; k < (st.houseSeats ?? 0) && hi < house.length; k++) {
      const pol = house[hi++];
      if (pol) pol.electedState = st.id;
    }
  }

  const senate = world.politicians
    .filter((p) => p.countryId === "US" && p.chamberKey === "senate" && p.electedState === undefined)
    .sort(byId);
  let si = 0;
  for (const st of states) {
    const classes = st.senateClasses ?? [1, 2];
    for (let k = 0; k < 2 && si < senate.length; k++) {
      const pol = senate[si++];
      if (pol) {
        pol.electedState = st.id;
        pol.senateClass = classes[k] as 1 | 2 | 3;
      }
    }
  }
}

/**
 * Generalisation of assignUsSeatGeography for every chamber contested per
 * region (W61): seeded holders from a historicalSeats table carry no region,
 * so the per-region race for that region could never unseat them and each
 * cycle stacked a full new slate on top (BR chamber reached 924 of 503).
 * Sorted fill, regions in id order, each taking its seat share; idempotent.
 * JP Sangiin additionally takes a class (1 = ceil, 2 = floor of the region's
 * JP_SANGIIN_SEATS), riding the senateClass slot like US Senate classes.
 */
export function assignRegionalSeatGeography(world: WorldState): void {
  const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  const regionsOf = (cid: string) => Object.values(world.regions ?? {}).filter((r) => r.countryId === cid).sort(byId);
  const fill = (cid: string, chamberKey: string, seatsOf: (r: { id: string; houseSeats?: number; senateSeats?: number }) => number, classes?: (r: { id: string }, k: number) => 1 | 2 | 3 | undefined) => {
    const regions = regionsOf(cid);
    if (regions.length === 0) return;
    const pool = world.politicians.filter((p) => p.countryId === cid && p.chamberKey === chamberKey && p.electedState === undefined).sort(byId);
    let idx = 0;
    for (const r of regions) {
      const n = seatsOf(r as { id: string; houseSeats?: number; senateSeats?: number });
      for (let k = 0; k < n && idx < pool.length; k++) {
        const pol = pool[idx++];
        if (!pol) continue;
        pol.electedState = r.id;
        const cls = classes?.(r, k);
        if (cls !== undefined) pol.senateClass = cls;
      }
    }
  };
  for (const [cid, spec] of Object.entries(LOWER_CHAMBER_PER_REGION)) fill(cid, spec.chamberKey, (r) => r.houseSeats ?? 0);
  for (const [cid, spec] of Object.entries(SUBNATIONAL_CHAMBER_PER_REGION)) fill(cid, spec.chamberKey, (r) => r.senateSeats ?? 0);
  // BR Senado: per-region seats = region.senateSeats (mainline ensureBRSenateElections).
  fill("BR", "senate", (r) => r.senateSeats ?? 0);
  // JP Sangiin: per-region seats from JP_SANGIIN_SEATS, first ceil(n/2) in class 1, rest class 2.
  fill("JP", "sangiin", (r) => JP_SANGIIN_SEATS[r.id] ?? 0, (r, k) => (k < Math.ceil((JP_SANGIIN_SEATS[r.id] ?? 0) / 2) ? 1 : 2));
}
