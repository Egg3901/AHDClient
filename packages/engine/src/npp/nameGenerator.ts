/**
 * Deterministic NPC name generator.
 *
 * Source: /root/projects/AHDGame/src/lib/npp/nameGenerator.ts
 *         /root/projects/AHDGame/src/lib/npp/nameEra.ts
 *         /root/projects/AHDGame/src/lib/npp/nameLists1.ts
 *         /root/projects/AHDGame/src/lib/npp/nameLists2.ts
 *         /root/projects/AHDGame/src/lib/npp/nameLists3.ts
 *         /root/projects/AHDGame/src/lib/npp/nameLists4.ts
 *
 * All randomness flows through the passed WorldRng (no Math.random / Date.now),
 * faithful to mainline's pools, weighting, gender ratios, feminizers, and era
 * gating (US pool only). See mainline headers for per-pool rationale.
 */

import type { WorldRng } from "../rng.js";
import { namesForYear } from "./nameEra.js";
import {
  FIRST_NAMES_MALE,
  FIRST_NAMES_FEMALE,
  LAST_NAMES,
  JP_SURNAMES,
  JP_GIVEN_NAMES_MALE,
  JP_GIVEN_NAMES_FEMALE,
  CN_SURNAMES,
  CN_GIVEN_NAMES_MALE,
  CN_GIVEN_NAMES_FEMALE,
  UK_SURNAMES,
  UK_FIRST_NAMES_MALE,
  UK_FIRST_NAMES_FEMALE,
} from "./nameLists1.js";
import {
  DE_SURNAMES,
  DE_FIRST_NAMES_MALE,
  DE_FIRST_NAMES_FEMALE,
  IE_SURNAMES,
  IE_FIRST_NAMES_MALE,
  IE_FIRST_NAMES_FEMALE,
  BR_SURNAMES,
  BR_FIRST_NAMES_MALE,
  BR_FIRST_NAMES_FEMALE,
  NG_SURNAMES,
  NG_FIRST_NAMES_MALE,
  NG_FIRST_NAMES_FEMALE,
} from "./nameLists2.js";
import {
  FR_SURNAMES,
  FR_FIRST_NAMES_MALE,
  FR_FIRST_NAMES_FEMALE,
  IT_SURNAMES,
  IT_FIRST_NAMES_MALE,
  IT_FIRST_NAMES_FEMALE,
  ES_SURNAMES,
  ES_FIRST_NAMES_MALE,
  ES_FIRST_NAMES_FEMALE,
  SE_SURNAMES,
  SE_FIRST_NAMES_MALE,
  SE_FIRST_NAMES_FEMALE,
  TR_SURNAMES,
  TR_FIRST_NAMES_MALE,
  TR_FIRST_NAMES_FEMALE,
  RU_SURNAMES,
  RU_FIRST_NAMES_MALE,
  RU_FIRST_NAMES_FEMALE,
} from "./nameLists3.js";
import {
  HU_SURNAMES,
  HU_FIRST_NAMES_MALE,
  HU_FIRST_NAMES_FEMALE,
  PL_SURNAMES,
  PL_FIRST_NAMES_MALE,
  PL_FIRST_NAMES_FEMALE,
  CS_SURNAMES,
  CS_FIRST_NAMES_MALE,
  CS_FIRST_NAMES_FEMALE,
  BG_SURNAMES,
  BG_FIRST_NAMES_MALE,
  BG_FIRST_NAMES_FEMALE,
  RO_SURNAMES,
  RO_FIRST_NAMES_MALE,
  RO_FIRST_NAMES_FEMALE,
  YU_SURNAMES,
  YU_FIRST_NAMES_MALE,
  YU_FIRST_NAMES_FEMALE,
  BLR_SURNAMES,
  BLR_FIRST_NAMES_MALE,
  BLR_FIRST_NAMES_FEMALE,
  BAL_EE_SURNAMES,
  BAL_EE_FIRST_NAMES_MALE,
  BAL_EE_FIRST_NAMES_FEMALE,
  BAL_LV_SURNAMES,
  BAL_LV_FIRST_NAMES_MALE,
  BAL_LV_FIRST_NAMES_FEMALE,
  BAL_LT_SURNAMES,
  BAL_LT_FIRST_NAMES_MALE,
  BAL_LT_FIRST_NAMES_FEMALE,
  RU_UA_SURNAMES,
  RU_UA_FIRST_NAMES_MALE,
  RU_UA_FIRST_NAMES_FEMALE,
  RU_CAUCASUS_SURNAMES,
  RU_CAUCASUS_FIRST_NAMES_MALE,
  RU_CAUCASUS_FIRST_NAMES_FEMALE,
  RU_CENTRAL_ASIA_SURNAMES,
  RU_CENTRAL_ASIA_FIRST_NAMES_MALE,
  RU_CENTRAL_ASIA_FIRST_NAMES_FEMALE,
  DD_FIRST_NAMES_MALE,
  DD_FIRST_NAMES_FEMALE,
} from "./nameLists4.js";

const SUFFIXES = ["Jr.", "Sr.", "III", "IV"] as const;
const SUFFIX_PROBABILITY = 0.05;

// Re-export era helpers for consumers that need them.
export { namesForYear, gatedNameCount } from "./nameEra.js";

// ---------------------------------------------------------------------------
// Era helpers
// ---------------------------------------------------------------------------

function eraToYear(era: string | number | null | undefined): number | null {
  if (era == null) return null;
  if (typeof era === "number") return Number.isFinite(era) ? era : null;
  const n = Number.parseInt(String(era), 10);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Per-country generators (all take WorldRng, return name+gender)
// ---------------------------------------------------------------------------

function generateJPNameAndGender(rng: WorldRng): { name: string; gender: "male" | "female" } {
  const isFemale = rng.next() < 0.4;
  const gender: "male" | "female" = isFemale ? "female" : "male";
  const givenNames = isFemale ? JP_GIVEN_NAMES_FEMALE : JP_GIVEN_NAMES_MALE;
  const surname = rng.pick(JP_SURNAMES);
  const givenName = rng.pick(givenNames);
  return { name: `${givenName} ${surname}`, gender };
}

function generateCNNameAndGender(rng: WorldRng): { name: string; gender: "male" | "female" } {
  const isFemale = rng.next() < 0.25;
  const gender: "male" | "female" = isFemale ? "female" : "male";
  const givenNames = isFemale ? CN_GIVEN_NAMES_FEMALE : CN_GIVEN_NAMES_MALE;
  const surname = rng.pick(CN_SURNAMES);
  const givenName = rng.pick(givenNames);
  return { name: `${surname} ${givenName}`, gender };
}

function generateUKNameAndGender(rng: WorldRng): { name: string; gender: "male" | "female" } {
  const isFemale = rng.next() < 0.4;
  const gender: "male" | "female" = isFemale ? "female" : "male";
  const firstNames = isFemale ? UK_FIRST_NAMES_FEMALE : UK_FIRST_NAMES_MALE;
  return { name: `${rng.pick(firstNames)} ${rng.pick(UK_SURNAMES)}`, gender };
}

function generateDENameAndGender(rng: WorldRng): { name: string; gender: "male" | "female" } {
  const isFemale = rng.next() < 0.35;
  const gender: "male" | "female" = isFemale ? "female" : "male";
  const firstNames = isFemale ? DE_FIRST_NAMES_FEMALE : DE_FIRST_NAMES_MALE;
  return { name: `${rng.pick(firstNames)} ${rng.pick(DE_SURNAMES)}`, gender };
}

function generateIENameAndGender(rng: WorldRng): { name: string; gender: "male" | "female" } {
  const isFemale = rng.next() < 0.3;
  const gender: "male" | "female" = isFemale ? "female" : "male";
  const firstNames = isFemale ? IE_FIRST_NAMES_FEMALE : IE_FIRST_NAMES_MALE;
  return { name: `${rng.pick(firstNames)} ${rng.pick(IE_SURNAMES)}`, gender };
}

function generateBRNameAndGender(rng: WorldRng): { name: string; gender: "male" | "female" } {
  const isFemale = rng.next() < 0.3;
  const gender: "male" | "female" = isFemale ? "female" : "male";
  const firstNames = isFemale ? BR_FIRST_NAMES_FEMALE : BR_FIRST_NAMES_MALE;
  return { name: `${rng.pick(firstNames)} ${rng.pick(BR_SURNAMES)}`, gender };
}

function generateNGNameAndGender(rng: WorldRng): { name: string; gender: "male" | "female" } {
  const isFemale = rng.next() < 0.25;
  const gender: "male" | "female" = isFemale ? "female" : "male";
  const firstNames = isFemale ? NG_FIRST_NAMES_FEMALE : NG_FIRST_NAMES_MALE;
  return { name: `${rng.pick(firstNames)} ${rng.pick(NG_SURNAMES)}`, gender };
}

function generateFRNameAndGender(rng: WorldRng): { name: string; gender: "male" | "female" } {
  const isFemale = rng.next() < 0.38;
  const gender: "male" | "female" = isFemale ? "female" : "male";
  const firstNames = isFemale ? FR_FIRST_NAMES_FEMALE : FR_FIRST_NAMES_MALE;
  return { name: `${rng.pick(firstNames)} ${rng.pick(FR_SURNAMES)}`, gender };
}

function generateITNameAndGender(rng: WorldRng): { name: string; gender: "male" | "female" } {
  const isFemale = rng.next() < 0.35;
  const gender: "male" | "female" = isFemale ? "female" : "male";
  const firstNames = isFemale ? IT_FIRST_NAMES_FEMALE : IT_FIRST_NAMES_MALE;
  return { name: `${rng.pick(firstNames)} ${rng.pick(IT_SURNAMES)}`, gender };
}

const ES_DOUBLE_SURNAME_PROBABILITY = 0.35;

function generateESNameAndGender(rng: WorldRng): { name: string; gender: "male" | "female" } {
  const isFemale = rng.next() < 0.4;
  const gender: "male" | "female" = isFemale ? "female" : "male";
  const firstNames = isFemale ? ES_FIRST_NAMES_FEMALE : ES_FIRST_NAMES_MALE;
  const firstName = rng.pick(firstNames);
  const paternal = rng.pick(ES_SURNAMES);
  if (rng.next() < ES_DOUBLE_SURNAME_PROBABILITY) {
    let maternal = paternal;
    while (maternal === paternal) maternal = rng.pick(ES_SURNAMES);
    return { name: `${firstName} ${paternal} ${maternal}`, gender };
  }
  return { name: `${firstName} ${paternal}`, gender };
}

function generateSENameAndGender(rng: WorldRng): { name: string; gender: "male" | "female" } {
  const isFemale = rng.next() < 0.45;
  const gender: "male" | "female" = isFemale ? "female" : "male";
  const firstNames = isFemale ? SE_FIRST_NAMES_FEMALE : SE_FIRST_NAMES_MALE;
  return { name: `${rng.pick(firstNames)} ${rng.pick(SE_SURNAMES)}`, gender };
}

function generateTRNameAndGender(rng: WorldRng): { name: string; gender: "male" | "female" } {
  const isFemale = rng.next() < 0.17;
  const gender: "male" | "female" = isFemale ? "female" : "male";
  const firstNames = isFemale ? TR_FIRST_NAMES_FEMALE : TR_FIRST_NAMES_MALE;
  return { name: `${rng.pick(firstNames)} ${rng.pick(TR_SURNAMES)}`, gender };
}

// -- feminizers -------------------------------------------------------------

export function feminizeRussianSurname(surname: string): string {
  if (/(sky|skiy|ski)$/.test(surname)) return surname.replace(/(sky|skiy|ski)$/, "skaya");
  if (/(ov|ev|yov|in|yn)$/.test(surname)) return `${surname}a`;
  return surname;
}

export function feminizePolishSurname(surname: string): string {
  if (/(ski|cki|dzki)$/.test(surname)) return surname.replace(/ki$/, "ka");
  return surname;
}

export function feminizeCzechSurname(surname: string): string {
  if (/y$/.test(surname)) return surname.replace(/y$/, "a");
  if (/a$/.test(surname)) return `${surname.slice(0, -1)}ova`;
  return `${surname}ova`;
}

export function feminizeLatvianSurname(surname: string): string {
  if (/ins$/.test(surname)) return surname.replace(/s$/, "a");
  if (/is$/.test(surname)) return surname.replace(/is$/, "e");
  if (/s$/.test(surname)) return surname.replace(/s$/, "a");
  return surname;
}

export function feminizeLithuanianSurname(surname: string): string {
  if (/(as|is|ys|us)$/.test(surname)) return `${surname.replace(/(as|is|ys|us)$/, "")}iene`;
  return surname;
}

// -- RU (with weighted minority sub-pools) ---------------------------------

const RU_MINORITY_SUB_POOLS = [
  {
    weight: 0.18,
    surnames: RU_UA_SURNAMES,
    male: RU_UA_FIRST_NAMES_MALE,
    female: RU_UA_FIRST_NAMES_FEMALE,
    feminize: feminizeRussianSurname,
  },
  {
    weight: 0.06,
    surnames: RU_CAUCASUS_SURNAMES,
    male: RU_CAUCASUS_FIRST_NAMES_MALE,
    female: RU_CAUCASUS_FIRST_NAMES_FEMALE,
    feminize: feminizeRussianSurname,
  },
  {
    weight: 0.05,
    surnames: RU_CENTRAL_ASIA_SURNAMES,
    male: RU_CENTRAL_ASIA_FIRST_NAMES_MALE,
    female: RU_CENTRAL_ASIA_FIRST_NAMES_FEMALE,
    feminize: feminizeRussianSurname,
  },
  {
    weight: 0.05,
    surnames: BLR_SURNAMES,
    male: BLR_FIRST_NAMES_MALE,
    female: BLR_FIRST_NAMES_FEMALE,
    feminize: feminizeRussianSurname,
  },
  {
    weight: 0.03,
    surnames: BAL_LT_SURNAMES,
    male: BAL_LT_FIRST_NAMES_MALE,
    female: BAL_LT_FIRST_NAMES_FEMALE,
    feminize: feminizeLithuanianSurname,
  },
  {
    weight: 0.02,
    surnames: BAL_LV_SURNAMES,
    male: BAL_LV_FIRST_NAMES_MALE,
    female: BAL_LV_FIRST_NAMES_FEMALE,
    feminize: feminizeLatvianSurname,
  },
  {
    weight: 0.02,
    surnames: RO_SURNAMES,
    male: RO_FIRST_NAMES_MALE,
    female: RO_FIRST_NAMES_FEMALE,
    feminize: (surname: string) => surname,
  },
] as const;

const RU_MINORITY_SHARE = RU_MINORITY_SUB_POOLS.reduce((sum, pool) => sum + pool.weight, 0);

function pickWeighted<T extends { weight: number }>(rng: WorldRng, pools: readonly T[]): T {
  let roll = rng.next();
  for (const pool of pools) {
    roll -= pool.weight;
    if (roll < 0) return pool;
  }
  return pools[pools.length - 1]!;
}

function generateRUNameAndGender(rng: WorldRng): { name: string; gender: "male" | "female" } {
  const isFemale = rng.next() < 0.16;
  const gender: "male" | "female" = isFemale ? "female" : "male";
  if (rng.next() < RU_MINORITY_SHARE) {
    const sub = pickWeighted(
      rng,
      RU_MINORITY_SUB_POOLS.map((pool) => ({ ...pool, weight: pool.weight / RU_MINORITY_SHARE })),
    );
    const firstNames = isFemale ? sub.female : sub.male;
    const firstName = rng.pick(firstNames);
    const surname = rng.pick(sub.surnames);
    return { name: `${firstName} ${isFemale ? sub.feminize(surname) : surname}`, gender };
  }
  const firstNames = isFemale ? RU_FIRST_NAMES_FEMALE : RU_FIRST_NAMES_MALE;
  const firstName = rng.pick(firstNames);
  const surname = rng.pick(RU_SURNAMES);
  return { name: `${firstName} ${isFemale ? feminizeRussianSurname(surname) : surname}`, gender };
}

function generateHUNameAndGender(rng: WorldRng): { name: string; gender: "male" | "female" } {
  const isFemale = rng.next() < 0.22;
  const gender: "male" | "female" = isFemale ? "female" : "male";
  const givenNames = isFemale ? HU_FIRST_NAMES_FEMALE : HU_FIRST_NAMES_MALE;
  return { name: `${rng.pick(HU_SURNAMES)} ${rng.pick(givenNames)}`, gender };
}

function generatePLNameAndGender(rng: WorldRng): { name: string; gender: "male" | "female" } {
  const isFemale = rng.next() < 0.23;
  const gender: "male" | "female" = isFemale ? "female" : "male";
  const firstNames = isFemale ? PL_FIRST_NAMES_FEMALE : PL_FIRST_NAMES_MALE;
  const firstName = rng.pick(firstNames);
  const surname = rng.pick(PL_SURNAMES);
  return { name: `${firstName} ${isFemale ? feminizePolishSurname(surname) : surname}`, gender };
}

function generateCSNameAndGender(rng: WorldRng): { name: string; gender: "male" | "female" } {
  const isFemale = rng.next() < 0.28;
  const gender: "male" | "female" = isFemale ? "female" : "male";
  const firstNames = isFemale ? CS_FIRST_NAMES_FEMALE : CS_FIRST_NAMES_MALE;
  const firstName = rng.pick(firstNames);
  const surname = rng.pick(CS_SURNAMES);
  return { name: `${firstName} ${isFemale ? feminizeCzechSurname(surname) : surname}`, gender };
}

function generateBGNameAndGender(rng: WorldRng): { name: string; gender: "male" | "female" } {
  const isFemale = rng.next() < 0.21;
  const gender: "male" | "female" = isFemale ? "female" : "male";
  const firstNames = isFemale ? BG_FIRST_NAMES_FEMALE : BG_FIRST_NAMES_MALE;
  const firstName = rng.pick(firstNames);
  const surname = rng.pick(BG_SURNAMES);
  return { name: `${firstName} ${isFemale ? feminizeRussianSurname(surname) : surname}`, gender };
}

function generateRONameAndGender(rng: WorldRng): { name: string; gender: "male" | "female" } {
  const isFemale = rng.next() < 0.32;
  const gender: "male" | "female" = isFemale ? "female" : "male";
  const firstNames = isFemale ? RO_FIRST_NAMES_FEMALE : RO_FIRST_NAMES_MALE;
  return { name: `${rng.pick(firstNames)} ${rng.pick(RO_SURNAMES)}`, gender };
}

function generateYUNameAndGender(rng: WorldRng): { name: string; gender: "male" | "female" } {
  const isFemale = rng.next() < 0.18;
  const gender: "male" | "female" = isFemale ? "female" : "male";
  const firstNames = isFemale ? YU_FIRST_NAMES_FEMALE : YU_FIRST_NAMES_MALE;
  return { name: `${rng.pick(firstNames)} ${rng.pick(YU_SURNAMES)}`, gender };
}

function generateBLRNameAndGender(rng: WorldRng): { name: string; gender: "male" | "female" } {
  const isFemale = rng.next() < 0.3;
  const gender: "male" | "female" = isFemale ? "female" : "male";
  const firstNames = isFemale ? BLR_FIRST_NAMES_FEMALE : BLR_FIRST_NAMES_MALE;
  const firstName = rng.pick(firstNames);
  const surname = rng.pick(BLR_SURNAMES);
  return { name: `${firstName} ${isFemale ? feminizeRussianSurname(surname) : surname}`, gender };
}

const BAL_SUB_POOLS = [
  {
    weight: 0.42,
    surnames: BAL_LT_SURNAMES,
    male: BAL_LT_FIRST_NAMES_MALE,
    female: BAL_LT_FIRST_NAMES_FEMALE,
    feminize: feminizeLithuanianSurname,
  },
  {
    weight: 0.33,
    surnames: BAL_LV_SURNAMES,
    male: BAL_LV_FIRST_NAMES_MALE,
    female: BAL_LV_FIRST_NAMES_FEMALE,
    feminize: feminizeLatvianSurname,
  },
  {
    weight: 0.25,
    surnames: BAL_EE_SURNAMES,
    male: BAL_EE_FIRST_NAMES_MALE,
    female: BAL_EE_FIRST_NAMES_FEMALE,
    feminize: (s: string) => s,
  },
] as const;

function generateBALNameAndGender(rng: WorldRng): { name: string; gender: "male" | "female" } {
  const sub = pickWeighted(rng, BAL_SUB_POOLS);
  const isFemale = rng.next() < 0.3;
  const gender: "male" | "female" = isFemale ? "female" : "male";
  const firstNames = isFemale ? sub.female : sub.male;
  const firstName = rng.pick(firstNames);
  const surnameRaw = rng.pick(sub.surnames);
  const surname = isFemale ? sub.feminize(surnameRaw) : surnameRaw;
  return { name: `${firstName} ${surname}`, gender };
}

function generateDDNameAndGender(rng: WorldRng): { name: string; gender: "male" | "female" } {
  const isFemale = rng.next() < 0.3;
  const gender: "male" | "female" = isFemale ? "female" : "male";
  const firstNames = isFemale ? DD_FIRST_NAMES_FEMALE : DD_FIRST_NAMES_MALE;
  return { name: `${rng.pick(firstNames)} ${rng.pick(DE_SURNAMES)}`, gender };
}

// -- US default -------------------------------------------------------------

function generateUSNameAndGender(rng: WorldRng, year: number | null): { name: string; gender: "male" | "female" } {
  const isFemale = rng.next() < 0.5;
  const gender: "male" | "female" = isFemale ? "female" : "male";
  const pool = isFemale ? FIRST_NAMES_FEMALE : FIRST_NAMES_MALE;
  const firstNames = namesForYear(pool, year);
  const firstName = rng.pick(firstNames);
  const lastName = rng.pick(LAST_NAMES);
  let suffix = "";
  if (!isFemale && rng.next() < SUFFIX_PROBABILITY) {
    suffix = " " + rng.pick([...SUFFIXES]);
  }
  return { name: `${firstName} ${lastName}${suffix}`, gender };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type NpcGender = "male" | "female";

export interface NpcNameAndGender {
  name: string;
  gender: NpcGender;
}

type CountryGenerator = (rng: WorldRng) => NpcNameAndGender;

const NAME_GENERATORS: Record<string, CountryGenerator> = {
  US: (rng) => generateUSNameAndGender(rng, null),
  UK: generateUKNameAndGender,
  DE: generateDENameAndGender,
  JP: generateJPNameAndGender,
  CN: generateCNNameAndGender,
  IE: generateIENameAndGender,
  BR: generateBRNameAndGender,
  NG: generateNGNameAndGender,
  FR: generateFRNameAndGender,
  IT: generateITNameAndGender,
  ES: generateESNameAndGender,
  SE: generateSENameAndGender,
  TR: generateTRNameAndGender,
  RU: generateRUNameAndGender,
  HU: generateHUNameAndGender,
  PL: generatePLNameAndGender,
  CS: generateCSNameAndGender,
  BG: generateBGNameAndGender,
  RO: generateRONameAndGender,
  YU: generateYUNameAndGender,
  BLR: generateBLRNameAndGender,
  BAL: generateBALNameAndGender,
  DD: generateDDNameAndGender,
  SCO: generateUKNameAndGender,
  WAL: generateUKNameAndGender,
};

export const SUPPORTED_COUNTRIES = Object.keys(NAME_GENERATORS) as readonly string[];

/**
 * Generate a full NPC name for `countryId` in `era`, deterministically from `rng`.
 * Falls back to the US pool for unknown countries. Era gates modern US given
 * names via namesForYear (same as mainline); non-US pools ignore era.
 */
export function generateNpcName(
  rng: WorldRng,
  countryId?: string,
  era?: string | number | null,
): string {
  return generateNpcNameAndGender(rng, countryId, era).name;
}

/**
 * Generate a full NPC name and the gender used to produce it.
 * Era may be a year number, an era id string like "1953", or null for no gating.
 */
export function generateNpcNameAndGender(
  rng: WorldRng,
  countryId?: string,
  era?: string | number | null,
): NpcNameAndGender {
  const year = eraToYear(era);
  const key = countryId ? countryId.toUpperCase() : "US";
  // US is the only pool that gates on era; rebuild its generator with the year.
  if (key === "US" || !NAME_GENERATORS[key]) {
    return generateUSNameAndGender(rng, year);
  }
  return NAME_GENERATORS[key]!(rng);
}

/**
 * Generate a unique name not in `existingNames`. Returns null after maxAttempts.
 */
export function generateUniqueNpcName(
  rng: WorldRng,
  existingNames: string[],
  countryId?: string,
  era?: string | number | null,
  maxAttempts = 100,
): string | null {
  const r = generateUniqueNpcNameAndGender(rng, existingNames, countryId, era, maxAttempts);
  return r ? r.name : null;
}

export function generateUniqueNpcNameAndGender(
  rng: WorldRng,
  existingNames: string[],
  countryId?: string,
  era?: string | number | null,
  maxAttempts = 100,
): NpcNameAndGender | null {
  const normalized = new Set(existingNames.map((n) => n.toLowerCase().trim()));
  for (let i = 0; i < maxAttempts; i++) {
    const result = generateNpcNameAndGender(rng, countryId, era);
    if (!normalized.has(result.name.toLowerCase().trim())) return result;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Compatibility shims — mainline names with rng-first signature
// ---------------------------------------------------------------------------

/** @deprecated use generateNpcNameAndGender */
export function generateNPPNameAndGender(
  rng: WorldRng,
  countryId?: string,
  era?: string | number | null,
): NpcNameAndGender {
  return generateNpcNameAndGender(rng, countryId, era);
}

/** @deprecated use generateUniqueNpcNameAndGender */
export function generateUniqueNPPNameAndGender(
  rng: WorldRng,
  existingNames: string[],
  countryId?: string,
  era?: string | number | null,
  maxAttempts = 100,
): NpcNameAndGender | null {
  return generateUniqueNpcNameAndGender(rng, existingNames, countryId, era, maxAttempts);
}

// ---------------------------------------------------------------------------
// Pool membership helpers (ported from mainline, no RNG)
// ---------------------------------------------------------------------------

const COUNTRY_NAME_POOLS: Record<string, { surnames: readonly string[]; firstNames: readonly string[]; surnameFirst?: boolean }> = {
  UK: { surnames: UK_SURNAMES, firstNames: [...UK_FIRST_NAMES_MALE, ...UK_FIRST_NAMES_FEMALE] },
  DE: { surnames: DE_SURNAMES, firstNames: [...DE_FIRST_NAMES_MALE, ...DE_FIRST_NAMES_FEMALE] },
  DD: {
    surnames: DE_SURNAMES,
    firstNames: [...DD_FIRST_NAMES_MALE, ...DD_FIRST_NAMES_FEMALE, ...DE_FIRST_NAMES_MALE, ...DE_FIRST_NAMES_FEMALE],
  },
  IE: { surnames: IE_SURNAMES, firstNames: [...IE_FIRST_NAMES_MALE, ...IE_FIRST_NAMES_FEMALE] },
  BR: { surnames: BR_SURNAMES, firstNames: [...BR_FIRST_NAMES_MALE, ...BR_FIRST_NAMES_FEMALE] },
  NG: { surnames: NG_SURNAMES, firstNames: [...NG_FIRST_NAMES_MALE, ...NG_FIRST_NAMES_FEMALE] },
  FR: { surnames: FR_SURNAMES, firstNames: [...FR_FIRST_NAMES_MALE, ...FR_FIRST_NAMES_FEMALE] },
  IT: { surnames: IT_SURNAMES, firstNames: [...IT_FIRST_NAMES_MALE, ...IT_FIRST_NAMES_FEMALE] },
  ES: { surnames: ES_SURNAMES, firstNames: [...ES_FIRST_NAMES_MALE, ...ES_FIRST_NAMES_FEMALE] },
  SE: { surnames: SE_SURNAMES, firstNames: [...SE_FIRST_NAMES_MALE, ...SE_FIRST_NAMES_FEMALE] },
  TR: { surnames: TR_SURNAMES, firstNames: [...TR_FIRST_NAMES_MALE, ...TR_FIRST_NAMES_FEMALE] },
  RU: {
    surnames: [
      ...RU_SURNAMES,
      ...RU_UA_SURNAMES,
      ...RU_CAUCASUS_SURNAMES,
      ...RU_CENTRAL_ASIA_SURNAMES,
      ...BLR_SURNAMES,
      ...BAL_LT_SURNAMES,
      ...BAL_LT_SURNAMES.map(feminizeLithuanianSurname),
      ...BAL_LV_SURNAMES,
      ...BAL_LV_SURNAMES.map(feminizeLatvianSurname),
      ...RO_SURNAMES,
    ],
    firstNames: [
      ...RU_FIRST_NAMES_MALE, ...RU_FIRST_NAMES_FEMALE,
      ...RU_UA_FIRST_NAMES_MALE, ...RU_UA_FIRST_NAMES_FEMALE,
      ...RU_CAUCASUS_FIRST_NAMES_MALE, ...RU_CAUCASUS_FIRST_NAMES_FEMALE,
      ...RU_CENTRAL_ASIA_FIRST_NAMES_MALE, ...RU_CENTRAL_ASIA_FIRST_NAMES_FEMALE,
      ...BLR_FIRST_NAMES_MALE, ...BLR_FIRST_NAMES_FEMALE,
      ...BAL_LT_FIRST_NAMES_MALE, ...BAL_LT_FIRST_NAMES_FEMALE,
      ...BAL_LV_FIRST_NAMES_MALE, ...BAL_LV_FIRST_NAMES_FEMALE,
      ...RO_FIRST_NAMES_MALE, ...RO_FIRST_NAMES_FEMALE,
    ],
  },
  HU: { surnames: HU_SURNAMES, firstNames: [...HU_FIRST_NAMES_MALE, ...HU_FIRST_NAMES_FEMALE], surnameFirst: true },
  PL: { surnames: [...PL_SURNAMES, ...PL_SURNAMES.map(feminizePolishSurname)], firstNames: [...PL_FIRST_NAMES_MALE, ...PL_FIRST_NAMES_FEMALE] },
  CS: { surnames: [...CS_SURNAMES, ...CS_SURNAMES.map(feminizeCzechSurname)], firstNames: [...CS_FIRST_NAMES_MALE, ...CS_FIRST_NAMES_FEMALE] },
  BG: { surnames: BG_SURNAMES, firstNames: [...BG_FIRST_NAMES_MALE, ...BG_FIRST_NAMES_FEMALE] },
  RO: { surnames: RO_SURNAMES, firstNames: [...RO_FIRST_NAMES_MALE, ...RO_FIRST_NAMES_FEMALE] },
  YU: { surnames: YU_SURNAMES, firstNames: [...YU_FIRST_NAMES_MALE, ...YU_FIRST_NAMES_FEMALE] },
  BLR: { surnames: BLR_SURNAMES, firstNames: [...BLR_FIRST_NAMES_MALE, ...BLR_FIRST_NAMES_FEMALE] },
  BAL: {
    surnames: [
      ...BAL_EE_SURNAMES,
      ...BAL_LV_SURNAMES, ...BAL_LV_SURNAMES.map(feminizeLatvianSurname),
      ...BAL_LT_SURNAMES, ...BAL_LT_SURNAMES.map(feminizeLithuanianSurname),
    ],
    firstNames: [
      ...BAL_EE_FIRST_NAMES_MALE, ...BAL_EE_FIRST_NAMES_FEMALE,
      ...BAL_LV_FIRST_NAMES_MALE, ...BAL_LV_FIRST_NAMES_FEMALE,
      ...BAL_LT_FIRST_NAMES_MALE, ...BAL_LT_FIRST_NAMES_FEMALE,
    ],
  },
  SCO: { surnames: UK_SURNAMES, firstNames: [...UK_FIRST_NAMES_MALE, ...UK_FIRST_NAMES_FEMALE] },
  WAL: { surnames: UK_SURNAMES, firstNames: [...UK_FIRST_NAMES_MALE, ...UK_FIRST_NAMES_FEMALE] },
  JP: { surnames: JP_SURNAMES, firstNames: [...JP_GIVEN_NAMES_MALE, ...JP_GIVEN_NAMES_FEMALE] },
  CN: { surnames: CN_SURNAMES, firstNames: [...CN_GIVEN_NAMES_MALE, ...CN_GIVEN_NAMES_FEMALE], surnameFirst: true },
};

export function isNameFromCountryPool(name: string, countryId?: string): boolean {
  const pool = countryId ? COUNTRY_NAME_POOLS[countryId.toUpperCase()] : undefined;
  if (!pool) return true;
  const tokens = name.trim().split(/\s+/).filter((t) => !(SUFFIXES as readonly string[]).includes(t));
  if (tokens.length < 2) return false;
  const given = pool.surnameFirst ? tokens.slice(1) : tokens.slice(0, 1);
  const family = pool.surnameFirst ? tokens.slice(0, 1) : tokens.slice(1);
  const surnames = new Set(pool.surnames);
  const firstNames = new Set(pool.firstNames);
  const matchesSurname = (candidate: string): boolean =>
    surnames.has(candidate) || pool.surnames.some((s) => feminizeRussianSurname(s) === candidate);
  const familyMatches = family.some((_, start) =>
    family.slice(start).some((__, end) => matchesSurname(family.slice(start, start + end + 1).join(" "))),
  );
  return familyMatches && given.some((token) => firstNames.has(token));
}
