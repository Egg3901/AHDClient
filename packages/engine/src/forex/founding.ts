/**
 * Seed exchange rates — W4 port.
 *
 * Seeded per-era from getInitialRatesForEra (1953/1979/1991/2019 tables,
 * each verbatim from mainline), with fallback to 1 for a country missing
 * from its era's table. See constants.ts citation. No invented numbers.
 */

import type { ExchangeRate } from "./types.js";
import { CURRENCY_CODE_BY_COUNTRY, getInitialRatesForEra } from "./constants.js";
import { regimeForEra } from "./regime.js";

export function seedExchangeRates(
  countries: Array<{ id: string }>,
  era: string,
): Record<string, ExchangeRate> {
  const regime = regimeForEra(era);
  const initialRates = getInitialRatesForEra(era);
  const rates: Record<string, ExchangeRate> = {};
  for (const c of countries) {
    const currencyCode = CURRENCY_CODE_BY_COUNTRY[c.id] ?? "USD";
    // This era's table is authoritative; a country missing from it falls
    // back to 1 (anchor passthrough). Mirrors mainline's
    // getInitialRates(preset) lookup — era-aware anchor, not modern default.
    const baseRate = initialRates[c.id] ?? 1;
    rates[c.id] = {
      countryId: c.id,
      currencyCode,
      rate: baseRate,
      baseRate,
      macroTarget: baseRate,
      rateHistory: [{ turn: 0, rate: baseRate }],
      regime: regime === "pegged" ? "pegged" : "floating",
      updatedTurn: 0,
    };
  }
  return rates;
}
