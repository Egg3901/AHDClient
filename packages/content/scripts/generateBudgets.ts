/**
 * Authored national budgets for the 1979 / 1991 / 2019 packs (every playable
 * country of each era), from mainline's own per-preset budget configs.
 *
 * Emits packages/content/src/packs/budgets{1979,1991,2019}.ts (BudgetSeed[]).
 *
 * Run FROM THE MAINLINE CHECKOUT so its `@/` alias resolves:
 *   npx tsx ../Rotunda/packages/content/scripts/generateBudgets.ts
 *
 * Sources (imported directly, no transcription, no invented numbers):
 *  - src/lib/seeds/reference/budgets.ts getNationalBudgetSeedConfigsForPreset
 *    (population, gdp in absolute local currency, currencyCode, economicFactors
 *    in percent, taxBaseRatios, otherRevenue, debt, creditRating,
 *    baselineSpendingByCategory, baselineStateGrants, taxPolicyIds,
 *    policyDefaults, policyOptionOverrides, taxRateOverrides).
 *  - Tax rates are derived exactly as mainline's deriveTaxRates does
 *    (budgets.ts): seedTaxRatesOverride verbatim if present; else per taxType
 *    the default option of the law named by taxPolicyIds — the
 *    policyOptionOverrides index when set, otherwise the option matching
 *    policyDefaults {economic, social} (exact, then nearest by L1 distance,
 *    = findMatchedOption); foreignCorporateTax mirrors domestic when its law
 *    is unset; taxRateOverrides apply last.
 *  - Legislation types: src/lib/seeds/reference/legislationTypes.ts (US, UK),
 *    src/lib/seeds/{ru,dd,jp,de,ie,cn,br}/{c}LegislationTypes.ts.
 * The 1953 pack keeps its hand-authored budgets (same field set).
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { getNationalBudgetSeedConfigsForPreset } from "@/lib/seeds/reference/budgets";
import { legislationTypes } from "@/lib/seeds/reference/legislationTypes";
import { ruLegislationTypes } from "@/lib/seeds/ru/ruLegislationTypes";
import { ddLegislationTypes } from "@/lib/seeds/dd/ddLegislationTypes";
import { jpLegislationTypes } from "@/lib/seeds/jp/jpLegislationTypes";
import { deLegislationTypes } from "@/lib/seeds/de/deLegislationTypes";
import { ieLegislationTypes } from "@/lib/seeds/ie/ieLegislationTypes";
import { cnLegislationTypes } from "@/lib/seeds/cn/cnLegislationTypes";
import { brLegislationTypes } from "@/lib/seeds/br/brLegislationTypes";

const OUT = path.resolve(import.meta.dirname, "../src/packs");
const TAX_TYPES = ["incomeTax", "domesticCorporateTax", "foreignCorporateTax", "payrollTax", "tariffs", "salesTax"] as const;
type TaxType = (typeof TAX_TYPES)[number];
type Opt = { rate?: number; economic?: number; social?: number };
type LT = { _id: string; policyOptions?: Opt[] };
type Cfg = {
  countryId: string; fiscalYear: number; population: number; gdp: number; currencyCode: string;
  economicFactors: { gdpGrowth: number; wageGrowth: number; inflationRate: number; tradeGrowth: number };
  taxBaseRatios: { taxableIncome: number; corporateProfits: number; wagesAndSalaries: number; importValue: number; taxableSales: number };
  otherRevenue: number; debt: { principal: number; interestRate: number; ceiling: number }; creditRating: string;
  baselineSpendingByCategory: Record<string, number>; baselineStateGrants: number;
  taxPolicyIds: Partial<Record<TaxType, string>>; policyDefaults: Record<string, { economic: number; social: number }>;
  policyOptionOverrides: Record<string, number>; seedTaxRatesOverride?: Partial<Record<TaxType, number>>; taxRateOverrides?: Partial<Record<TaxType, number>>;
};

const PLAYABLE: Record<string, string[]> = {
  "1979": ["US", "UK", "RU", "DD"],
  "1991": ["US", "UK", "JP", "DE", "CN", "BR", "IE"],
  "2019": ["US", "UK", "JP", "DE", "CN", "IE"],
};

const typesById = new Map<string, LT>();
for (const list of [legislationTypes, ruLegislationTypes, ddLegislationTypes, jpLegislationTypes, deLegislationTypes, ieLegislationTypes, cnLegislationTypes, brLegislationTypes] as unknown as LT[][]) {
  for (const t of list) if (!typesById.has(t._id)) typesById.set(t._id, t);
}

function findMatchedOption(options: Opt[] | undefined, economic: number, social: number): Opt | null {
  if (!options?.length) return null;
  const exact = options.find((o) => o.economic === economic && o.social === social);
  if (exact) return exact;
  let best: Opt | null = null, bestDist = Infinity;
  for (const o of options) {
    const dist = Math.abs((o.economic ?? 0) - economic) + Math.abs((o.social ?? 0) - social);
    if (dist < bestDist) { bestDist = dist; best = o; }
  }
  return best;
}

function deriveTaxRates(cfg: Cfg): { rates: Record<TaxType, number>; notes: string[] } {
  const rates: Record<TaxType, number> = { incomeTax: 0, domesticCorporateTax: 0, foreignCorporateTax: 0, payrollTax: 0, tariffs: 0, salesTax: 0 };
  const notes: string[] = [];
  if (cfg.seedTaxRatesOverride) { notes.push("seedTaxRatesOverride verbatim"); return { rates: { ...rates, ...cfg.seedTaxRatesOverride } as Record<TaxType, number>, notes }; }
  const extraLaws: string[] = [];
  for (const [taxType, lawId] of Object.entries(cfg.taxPolicyIds) as Array<[TaxType, string | undefined]>) {
    if (!lawId) continue;
    // Mainline's taxPolicyIds carry country-specific dials beyond Rotunda's six
    // revenue lines (DE solidaritySurcharge, CN LVAT / urban maintenance / stamp
    // duty, IE property / USC / CGT / excise): PORT-STUB budget/extraTaxLines.
    if (!(TAX_TYPES as readonly string[]).includes(taxType)) { extraLaws.push(`${taxType}:${lawId}`); continue; }
    const lt = typesById.get(lawId);
    if (!lt) { notes.push(`${taxType}: law ${lawId} not in mainline seeds -> 0`); continue; }
    const idx = cfg.policyOptionOverrides?.[lt._id];
    const opt = idx !== undefined ? lt.policyOptions?.[idx] : findMatchedOption(lt.policyOptions, (cfg.policyDefaults[lt._id] ?? { economic: 0, social: 0 }).economic, (cfg.policyDefaults[lt._id] ?? { economic: 0, social: 0 }).social);
    if (opt && typeof opt.rate === "number") { rates[taxType] = opt.rate; notes.push(`${taxType}: ${lawId}${idx !== undefined ? ` option[${idx}]` : " policyDefaults match"} = ${opt.rate}`); }
    else notes.push(`${taxType}: ${lawId} has no rated option -> 0`);
  }
  if (extraLaws.length) notes.push(`PORT-STUB budget/extraTaxLines (laws): ${extraLaws.join(", ")}`);
  if (!cfg.taxPolicyIds.foreignCorporateTax) { rates.foreignCorporateTax = rates.domesticCorporateTax; notes.push("foreignCorporateTax mirrors domestic (no foreign law)"); }
  if (cfg.taxRateOverrides) {
    const extras: string[] = [];
    for (const [k, v] of Object.entries(cfg.taxRateOverrides)) {
      if ((TAX_TYPES as readonly string[]).includes(k)) rates[k as TaxType] = v as number;
      else extras.push(`${k}=${v}`);
    }
    notes.push(`taxRateOverrides applied: ${JSON.stringify(cfg.taxRateOverrides)}`);
    // Country-specific dials beyond Rotunda's six-key BudgetTaxRates (DE
    // solidaritySurcharge, CN LVAT/urban maintenance/stamp duty, IE property/
    // USC/CGT/excise) have no revenue line in budget/revenue.ts: PORT-STUB.
    if (extras.length) notes.push(`PORT-STUB budget/extraTaxLines: ${extras.join(", ")}`);
  }
  return { rates, notes };
}

const fmtNum = (n: number) => (Number.isInteger(n) && Math.abs(n) >= 10_000 ? n.toLocaleString("en-US").replace(/,/g, "_") : String(n));

for (const [era, countries] of Object.entries(PLAYABLE)) {
  const cfgs = getNationalBudgetSeedConfigsForPreset(`${era}-default`) as unknown as Cfg[];
  const lines: string[] = [
    `import type { BudgetSeed } from "../types.js";`,
    "/**",
    ` * Authored national budgets for ${era}-default (${countries.join("/")}). Generated from mainline AHDGame — DO NOT HAND-EDIT.`,
    " * Generator: packages/content/scripts/generateBudgets.ts (see its header for sources and the tax-rate derivation).",
    " * Units: gdp / otherRevenue / debt / spending in absolute local currency; economicFactors and taxRates in percent (same as the 1953 pack).",
    " */",
    `export const BUDGETS_${era}: BudgetSeed[] = [`,
  ];
  for (const c of countries) {
    const cfg = cfgs.find((x) => x.countryId === c);
    if (!cfg) throw new Error(`no ${era} budget config for ${c}`);
    const { rates, notes } = deriveTaxRates(cfg);
    const ef = cfg.economicFactors;
    lines.push(
      "  {",
      `    // taxRates: ${notes.join("; ")}`,
      `    countryId: "${c}",`,
      `    fiscalYear: ${cfg.fiscalYear},`,
      `    population: ${fmtNum(cfg.population)},`,
      `    gdp: ${fmtNum(cfg.gdp)},`,
      `    currencyCode: ${JSON.stringify(cfg.currencyCode)},`,
      `    taxBaseRatios: ${JSON.stringify(cfg.taxBaseRatios)},`,
      `    taxRates: ${JSON.stringify(rates)},`,
      `    otherRevenue: ${fmtNum(cfg.otherRevenue)},`,
      `    debt: { principal: ${fmtNum(cfg.debt.principal)}, interestRate: ${cfg.debt.interestRate}, ceiling: ${fmtNum(cfg.debt.ceiling)} },`,
      `    creditRating: ${JSON.stringify(cfg.creditRating)},`,
      `    baselineSpendingByCategory: ${JSON.stringify(Object.fromEntries(Object.entries(cfg.baselineSpendingByCategory).map(([k, v]) => [k, Math.round(v)])))},`,
      `    baselineStateGrants: ${fmtNum(Math.round(cfg.baselineStateGrants))},`,
      `    economicFactors: { gdpGrowth: ${ef.gdpGrowth}, wageGrowth: ${ef.wageGrowth}, inflationRate: ${ef.inflationRate}, tradeGrowth: ${ef.tradeGrowth} },`,
      "  },",
    );
    console.log(era, c, JSON.stringify(rates));
  }
  lines.push("];", "");
  fs.writeFileSync(path.join(OUT, `budgets${era}.ts`), lines.join("\n"));
  console.log("wrote", `budgets${era}.ts`);
}
console.log("done");
