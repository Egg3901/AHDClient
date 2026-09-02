/**
 * Deterministic per-region extraction capacity seeding — W11.
 *
 * Ports src/lib/seeds/reference/stateResourceCapacity.ts STATE_RESOURCE_CAPACITY
 * (US/UK/RU/DD entries — solo's region ids are the same real state/region
 * codes as mainline for every playable country as of W39, so all entries
 * port verbatim by regionId) and RESOURCE_CAPACITY_HEADROOM (applied
 * identically: iron x7, oil/natural_gas/rare_earth/timber x3, coal x2 — see
 * mainline file doc for the extraction-capacity-remediation rationale).
 *
 * Coverage vs mainline (cited, not invented):
 *  - UK: solo's 12 electoral regions (LON/SEE/SWE/EAE/EMI/WMI/YHU/NWE/NEE/
 *    SCO/WAL/NIR) match mainline's 12 UK:* keys exactly.
 *  - RU: solo's 14 regions (CEN/NWR/NOR/CBE/VOL/NCA/URA/WSB/ESB/FEA/KAZ/TRA/
 *    CAS/MOL) are the first 14 of mainline's 16 RU:* keys; mainline's
 *    RU:BEL/RU:BLT (Belorussia/Baltics) have no solo region and are dropped.
 *  - DD: solo's 6 Länder (BEO/MV/BB/ST/SN/TH) vs mainline's 5 DD:* keys (no
 *    DD:BEO entry in mainline — East Berlin gets resources: {}, same
 *    "no authored entry" pattern the US table already uses for states not
 *    listed).
 *
 * This REPLACES an earlier even-split-across-3-opaque-regions approach that
 * predated this wave's own branch point: real UK/RU/DD subdivisions (W39)
 * already landed on this branch before W11 started — see world.ts region
 * seeding "W39: UK 12, RU 14, DD 6" comment. The 1960 era still has no
 * `states` table for any country (see content/packs/1960.ts) and falls back
 * to 3 opaque `${countryId}-R1..R3` regions per country including US; that
 * fallback path (aggregate national total split evenly) is retained below
 * for that case only.
 *
 * Era gate: mainline's getStateResourceCapacity zeroes UK:SCO and RU:WSB
 * oil/natural_gas for the "1953-default" preset (North Sea oil: first
 * production 1969; West Siberian/Tyumen oil+gas: discovered 1960; neither
 * exists yet in a 1953 world). Solo's "1953" and "1960" eras share the same
 * pre-discovery nominal regime (see commodity/constants.ts
 * getEraNominalScale), so both apply the same strip; any other/future era
 * gets the unstripped (modern) totals, matching mainline's own preset gate
 * (which only ever checked "1953-default", never a "1960-default").
 */
import type { ExtractableResource } from "../commodity/constants.js";
import type { StateResourceCapacity } from "./types.js";

// Source: src/lib/seeds/reference/stateResourceCapacity.ts RESOURCE_CAPACITY_HEADROOM.
const RESOURCE_CAPACITY_HEADROOM: Record<ExtractableResource, number> = {
  iron: 7,
  oil: 3,
  natural_gas: 3,
  coal: 2,
  rare_earth: 3,
  timber: 3,
};

function scale(resources: Partial<Record<ExtractableResource, number>>): Partial<Record<ExtractableResource, number>> {
  const out: Partial<Record<ExtractableResource, number>> = {};
  for (const [resource, value] of Object.entries(resources) as [ExtractableResource, number][]) {
    out[resource] = Math.round(value * (RESOURCE_CAPACITY_HEADROOM[resource] ?? 1));
  }
  return out;
}

// Source: STATE_RESOURCE_CAPACITY US:* entries, verbatim (pre-headroom values).
const US_STATE_RESOURCES: Record<string, Partial<Record<ExtractableResource, number>>> = {
  TX: { oil: 450000, natural_gas: 2250000, coal: 15000 },
  AK: { oil: 225000, natural_gas: 600000, coal: 3000, rare_earth: 3000 },
  ND: { oil: 180000, natural_gas: 300000, coal: 37500 },
  NM: { oil: 150000, natural_gas: 300000, rare_earth: 4500 },
  WY: { oil: 90000, natural_gas: 600000, coal: 450000, timber: 45000, rare_earth: 3000 },
  OK: { oil: 120000, natural_gas: 525000 },
  CO: { oil: 75000, natural_gas: 450000, coal: 52500 },
  CA: { oil: 60000, natural_gas: 120000, timber: 75000, rare_earth: 9000 },
  LA: { oil: 52500, natural_gas: 375000 },
  UT: { oil: 37500, rare_earth: 6000 },
  KS: { oil: 22500, natural_gas: 90000 },
  MT: { oil: 30000, coal: 105000, rare_earth: 2250, timber: 105000 },
  PA: { natural_gas: 1200000, coal: 120000 },
  WV: { natural_gas: 750000, coal: 225000 },
  OH: { natural_gas: 225000, coal: 30000 },
  KY: { coal: 150000 },
  VA: { coal: 60000, timber: 30000 },
  IL: { coal: 90000 },
  IN: { coal: 45000 },
  MN: { iron: 675000, timber: 37500 },
  MI: { iron: 135000, rare_earth: 1200, timber: 30000 },
  AZ: { rare_earth: 14857 },
  NV: { rare_earth: 7286, timber: 15000 },
  ID: { rare_earth: 1200, timber: 90000 },
  OR: { timber: 150000 },
  WA: { timber: 120000 },
  ME: { timber: 60000 },
  GA: { timber: 67500 },
  WI: { timber: 37500, iron: 18000 },
  NY: { timber: 45000, natural_gas: 22500 },
  MA: { timber: 7500, natural_gas: 15000 },
  CT: { timber: 3000 },
  VT: { timber: 37500 },
  NH: { timber: 30000 },
  NJ: { natural_gas: 7500 },
  DE: { natural_gas: 7500 },
  MD: { coal: 4500, timber: 12000 },
  RI: { timber: 750 },
  AL: { coal: 60000, timber: 75000 },
  TN: { coal: 30000, timber: 52500 },
  NC: { timber: 67500 },
  SC: { timber: 45000 },
  FL: { oil: 7500, timber: 45000 },
  MS: { natural_gas: 120000, oil: 30000, timber: 37500 },
  AR: { natural_gas: 225000, oil: 22500, timber: 60000 },
  MO: { coal: 22500, timber: 30000, iron: 9000 },
  IA: { coal: 7500, natural_gas: 7500 },
  NE: { oil: 15000, natural_gas: 60000 },
  SD: { rare_earth: 750, timber: 12000 },
  HI: { timber: 7500 },
};

// Source: STATE_RESOURCE_CAPACITY UK:* entries, verbatim (pre-headroom values).
// SCO carries oil/natural_gas — stripped pre-1960 (North Sea, first production 1969).
const UK_REGION_RESOURCES: Record<string, Partial<Record<ExtractableResource, number>>> = {
  SCO: { oil: 120000, natural_gas: 300000, timber: 22500 },
  NEE: { coal: 30000, iron: 9000 },
  YHU: { coal: 22500, iron: 14400 },
  WAL: { coal: 15000, timber: 22500 },
  NWE: { coal: 7500, timber: 12000 },
  EMI: { coal: 12000, iron: 13500 },
  WMI: { coal: 7500, iron: 8100 },
  EAE: { natural_gas: 15000, timber: 7500 },
  SWE: { rare_earth: 538, timber: 12000 },
  SEE: { timber: 7500 },
  NIR: { coal: 3000, timber: 6000 },
  LON: { timber: 750 },
};

// Source: STATE_RESOURCE_CAPACITY RU:* entries, verbatim (pre-headroom values).
// Limited to the 14 keys with a solo region (RU:BEL/RU:BLT have none — see file doc).
// WSB carries oil/natural_gas — stripped pre-1960 (West Siberian/Tyumen, discovered 1960).
const RU_REGION_RESOURCES: Record<string, Partial<Record<ExtractableResource, number>>> = {
  CEN: { coal: 30000 },
  NWR: { timber: 45000, iron: 9000 },
  NOR: { timber: 225000, rare_earth: 6000, coal: 30000, oil: 15000 },
  CBE: { iron: 54000 },
  VOL: { oil: 135000, natural_gas: 45000 },
  NCA: { oil: 45000, natural_gas: 15000 },
  URA: { iron: 216000, oil: 45000, coal: 45000, timber: 60000, rare_earth: 1500 },
  WSB: { coal: 150000, oil: 120000, natural_gas: 150000, timber: 90000 },
  ESB: { timber: 300000, coal: 30000, rare_earth: 2400 },
  FEA: { timber: 90000, coal: 22500, oil: 15000 },
  KAZ: { coal: 90000, oil: 30000, iron: 27000, rare_earth: 1200 },
  TRA: { oil: 150000, natural_gas: 15000 },
  CAS: { natural_gas: 45000, oil: 15000, coal: 15000 },
  MOL: { timber: 3000 },
};

// Source: STATE_RESOURCE_CAPACITY DD:* entries, verbatim (pre-headroom values).
// DD:BEO has no mainline entry (East Berlin) — falls through to resources: {}.
const DD_REGION_RESOURCES: Record<string, Partial<Record<ExtractableResource, number>>> = {
  SN: { coal: 55000, timber: 8000, rare_earth: 300 },
  ST: { coal: 50000, timber: 4000 },
  BB: { coal: 60000, timber: 5000 },
  TH: { timber: 10000 },
  MV: { timber: 3000 },
};

// US national total (sum of all 50 US_STATE_RESOURCES entries above), used
// only when world.ts falls back to 3 opaque regions per country (1960 era —
// see world.ts seedRegions "carries no states table" comment; the per-region
// tables above only apply when real region ids are the region keys).
const US_TOTAL: Partial<Record<ExtractableResource, number>> = {
  oil: 1567500,
  natural_gas: 8250000,
  coal: 1507500,
  rare_earth: 53043,
  timber: 1430250,
  iron: 837000,
};

// National totals summed from the per-region tables above (see file doc).
// "Stripped" excludes SCO's/WSB's oil/natural_gas (pre-1960 discovery);
// "full" is the unstripped modern total. Used only for the opaque-region
// fallback (1960 era, no states table for any country).
const UK_TOTAL_STRIPPED: Partial<Record<ExtractableResource, number>> = {
  timber: 90750,
  coal: 97500,
  iron: 45000,
  natural_gas: 15000,
  rare_earth: 538,
};
const UK_TOTAL_FULL: Partial<Record<ExtractableResource, number>> = {
  oil: 120000,
  natural_gas: 315000,
  timber: 90750,
  coal: 97500,
  iron: 45000,
  rare_earth: 538,
};
const RU_TOTAL_STRIPPED: Partial<Record<ExtractableResource, number>> = {
  coal: 435000,
  timber: 873000,
  iron: 306000,
  rare_earth: 11100,
  oil: 450000,
  natural_gas: 120000,
};
const RU_TOTAL_FULL: Partial<Record<ExtractableResource, number>> = {
  coal: 435000,
  timber: 873000,
  iron: 306000,
  rare_earth: 11100,
  oil: 570000,
  natural_gas: 270000,
};
// DD has no oil/natural_gas entries at all in the source table, so stripped == full.
const DD_TOTAL: Partial<Record<ExtractableResource, number>> = {
  coal: 165000,
  timber: 30000,
  rare_earth: 300,
};

/** Strip a resource's oil/natural_gas keys from one region entry (pre-1960 discovery gate). */
function stripOilGas(resources: Partial<Record<ExtractableResource, number>>): Partial<Record<ExtractableResource, number>> {
  const { oil: _oil, natural_gas: _ng, ...rest } = resources;
  return rest;
}

function splitEvenly(
  total: Partial<Record<ExtractableResource, number>>,
  regionIds: readonly string[],
): Partial<Record<ExtractableResource, number>>[] {
  const scaled = scale(total);
  return regionIds.map((_, i) => {
    const share: Partial<Record<ExtractableResource, number>> = {};
    for (const [resource, value] of Object.entries(scaled) as [ExtractableResource, number][]) {
      // Remainder goes to the first region so the sum across regions equals
      // the scaled total exactly (no capacity lost to rounding).
      const base = Math.floor(value / regionIds.length);
      const remainder = value - base * regionIds.length;
      share[resource] = base + (i < remainder ? 1 : 0);
    }
    return share;
  });
}

const PRE_1960_DISCOVERY_ERAS = new Set(["1953", "1960"]);

/** Seed one country's real per-region table, applying headroom and the pre-1960 strip. */
function seedRealRegionTable(
  countryId: string,
  regionIds: readonly string[],
  table: Record<string, Partial<Record<ExtractableResource, number>>>,
  strippedRegionId: string | null,
  pre1960: boolean,
  capacities: Record<string, StateResourceCapacity>,
): void {
  for (const regionId of regionIds) {
    let resources = table[regionId];
    if (resources && pre1960 && regionId === strippedRegionId) {
      resources = stripOilGas(resources);
    }
    capacities[regionId] = {
      regionId,
      countryId,
      resources: resources ? scale(resources) : {},
      updatedAtTurn: 0,
    };
  }
}

/**
 * Seed StateResourceCapacity for every playable country's regions.
 * Deterministic, no rng. `regionIdsByCountry` must match world.ts's own
 * region-id assignment (real state/region ids where a states table exists;
 * `${countryId}-R1..R3` opaque regions where it does not — currently only
 * the 1960 era) so capacity keys line up with `world.regions`.
 */
export function seedStateResourceCapacities(
  regionIdsByCountry: ReadonlyMap<string, readonly string[]>,
  era: string,
): Record<string, StateResourceCapacity> {
  const capacities: Record<string, StateResourceCapacity> = {};
  const pre1960 = PRE_1960_DISCOVERY_ERAS.has(era);

  // Real-region path: used whenever world.ts seeded real state/region ids
  // for that country (every playable country as of W39, for any era with a
  // `states` table). Detected the same way as W38's own US-only check
  // originally did: at least one seeded region id is a known key in that
  // country's real-region table.
  const REAL_TABLES: Array<[string, Record<string, Partial<Record<ExtractableResource, number>>>, string | null]> = [
    ["US", US_STATE_RESOURCES, null],
    ["UK", UK_REGION_RESOURCES, "SCO"],
    ["RU", RU_REGION_RESOURCES, "WSB"],
    ["DD", DD_REGION_RESOURCES, null],
  ];
  const handledAsReal = new Set<string>();
  for (const [countryId, table, strippedRegionId] of REAL_TABLES) {
    const regionIds = regionIdsByCountry.get(countryId) ?? [];
    const hasRealIds = regionIds.some((rid) => rid in table);
    if (!hasRealIds) continue;
    seedRealRegionTable(countryId, regionIds, table, strippedRegionId, pre1960, capacities);
    handledAsReal.add(countryId);
  }

  // Opaque-region fallback: any playable country not handled above (1960 era
  // — no states table for any country, so every country falls back here).
  const aggregated: Array<[string, Partial<Record<ExtractableResource, number>>]> = [
    ["US", US_TOTAL],
    ["UK", pre1960 ? UK_TOTAL_STRIPPED : UK_TOTAL_FULL],
    ["RU", pre1960 ? RU_TOTAL_STRIPPED : RU_TOTAL_FULL],
    ["DD", DD_TOTAL],
  ];
  for (const [countryId, total] of aggregated) {
    if (handledAsReal.has(countryId)) continue;
    const regionIds = regionIdsByCountry.get(countryId) ?? [];
    if (regionIds.length === 0) continue;
    const shares = splitEvenly(total, regionIds);
    regionIds.forEach((regionId, i) => {
      capacities[regionId] = {
        regionId,
        countryId,
        resources: shares[i] ?? {},
        updatedAtTurn: 0,
      };
    });
  }

  return capacities;
}
