// @ts-nocheck
/**
 * Shared constants for the pure resolution layer.
 *
 * Mirrors mainline `src/lib/constants/*` and `src/lib/utils/electionLabels.ts`
 * values used by the ported modules. Values are byte-identical to mainline so
 * numeric assertions remain valid.
 */

// ─── Turn time ────────────────────────────────────────────────────────────

export const STARTING_YEAR = 2019;
export const TURNS_PER_YEAR = 48;
export const MS_PER_TURN = 60 * 60 * 1000;

export const SEED_PRESET_IDS = [
  "1953-default",
  "1979-default",
  "1991-default",
  "1999-default",
  "2007-default",
  "2019-default",
  "2023-default",
] as const;

/**
 * Map a AHDClient content-pack era id ("1953"/"1979"/"1991"/"2019", the bare
 * year strings `packages/content/src/packs` ships) to the mainline preset id
 * this resolution layer keys everything on ("1953-default" etc). The two
 * naming conventions coexist in this codebase: content packs use bare years
 * (matching mainline's `EraId`), this ported election-resolution layer uses
 * mainline's `ResetPresetId` (`<year>-default`). Falls back to
 * `DEFAULT_SEED_PRESET` for anything unrecognized, including the legacy
 * fabricated "1960" era (see packages/content/src/packs/index.ts) — a
 * pre-fix save carrying that era gets the same modern election-cycle
 * anchors an unseeded/unknown era always fell back to, not a crash.
 */
export function eraToPreset(era: string): string {
  if (era === "1953") return "1953-default";
  if (era === "1979") return "1979-default";
  if (era === "1991") return "1991-default";
  if (era === "2019") return "2019-default";
  return DEFAULT_SEED_PRESET;
}

export function getStartingYearForPreset(presetId: string): number {
  if (presetId === "1953-default") return 1953;
  if (presetId === "1979-default") return 1979;
  if (presetId === "1991-default") return 1991;
  if (presetId === "1999-default") return 1999;
  if (presetId === "2007-default") return 2007;
  if (presetId === "2023-default") return 2023;
  return STARTING_YEAR;
}

// ─── House seats (2020 census) ───────────────────────────────────────────

export const HOUSE_SEATS: Record<string, number> = {
  AL: 7, AK: 1, AZ: 9, AR: 4, CA: 52, CO: 8, CT: 5, DE: 1, FL: 28, GA: 14,
  HI: 2, ID: 2, IL: 17, IN: 9, IA: 4, KS: 4, KY: 6, LA: 6, ME: 2, MD: 8,
  MA: 9, MI: 13, MN: 8, MS: 4, MO: 8, MT: 2, NE: 3, NV: 4, NH: 2, NJ: 12,
  NM: 3, NY: 26, NC: 14, ND: 1, OH: 15, OK: 5, OR: 6, PA: 17, RI: 2, SC: 7,
  SD: 1, TN: 9, TX: 38, UT: 4, VT: 1, VA: 11, WA: 10, WV: 2, WI: 8, WY: 1,
};

export const HOUSE_SEATS_1953: Record<string, number> = {
  AL: 9, AZ: 2, AR: 6, CA: 30, CO: 4, CT: 6, DE: 1, FL: 8, GA: 10, ID: 2,
  IL: 25, IN: 11, IA: 8, KS: 6, KY: 8, LA: 8, ME: 3, MD: 7, MA: 14, MI: 18,
  MN: 9, MS: 6, MO: 11, MT: 2, NE: 4, NV: 1, NH: 2, NJ: 14, NM: 2, NY: 43,
  NC: 12, ND: 2, OH: 23, OK: 6, OR: 4, PA: 30, RI: 2, SC: 6, SD: 2, TN: 9,
  TX: 22, UT: 2, VT: 1, VA: 10, WA: 7, WV: 6, WI: 10, WY: 1,
};

// ─── UK / other ──────────────────────────────────────────────────────────

export const UK_COMMONS_SEATS: Record<string, number> = {
  LON: 75, SEE: 90, SWE: 58, EAE: 60, EMI: 47, WMI: 57, YHU: 54, NWE: 75, NEE: 27, SCO: 57, WAL: 32, NIR: 18,
};

export const UK_REGIONAL_COUNCIL_SEATS: Record<string, number> = {
  LON: 32, SEE: 67, SWE: 39, EAE: 39, EMI: 39, WMI: 18, YHU: 21, NWE: 27, NEE: 17, SCO: 129, WAL: 60, NIR: 90,
};

// ─── Era / modern ────────────────────────────────────────────────────────

export const MODERN_ERA_START_YEAR = 1999;

// ─── Election durations ───────────────────────────────────────────────────

export const DEFAULT_DURATIONS: Record<string, { durationHours: number; primaryDurationHours: number; generalDurationHours: number }> = {
  house: { durationHours: 96, primaryDurationHours: 48, generalDurationHours: 48 },
  senate: { durationHours: 288, primaryDurationHours: 240, generalDurationHours: 48 },
  governor: { durationHours: 192, primaryDurationHours: 144, generalDurationHours: 48 },
  stateSenate: { durationHours: 192, primaryDurationHours: 144, generalDurationHours: 48 },
  president: { durationHours: 192, primaryDurationHours: 144, generalDurationHours: 48 },
  commons: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  regionalCouncil: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  shugiin: { durationHours: 192, primaryDurationHours: 144, generalDurationHours: 48 },
  sangiin: { durationHours: 144, primaryDurationHours: 72, generalDurationHours: 72 },
  bundestag: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  landtag: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  ministerPresident: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  snap_shugiin: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  snap_commons: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  snap_bundestag: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  snap_lowerChamber: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  // W61: IE Uachtarán nationwide race. Source: src/lib/constants/electionDurations.ts:86.
  uachtaran: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  special_governor: { durationHours: 48, primaryDurationHours: 0, generalDurationHours: 48 },
  npcDelegate: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  peoplesCongress: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  chamber: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  supremeSovietDeputy: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  nationalitiesDeputy: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  republicSupremeSoviet: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  volkskammerDeputy: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  landAssembly: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  sejm: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  chamberOfThePeople: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  nationalAssembly: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  grandNationalAssembly: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  federalAssembly: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  supremeSoviet: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  assembleeNationale: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  cameraDeputati: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  congresoDiputados: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  riksdag: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  milletMeclisi: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  nationalrat: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  eduskunta: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  vouli: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  senat: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  senato: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  senado: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  dail: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  seanad: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  localCouncil: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  holyrood: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  senedd: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
};

// ─── Multi-seat types ─────────────────────────────────────────────────────

export const MULTI_SEAT_TYPES: ReadonlySet<string> = new Set([
  "house", "stateSenate", "commons", "snap_commons", "regionalCouncil",
  "bundestag", "snap_bundestag", "shugiin", "snap_shugiin", "sangiin",
  "landtag", "npcDelegate", "peoplesCongress",
  "dail", "seanad", "localCouncil",
  "assembleeNationale", "cameraDeputati", "congresoDiputados", "riksdag", "milletMeclisi",
  "nationalrat", "eduskunta", "vouli",
  "deputy", "senator", "member", "procurador",
  "senat", "senato", "senado",
  "chamber",
  "supremeSovietDeputy", "nationalitiesDeputy", "republicSupremeSoviet",
  "volkskammerDeputy", "landAssembly",
  "sejm", "chamberOfThePeople", "nationalAssembly", "grandNationalAssembly", "federalAssembly", "supremeSoviet",
  // AHDClient-native snap variants (government/constants.ts
  // SNAP_ELECTION_TYPE_BY_CHAMBER); mainline only has snap_commons/bundestag/shugiin.
  "snap_supremeSovietDeputy",
  "snap_nationalitiesDeputy",
  "snap_volkskammerDeputy",
  // W61: JP/DE/IE/CN snap variants for the Dail and NPC (AHDClient-native names,
  // same snap_<baseType> convention); snap_shugiin/snap_bundestag are mainline.
  "snap_dail",
  "snap_npcDelegate",
]);

// ─── Bloc list ────────────────────────────────────────────────────────────

export interface BlocListQuota {
  label: string;
  shares: Readonly<Record<string, number>>;
}

export const BLOC_LIST_QUOTAS: Partial<Record<string, BlocListQuota>> = {
  DD: {
    label: "National Front",
    shares: { "1": 55, "2": 11.25, "3": 11.25, "4": 11.25, "5": 11.25 },
  },
};

export function blocListQuota(countryId: string | null | undefined): BlocListQuota | null {
  if (!countryId) return null;
  return BLOC_LIST_QUOTAS[countryId] ?? null;
}

export function blocListQuotaForGovernment(
  countryId: string,
  governmentType: string | null | undefined,
): BlocListQuota | null {
  if (countryId === "DD" && governmentType === "onePartyState") return BLOC_LIST_QUOTAS.DD ?? null;
  return null;
}

// ─── Country sets ─────────────────────────────────────────────────────────

export const COUNTRIES_WITH_CONCURRENT_GENERAL_ELECTIONS = new Set<string>(["NG"]);

// ─── Default seed preset ──────────────────────────────────────────────────

export const DEFAULT_SEED_PRESET = "2019-default";

// ─── Electoral votes (for golden tests) ───────────────────────────────────

export function getHouseSeats(preset?: string): Record<string, number> {
  if (preset === "1953-default") return { ...HOUSE_SEATS_1953 };
  if (preset === "1991-default") return { ...HOUSE_SEATS_1991 };
  return { ...HOUSE_SEATS };
}

// Minimal helpers for apportionment era gates
export function electoralVotesSeedForPreset(preset?: string): Record<string, number> {
  const seats = getHouseSeats(preset);
  const ev: Record<string, number> = {};
  for (const [k, v] of Object.entries(seats)) ev[k] = v + 2;
  // DC 3 EV only from 1961; simplified here as always present for modern presets
  const year = getStartingYearForPreset(preset ?? DEFAULT_SEED_PRESET);
  if (year >= 1961) ev["DC"] = 3;
  return ev;
}

// ─── Era seat maps (1953, 1991) ────────────────────────────────────────────

export const HOUSE_SEATS_1991: Record<string, number> = {
  AL: 7, AK: 1, AZ: 6, AR: 4, CA: 52, CO: 6, CT: 6, DE: 1, FL: 23, GA: 11,
  HI: 2, ID: 2, IL: 20, IN: 10, IA: 5, KS: 4, KY: 6, LA: 7, ME: 2, MD: 8,
  MA: 10, MI: 16, MN: 8, MS: 5, MO: 9, MT: 1, NE: 3, NV: 2, NH: 2, NJ: 13,
  NM: 3, NY: 31, NC: 12, ND: 1, OH: 19, OK: 6, OR: 5, PA: 21, RI: 2, SC: 6,
  SD: 1, TN: 9, TX: 30, UT: 3, VT: 1, VA: 11, WA: 9, WV: 3, WI: 9, WY: 1,
};

export const UK_COMMONS_SEATS_1953: Record<string, number> = {
  LON: 91, SEE: 81, SWE: 43, EAE: 47, EMI: 37, WMI: 53, YHU: 52, NWE: 75, NEE: 27, SCO: 71, WAL: 36, NIR: 12,
};

export const TOTAL_UK_COMMONS_SEATS_1953 = 625;
export const TOTAL_UK_COMMONS_SEATS = 650;

export const ELECTORAL_VOTES: Record<string, number> = Object.fromEntries(Object.entries(HOUSE_SEATS).map(([k,v])=>[k, v+2]).concat([["DC",3]]));
export const ELECTORAL_VOTES_1991: Record<string, number> = { AL:9, AK:3, AZ:8, AR:6, CA:54, CO:8, CT:8, DE:3, FL:25, GA:13, HI:4, ID:4, IL:22, IN:12, IA:7, KS:6, KY:8, LA:9, ME:4, MD:10, MA:12, MI:18, MN:10, MS:7, MO:11, MT:3, NE:5, NV:4, NH:4, NJ:15, NM:5, NY:33, NC:14, ND:3, OH:21, OK:8, OR:7, PA:23, RI:4, SC:8, SD:3, TN:11, TX:32, UT:5, VT:3, VA:13, WA:11, WV:5, WI:11, WY:3, DC:3 };
export const ELECTORAL_VOTES_1953: Record<string, number> = Object.fromEntries(Object.entries(HOUSE_SEATS_1953).map(([k,v])=>[k, v+2]));

export function getUkCommonsSeats(preset?: string): Record<string, number> {
  return preset === "1953-default" ? UK_COMMONS_SEATS_1953 : UK_COMMONS_SEATS;
}
export function getTotalUkCommonsSeats(preset?: string): number {
  return preset === "1953-default" ? TOTAL_UK_COMMONS_SEATS_1953 : TOTAL_UK_COMMONS_SEATS;
}
export function getElectoralVotes(preset?: string): Record<string, number> {
  if (preset === "1953-default") return ELECTORAL_VOTES_1953;
  return preset === "1991-default" ? ELECTORAL_VOTES_1991 : ELECTORAL_VOTES;
}

// Overwrite getHouseSeats to support all presets
const _origGetHouseSeats = getHouseSeats;
export function getHouseSeatsFull(preset?: string): Record<string, number> {
  if (preset === "1953-default") return { ...HOUSE_SEATS_1953 };
  if (preset === "1991-default") return { ...HOUSE_SEATS_1991 };
  return { ...HOUSE_SEATS };
}

// ─── Electoral vote units ─────────────────────────────────────────────────

export const ELECTORAL_VOTE_UNITS: { unitId: string; ev: number; stateId: string }[] = (() => {
  const units: { unitId: string; ev: number; stateId: string }[] = [];
  for (const [stateId, ev] of Object.entries(ELECTORAL_VOTES)) {
    if (stateId === "ME") {
      units.push({ unitId: "ME", ev: 2, stateId: "ME" });
      units.push({ unitId: "ME_CD1", ev: 1, stateId: "ME" });
      units.push({ unitId: "ME_CD2", ev: 1, stateId: "ME" });
    } else if (stateId === "NE") {
      units.push({ unitId: "NE", ev: 2, stateId: "NE" });
      units.push({ unitId: "NE_CD1", ev: 1, stateId: "NE" });
      units.push({ unitId: "NE_CD2", ev: 1, stateId: "NE" });
      units.push({ unitId: "NE_CD3", ev: 1, stateId: "NE" });
    } else {
      units.push({ unitId: stateId, ev, stateId });
    }
  }
  return units;
})();

export const ELECTORAL_VOTE_UNITS_1991: { unitId: string; ev: number; stateId: string }[] = (() => {
  const units: { unitId: string; ev: number; stateId: string }[] = [];
  for (const [stateId, ev] of Object.entries(ELECTORAL_VOTES_1991)) {
    if (stateId === "ME") {
      units.push({ unitId: "ME", ev: 2, stateId: "ME" });
      units.push({ unitId: "ME_CD1", ev: 1, stateId: "ME" });
      units.push({ unitId: "ME_CD2", ev: 1, stateId: "ME" });
    } else if (stateId === "NE") {
      units.push({ unitId: "NE", ev: 2, stateId: "NE" });
      units.push({ unitId: "NE_CD1", ev: 1, stateId: "NE" });
      units.push({ unitId: "NE_CD2", ev: 1, stateId: "NE" });
      units.push({ unitId: "NE_CD3", ev: 1, stateId: "NE" });
    } else {
      units.push({ unitId: stateId, ev, stateId });
    }
  }
  return units;
})();
