/**
 * Union founding + seeding — W15.
 *
 * One union per (playable country, nonzero-weight 1953 sector) pair,
 * matching Corporation seeding granularity (see corporation/founding.ts).
 * Names from historical table where authored, else generic fallback
 * (see unionNames.ts genericUnionName).
 *
 * Source: <mainline-checkout>/src/lib/seeds/reference/unionNames.ts
 *         <mainline-checkout>/src/lib/unions/unionNames.ts genericUnionName / getUnionName
 *         <mainline-checkout>/src/lib/constants/corporations.ts CORPORATION_TYPES
 *         corporation/sectorSeedWeights1953.ts SECTOR_WEIGHTS_1953
 */

import { CORPORATION_TYPES, type CorporationType } from "../corporation/types.js";
import { SECTOR_WEIGHTS_1953 } from "../corporation/sectorSeedWeights1953.js";
import type { Union } from "./types.js";
import {
  UNION_DEFAULT_TREASURY,
  UNION_DEFAULT_APPROVAL,
  UNION_DEFAULT_DUES,
  UNION_DEFAULT_SERVICES,
  UNION_DEFAULT_POLITICAL_PCT,
  UNION_DEFAULT_UNIONIZATION,
} from "./types.js";

/**
 * Minimal historical union name table for 1953 era, covering the four playable
 * countries in this worktree (US/UK/RU/DD). Drawn from
 * src/lib/seeds/reference/unionNames.ts UNION_NAMES_BY_ERA["1953"].
 * Where no historical entry existed for a pair, the table entry is absent and
 * genericUnionName is used (preferred over inventing a fake historical union).
 *
 * Extracted for 1953 only. The 1979/1991/2019 packs reuse this same table
 * (and SECTOR_WEIGHTS_1953 below) rather than mainline's own
 * sectorSeedWeights{1979,1991,2019}.ts / UNION_NAMES_BY_ERA entries for
 * those eras — porting union sector weights and historical names per era is
 * a genuine, documented gap deferred to a future wave, not something this
 * fix invents. Any pair with no historical entry (including every pair in
 * every non-1953 era right now) falls back to genericUnionName, never a
 * fabricated historical name.
 */
const HISTORICAL_1953: Record<string, Partial<Record<CorporationType, string>>> = {
  US: {
    manufacturing: "United Steelworkers",
    automobiles: "United Auto Workers",
    extraction: "United Mine Workers of America",
    energy: "Utility Workers Union of America",
    construction: "United Brotherhood of Carpenters and Joiners",
    agriculture: "United Farm Workers",
    healthcare: "National Nurses United",
    retail: "United Food and Commercial Workers",
    logistics: "International Brotherhood of Teamsters",
    media: "NewsGuild-CWA",
    defense: "International Association of Machinists and Aerospace Workers",
    entertainment: "SAG-AFTRA",
    telecommunications: "Communications Workers of America",
    chemical_industries: "United Steelworkers",
    technology: "Communications Workers of America",
    financial: "United Steelworkers",
    real_estate: "United Brotherhood of Carpenters and Joiners",
  },
  UK: {
    manufacturing: "Amalgamated Engineering Union",
    automobiles: "Amalgamated Engineering Union",
    extraction: "National Union of Mineworkers",
    energy: "GMB",
    construction: "Amalgamated Union of Building Trade Workers",
    agriculture: "National Union of Agricultural Workers",
    healthcare: "Confederation of Health Service Employees",
    retail: "Union of Shop, Distributive and Allied Workers",
    logistics: "Transport and General Workers' Union",
    media: "National Union of Journalists",
    defense: "Amalgamated Engineering Union",
    entertainment: "Equity",
    telecommunications: "Union of Communication Workers",
    chemical_industries: "Transport and General Workers' Union",
    technology: "Association of Scientific Workers",
    financial: "Banking, Insurance and Finance Union",
    real_estate: "Amalgamated Union of Building Trade Workers",
  },
  RU: {
    manufacturing: "Federation of Independent Trade Unions of Russia",
    automobiles: "Federation of Independent Trade Unions of Russia",
    extraction: "Russian Independent Coal Employees' Union",
    energy: "Trade Union of Russian Fuel and Energy Sector Workers",
    construction: "Building Workers' Union of Russia",
    agriculture: "Agro-Industrial Workers' Union of Russia",
    healthcare: "Trade Union of Health Workers of Russia",
    retail: "Trade Union of Workers of Trade and Public Catering",
    logistics: "Russian Trade Union of Railwaymen and Transport Builders",
    media: "Interregional Trade Union of Media Workers",
    chemical_industries: "Federation of Independent Trade Unions of Russia",
    technology: "Federation of Independent Trade Unions of Russia",
    financial: "Trade Union of Workers of the Banking Sector",
    telecommunications: "Federation of Independent Trade Unions of Russia",
    entertainment: "Interregional Trade Union of Culture Workers",
    defense: "Federation of Independent Trade Unions of Russia",
    real_estate: "Building Workers' Union of Russia",
  },
  DD: {
    financial: "Free German Trade Union Federation",
    manufacturing: "Free German Trade Union Federation",
    media: "Free German Trade Union Federation",
    chemical_industries: "Free German Trade Union Federation",
    healthcare: "Free German Trade Union Federation",
    retail: "Free German Trade Union Federation",
    automobiles: "Free German Trade Union Federation",
    technology: "Free German Trade Union Federation",
    energy: "Free German Trade Union Federation",
    agriculture: "Free German Trade Union Federation",
    real_estate: "Free German Trade Union Federation",
    construction: "Free German Trade Union Federation",
    defense: "Free German Trade Union Federation",
    telecommunications: "Free German Trade Union Federation",
    entertainment: "Free German Trade Union Federation",
    logistics: "Free German Trade Union Federation",
    extraction: "Free German Trade Union Federation",
  },
};

const SECTOR_LABELS: Record<CorporationType, string> = {
  financial: "Financial",
  media: "Media",
  manufacturing: "Manufacturing",
  chemical_industries: "Chemical Industries",
  healthcare: "Healthcare",
  retail: "Retail",
  automobiles: "Automobiles",
  technology: "Technology",
  energy: "Energy",
  agriculture: "Agriculture",
  real_estate: "Real Estate",
  construction: "Construction",
  defense: "Defense",
  telecommunications: "Telecommunications",
  entertainment: "Entertainment",
  logistics: "Logistics",
  extraction: "Extraction",
};

export function genericUnionName(countryId: string, sectorType: CorporationType): string {
  const sector = SECTOR_LABELS[sectorType] ?? sectorType;
  return `${countryId} ${sector} Workers' Union`;
}

export function getUnionName(countryId: string, sectorType: CorporationType, _era: string = "1953"): string {
  const hist = HISTORICAL_1953[countryId]?.[sectorType];
  if (hist) return hist;
  return genericUnionName(countryId, sectorType);
}

export interface FoundingCountryInput {
  id: string;
  playable: boolean;
}

export function seedUnions(
  countries: readonly FoundingCountryInput[],
  era: string = "1953",
): Record<string, Union> {
  const unions: Record<string, Union> = {};
  const sorted = [...countries].filter((c) => c.playable).sort((a, b) => a.id.localeCompare(b.id));

  for (const country of sorted) {
    const weights = SECTOR_WEIGHTS_1953[country.id];
    if (!weights) continue;

    for (const sectorType of CORPORATION_TYPES) {
      const rawWeight = weights[sectorType as CorporationType];
      if (!rawWeight || rawWeight <= 0) continue;

      const id = `${country.id}-${sectorType}`;
      unions[id] = {
        id,
        countryId: country.id,
        sectorType,
        name: getUnionName(country.id, sectorType, era),
        treasury: UNION_DEFAULT_TREASURY,
        approval: UNION_DEFAULT_APPROVAL,
        duesPerWorkerAnnual: UNION_DEFAULT_DUES,
        activeServices: [...UNION_DEFAULT_SERVICES],
        politicalContributionPct: UNION_DEFAULT_POLITICAL_PCT,
        unionization: UNION_DEFAULT_UNIONIZATION,
        ownerType: null,
        ownerId: null,
        createdAtTurn: 0,
        updatedAtTurn: 0,
      };
    }
  }

  return unions;
}
