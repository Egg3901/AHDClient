/**
 * W61 M2 legislation catalog generator: JP / DE / IE / CN / BR.
 *
 * Emits packages/engine/src/legislation/catalogPorted{JP,DE,IE,CN,BR}.ts from
 * mainline's own per-country legislation type seeds (imported directly, no
 * transcription, no invented numbers):
 *   src/lib/seeds/{c}/{c}LegislationTypes.ts
 *   src/lib/politicalLegislation/marginAdapter.ts ADAPTER_TIER1 (legacy
 *     "category.metricId" -> political-metric family id)
 *   src/lib/seeds/reference/budgets.ts getNationalBudgetSeedConfigsForPreset
 *     (policyDefaults: the baseline option per tax law for a preset)
 *
 * Run FROM THE MAINLINE CHECKOUT so its `@/` alias resolves:
 *   npx tsx ../AHDClient/packages/content/scripts/generateCatalogs.ts
 *
 * Mapping (same conventions the hand-ported US/UK/RU/DD entries use):
 *  - id = mainline `_id`; title/description/category(policyDomain) verbatim.
 *  - kind = "tax" when the type carries taxRateChange, else "primary".
 *  - allowedScope = nationalOnly ? "national" : "both".
 *  - taxPolicy: scope/taxType from taxRateChange; min/max/step from the
 *    authored policyOptions rates; baselineRate = the option the preset's
 *    budget policyDefaults selects (2019-default, else 1991-default), else
 *    the median option (documented per entry).
 *  - targets: effectTargetsWeighted mapped through ADAPTER_TIER1 to political
 *    families (the DECAY channel policyEffects/phases.ts consumes). Unmapped
 *    legacy ids are kept verbatim so the intent is visible.
 *  - status: every generated entry is "unavailable" (PORT-STUB). The catalog
 *    contract (legislation.test.ts) is that an available bill carries a
 *    hand-authored immediate `effect` (economy / partySupport); deriving one
 *    mechanically would invent numbers. Entries whose every target maps
 *    through ADAPTER_TIER1 name blockingSystem "legislation/effectDescriptor"
 *    (targets ready for the DECAY channel, effect pending); the rest name
 *    "politicalMetrics/<unmapped ids>". Tax entries carry their taxPolicy ladder but the
 *    rate write itself is PORT-STUB in billLifecycle.ts (budget/taxRateLadder),
 *    so they get no special availability. No immediate `effect` descriptor is derived (those
 *    were hand-authored for US; deriving them mechanically would invent
 *    numbers).
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { jpLegislationTypes } from "@/lib/seeds/jp/jpLegislationTypes";
import { deLegislationTypes } from "@/lib/seeds/de/deLegislationTypes";
import { ieLegislationTypes } from "@/lib/seeds/ie/ieLegislationTypes";
import { cnLegislationTypes } from "@/lib/seeds/cn/cnLegislationTypes";
import { brLegislationTypes } from "@/lib/seeds/br/brLegislationTypes";
import { ADAPTER_TIER1 } from "@/lib/politicalLegislation/marginAdapter";
import { getNationalBudgetSeedConfigsForPreset } from "@/lib/seeds/reference/budgets";

const OUT = path.resolve(import.meta.dirname, "../../engine/src/legislation");

type Opt = { id: string; name: string; rate?: number; economic?: number; social?: number; effectDirection?: number };
type LT = { _id: string; name: string; description?: string; policyDomain?: string; nationalOnly?: boolean; effectTargetsWeighted?: Array<{ metricCategoryId: string; metricId: string; weight: number }>; taxRateChange?: { scope: string; taxType: string }; policyOptions?: Opt[]; isPermanent?: boolean; source?: string };

const adapter = ADAPTER_TIER1 as Record<string, string>;
const q = (s: string) => JSON.stringify(s);

function policyDefaultsFor(c: string): Record<string, { economic: number; social: number }> {
  for (const preset of ["2019-default", "1991-default"]) {
    const cfg = (getNationalBudgetSeedConfigsForPreset(preset) as Array<{ countryId: string; policyDefaults?: Record<string, { economic: number; social: number }> }>).find((b) => b.countryId === c);
    if (cfg?.policyDefaults) return cfg.policyDefaults;
  }
  return {};
}

function emit(c: string, types: LT[]): void {
  const defaults = policyDefaultsFor(c);
  const lines: string[] = [
    `import type { CatalogEntry } from "./catalog.js";`,
    "/**",
    ` * ${c} legislation catalog. Generated from mainline AHDGame — DO NOT HAND-EDIT.`,
    " * Generator: packages/content/scripts/generateCatalogs.ts",
    ` * Source: src/lib/seeds/${c.toLowerCase()}/${c.toLowerCase()}LegislationTypes.ts (${types.length} types),`,
    " * src/lib/politicalLegislation/marginAdapter.ts ADAPTER_TIER1 (target mapping),",
    " * src/lib/seeds/reference/budgets.ts policyDefaults (tax baselines). See the",
    " * generator header for the mapping rules and the PORT-STUB convention.",
    " */",
    `export const CATALOG_${c}: CatalogEntry[] = [`,
  ];
  let available = 0, tax = 0;
  const seen = new Set<string>();
  for (const t of types) {
    if (seen.has(t._id)) continue;
    seen.add(t._id);
    const targets: Array<{ metricId: string; weight: number }> = [];
    const unmapped: string[] = [];
    const acc = new Map<string, number>();
    for (const e of t.effectTargetsWeighted ?? []) {
      const legacy = `${e.metricCategoryId}.${e.metricId}`;
      const fam = adapter[legacy];
      if (fam) acc.set(fam, (acc.get(fam) ?? 0) + e.weight);
      else { acc.set(legacy, (acc.get(legacy) ?? 0) + e.weight); unmapped.push(legacy); }
    }
    for (const [metricId, weight] of acc) targets.push({ metricId, weight: Math.round(weight * 100) / 100 });
    const isTax = !!t.taxRateChange;
    let taxPolicy = "";
    let taxNote = "";
    if (isTax) {
      const rates = (t.policyOptions ?? []).map((o) => o.rate).filter((r): r is number => typeof r === "number").sort((a, b) => a - b);
      const min = rates[0] ?? 0, max = rates[rates.length - 1] ?? 0;
      let step = 0;
      for (let i = 1; i < rates.length; i++) { const d = rates[i]! - rates[i - 1]!; if (d > 0 && (step === 0 || d < step)) step = d; }
      const d = defaults[t._id];
      let base: number | undefined;
      if (d) {
        const opt = (t.policyOptions ?? []).find((o) => o.economic === d.economic && o.social === d.social && typeof o.rate === "number");
        if (opt) { base = opt.rate; taxNote = `baselineRate from budget policyDefaults option ${opt.id}`; }
      }
      if (base === undefined) { base = rates[Math.floor(rates.length / 2)] ?? 0; taxNote = "baselineRate = median authored option (no policyDefaults entry for this preset; PORT-STUB)"; }
      taxPolicy = `    taxPolicy: { scope: ${q(t.taxRateChange!.scope)}, taxType: ${q(t.taxRateChange!.taxType)}, minRate: ${min}, maxRate: ${max}, step: ${step || 1}, baselineRate: ${base} },\n`;
      tax++;
    }
    const mapped = targets.length > 0 && unmapped.length === 0;
    if (mapped) available++;
    const isAvailable = false;
    const blocker = mapped ? "legislation/effectDescriptor" : "politicalMetrics/" + unmapped.join(",");
    lines.push(
      "  {",
      `    // source: ${t.source ?? `${c.toLowerCase()}LegislationTypes.ts ${t._id}`}${taxNote ? `; ${taxNote}` : ""}`,
      `    id: ${q(t._id)},`,
      `    countryId: ${q(c)},`,
      `    kind: ${q(isTax ? "tax" : "primary")},`,
      `    title: ${q(t.name)},`,
      `    description: ${q(t.description ?? "")},`,
      `    category: ${q(t.policyDomain ?? "governance")},`,
      `    allowedScope: ${q(t.nationalOnly ? "national" : "both")},`,
      ...(taxPolicy ? [taxPolicy.trimEnd()] : []),
      `    targets: ${JSON.stringify(targets)},`,
      `    status: ${q(isAvailable ? "available" : "unavailable")},`,
      ...(isAvailable ? [] : [`    blockingSystem: ${q(blocker)},`]),
      "  },",
    );
  }
  lines.push("];", "");
  fs.writeFileSync(path.join(OUT, `catalogPorted${c}.ts`), lines.join("\n"));
  console.log(`wrote catalogPorted${c}.ts: ${seen.size} entries (all PORT-STUB; ${available} with fully mapped targets, ${tax} tax)`);
}

emit("JP", jpLegislationTypes as unknown as LT[]);
emit("DE", deLegislationTypes as unknown as LT[]);
emit("IE", ieLegislationTypes as unknown as LT[]);
emit("CN", cnLegislationTypes as unknown as LT[]);
emit("BR", brLegislationTypes as unknown as LT[]);
console.log("done");
