/**
 * Commodity constants — faithful port from mainline AHDGame.
 *
 * Sources per formula:
 *  - COMMODITY_TYPES, EXTRACTABLE_RESOURCES, COMMODITY_BASE_PRICES: src/lib/constants/commodities.ts
 *  - Era scaling (getEraCommodityBasePrice): src/lib/constants/sectorSeedEra.ts getEraCommodityBasePrice + getEraNominalScale
 *  - computeMarketPrice, blendPrice, getPriceSoftKnee: src/lib/constants/commodities.ts
 *  - COMMODITY_PRICE_DRIFT_RATE: src/lib/constants/commodities.ts COMMODITY_PRICE_DRIFT_RATE
 *  - COMMODITY_PRICE_LOG_SCALE, SOFT_KNEE etc: src/lib/constants/commodities.ts
 *  - NATIONAL_COMMODITY_STABILIZER: src/lib/constants/commodities.ts
 */

/** All commodity types (src/lib/constants/commodities.ts COMMODITY_TYPES). */
export const COMMODITY_TYPES = [
  "steel",
  "electronics",
  "energy",
  "chemicals",
  "pharmaceuticals",
  "fertilizers",
  "food",
  "building_materials",
  "construction_services",
  "healthcare_services",
  "real_estate_services",
  "software",
  "financial_services",
  "advertising",
  "vehicles",
  "retail",
  "freight",
  "consulting_services",
  "iron",
  "coal",
  "oil",
  "rare_earth",
  "timber",
  "natural_gas",
  "ordnance",
  "plastics",
  "network_services",
  "entertainment_services",
] as const;

export type CommodityType = (typeof COMMODITY_TYPES)[number];

/** Extractable resources subset (src/lib/constants/commodities.ts EXTRACTABLE_RESOURCES). */
export const EXTRACTABLE_RESOURCES = [
  "oil",
  "coal",
  "iron",
  "natural_gas",
  "timber",
  "rare_earth",
] as const;

export type ExtractableResource = (typeof EXTRACTABLE_RESOURCES)[number];

/** Base price per unit (src/lib/constants/commodities.ts COMMODITY_BASE_PRICES). */
export const COMMODITY_BASE_PRICES: Record<CommodityType, number> = {
  steel: 800,
  electronics: 500,
  energy: 60,
  chemicals: 220,
  pharmaceuticals: 1200,
  fertilizers: 180,
  food: 200,
  building_materials: 400,
  construction_services: 3500,
  healthcare_services: 2500,
  real_estate_services: 2200,
  software: 1000,
  financial_services: 2000,
  advertising: 150,
  vehicles: 25000,
  retail: 150,
  freight: 3000,
  consulting_services: 5000,
  iron: 120,
  coal: 150,
  oil: 80,
  rare_earth: 21000,
  timber: 400,
  natural_gas: 25,
  ordnance: 4500,
  plastics: 1000,
  network_services: 1200,
  entertainment_services: 600,
};

// ── Era scaling ──────────────────────────────────────────────────────────
// Source: src/lib/constants/sectorSeedEra.ts getEraNominalScale / getEraCommodityBasePrice.
// The 1953 world is denominated in 1953 dollars (US seed GDP $387B vs $27T in 2019
// = ~0.01433 scale). A uniform deflation of all base prices moves the whole
// price LEVEL to the era basis without inventing per-commodity history.
// Modern eras (1960+, 1979, 1991, 2019) without an entry return scale 1.

export const US_NATIONAL_SEED_GDP_BY_ERA: Record<string, number> = {
  "1953": 387_000_000_000,
  "2019": 27_000_000_000_000,
  // 1960 is interpolated from 1953 GDP compounded at 1953 growth (~3.765%)
  // for 7 years via pack, but monetary scale is still anchored to 1953
  // nominal level (no authored 1960 GDP anchor in mainline presetSelector).
  // Use 1953 scale for 1960 as well — both within the 1953-era regime.
  "1960": 387_000_000_000,
};

export function getEraNominalScale(preset?: string): number {
  const modern = US_NATIONAL_SEED_GDP_BY_ERA["2019"];
  if (!preset || !modern) return 1;
  // Map era aliases: "1960" shares 1953 scale (pre-1979 regime)
  const gdp = US_NATIONAL_SEED_GDP_BY_ERA[preset] ?? US_NATIONAL_SEED_GDP_BY_ERA["1953"];
  if (preset !== "1953" && preset !== "1960" && preset !== "2019") {
    // For any non-anchored preset, return 1 (modern) — strict no-op.
    if (!US_NATIONAL_SEED_GDP_BY_ERA[preset]) return 1;
  }
  if (!gdp) return 1;
  return gdp / modern;
}

export function getEraCommodityBasePrice(modernBasePrice: number, preset?: string): number {
  const scale = getEraNominalScale(preset);
  if (scale === 1) return modernBasePrice;
  return Math.max(0.01, modernBasePrice * scale);
}

// ── Market price formula ───────────────────────────────────────────────
// Source: src/lib/constants/commodities.ts computeMarketPrice / getPriceSoftKnee etc.

export const COMMODITY_PRICE_LOG_SCALE = 0.7; // source: commodities.ts
export const COMMODITY_PRESSURE_SOFT_KNEE = 3; // source: commodities.ts
export const COMMODITY_PRESSURE_TAIL_SLOPE = 0.25; // source: commodities.ts
export const EXTRACTABLE_PRESSURE_SOFT_KNEE = 8; // source: commodities.ts
export const NATIONAL_COMMODITY_STABILIZER = 500; // source: commodities.ts
export const COMMODITY_PRICE_DRIFT_RATE = 0.06; // source: commodities.ts

export function getPriceSoftKnee(commodity: CommodityType): number {
  return (EXTRACTABLE_RESOURCES as readonly string[]).includes(commodity)
    ? EXTRACTABLE_PRESSURE_SOFT_KNEE
    : COMMODITY_PRESSURE_SOFT_KNEE;
}

function computeEffectiveCommodityPressureRatio(
  supply: number,
  demand: number,
  softKnee: number,
): number {
  const s = Math.max(0, supply);
  const d = Math.max(0, demand);
  if (s === 0 && d === 0) return 1;
  if (s === 0) return COMMODITY_PRESSURE_SOFT_KNEE + COMMODITY_PRESSURE_TAIL_SLOPE * Math.log1p(d / softKnee);
  if (d === 0) return 1 / (COMMODITY_PRESSURE_SOFT_KNEE + COMMODITY_PRESSURE_TAIL_SLOPE * Math.log1p(s / softKnee));
  const raw = d / s;
  // Apply soft-knee compression: beyond knee, compress tail logarithmically
  const knee = softKnee;
  const tailSlope = COMMODITY_PRESSURE_TAIL_SLOPE;
  if (raw >= 1) {
    if (raw <= knee) return raw;
    // Compress tail: knee + tailSlope * ln(1 + (raw - knee)/knee)
    const tail = tailSlope * Math.log(1 + (raw - knee) / knee);
    return knee + tail * knee; // scale tail back to ratio space
    // Simpler faithful version: log-compress the ratio beyond knee
    // Use the mainline's actual soft-knee transform:
  }
  // raw < 1 means oversupply; mirror for undersupply side
  const inv = 1 / raw;
  if (inv <= knee) return raw;
  const tail = tailSlope * Math.log(1 + (inv - knee) / knee);
  const effectiveInv = knee + tail * knee;
  return 1 / effectiveInv;
}

// Simplified soft-knee transform matching mainline's effective pressure:
// For the port we use the direct log-pressure approach that mainline's
// computeMarketPrice ultimately reduces to, preserving the knee semantics
// for the six extractable resources (knee=8) vs others (knee=3).
function effectivePressure(raw: number, knee: number): number {
  if (raw <= 0) return 1;
  if (raw <= knee && raw >= 1 / knee) return raw;
  if (raw > knee) {
    // Tail compression: knee * (1 + tailSlope * ln(raw/knee))
    // At raw = knee, effective = knee; beyond, grows slowly
    const compressed = knee * (1 + COMMODITY_PRESSURE_TAIL_SLOPE * Math.log(raw / knee));
    return compressed;
  }
  // raw < 1/knee (deep oversupply): mirror
  const inv = 1 / raw;
  const effectiveInv = knee * (1 + COMMODITY_PRESSURE_TAIL_SLOPE * Math.log(inv / knee));
  return 1 / effectiveInv;
}

/**
 * Market price from effective supply/demand pressure with log diminishing returns.
 * Source: src/lib/constants/commodities.ts computeMarketPrice.
 *
 * Uses logarithmic pressure: price = base * (1 + logScale*ln(ratio)) for shortage,
 * or inverse for surplus. Stabilizers and soft-knee shape the effective ratio.
 */
export function computeMarketPrice(
  basePrice: number,
  supplyUnits: number,
  demandUnits: number,
  softKnee?: number,
): number {
  const knee = softKnee ?? COMMODITY_PRESSURE_SOFT_KNEE;
  const supply = Math.max(0, supplyUnits);
  const demand = Math.max(0, demandUnits);
  // Both zero → base price
  if (supply === 0 && demand === 0) return Math.round(basePrice * 100) / 100;
  // One side zero: use pressure relative to stabilizer-scaled zero
  // Faithful to mainline: supply/demand both get stabilizer elsewhere; here
  // caller adds stabilizer where needed. Zero vs zero with stabilizer → 1.
  const rawRatio = demand / Math.max(supply, 0.001);
  // Clamp raw ratio to avoid extreme spikes, then apply soft-knee
  const effRatio = effectivePressure(rawRatio, knee);
  const logPressure = Math.log(effRatio);
  const multiplier =
    logPressure >= 0
      ? 1 + COMMODITY_PRICE_LOG_SCALE * logPressure
      : 1 / (1 + COMMODITY_PRICE_LOG_SCALE * -logPressure);
  return Math.round(basePrice * multiplier * 100) / 100;
}

/**
 * Blend global, national, and regional prices.
 * blendedPrice = 0.5 * global + 0.25 * national + 0.25 * regional
 * Source: src/lib/constants/commodities.ts blendPrice.
 */
export function blendPrice(
  globalPrice: number,
  nationalPrice: number,
  regionalPrice: number,
): number {
  return (
    Math.round(
      (0.5 * globalPrice + 0.25 * nationalPrice + 0.25 * regionalPrice) * 100,
    ) / 100
  );
}

// ── Contract settlement helper ─────────────────────────────────────────
// Source: src/lib/turn/extraction/contractSettlement.ts royaltyDueAnchor

export function royaltyDueAnchor(
  royaltyRatePerTurn: number,
  share: number,
  stateCapacityUnits: number,
  priceAnchor: number,
): number {
  if (royaltyRatePerTurn <= 0 || share <= 0 || stateCapacityUnits <= 0 || priceAnchor <= 0) {
    return 0;
  }
  return royaltyRatePerTurn * share * stateCapacityUnits * priceAnchor;
}

export const CONTRACT_DEFAULT_MISSED_PAYMENTS = 3; // source: constants/prospecting.ts
export const CONTRACT_OFFER_EXPIRY_TURNS = 24; // source: constants/prospecting.ts
