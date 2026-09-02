/**
 * W61 roster generator: the post-Cold-War playable countries mainline's
 * presets actually seed (RESET_PRESETS[...].countries):
 *   1991-default: + JP, DE, CN, BR, IE
 *   2019-default: + JP, DE, CN, IE
 *
 * Emits, from mainline AHDGame's OWN modules (imported directly, no
 * transcription, no invented numbers):
 *   packages/content/src/packs/{jp,de,cn,br,ie}Regions{1991,2019}.ts   StateSeed[]
 *   packages/content/src/packs/roster{1991,2019}.ts                     parties + legislatures (compositions from historicalSeats)
 *   packages/engine/src/demographics/{jp,de,cn,br,ie}Demographics{1991,2019}.ts
 *   packages/engine/src/cabinet/positionsPorted.ts                       JP/DE/IE/CN cabinet position tables
 *
 * Run FROM THE MAINLINE CHECKOUT so its `@/` alias resolves:
 *   npx tsx ../Rotunda/packages/content/scripts/generateRosters.ts
 *
 * Chamber sizing rule (same rule the content seat-sum tests enforce): a chamber
 * whose seats are contested per region is sized to the SUM of that region
 * field, because that is what the per-region races can fill. Where mainline's
 * era-neutral COUNTRY_CONFIGS number differs from the per-region sum, the sum
 * wins and the difference is documented inline. Seat tables larger than the
 * chamber are scaled proportionally (largest remainder) and documented;
 * mainline itself labels its 2021 Bundestag table "scaled".
 * Party slugs resolve through mainline's own SLUG_TO_NAME; independents and
 * slugs with no party in the era's roster become vacancies (the 1953 pack's
 * convention for independents).
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { jpRegions1991 } from "@/lib/seeds/jp/jpRegions1991";
import { jpRegions } from "@/lib/seeds/jp/jpRegions";
import { deRegions1991 } from "@/lib/seeds/de/deRegions1991";
import { deRegions } from "@/lib/seeds/de/deRegions";
import { cnRegions1991 } from "@/lib/seeds/cn/cnRegions1991";
import { cnRegions } from "@/lib/seeds/cn/cnRegions";
import { brRegions1991 } from "@/lib/seeds/br/brRegions1991";
import { ieRegions1991 } from "@/lib/seeds/ie/ieRegions1991";
import { ieRegions } from "@/lib/seeds/ie/ieRegions";
import { jpParties } from "@/lib/seeds/jp/jpParties";
import { deParties } from "@/lib/seeds/de/deParties";
import { cnParties } from "@/lib/seeds/cn/cnParties";
import { brParties } from "@/lib/seeds/br/brParties";
import { ieParties } from "@/lib/seeds/ie/ieParties";
import * as HS from "@/lib/constants/historicalSeats";
import { SLUG_TO_NAME, INDEPENDENT_SLUGS } from "@/lib/npp/seedHistorical";
import { COUNTRY_CONFIGS } from "@/lib/constants/countries";
import { JP_SANGIIN_SEATS, getCnPeoplesCongressSeats } from "@/lib/constants/states";
import { build1991RegistrationSeeds } from "@/lib/seeds/registration/registrationLanes1991";
import { buildAllRegistrationSeeds } from "@/lib/seeds/registration/registrationLanes";
import { IE_REGION_VOTE_SHARES_1989, IE_REGION_VOTE_SHARES_2024 } from "@/lib/seeds/ie/ieRegionVoteShares";
import { getCnRegionOrg } from "@/lib/seeds/cn/cnStatePartyOrgCalculations";
import { getCountryLayer1Model } from "@/lib/seeds/international";
import { buildModelRegionDemographics } from "@/lib/seeds/international/derive";
import { JP_CABINET_POSITIONS } from "@/lib/constants/jpCabinet";
import { DE_CABINET_POSITIONS } from "@/lib/constants/deCabinet";
import { IE_CABINET_POSITIONS } from "@/lib/constants/ieCabinet";
import { CN_CABINET_POSITIONS } from "@/lib/constants/cnCabinet";
import { jpDemographicCategories } from "@/lib/seeds/jp/jpDemographicCategories";
import { deDemographicCategories } from "@/lib/seeds/de/deDemographicCategories";
import { ieDemographicCategories } from "@/lib/seeds/ie/ieDemographicCategories";
import { cnDemographicCategories } from "@/lib/seeds/cn/cnDemographicCategories";
import { brDemographicCategories } from "@/lib/seeds/br/brDemographicCategories";

const ROTUNDA = path.resolve(import.meta.dirname, "../..");
const PACKS = path.join(ROTUNDA, "content/src/packs");
const DEMO = path.join(ROTUNDA, "engine/src/demographics");
const CABINET = path.join(ROTUNDA, "engine/src/cabinet");

type Reg = { parties: Array<{ abbr: string; org: number; reg: number }>; independent: number; unregistered: number; unaffiliatedOrg: number };
type RegionIn = { _id: string; countryId: string; name: string; population: number; gdp: number; houseDistricts: number; stateSenateSeats: number; region: string };
type Seat = { state: string; officeType: string; party: string; seatsHeld?: number; chamberClass?: 1 | 2 };
type Party = { countryId: string; name: string; abbreviation: string; color: string; economicPosition: number; socialPosition: number; validForPresets?: string[] };

const r2 = (n: number) => Math.round(n * 100) / 100;
const preset = (era: string) => `${era}-default`;

function header(title: string, sources: string[], notes: string[] = []): string {
  return ["/**", ` * ${title}. Generated from mainline AHDGame - DO NOT HAND-EDIT.`, " * Generator: packages/content/scripts/generateRosters.ts", " * Sources:", ...sources.map((s) => ` * - ${s}`), ...(notes.length ? [" *", ...notes.map((n) => ` * ${n}`)] : []), " */"].join("\n");
}
const fmtReg = (r: Reg) => `{ parties: [${r.parties.map((p) => `{ abbr: "${p.abbr}", org: ${p.org}, reg: ${p.reg} }`).join(", ")}], independent: ${r.independent}, unregistered: ${r.unregistered}, unaffiliatedOrg: ${r.unaffiliatedOrg} }`;

function emitStates(file: string, exportName: string, title: string, sources: string[], notes: string[], regions: RegionIn[], regOf: (id: string) => Reg, senateSeatsOf?: (r: RegionIn) => number): { house: number; senate: number } {
  const lines = [`import type { StateSeed } from "../types.js";`, header(title, sources, notes), `export const ${exportName}: StateSeed[] = [`];
  let house = 0, senate = 0;
  for (const s of regions) {
    const ss = senateSeatsOf ? senateSeatsOf(s) : s.stateSenateSeats;
    house += s.houseDistricts; senate += ss;
    lines.push("  {", `    id: "${s._id}",`, `    name: ${JSON.stringify(s.name)},`, `    countryId: "${s.countryId}",`, `    population: ${s.population},`, `    gdp: ${s.gdp},`, `    houseSeats: ${s.houseDistricts},`, `    senateSeats: ${ss},`, `    region: ${JSON.stringify(s.region)},`, `    senateClasses: [1, 2],`, `    registration: ${fmtReg(regOf(s._id))},`, "  },");
  }
  lines.push("];", "", `// Totals: ${regions.length} regions, ${house} lower-house seats, ${senate} upper/subnational seats (sum).`, "");
  fs.writeFileSync(path.join(PACKS, file), lines.join("\n"));
  console.log("wrote", file, regions.length, "regions; house", house, "senate", senate);
  return { house, senate };
}

type DemoIn = { _id: string; categoryWeights: Record<string, number>; groups: Record<string, { population: number; economicLean: number; socialLean: number; turnout?: number }> };
function emitDemographics(file: string, exportName: string, title: string, sources: string[], rows: DemoIn[]): void {
  const lines = [`import type { StateDemographicsSeed } from "./usStateDemographics1953.js";`, header(title, sources), `export const ${exportName}: StateDemographicsSeed[] = [`];
  for (const d of rows) {
    lines.push("  {", `    stateId: "${d._id}",`, `    categoryWeights: ${JSON.stringify(d.categoryWeights)},`, "    groups: {");
    for (const [gid, g] of Object.entries(d.groups)) lines.push(`      ${gid}: { population: ${r2(g.population)}, economicLean: ${r2(g.economicLean)}, socialLean: ${r2(g.socialLean)}, turnout: ${Math.round(g.turnout ?? 55)} },`);
    lines.push("    },", "  },");
  }
  lines.push("];", "");
  fs.writeFileSync(path.join(DEMO, file), lines.join("\n"));
  console.log("wrote", file, rows.length, "rows");
}

// ── registration builders ────────────────────────────────────────────────
const regMap = (seeds: Array<{ countryId: string; stateId: string } & Reg>, country: string) => {
  const m = new Map<string, Reg>();
  for (const s of seeds) if (s.countryId === country) m.set(s.stateId, { parties: s.parties.map((p) => ({ abbr: p.abbr, org: p.org, reg: p.reg })), independent: s.independent, unregistered: s.unregistered, unaffiliatedOrg: s.unaffiliatedOrg });
  return (id: string) => { const r = m.get(id); if (!r) throw new Error(`no registration for ${country}:${id}`); return r; };
};
const reg1991 = build1991RegistrationSeeds() as never;
const reg2019 = buildAllRegistrationSeeds() as never;
// IE: mainline ieStatePartyOrgCalculations.ts calculateIEPartyOrg(voteShare) = clamp(round(5 + voteShare/50 * 65), 5, 70);
// registration (reg) = vote share itself, per the same file's row builder. Slugs -> abbreviations per ieParties.
const IE_SLUG_ABBR: Record<string, string> = { ff: "FF", fg: "FG", lab: "LAB", wp: "WP", pd: "PD", sf: "SF", green: "GP" };
const ieReg = (shares: Record<string, Record<string, number>>) => (id: string): Reg => {
  const row = shares[id]; if (!row) throw new Error(`IE vote shares missing ${id}`);
  const parties = Object.entries(row).map(([slug, share]) => ({ abbr: IE_SLUG_ABBR[slug] ?? slug.toUpperCase(), org: Math.min(Math.max(Math.round(5 + (share / 50) * 65), 5), 70), reg: share }));
  const sumReg = parties.reduce((a, p) => a + p.reg, 0), sumOrg = parties.reduce((a, p) => a + p.org, 0);
  return { parties, independent: Math.max(0, 100 - sumReg), unregistered: 0, unaffiliatedOrg: Math.max(0, 100 - sumOrg) };
};
// CN: seedCnStatePartyOrg.ts — registration mirrors organization per row; independent = remainder.
const cnReg = (era: string) => (id: string): Reg => {
  const o = getCnRegionOrg(preset(era))[id] as unknown as Record<string, number>; if (!o) throw new Error(`CN org missing ${id}`);
  const parties = Object.entries(o).map(([k, v]) => ({ abbr: k.toUpperCase(), org: v, reg: v }));
  const sum = parties.reduce((a, p) => a + p.reg, 0);
  return { parties, independent: Math.max(0, 100 - sum), unregistered: 0, unaffiliatedOrg: Math.max(0, 100 - sum) };
};

// ── parties ──────────────────────────────────────────────────────────────
const partyId = (c: string, abbr: string) => `${c}_${abbr.replace(/[^A-Z0-9]/gi, "").toUpperCase()}`;
function partiesFor(c: string, list: Party[], era: string): Party[] {
  return list.filter((p) => !p.validForPresets || p.validForPresets.includes(preset(era)));
}
function nameToId(c: string, parties: Party[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of parties) m.set(p.name, partyId(c, p.abbreviation));
  return m;
}

// ── compositions from seat tables ────────────────────────────────────────
function compose(c: string, table: Seat[] | undefined, officeType: string, chamberSeats: number, byName: Map<string, string>, filter?: (s: Seat) => boolean): { seatsByParty: Record<string, number>; vacancies: number; note: string } {
  const rows = (table ?? []).filter((s) => s.officeType === officeType && (!filter || filter(s)));
  const raw: Record<string, number> = {};
  let independents = 0, unknown: string[] = [];
  for (const s of rows) {
    const n = s.seatsHeld ?? 1;
    if (INDEPENDENT_SLUGS.has(s.party)) { independents += n; continue; }
    const name = (SLUG_TO_NAME as Record<string, string>)[s.party];
    const id = name ? byName.get(name) : undefined;
    if (!id) { independents += n; if (!unknown.includes(s.party)) unknown.push(s.party); continue; }
    raw[id] = (raw[id] ?? 0) + n;
  }
  let total = Object.values(raw).reduce((a, b) => a + b, 0);
  let note = `table sum ${total + independents} (${independents} independent/unrostered${unknown.length ? ": " + unknown.join(",") : ""} -> vacancies)`;
  if (total > chamberSeats) {
    // Largest-remainder scale to fit the per-region-sum chamber (mainline's own "scaled" convention).
    const scale = chamberSeats / total;
    const scaled: Record<string, number> = {}; const rem: Array<[string, number]> = [];
    let used = 0;
    for (const [id, n] of Object.entries(raw)) { const x = n * scale; const f = Math.floor(x); scaled[id] = f; used += f; rem.push([id, x - f]); }
    rem.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    for (let i = 0; used < chamberSeats && i < rem.length; i++, used++) scaled[rem[i]![0]]! += 1;
    note += `; scaled ${total} -> ${chamberSeats} proportionally (largest remainder)`;
    return { seatsByParty: scaled, vacancies: 0, note };
  }
  return { seatsByParty: raw, vacancies: chamberSeats - total, note };
}

type Chamber = { key: string; name: string; shortName: string; seats: number; elected: boolean; description: string; composition: { seatsByParty: Record<string, number>; vacancies: number }; note: string };
function chamberLine(ch: Chamber): string {
  return `      {\n        // ${ch.note}\n        key: "${ch.key}",\n        name: ${JSON.stringify(ch.name)},\n        shortName: ${JSON.stringify(ch.shortName)},\n        seats: ${ch.seats},\n        elected: ${ch.elected},\n        description: ${JSON.stringify(ch.description)},\n        composition: { seatsByParty: ${JSON.stringify(ch.composition.seatsByParty)}, vacancies: ${ch.composition.vacancies} },\n      },`;
}

// ── per-country build ────────────────────────────────────────────────────
const cfg = (c: string) => (COUNTRY_CONFIGS as Record<string, any>)[c];
function desc(c: string, which: "lowerChamber" | "upperChamber" | "subNationalChamber"): { name: string; shortName: string; description: string } {
  const k = cfg(c);
  const ch = which === "subNationalChamber" ? k.subNationalChamber : k.legislature?.[which];
  return { name: ch?.name ?? which, shortName: ch?.shortName ?? which, description: ch?.description ?? "" };
}

interface Built { parties: string[]; legislature: string; regionsExport: string; regionsFile: string; demoExport: string; demoFile: string }

function buildCountry(era: string, c: string, regions: RegionIn[], parties: Party[], regOf: (id: string) => Reg, tables: Record<string, Seat[] | undefined>, opts: { senateSeatsOf?: (r: RegionIn) => number; sources: string[]; notes: string[] }): Built {
  const cl = c.toLowerCase();
  const regionsExport = `${cl}Regions${era}`; const regionsFile = `${regionsExport}.ts`;
  const sums = emitStates(regionsFile, regionsExport, `${cfg(c).name} regions for ${era}-default`, opts.sources, opts.notes, regions, regOf, opts.senateSeatsOf);
  const ps = partiesFor(c, parties, era); const byName = nameToId(c, ps);
  const partyLines = ps.map((p) => `    { id: "${partyId(c, p.abbreviation)}", name: ${JSON.stringify(p.name)}, countryId: "${c}", abbreviation: ${JSON.stringify(p.abbreviation)}, color: "${p.color}", economicPosition: ${p.economicPosition}, socialPosition: ${p.socialPosition} },`);
  const chambers: Chamber[] = [];
  const add = (key: string, which: "lowerChamber" | "upperChamber" | "subNationalChamber", seats: number, elected: boolean, table: Seat[] | undefined, officeType: string, extraNote: string, filter?: (s: Seat) => boolean) => {
    const d = desc(c, which); const comp = compose(c, table, officeType, seats, byName, filter);
    chambers.push({ key, ...d, seats, elected, composition: { seatsByParty: comp.seatsByParty, vacancies: comp.vacancies }, note: `${extraNote}; ${comp.note}` });
  };
  const k = cfg(c);
  if (c === "JP") {
    add("shugiin", "lowerChamber", sums.house, true, tables.shugiin, "shugiin", `seats = sum jpRegions${era}.houseDistricts (per-region shugiin races, mainline ensureJPElections); config ${k.legislature.lowerChamber.seats}`);
    const sangiinTotal = Object.values(JP_SANGIIN_SEATS as Record<string, number>).reduce((a, b) => a + b, 0);
    add("sangiin", "upperChamber", sangiinTotal, true, tables.sangiin, "sangiin", `seats = sum constants/states.ts JP_SANGIIN_SEATS (per-region, two classes: class 1 ceil / class 2 floor per mainline JP_SANGIIN_2020 header)`);
    add("regionalCouncil", "subNationalChamber", sums.senate, true, tables.regionalCouncil, "regionalCouncil", `seats = sum jpRegions${era}.stateSenateSeats (per-region regionalCouncil races)`);
  } else if (c === "DE") {
    add("bundestag", "lowerChamber", sums.house, true, tables.bundestag, "bundestag", `seats = sum deRegions${era}.houseDistricts = mainline DE_WAHLKREIS_SEATS per Land, the totalSeats mainline ensureDEElections gives each per-Land Bundestag race; config ${k.legislature.lowerChamber.seats} (AMS list seats are PORT-STUB: Rotunda allocates per-Land seats by Hamilton PR)`);
    add("bundesrat", "upperChamber", k.legislature.upperChamber.seats, false, undefined, "bundesrat", `appointed by Land governments (mainline: no election, no seat table) -> vacant`);
    add("landtag", "subNationalChamber", sums.senate, true, tables.landtag, "landtag", `seats = sum deRegions${era}.stateSenateSeats = DE_LANDTAG_SEATS per Land`);
  } else if (c === "CN") {
    add("npc", "lowerChamber", sums.house, true, tables.npc, "npcDelegate", `seats = sum cnRegions${era}.houseDistricts = CN_NPC_SEATS per macro-region (mainline ensureCNElections getCnNpcSeats)`);
    add("cppcc", "upperChamber", k.legislature.upperChamber.seats, false, undefined, "cppcc", `advisory body, appointed (mainline: no election, no seat table) -> vacant`);
    add("peoplesCongress", "subNationalChamber", sums.senate, true, tables.peoplesCongress, "peoplesCongress", `seats = sum CN_PEOPLES_CONGRESS_SEATS (getCnPeoplesCongressSeats) which this pack stores as each region's senateSeats; the region doc's stateSenateSeats field is the separate appointed CPPCC per mainline constants/states.ts`);
  } else if (c === "BR") {
    add("chamber", "lowerChamber", sums.house, true, tables.chamber, "chamber", `seats = sum brRegions${era}.houseDistricts (per-region Camara races, mainline ensureBRElections); config ${k.legislature.lowerChamber.seats} is the modern count`);
    add("senate", "upperChamber", sums.senate, true, tables.senate, "senate", `seats = sum brRegions${era}.stateSenateSeats (per-region Senado races, mainline ensureBRSenateElections); staggered 1/3-2/3 renewal is PORT-STUB (single class)`);
  } else if (c === "IE") {
    add("dail", "lowerChamber", sums.house, true, tables.dail, "dail", `seats = sum ieRegions${era}.houseDistricts (per-region PR-STV Dail races, mainline ensureIEElections; STV itself is PORT-STUB, Hamilton PR allocates)`);
    add("seanad", "upperChamber", k.legislature.upperChamber.seats, false, tables.seanad, "seanad", `vocational panels / nominees / universities: mainline seeds the table, spawns no election -> seeded, static`);
    add("localCouncil", "subNationalChamber", sums.senate, true, undefined, "localCouncil", `seats = sum ieRegions${era}.stateSenateSeats, the per-region seat count mainline ensureIELocalCouncilElections uses (config ${k.subNationalChamber?.seats} is stale vs the region bundle); no seat table -> vacant`);
  }
  const legislature = `  {\n    countryId: "${c}",\n    name: ${JSON.stringify(k.legislature.name)},\n    bicameral: ${!!k.legislature.bicameral},\n    chambers: [\n${chambers.map(chamberLine).join("\n")}\n    ],\n  },`;
  // demographics
  const model = getCountryLayer1Model(c, era as never); if (!model) throw new Error(`no Layer-1 model ${c} ${era}`);
  const demoExport = `${c}_DEMOGRAPHICS_${era}`; const demoFile = `${cl}Demographics${era}.ts`;
  emitDemographics(demoFile, demoExport, `${k.name} region demographics for ${era}`, [`src/lib/seeds/international/${cl}.ts get${c[0]}${cl.slice(1)}Model("${era}") via getCountryLayer1Model`, "src/lib/seeds/international/derive.ts buildModelRegionDemographics (the path admin/seed/seed" + c + ".ts runs)"], buildModelRegionDemographics(model) as unknown as DemoIn[]);
  return { parties: partyLines, legislature, regionsExport, regionsFile, demoExport, demoFile };
}

const T = HS as unknown as Record<string, Seat[]>;
const cnSenate = (era: string) => (r: RegionIn) => (getCnPeoplesCongressSeats(preset(era)) as Record<string, number>)[r._id] ?? r.stateSenateSeats;

const plans: Record<string, Built[]> = { "1991": [], "2019": [] };
const SRC = (files: string[]) => files;
plans["1991"]!.push(
  buildCountry("1991", "JP", jpRegions1991 as RegionIn[], jpParties as Party[], regMap(reg1991, "JP"), { shugiin: T.JP_SHUGIIN_1990, sangiin: T.JP_SANGIIN_1989, regionalCouncil: T.JP_REGIONAL_COUNCIL_1991 }, { sources: SRC(["src/lib/seeds/jp/jpRegions1991.ts", "src/lib/seeds/registration/registrationLanes1991.ts build1991RegistrationSeeds JP entries"]), notes: [] }),
  buildCountry("1991", "DE", deRegions1991 as RegionIn[], deParties as Party[], regMap(reg1991, "DE"), { bundestag: T.DE_BUNDESTAG_1990, landtag: T.DE_LANDTAG_1990 }, { sources: SRC(["src/lib/seeds/de/deRegions1991.ts", "src/lib/seeds/registration/registrationLanes1991.ts build1991RegistrationSeeds DE entries"]), notes: [] }),
  buildCountry("1991", "CN", cnRegions1991 as RegionIn[], cnParties as Party[], regMap(reg1991, "CN"), { npc: T.CN_NPC_1991, peoplesCongress: T.CN_PEOPLES_CONGRESS_1991 }, { senateSeatsOf: cnSenate("1991"), sources: SRC(["src/lib/seeds/cn/cnRegions1991.ts", "src/lib/seeds/registration/registrationLanes1991.ts build1991RegistrationSeeds CN entries", "src/lib/constants/states.ts getCnPeoplesCongressSeats (senateSeats)"]), notes: ["senateSeats = CN_PEOPLES_CONGRESS_SEATS per mainline (the region doc's stateSenateSeats is the appointed CPPCC)."] }),
  buildCountry("1991", "BR", brRegions1991 as RegionIn[], brParties as Party[], regMap(reg1991, "BR"), { chamber: T.BR_CHAMBER_1991, senate: T.BR_SENATE_1991 }, { sources: SRC(["src/lib/seeds/br/brRegions1991.ts", "src/lib/seeds/registration/registrationLanes1991.ts build1991RegistrationSeeds BR entries"]), notes: [] }),
  buildCountry("1991", "IE", ieRegions1991 as RegionIn[], ieParties as Party[], ieReg(IE_REGION_VOTE_SHARES_1989 as never), { dail: T.IE_DAIL_1991, seanad: T.IE_SEANAD_1991 }, { sources: SRC(["src/lib/seeds/ie/ieRegions1991.ts", "src/lib/seeds/ie/ieRegionVoteShares.ts IE_REGION_VOTE_SHARES_1989 via ieStatePartyOrgCalculations.ts calculateIEPartyOrg"]), notes: [] }),
);
plans["2019"]!.push(
  buildCountry("2019", "JP", jpRegions as RegionIn[], jpParties as Party[], regMap(reg2019, "JP"), { shugiin: T.JP_SHUGIIN_2020, sangiin: T.JP_SANGIIN_2020, regionalCouncil: T.JP_REGIONAL_COUNCIL_2020 }, { sources: SRC(["src/lib/seeds/jp/jpRegions.ts (2019-default bundle)", "src/lib/seeds/registration/registrationLanes.ts buildAllRegistrationSeeds JP entries"]), notes: [] }),
  buildCountry("2019", "DE", deRegions as RegionIn[], deParties as Party[], regMap(reg2019, "DE"), { bundestag: T.DE_BUNDESTAG_2021, landtag: T.DE_LANDTAG_2020 }, { sources: SRC(["src/lib/seeds/de/deRegions.ts (2019-default bundle)", "src/lib/seeds/registration/registrationLanes.ts buildAllRegistrationSeeds DE entries"]), notes: [] }),
  buildCountry("2019", "CN", cnRegions as RegionIn[], cnParties as Party[], cnReg("2019"), { npc: T.CN_NPC_2020, peoplesCongress: T.CN_PEOPLES_CONGRESS_2020 }, { senateSeatsOf: cnSenate("2019"), sources: SRC(["src/lib/seeds/cn/cnRegions.ts (2019-default bundle)", "src/lib/seeds/cn/cnStatePartyOrgCalculations.ts getCnRegionOrg(2019) (registration mirrors organization, per admin/seed/seedCnStatePartyOrg.ts)", "src/lib/constants/states.ts getCnPeoplesCongressSeats (senateSeats)"]), notes: ["senateSeats = CN_PEOPLES_CONGRESS_SEATS per mainline (the region doc's stateSenateSeats is the appointed CPPCC)."] }),
  buildCountry("2019", "IE", ieRegions as RegionIn[], ieParties as Party[], ieReg(IE_REGION_VOTE_SHARES_2024 as never), { dail: T.IE_DAIL_2020, seanad: T.IE_SEANAD_2020 }, { sources: SRC(["src/lib/seeds/ie/ieRegions.ts (2019-default bundle)", "src/lib/seeds/ie/ieRegionVoteShares.ts IE_REGION_VOTE_SHARES_2024 (mainline's 2019-default selection) via calculateIEPartyOrg"]), notes: [] }),
);

for (const [era, built] of Object.entries(plans)) {
  const imports = built.map((b) => `import { ${b.regionsExport} } from "./${b.regionsExport}.js";`).join("\n");
  const body = [
    `import type { PartySeed, LegislatureSeed, StateSeed } from "../types.js";`,
    imports,
    header(`${era}-default post-Cold-War roster (${built.map((b) => b.legislature.match(/countryId: "([A-Z]+)"/)![1]).join("/")})`,
      ["src/lib/constants/historicalSeats.ts RESET_PRESETS[\"" + era + "-default\"].countries (the seeded roster) and the per-chamber seat tables named in each chamber note",
       "src/lib/seeds/{jp,de,cn,br,ie}/*Parties.ts filtered by validForPresets",
       "src/lib/constants/countries.ts COUNTRY_CONFIGS (chamber names/descriptions, bicameral flag)",
       "src/lib/npp/seedHistorical.ts SLUG_TO_NAME / INDEPENDENT_SLUGS (party slug resolution)"],
      ["Party ids follow the pack convention `${countryId}_${ABBREVIATION}`.", "Independents and unrostered slugs are vacancies (1953 pack convention)."]),
    `export const ROSTER_${era}_PARTIES: PartySeed[] = [`, ...built.flatMap((b) => b.parties), `];`, "",
    `export const ROSTER_${era}_LEGISLATURES: LegislatureSeed[] = [`, ...built.map((b) => b.legislature), `];`, "",
    `export const ROSTER_${era}_STATES: StateSeed[] = [${built.map((b) => `...${b.regionsExport}`).join(", ")}];`, "",
  ].join("\n");
  fs.writeFileSync(path.join(PACKS, `roster${era}.ts`), body);
  console.log("wrote", `roster${era}.ts`);
}

// cabinet positions (era-neutral tables)
{
  const tables: Array<[string, unknown[]]> = [["JP", JP_CABINET_POSITIONS as unknown[]], ["DE", DE_CABINET_POSITIONS as unknown[]], ["IE", IE_CABINET_POSITIONS as unknown[]], ["CN", CN_CABINET_POSITIONS as unknown[]]];
  const lines = [`import type { CabinetPosition } from "./constants.js";`, header("Cabinet position tables for JP/DE/IE/CN", ["src/lib/constants/jpCabinet.ts JP_CABINET_POSITIONS", "src/lib/constants/deCabinet.ts DE_CABINET_POSITIONS", "src/lib/constants/ieCabinet.ts IE_CABINET_POSITIONS", "src/lib/constants/cnCabinet.ts CN_CABINET_POSITIONS"], ["Same {id, name, order, yearEnabled} shape as UK_CABINET_POSITIONS. Country-specific cabinet mechanics/orders (mainline *CabinetMechanics.ts) are PORT-STUB; positions fill via the parliamentary path."])];
  for (const [c, rows] of tables) {
    lines.push(`export const ${c}_CABINET_POSITIONS: readonly CabinetPosition[] = [`);
    for (const r of rows as Array<{ id: string; name: string; order: number; yearEnabled: number }>) lines.push(`  { id: ${JSON.stringify(r.id)}, name: ${JSON.stringify(r.name)}, order: ${r.order}, yearEnabled: ${r.yearEnabled} },`);
    lines.push("];", "");
  }
  fs.writeFileSync(path.join(CABINET, "positionsPorted.ts"), lines.join("\n"));
  console.log("wrote cabinet/positionsPorted.ts");
}
// demographic categories (era-neutral group definitions the Layer-1 output references)
{
  type Cat = { _id: string; name: string; defaultWeight: number; groups: Array<{ id: string; name: string; defaultEconomicLean: number; defaultSocialLean: number; defaultTurnout?: number }> };
  const cats: Array<[string, Cat]> = [["JP", (jpDemographicCategories as Cat[])[0]!], ["DE", (deDemographicCategories as Cat[])[0]!], ["IE", (ieDemographicCategories as Cat[])[0]!], ["CN", (cnDemographicCategories as Cat[])[0]!], ["BR", (brDemographicCategories as Cat[])[0]!]];
  const lines = [`import type { DemographicCategory } from "./categories.js";`, header("Demographic voter-group categories for JP/DE/IE/CN/BR", cats.map(([c]) => `src/lib/seeds/${c.toLowerCase()}/${c.toLowerCase()}DemographicCategories.ts`), ["Same {_id, name, defaultWeight, groups[{id,name,defaultEconomicLean,defaultSocialLean,defaultTurnout}]} shape as UK_CATEGORY in categories.ts."])];
  for (const [c, cat] of cats) {
    lines.push(`export const ${c}_CATEGORY: DemographicCategory = {`, `  _id: ${JSON.stringify(cat._id)},`, `  name: ${JSON.stringify(cat.name)},`, `  defaultWeight: ${cat.defaultWeight},`, "  groups: [");
    for (const g of cat.groups) lines.push(`    { id: ${JSON.stringify(g.id)}, name: ${JSON.stringify(g.name)}, defaultEconomicLean: ${g.defaultEconomicLean}, defaultSocialLean: ${g.defaultSocialLean}${g.defaultTurnout != null ? `, defaultTurnout: ${g.defaultTurnout}` : ""} },`);
    lines.push("  ],", "};", "");
  }
  fs.writeFileSync(path.join(DEMO, "categoriesPorted.ts"), lines.join("\n"));
  console.log("wrote demographics/categoriesPorted.ts");
}
console.log("done");
