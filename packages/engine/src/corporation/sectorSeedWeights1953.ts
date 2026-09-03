/**
 * 1953 national sector weights for the four playable countries, verbatim from
 * mainline. Source: <mainline-checkout>/src/lib/seeds/reference/
 * sectorSeedWeights1953.ts COUNTRY_SECTOR_WEIGHTS_1953.
 *
 * Values are "relative percentage-of-GDP allocations across the 17 game
 * sectors, calibrated to ~1953 BEA value-added shares" (mainline file doc,
 * lines 10-32) — i.e. each raw number is directly a percent-of-GDP share
 * (they sum to roughly, not exactly, 100 per country; mainline itself
 * normalizes at read time via getCountrySectorWeights1953, dividing by the
 * per-country total). founding.ts uses the RAW numbers divided by 100 as the
 * fraction of national GDP one sector's founding NPC corporation captures —
 * see founding.ts file doc for why W9 uses the raw share directly rather than
 * reproducing mainline's per-state computeUnownedSeedRevenue pipeline
 * (SECTOR_SEED_SCALE, era floor, FX): AHDClient has no per-state GDP for three
 * of the four playable countries (UK/RU/DD regions are opaque, see
 * types.ts Region doc) and no unowned-sector-pool/market-tier system to
 * distribute revenue through, so W9 founds exactly one national corp per
 * nonzero-weight sector per playable country, sized at its full GDP share.
 *
 * RU uses mainline's "SU" bundle (RU is aliased to SU via
 * BUNDLE_KEY_ALIASES_1953 = { RU: "SU" } in the source file — mainline's
 * internal Soviet Union country id is SU, matched to AHDClient's RU).
 *
 * Sectors omitted from a country's map (not listed below) had mainline weight
 * 0 for that country ("essentially zero commercial sector" — e.g. technology
 * pre-silicon, or RU/automobiles negligible consumer auto industry under
 * central planning) and get no founding corporation, matching mainline's own
 * "technology: 0" annotations.
 */

import type { CorporationType } from "./types.js";

export const SECTOR_WEIGHTS_1953: Record<string, Partial<Record<CorporationType, number>>> = {
  // Source: sectorSeedWeights1953.ts:47-64 (US block).
  US: {
    manufacturing: 26,
    defense: 14,
    automobiles: 10,
    agriculture: 8,
    energy: 7,
    construction: 6,
    chemical_industries: 5,
    retail: 5,
    real_estate: 4,
    logistics: 8,
    financial: 3,
    healthcare: 2,
    media: 2,
    telecommunications: 2,
    entertainment: 2,
    extraction: 2,
    // technology: 0 — omitted (ENIAC-era, no commercial sector)
  },
  // Source: sectorSeedWeights1953.ts:65-83 (UK block).
  UK: {
    manufacturing: 28,
    energy: 10,
    construction: 8,
    agriculture: 6,
    chemical_industries: 6,
    logistics: 5,
    retail: 5,
    financial: 5,
    defense: 4,
    real_estate: 4,
    automobiles: 3,
    telecommunications: 2,
    media: 2,
    healthcare: 2,
    extraction: 2,
    entertainment: 2,
    // technology: 0 — omitted (Ferranti Mark 1, no commercial market)
  },
  // Source: sectorSeedWeights1953.ts:337-355 (SU block; RU aliases to SU).
  RU: {
    manufacturing: 25,
    defense: 18,
    energy: 12,
    construction: 10,
    agriculture: 8,
    extraction: 8,
    chemical_industries: 5,
    logistics: 5,
    telecommunications: 2,
    media: 2,
    financial: 1,
    real_estate: 1,
    healthcare: 1,
    retail: 1,
    // automobiles: 0 — omitted (Moskvitch/GAZ/Zil, negligible consumer auto)
    // technology: 0 — omitted (BESM-1, no commercial market)
    // entertainment: 0 — omitted (approved culture only, no commercial sector)
  },
  // Source: sectorSeedWeights1953.ts:357-376 (DD block).
  DD: {
    manufacturing: 28,
    chemical_industries: 8,
    extraction: 8,
    defense: 12,
    energy: 6,
    agriculture: 8,
    construction: 6,
    logistics: 4,
    healthcare: 4,
    automobiles: 2,
    technology: 1,
    retail: 2,
    media: 1,
    financial: 1,
    real_estate: 1,
    telecommunications: 1,
    entertainment: 1,
  },
};
