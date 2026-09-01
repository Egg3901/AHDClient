/**
 * Metric era activation gates — thin port of src/lib/era/metricCatalog.ts
 * isMetricActive and getEraEnvelope.
 *
 * Each metric may have a window (from year, optional countries scope, optional
 * per-country overrides) and an envelope (ceiling for higher-is-better adoption
 * metrics while hidden). Era system flag off (year null) or window absent means
 * always active and no envelope — legacy byte-identical.
 *
 * Solo's metric families that have activation windows are cited inline; other
 * families are always active. The gates are pure and rng-free.
 *
 * Sources:
 *  - src/lib/era/metricCatalog.ts isMetricActive
 *  - src/lib/era/metricCatalog.ts getEraEnvelope
 *  - src/lib/era/metricCatalog.ts METRIC_ERA_WINDOWS (window table)
 *  - docs/superpowers/specs/2026-07-04-metric-era-catalog-design.md
 */

// Minimal window table ported for engine-resident metrics.
// Only metrics that belong to the W6 nationalMetrics families need entries
// here; others are treated as always active (METRIC_ERA_WINDOWS absent).
// Values are verbatim from src/lib/era/metricCatalog.ts METRIC_ERA_WINDOWS.

export interface EraWindow {
  from: number;
  countries?: string[];
  countryOverrides?: Record<string, { from: number }>;
}

export const METRIC_ERA_WINDOWS: Record<string, EraWindow> = {
  broadbandAccess: { from: 1998, countryOverrides: { NG: { from: 2008 } } },
  socialMediaSentiment: { from: 2004 },
  renewableEnergy: { from: 1974 },
  energyTransitionProgress: { from: 2000 },
  carbonEmissions: { from: 1990 },
  recyclingRate: { from: 1972 },
  climateResilience: { from: 2000 },
  nuclearSafety: { from: 1957, countryOverrides: { JP: { from: 1966 } } },
  roboticsAdoption: { from: 1980 },
  demographicDecline: { from: 1990 },
  foreignWorkerIntegration: { from: 1990, countryOverrides: { DE: { from: 1961 } } },
  mentalHealthAccess: { from: 1970 },
  devolutionSatisfaction: { from: 1999, countries: ["UK"] },
  antiSocialBehaviourRate: { from: 1998, countries: ["UK"] },
  schuldenbremseHeadroom: { from: 2009 },
  eastWestConvergence: { from: 1990 },
  euCohesionScore: { from: 1993 },
};

export function isMetricActive(metricId: string, countryId: string | undefined, year: number | null): boolean {
  if (year == null || !Number.isFinite(year)) return true;
  const w = METRIC_ERA_WINDOWS[metricId];
  if (!w) return true;
  if (w.countries && (!countryId || !w.countries.includes(countryId))) return true;
  const override = countryId ? w.countryOverrides?.[countryId] : undefined;
  return year >= (override?.from ?? w.from);
}

// Envelope is not wired for W6 value clamping (future wave); exported for cite completeness.
export function getEraEnvelopeStub(): null {
  return null;
}
