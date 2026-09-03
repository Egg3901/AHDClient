/**
 * State-layer generator for the 1979 / 1991 / 2019 packs.
 *
 * Emits, from mainline AHDGame's OWN per-era modules (imported directly, no
 * transcription, no invented numbers):
 *   packages/content/src/packs/usStates{1979,1991,2019}.ts
 *   packages/content/src/packs/ukRegions{1979,1991,2019}.ts
 *   packages/content/src/packs/ruRegions1979.ts, ddRegions1979.ts
 *   packages/engine/src/demographics/usStateDemographics{1979,1991,2019}.ts
 *   packages/engine/src/demographics/ukDemographics{1979,1991,2019}.ts
 *   packages/engine/src/demographics/ruDemographics1979.ts, ddDemographics1979.ts
 *
 * Run FROM THE MAINLINE CHECKOUT so its `@/` path alias resolves:
 *   npx tsx ../AHDClient/packages/content/scripts/generateStateLayer.ts
 *
 * Mainline is read-only; this script only reads it. Every emitted file
 * carries a source header. Conventions mirror the hand-generated 1953 files
 * (usStates1953.ts, ukRegions1953.ts, ruRegions1953.ts, ddRegions1953.ts,
 * usStateDemographics1953.ts): DC is excluded (non-state, no House seats,
 * no electors), UK/RU/DD senateClasses are the [1,2] placeholder (no
 * staggered classes exist for them in mainline), demographics use the
 * legacy positions path (layer1Positions off; the 1953 port made the same
 * choice and documented that STATE_POSITION_OVERRIDES are not folded).
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { states1979 } from "@/lib/seeds/reference/states1979";
import { states1991 } from "@/lib/seeds/reference/states1991";
import { states as states2019 } from "@/lib/seeds/reference/states";
import { SENATE_CLASSES_BY_STATE } from "@/lib/constants/states";
import { build1979RegistrationSeeds } from "@/lib/seeds/registration/registrationLanes1979";
import { build1991RegistrationSeeds } from "@/lib/seeds/registration/registrationLanes1991";
import { buildAllRegistrationSeeds } from "@/lib/seeds/registration/registrationLanes";
import { ukRegions1979 } from "@/lib/seeds/uk/ukRegions1979";
import { ukRegions1991 } from "@/lib/seeds/uk/ukRegions1991";
import { ukRegions as ukRegions2019 } from "@/lib/seeds/uk/ukRegions";
import { ruRegions } from "@/lib/seeds/ru/ruRegions";
import { ddRegions } from "@/lib/seeds/dd/ddRegions";
import { RU_REGION_ORG_1979 } from "@/lib/seeds/ru/ruStatePartyOrgCalculations";
import { DD_REGION_ORG_1979 } from "@/lib/seeds/dd/ddStatePartyOrgCalculations";
import { stateCensusData1979 } from "@/lib/seeds/stateCensusData1979";
import { stateCensusData1991 } from "@/lib/seeds/stateCensusData1991";
import { stateCensusData as stateCensusData2019 } from "@/lib/seeds/stateCensusData";
import { generateStateDemographicsForTest } from "@/lib/seeds/stateDemographics";
import { ukRegionDemographics1979 } from "@/lib/seeds/uk/ukRegionDemographics1979";
import { ukRegionDemographics1991 } from "@/lib/seeds/uk/ukRegionDemographics1991";
import ukRegionDemographics2019 from "@/lib/seeds/uk/ukRegionDemographics";
import { getCountryLayer1Model } from "@/lib/seeds/international";
import { buildModelRegionDemographics } from "@/lib/seeds/international/derive";

const AHDClient = path.resolve(import.meta.dirname, "../..");
const PACKS = path.join(AHDClient, "content/src/packs");
const DEMO = path.join(AHDClient, "engine/src/demographics");

type Reg = { parties: Array<{ abbr: string; org: number; reg: number }>; independent: number; unregistered: number; unaffiliatedOrg: number };
type RegionIn = { _id: string; countryId: string; name: string; population: number; gdp: number; houseDistricts: number; stateSenateSeats: number; region: string };

const r2 = (n: number) => Math.round(n * 100) / 100;

function header(title: string, sources: string[], notes: string[] = []): string {
  return [
    "/**",
    ` * ${title}. Generated from mainline AHDGame - DO NOT HAND-EDIT.`,
    " * Generator: packages/content/scripts/generateStateLayer.ts",
    " * Sources:",
    ...sources.map((s) => ` * - ${s}`),
    ...(notes.length ? [" *", ...notes.map((n) => ` * ${n}`)] : []),
    " */",
  ].join("\n");
}

function fmtReg(r: Reg): string {
  const parties = r.parties.map((p) => `{ abbr: "${p.abbr}", org: ${p.org}, reg: ${p.reg} }`).join(", ");
  return `{ parties: [${parties}], independent: ${r.independent}, unregistered: ${r.unregistered}, unaffiliatedOrg: ${r.unaffiliatedOrg} }`;
}

function emitStates(
  file: string,
  exportName: string,
  title: string,
  sources: string[],
  notes: string[],
  regions: RegionIn[],
  regOf: (id: string) => Reg,
  classesOf: (id: string) => [number, number],
): void {
  const lines: string[] = [`import type { StateSeed } from "../types.js";`, header(title, sources, notes), `export const ${exportName}: StateSeed[] = [`];
  let pop = 0, house = 0, senate = 0;
  for (const s of regions) {
    const [a, b] = classesOf(s._id);
    pop += s.population; house += s.houseDistricts; senate += s.stateSenateSeats;
    lines.push(
      "  {",
      `    id: "${s._id}",`,
      `    name: ${JSON.stringify(s.name)},`,
      `    countryId: "${s.countryId}",`,
      `    population: ${s.population},`,
      `    gdp: ${s.gdp},`,
      `    houseSeats: ${s.houseDistricts},`,
      `    senateSeats: ${s.stateSenateSeats},`,
      `    region: ${JSON.stringify(s.region)},`,
      `    senateClasses: [${a}, ${b}],`,
      `    registration: ${fmtReg(regOf(s._id))},`,
      "  },",
    );
  }
  lines.push("];", "", `// Totals: ${regions.length} regions, ${pop.toLocaleString("en-US")} population, ${house} house seats, ${senate} upper-state seats (sum).`, "");
  fs.writeFileSync(path.join(PACKS, file), lines.join("\n"));
  console.log("wrote", file, regions.length, "regions; house", house, "senate", senate);
}

type DemoIn = { _id: string; categoryWeights: Record<string, number>; groups: Record<string, { population: number; economicLean: number; socialLean: number; turnout?: number }> };

function emitDemographics(file: string, exportName: string, title: string, sources: string[], notes: string[], rows: DemoIn[], defaultTurnout: (gid: string) => number): void {
  const lines: string[] = [
    `import type { StateDemographicsSeed } from "./usStateDemographics1953.js";`,
    header(title, sources, notes),
    `export const ${exportName}: StateDemographicsSeed[] = [`,
  ];
  for (const d of rows) {
    lines.push("  {", `    stateId: "${d._id}",`, `    categoryWeights: ${JSON.stringify(d.categoryWeights)},`, "    groups: {");
    for (const [gid, g] of Object.entries(d.groups)) {
      lines.push(`      ${gid}: { population: ${r2(g.population)}, economicLean: ${r2(g.economicLean)}, socialLean: ${r2(g.socialLean)}, turnout: ${Math.round(g.turnout ?? defaultTurnout(gid))} },`);
    }
    lines.push("    },", "  },");
  }
  lines.push("];", "");
  fs.writeFileSync(path.join(DEMO, file), lines.join("\n"));
  console.log("wrote", file, rows.length, "rows");
}

// ── US ────────────────────────────────────────────────────────────────────
const noDC = (xs: RegionIn[]) => xs.filter((s) => s._id !== "DC");
const usClasses = (id: string): [number, number] => {
  const c = (SENATE_CLASSES_BY_STATE as Record<string, readonly number[]>)[id];
  if (!c || c.length !== 2) throw new Error(`no senate classes for ${id}`);
  return [c[0]!, c[1]!];
};
const regMap = (seeds: Array<{ countryId: string; stateId: string } & Reg>, country: string) => {
  const m = new Map<string, Reg>();
  for (const s of seeds) if (s.countryId === country) m.set(s.stateId, { parties: s.parties.map((p) => ({ abbr: p.abbr, org: p.org, reg: p.reg })), independent: s.independent, unregistered: s.unregistered, unaffiliatedOrg: s.unaffiliatedOrg });
  return (id: string) => {
    const r = m.get(id);
    if (!r) throw new Error(`no registration for ${country}:${id}`);
    return r;
  };
};
const reg1979 = build1979RegistrationSeeds() as never;
const reg1991 = build1991RegistrationSeeds() as never;
const reg2019 = buildAllRegistrationSeeds() as never;

const US_NOTES = [
  "DC excluded (non-state: no House seats, no electors; same as usStates1953.ts).",
  "senateClasses from constants/states.ts SENATE_CLASSES_BY_STATE (era-invariant).",
  "1979 US Congress starts VACANT: mainline's own RESET_PRESETS[\"1979-default\"]",
  "description reads \"Legislatures start vacant (historical seat maps are a",
  "follow-up)\" and historicalSeats.ts has no US_HOUSE_1979/US_SENATE_1979;",
  "the first per-state House/Senate cycle fills it, as in mainline.",
];
emitStates("usStates1979.ts", "usStates1979", "US states for 1979-default",
  ["src/lib/seeds/reference/states1979.ts (population, gdp, houseDistricts, stateSenateSeats, region) — 96th Congress snapshot",
   "src/lib/seeds/registration/registrationLanes1979.ts build1979RegistrationSeeds (org/reg per party, independent/unregistered/unaffiliatedOrg)",
   "src/lib/constants/states.ts SENATE_CLASSES_BY_STATE"], US_NOTES,
  noDC(states1979 as RegionIn[]), regMap(reg1979, "US"), usClasses);
emitStates("usStates1991.ts", "usStates1991", "US states for 1991-default",
  ["src/lib/seeds/reference/states1991.ts (1990 Census population, 1991 nominal GSP, houseDistricts = 1990 apportionment, stateSenateSeats, region)",
   "src/lib/seeds/registration/registrationLanes1991.ts build1991RegistrationSeeds",
   "src/lib/constants/states.ts SENATE_CLASSES_BY_STATE"], US_NOTES.slice(0, 2),
  noDC(states1991 as RegionIn[]), regMap(reg1991, "US"), usClasses);
emitStates("usStates2019.ts", "usStates2019", "US states for 2019-default",
  ["src/lib/seeds/reference/states.ts (mainline's 2019-default bundle per admin/seed/seedStates.ts selectStatesBundleForPreset: 2020-Census population, current GDP, houseDistricts, stateSenateSeats, region)",
   "src/lib/seeds/registration/registrationLanes.ts buildAllRegistrationSeeds (2019 lanes)",
   "src/lib/constants/states.ts SENATE_CLASSES_BY_STATE"], US_NOTES.slice(0, 2),
  noDC(states2019 as RegionIn[]), regMap(reg2019, "US"), usClasses);

// ── UK ────────────────────────────────────────────────────────────────────
const ukClasses = (): [number, number] => [1, 2];
const UK_NOTES = [
  "Granularity: mainline's 12 electoral regions (its State granularity for UK), not per-constituency.",
  "senateClasses: no mainline Senate-class table for UK (FPTP Commons has no staggered classes); neutral [1,2] placeholder, PORT-STUB as in ukRegions1953.ts.",
  "Per-region houseDistricts sum is mainline's regional Commons apportionment; the pack's national commons chamber seat count is the era-neutral COUNTRY_CONFIGS base (see pack header).",
];
emitStates("ukRegions1979.ts", "ukRegions1979", "UK regions for 1979-default",
  ["src/lib/seeds/uk/ukRegions1979.ts (population, gdp, houseDistricts, stateSenateSeats, region)",
   "src/lib/seeds/registration/registrationLanes.ts buildAllRegistrationSeeds UK entries — mainline's registrationLanes1979.ts is US-only and states \"non-US countries fall back to their 2019 lanes on a 1979 reset\"; this file applies exactly that fallback"],
  UK_NOTES, ukRegions1979 as RegionIn[], regMap(reg2019, "UK"), ukClasses);
emitStates("ukRegions1991.ts", "ukRegions1991", "UK regions for 1991-default",
  ["src/lib/seeds/uk/ukRegions1991.ts (population, gdp, houseDistricts, stateSenateSeats, region)",
   "src/lib/seeds/registration/registrationLanes1991.ts build1991RegistrationSeeds UK entries"],
  UK_NOTES, ukRegions1991 as RegionIn[], regMap(reg1991, "UK"), ukClasses);
emitStates("ukRegions2019.ts", "ukRegions2019", "UK regions for 2019-default",
  ["src/lib/seeds/uk/ukRegions.ts (mainline's 2019-default bundle per admin/seed/seedUK.ts)",
   "src/lib/seeds/registration/registrationLanes.ts buildAllRegistrationSeeds UK entries"],
  UK_NOTES, ukRegions2019 as RegionIn[], regMap(reg2019, "UK"), ukClasses);

// ── RU / DD 1979 ──────────────────────────────────────────────────────────
// Registration formula is the one ruRegions1953.ts / ddRegions1953.ts document
// for registrationLanes1953.ts buildRUSeeds1953 / buildDDSeeds1953, applied to
// the 1979 org tables: RU parties [{CPSU, org: cpsu, reg: cpsu}], independent
// = 100 - cpsu, unaffiliatedOrg = 100 - cpsu; DD parties [{abbr, org, reg}] per
// Land with org = reg = table value, independent = 100 - sumReg,
// unaffiliatedOrg = 100 - sumOrg. unregistered = 0 (one-party regimes).
const ruReg = (id: string): Reg => {
  const o = (RU_REGION_ORG_1979 as Record<string, { cpsu: number }>)[id];
  if (!o) throw new Error(`RU_REGION_ORG_1979 missing ${id}`);
  return { parties: [{ abbr: "CPSU", org: o.cpsu, reg: o.cpsu }], independent: 100 - o.cpsu, unregistered: 0, unaffiliatedOrg: 100 - o.cpsu };
};
const ddReg = (id: string): Reg => {
  const o = (DD_REGION_ORG_1979 as Record<string, Record<string, number>>)[id];
  if (!o) throw new Error(`DD_REGION_ORG_1979 missing ${id}`);
  const parties = Object.entries(o).map(([k, v]) => ({ abbr: k.toUpperCase(), org: v, reg: v }));
  const sum = parties.reduce((a, p) => a + p.reg, 0);
  return { parties, independent: 100 - sum, unregistered: 0, unaffiliatedOrg: 100 - sum };
};
const BLOC_NOTE = "Regions: mainline has no dedicated 1979 region bundle for this country; admin/seed/seedRU.ts maps \"1979-default\" to ruRegions.ts (and seedDD.ts / selectPresetBundle fall back to the 2019-default bundle). This file applies that same mapping.";
emitStates("ruRegions1979.ts", "ruRegions1979", "USSR regions for 1979-default",
  ["src/lib/seeds/ru/ruRegions.ts (population, gdp, houseDistricts, stateSenateSeats, region) — the bundle mainline seeds for 1979-default",
   "src/lib/seeds/ru/ruStatePartyOrgCalculations.ts RU_REGION_ORG_1979 (CPSU org per region)"],
  [BLOC_NOTE, "houseDistricts sum 559 = pack sovietOfTheUnion seats; stateSenateSeats sum 4587 = republicSupremeSoviet."],
  ruRegions as RegionIn[], ruReg, ukClasses);
emitStates("ddRegions1979.ts", "ddRegions1979", "East Germany regions for 1979-default",
  ["src/lib/seeds/dd/ddRegions.ts (population, gdp, houseDistricts, stateSenateSeats, region) — the bundle mainline seeds for 1979-default",
   "src/lib/seeds/dd/ddStatePartyOrgCalculations.ts DD_REGION_ORG_1979 (SED/CDU/LDPD/NDPD/DBD org per Land)"],
  [BLOC_NOTE, "houseDistricts sum 500 = pack volkskammer seats; stateSenateSeats sum 80 = landAssembly."],
  ddRegions as RegionIn[], ddReg, ukClasses);

// ── Demographics ──────────────────────────────────────────────────────────
const usDemo = (census: Record<string, unknown>, era: string): DemoIn[] =>
  Object.keys(census).filter((id) => id !== "DC").sort().map((id) => generateStateDemographicsForTest(id, census[id] as never, era as never, {}) as unknown as DemoIn);
const US_DEMO_NOTES = [
  "Derived by mainline's own Layer-1 pipeline (stateDemographics.ts generateStateDemographics via the",
  "generateStateDemographicsForTest seam) with that era's ERA_COMPOSITIONS / ERA_TURNOUT_RATES, legacy",
  "positions path (layer1Positions off, no STATE_POSITION_OVERRIDES folded) — the same choice as",
  "usStateDemographics1953.ts. DC excluded. Populations sum to 100 per state.",
];
emitDemographics("usStateDemographics1979.ts", "US_STATE_DEMOGRAPHICS_1979", "US state demographics for 1979",
  ["src/lib/seeds/stateCensusData1979.ts (per-state race/age/education/wealth/ideology shares)", "src/lib/seeds/demographicCategories.ts ERA_COMPOSITIONS[\"1979\"], ERA_TURNOUT_RATES[\"1979\"]", "src/lib/seeds/stateDemographicsPure.ts deriveGroupPopulations / deriveGroupTurnout"],
  US_DEMO_NOTES, usDemo(stateCensusData1979 as never, "1979"), () => 55);
emitDemographics("usStateDemographics1991.ts", "US_STATE_DEMOGRAPHICS_1991", "US state demographics for 1991",
  ["src/lib/seeds/stateCensusData1991.ts", "src/lib/seeds/demographicCategories.ts ERA_COMPOSITIONS[\"1991\"], ERA_TURNOUT_RATES[\"1991\"]", "src/lib/seeds/stateDemographicsPure.ts"],
  US_DEMO_NOTES, usDemo(stateCensusData1991 as never, "1991"), () => 55);
emitDemographics("usStateDemographics2019.ts", "US_STATE_DEMOGRAPHICS_2019", "US state demographics for 2019",
  ["src/lib/seeds/stateCensusData.ts (mainline's 2019-default census bundle)", "src/lib/seeds/demographicCategories.ts ERA_COMPOSITIONS[\"2019\"], ERA_TURNOUT_RATES[\"2019\"]", "src/lib/seeds/stateDemographicsPure.ts"],
  US_DEMO_NOTES, usDemo(stateCensusData2019 as never, "2019"), () => 55);

// ESM/CJS interop: the default export may arrive wrapped as { default: [...] }.
const unwrap = (x: unknown): unknown[] => (Array.isArray(x) ? x : ((x as { default?: unknown[] }).default ?? []));
const ukStatic = (rows: unknown): DemoIn[] => (unwrap(rows) as DemoIn[]).map((r) => ({ _id: r._id, categoryWeights: r.categoryWeights, groups: r.groups }));
emitDemographics("ukDemographics1979.ts", "UK_DEMOGRAPHICS_1979", "UK region demographics for 1979",
  ["src/lib/seeds/uk/ukRegionDemographics1979.ts (static per-region groups, the bundle admin/seed/seedUK.ts seedUKDemographics uses for 1979-default)"], [],
  ukStatic(ukRegionDemographics1979 as never), () => 55);
emitDemographics("ukDemographics1991.ts", "UK_DEMOGRAPHICS_1991", "UK region demographics for 1991",
  ["src/lib/seeds/uk/ukRegionDemographics1991.ts"], [], ukStatic(ukRegionDemographics1991 as never), () => 55);
emitDemographics("ukDemographics2019.ts", "UK_DEMOGRAPHICS_2019", "UK region demographics for 2019",
  ["src/lib/seeds/uk/ukRegionDemographics.ts (default export, 2019-default bundle)"], [], ukStatic(ukRegionDemographics2019 as never), () => 55);

for (const [c, file, name] of [["RU", "ruDemographics1979.ts", "RU_DEMOGRAPHICS_1979"], ["DD", "ddDemographics1979.ts", "DD_DEMOGRAPHICS_1979"]] as const) {
  const model = getCountryLayer1Model(c, "1979" as never);
  if (!model) throw new Error(`no Layer-1 model for ${c} 1979`);
  const rows = buildModelRegionDemographics(model) as unknown as DemoIn[];
  emitDemographics(file, name, `${c} region demographics for 1979`,
    [`src/lib/seeds/international/${c.toLowerCase()}.ts get${c === "RU" ? "Ru" : "Dd"}Model("1979") (census, POSITIONS_1979, composition, turnout)`,
     "src/lib/seeds/international/derive.ts buildModelRegionDemographics — the exact path admin/seed/seedRU.ts / seedDD.ts run for 1979-default"],
    [], rows, () => 80);
}
console.log("done");
