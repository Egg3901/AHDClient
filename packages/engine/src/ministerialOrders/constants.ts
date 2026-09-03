/**
 * MinisterialOrders constants — port of the metric-modifier accumulation/cap
 * logic from src/lib/turn/ministerialOrderProcessing.ts, plus the per-metric
 * span table from src/lib/utils/metricScoring.ts THRESHOLDS.
 *
 * Mainline's ministerialOrderProcessing.ts also runs a large defense/military
 * turn sub-pipeline (appropriation, deliveries, refit, nuclear production,
 * covert nuclear, battle resolution, cold-war holds, peace windows,
 * reinforcement) bundled in the same phase function. AHDClient has no unit-
 * level military system, so only the metric-modifier accumulation/cap logic
 * (ministerialOrderProcessing.ts lines ~77-108, 556-564) is ported here —
 * PORT-STUB, named blocker: military/unitCombat (the defense sub-pipeline
 * has no AHDClient equivalent; see coldWar/nuclear.ts for the pure nuclear-math
 * slice that IS ported).
 */

/** Source: ministerialOrderProcessing.ts:77 — raised 0.05->0.08 in mainline #0800. */
export const MAX_PER_METRIC_MODIFIER_PER_TURN = 0.08;

/** Source: ministerialOrderProcessing.ts:88 — uniform +25% multiplier, applied before the cap. */
export const CABINET_EFFECT_STRENGTH = 1.25;

export interface ScoreThreshold {
  best: number;
  worst: number;
}

/**
 * Per-metric best/worst band, used only to derive modifierSpanScale here.
 * Source: src/lib/utils/metricScoring.ts THRESHOLDS (ported verbatim; the
 * player-facing scoring math itself — applyThreshold/computeMetricScore — is
 * out of scope for W28 and not ported).
 */
export const THRESHOLDS: Record<string, ScoreThreshold> = {
  // Economic
  unemploymentRate: { best: 2, worst: 15 },
  medianIncome: { best: 90000, worst: 15000 },
  gdpGrowth: { best: 5, worst: -3 },
  wageGrowth: { best: 6, worst: -2 },
  tradeGrowth: { best: 5, worst: -5 },
  povertyRate: { best: 4, worst: 25 },
  costOfLiving: { best: 70, worst: 165 },
  smallBusinessFormation: { best: 8, worst: 1 },
  tradeBalance: { best: 8, worst: -8 },
  productivityGrowth: { best: 4, worst: -2 },
  rdIntensity: { best: 4.5, worst: 0.5 },
  exportDependency: { best: 30, worst: 55 },
  manufacturingCompetitiveness: { best: 90, worst: 40 },
  // Education
  highSchoolGradRate: { best: 97, worst: 60 },
  universityEnrollment: { best: 85, worst: 25 },
  testPerformance: { best: 125, worst: 75 },
  educationSpending: { best: 15000, worst: 3000 },
  literacyRate: { best: 99, worst: 82 },
  workforceSkill: { best: 90, worst: 30 },
  apprenticeshipRate: { best: 6, worst: 1 },
  // Healthcare
  uninsuredRate: { best: 0, worst: 22 },
  affordabilityIndex: { best: 90, worst: 30 },
  physicianRate: { best: 5, worst: 1 },
  lifeExpectancy: { best: 85, worst: 70 },
  preventableMortality: { best: 120, worst: 500 },
  publicHealthPreparedness: { best: 90, worst: 30 },
  // Infrastructure
  roadCondition: { best: 90, worst: 40 },
  broadbandAccess: { best: 99, worst: 50 },
  publicTransit: { best: 90, worst: 15 },
  waterQuality: { best: 99, worst: 70 },
  powerGridReliability: { best: 99.9, worst: 97 },
  infrastructureInvestmentGap: { best: 5, worst: 45 },
  // Public Safety
  crimeRate: { best: 1500, worst: 11000 },
  violentCrimeRate: { best: 80, worst: 700 },
  policePerCapita: { best: 5, worst: 1 },
  incarcerationRate: { best: 50, worst: 800 },
  recidivismRate: { best: 15, worst: 70 },
  publicSafetyConfidence: { best: 85, worst: 30 },
  firearmRights: { best: 90, worst: 10 },
  // Environment
  airQuality: { best: 8, worst: 80 },
  renewableEnergy: { best: 80, worst: 5 },
  carbonEmissions: { best: 3, worst: 25 },
  recyclingRate: { best: 70, worst: 10 },
  climateResilience: { best: 90, worst: 30 },
  protectedLand: { best: 50, worst: 3 },
  energyTransitionProgress: { best: 90, worst: 20 },
  // Social
  economicFreedom: { best: 85, worst: 25 },
  regulatoryBurden: { best: 20, worst: 80 },
  socialMobility: { best: 80, worst: 20 },
  incomeInequality: { best: 24, worst: 55 },
  homelessnessRate: { best: 2, worst: 55 },
  housingAffordability: { best: 15, worst: 70 },
  foodInsecurity: { best: 4, worst: 22 },
  civicParticipation: { best: 80, worst: 30 },
  socialCohesion: { best: 85, worst: 30 },
  housingSupplyGrowth: { best: 5, worst: -1 },
  // Governance
  governmentTransparency: { best: 90, worst: 30 },
  budgetBalance: { best: 3, worst: -8 },
  debtToGdp: { best: 20, worst: 140 },
  corruptionIndex: { best: 10, worst: 70 },
  voterTurnout: { best: 85, worst: 30 },
  publicTrust: { best: 80, worst: 20 },
  civilLiberties: { best: 85, worst: 25 },
  nationalPride: { best: 80, worst: 30 },
  militaryReadiness: { best: 85, worst: 25 },
  borderSecurity: { best: 85, worst: 20 },
  coDeterminationQuality: { best: 85, worst: 30 },
  // Population
  populationGrowth: { best: 2, worst: -1 },
  urbanizationRate: { best: 92, worst: 25 },
  medianAge: { best: 30, worst: 52 },
  migrationRate: { best: 2, worst: -1.5 },
  // Media & Information
  mediaPolarization: { best: 10, worst: 80 },
  stateMediaControl: { best: 10, worst: 85 },
  disinformationRisk: { best: 10, worst: 70 },
  pressFreedom: { best: 92, worst: 25 },
  socialMediaSentiment: { best: 15, worst: -15 },
};

/**
 * Scale factor for a metric's applied modifier, from the leaf name of a
 * dotted metric path (e.g. "economic.gdpGrowth" -> "gdpGrowth"). Large-range
 * metrics (medianIncome, educationSpending, crimeRate) get their cap scaled
 * up by span/100 so an order-authored 0-100-point magnitude isn't inert
 * against a real-unit metric. Source: ministerialOrderProcessing.ts:101-108.
 */
export function modifierSpanScale(metricPath: string): number {
  const leaf = metricPath.includes(".") ? metricPath.slice(metricPath.lastIndexOf(".") + 1) : metricPath;
  const t = THRESHOLDS[leaf];
  if (!t) return 1;
  return Math.max(1, Math.abs(t.worst - t.best) / 100);
}

/**
 * Boost a raw combined modifier by CABINET_EFFECT_STRENGTH, then cap at
 * ±MAX_PER_METRIC_MODIFIER_PER_TURN — before span-scaling. Source:
 * ministerialOrderProcessing.ts:556-564.
 */
export function clampCabinetModifier(modifier: number): number {
  const boosted = modifier * CABINET_EFFECT_STRENGTH;
  return Math.max(-MAX_PER_METRIC_MODIFIER_PER_TURN, Math.min(MAX_PER_METRIC_MODIFIER_PER_TURN, boosted));
}
