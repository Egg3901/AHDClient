import type { WorldState } from "../types.js";

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
