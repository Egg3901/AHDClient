/**
 * Generator for 1953/1960 seed packs from mainline AHDGame.
 *
 * Reads mainline files only (RO). Emits checked-in TypeScript.
 * Run: npx tsx scripts/generatePacks.ts
 * Or: node --loader ts-node/esm scripts/generatePacks.ts
 *
 * Determinism: no Math.random, no Date.now at pack load time. This script runs at build time only.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const MAINLINE = "/root/projects/AHDGame";
const DATE = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Raw data extracted from mainline (see provenance headers in output packs)
// ---------------------------------------------------------------------------

// From /root/projects/AHDGame/src/lib/seeds/reference/budgets.ts
// NATIONAL_BUDGET_SEED_CONFIGS_1953 (18 direct + 9 via makeEasternBlocBudget1953)
// gdp in local currency (or USD where denomination = usd), see gdpDenomination.ts
interface RawBudget {
  gdp: number;
  currency: string;
  growth: number; // gdpGrowth %
  inflation: number; // %
  pop: number;
}

const RAW_1953: Record<string, RawBudget> = {
  US: { gdp: 387_000_000_000, currency: "USD", growth: 4.6, inflation: 0.75, pop: 158_000_000 },
  UK: { gdp: 14_400_000_000, currency: "GBP", growth: 4.0, inflation: 3.0, pop: 50_600_000 },
  RU: { gdp: 1_029_166_000_000, currency: "SUR", growth: 5.5, inflation: 0.5, pop: 139_500_000 },
  FR: { gdp: 16_450_000_000_000, currency: "FRF", growth: 3.5, inflation: 2.5, pop: 42_800_000 },
  IT: { gdp: 17_000_000_000, currency: "ITL", growth: 6.5, inflation: 2.5, pop: 47_500_000 },
  ES: { gdp: 198_000_000_000, currency: "ESP", growth: 2.0, inflation: 4.0, pop: 28_200_000 },
  SE: { gdp: 36_000_000_000, currency: "SEK", growth: 3.5, inflation: 2.5, pop: 7_170_000 },
  TR: { gdp: 24_000_000_000, currency: "TRL", growth: 9.5, inflation: 4.5, pop: 22_500_000 },
  GR: { gdp: 50_000_000_000, currency: "GRD", growth: 7.0, inflation: 9.0, pop: 7_600_000 },
  AT: { gdp: 85_000_000_000, currency: "ATS", growth: 3.0, inflation: 2.0, pop: 6_930_000 },
  FI: { gdp: 790_000_000_000, currency: "FIM", growth: 1.0, inflation: 2.0, pop: 4_150_000 },
  DE: { gdp: 138_000_000_000, currency: "EUR", growth: 8.5, inflation: -0.2, pop: 50_000_000 },
  JP: { gdp: 25_800_000_000, currency: "JPY", growth: 9.0, inflation: 6.5, pop: 86_600_000 },
  CN: { gdp: 33_300_000_000, currency: "CNY", growth: 15.0, inflation: 3.5, pop: 588_000_000 },
  BR: { gdp: 330_000_000_000, currency: "BRL", growth: 4.5, inflation: 8.0, pop: 57_000_000 },
  IE: { gdp: 340_000_000, currency: "IEP", growth: 1.5, inflation: 2.5, pop: 2_960_000 },
  NG: { gdp: 3_400_000_000, currency: "NGN", growth: 3.5, inflation: 3.0, pop: 30_000_000 },
  DD: { gdp: 50_000_000_000, currency: "DDM", growth: 3.0, inflation: 0.5, pop: 18_400_000 },
  // Eastern bloc via makeEasternBlocBudget1953
  HU: { gdp: 100_000_000_000, currency: "HUF", growth: 3.5, inflation: 3.0, pop: 9_500_000 },
  PL: { gdp: 300_000_000_000, currency: "PLZ", growth: 4.0, inflation: 2.0, pop: 25_500_000 },
  RO: { gdp: 80_000_000_000, currency: "ROL", growth: 3.5, inflation: 2.0, pop: 16_600_000 },
  YU: { gdp: 100_000_000_000, currency: "YUD", growth: 5.0, inflation: 5.0, pop: 16_900_000 },
  BG: { gdp: 40_000_000_000, currency: "BGL", growth: 4.0, inflation: 1.5, pop: 7_300_000 },
  BLR: { gdp: 50_000_000_000, currency: "SUR", growth: 5.0, inflation: 0.5, pop: 7_700_000 },
  UKR: { gdp: 291_667_000_000, currency: "SUR", growth: 5.5, inflation: 0.5, pop: 41_000_000 },
  CS: { gdp: 200_000_000_000, currency: "CSK", growth: 4.5, inflation: 1.5, pop: 12_400_000 },
  BAL: { gdp: 29_167_000_000, currency: "SUR", growth: 4.5, inflation: 0.5, pop: 2_900_000 },
};

// From gdpDenomination.ts  -  which 1953 GDPs are already USD
const USD_DENOMINATED = new Set(["IT", "JP", "CN", "NG"]);

// From currencies.ts INITIAL_RATES_1953  -  local per USD
const FX_1953: Record<string, number> = {
  US: 1.0,
  UK: 0.357,
  JP: 360.0,
  DE: 4.2,
  IE: 0.357,
  BR: 18.8,
  CN: 2.46,
  NG: 0.357,
  RU: 9.0,
  DD: 4.2,
  FR: 350.0,
  IT: 625.0,
  ES: 39.6,
  SE: 5.17,
  TR: 2.8,
  GR: 30.0,
  AT: 26.0,
  FI: 230.0,
  PL: 24.0,
  CS: 27.0,
  RO: 13.5,
  HU: 20.0,
  BG: 15.3,
  YU: 16.667,
  BLR: 9.0,
  UKR: 9.0,
  BAL: 9.0,
};

const NAMES: Record<string, string> = {
  US: "United States",
  UK: "United Kingdom",
  RU: "Soviet Union",
  FR: "France",
  IT: "Italy",
  ES: "Spain",
  SE: "Sweden",
  TR: "Turkey",
  GR: "Greece",
  AT: "Austria",
  FI: "Finland",
  DE: "West Germany",
  JP: "Japan",
  CN: "China",
  BR: "Brazil",
  IE: "Ireland",
  NG: "Nigeria",
  DD: "East Germany",
  HU: "Hungary",
  PL: "Poland",
  RO: "Romania",
  YU: "Yugoslavia",
  BG: "Bulgaria",
  BLR: "Belarus",
  UKR: "Ukraine",
  CS: "Czechoslovakia",
  BAL: "Baltic Republics",
};

// From worldEntityManifest.ts COLD_WAR_PLAYER for 1953-default
const PLAYABLE_1953 = new Set(["US", "UK", "RU", "DD"]);

// Unemployment sources (see pack file comments for per-country provenance)
const UNEMP_1953: Record<string, number> = {
  US: 2.9, // BLS 1953 annual avg, via stateMetrics1953.ts UNEMP_1953 comment
  UK: 1.8, // Beveridge full employment; UK historical ~1.5-1.8% in 1953
  RU: 0.5, // planned full employment proxy, DD baseline
  FR: 2.0, // frMetricPresets1953.ts NATIONAL_1953 economic.unemploymentRate
  IT: 8.0, // itMetricPresets1953.ts NATIONAL_1953
  ES: 4.5, // esMetricPresets1953.ts
  SE: 2.5, // seMetricPresets1953.ts
  TR: 5.0, // trMetricPresets1953.ts
  GR: 6.0, // grMetricPresets1953.ts
  AT: 4.5, // atMetricPresets1953.ts
  FI: 3.0, // fiMetricPresets1953.ts
  DE: 8.4, // Statistisches Bundesamt 1953: West Germany 8.4% (refugee unemployment)
  JP: 2.0, // historical Japan ~1-2% in 1953; low formal unemployment
  CN: 4.5, // cnMetricPresets1953.ts
  BR: 5.0, // proxy: brMetricPresets1953 matchingFriction 6.0 implies high informal
  IE: 5.0, // proxy: ieMetricPresets1953 matchingFriction 5.0 emigration safety valve
  NG: 3.0, // proxy: ngMetricPresets1953 matchingFriction 8.0 minimal formal market
  DD: 0.5, // ddStateMetrics1953.ts BASELINE unemploymentRate 0.5
  HU: 0.5, // planned proxy DD
  PL: 0.5,
  RO: 0.5,
  YU: 1.0, // self-management slightly looser than bloc
  BG: 0.5,
  BLR: 0.5,
  UKR: 0.5,
  CS: 0.5,
  BAL: 0.5,
};

function gdpToUsdMillions(id: string, rawGdp: number): number {
  if (USD_DENOMINATED.has(id)) return Math.round(rawGdp / 1_000_000);
  const fx = FX_1953[id];
  if (!fx) throw new Error(`No FX for ${id}`);
  return Math.round(rawGdp / fx / 1_000_000);
}

function toFraction(pct: number): number {
  return Math.round((pct / 100) * 100000) / 100000;
}

function buildCountry(id: string, gdpMillions: number, growth: number, inflation: number, unemployment: number, playable: boolean) {
  return {
    id,
    name: NAMES[id],
    playable,
    economy: {
      gdp: gdpMillions,
      growthRate: toFraction(growth),
      inflationRate: toFraction(inflation),
      unemploymentRate: toFraction(unemployment),
    },
  };
}

function header(files: string[]): string {
  return `/**
 * Generated from mainline AHDGame  -  DO NOT HAND-EDIT.
 * Source files: ${files.join(", ")}
 * Generated: ${DATE}
 * See packages/content/scripts/generatePacks.ts for conversion notes.
 */`;
}

function emitPack(
  eraId: string,
  label: string,
  startDate: string,
  countries: ReturnType<typeof buildCountry>[],
  sourceFiles: string[],
  notes: string[]
): string {
  const lines: string[] = [];
  lines.push(`import type { SeedPack } from "../types.js";`);
  lines.push("");
  lines.push(header(sourceFiles));
  if (notes.length) {
    lines.push("/**");
    for (const n of notes) lines.push(` * ${n}`);
    lines.push(" */");
  }
  lines.push(`export const pack${eraId}: SeedPack = {`);
  lines.push(`  packVersion: 1,`);
  lines.push(`  era: { id: "${eraId}", label: "${label}", startDate: "${startDate}" },`);
  lines.push(`  countries: [`);
  for (const c of countries) {
    lines.push(`    {`);
    lines.push(`      id: "${c.id}",`);
    lines.push(`      name: ${JSON.stringify(c.name)},`);
    lines.push(`      playable: ${c.playable},`);
    lines.push(`      economy: { gdp: ${c.economy.gdp}, growthRate: ${c.economy.growthRate}, inflationRate: ${c.economy.inflationRate}, unemploymentRate: ${c.economy.unemploymentRate} },`);
    lines.push(`    },`);
  }
  lines.push(`  ],`);
  lines.push(`};`);
  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 1953 pack
// ---------------------------------------------------------------------------
const ORDER_1953 = Object.keys(RAW_1953); // insertion order = budget order
const countries1953 = ORDER_1953.map((id) => {
  const r = RAW_1953[id];
  const gdpM = gdpToUsdMillions(id, r.gdp);
  const unemp = UNEMP_1953[id] ?? 2.0;
  return buildCountry(id, gdpM, r.growth, r.inflation, unemp, PLAYABLE_1953.has(id));
});

const notes1953 = [
  "Conversions:",
  " - gdp: mainline stores GDP in local currency (or USD-anchored for IT/JP/CN/NG per gdpDenomination.ts).",
  "   Converted to millions USD via INITIAL_RATES_1953 (currencies.ts). USD-anchored values divided by 1e6 only.",
  " - growthRate/inflationRate: mainline stores as percent (e.g. 4.6 = 4.6%). Divided by 100 to fractions as EconomySeed expects.",
  " - unemploymentRate: where NATIONAL_1953 carries economic.unemploymentRate (FR/IT/ES/SE/TR/GR/AT/FI/CN and DD baseline 0.5), used directly.",
  "   Otherwise: US 2.9 via stateMetrics1953.ts UNEMP_1953/BLS; UK 1.8 historical; DE 8.4 Statistisches Bundesamt;",
  "   JP 2.0 historical; IE/BR/NG via matchingFriction proxy; RU and eastern-bloc satellites at planned 0.5 (DD proxy, YU 1.0 self-management).",
  "Playable: worldEntityManifest.ts COLD_WAR_PLAYER = US/UK/RU/DD for 1953-default; rest economy-preview/hidden.",
  "Ids: kept as mainline CountryId values (uppercase, e.g. US not us) for cross-repo alignment.",
];

const pack1953Src = emitPack(
  "1953",
  "1953: Cold War Dawn",
  "1953-01-06",
  countries1953,
  [
    "src/lib/seeds/reference/budgets.ts (NATIONAL_BUDGET_SEED_CONFIGS_1953 + makeEasternBlocBudget1953)",
    "src/lib/seeds/reference/gdpDenomination.ts (GDP_DENOMINATION_1953)",
    "src/lib/constants/currencies.ts (INITIAL_RATES_1953)",
    "src/lib/constants/countries.ts (COUNTRY_CONFIGS names)",
    "src/lib/world/worldEntityManifest.ts (COLD_WAR_PLAYER)",
    "src/lib/seeds/[country]/[country]MetricPresets1953.ts and ddStateMetrics1953.ts (unemployment where authored)",
    "src/lib/seeds/reference/stateMetrics1953.ts (UNEMP_1953 comment for US)",
  ],
  notes1953
);

// ---------------------------------------------------------------------------
// A "1960" pack used to be generated here via era interpolation (lerping
// between the 1953 and 1979 budget anchors). 1960 is not an authored EraId
// in mainline — presetSelector.ts's real EraId union is
// "1953"|"1979"|"1991"|"1999"|"2007"|"2019"|"2023" — so that pack was
// fabricated data presented as if it were period-authored. It has been
// deleted (see packs/1960.ts removal and docs/briefs for the writeup).
//
// The real 1979/1991/2019 packs (packages/content/src/packs/{1979,1991,2019}.ts)
// are hand-authored from mainline's actual NATIONAL_BUDGET_SEED_CONFIGS_1979/
// _1991 tables and the base (2019-default) table, following this script's
// citation convention in each pack's own file header, rather than being
// generated by this script. A future pass can fold their generation back
// into this script the way the 1953 pack is generated here, but every
// number they carry today is transcribed from a cited mainline source, not
// derived or interpolated.
// ---------------------------------------------------------------------------

const out1953 = path.join(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), "../src/packs/1953.ts");

fs.writeFileSync(out1953, pack1953Src);
console.log(`Wrote ${out1953} (${countries1953.length} countries)`);

for (const c of countries1953) {
  if (c.economy.gdp <= 0) console.error(`1953 ${c.id} gdp ${c.economy.gdp} <=0`);
}
