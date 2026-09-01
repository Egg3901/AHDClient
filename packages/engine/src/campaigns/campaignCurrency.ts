/**
 * Campaign treasury currency helpers (W26).
 * Ported from src/lib/campaigns/campaignCurrency.ts. Cost/income/maintenance
 * constants (upgradeCosts.ts) are anchor $; the stored Campaign.funds is
 * LOCAL currency. Conversion uses the FROZEN base rate table
 * (INITIAL_RATES), never live forex — campaign funds are deliberately
 * decoupled from market drift, matching mainline's documented behavior
 * ("intentionally NOT preset-aware").
 *
 * Restricted to solo's playable + campaign-eligible-adjacent countries
 * (US/UK/RU/DD) plus the rest of mainline's INITIAL_RATES table for
 * fidelity — solo only ever creates campaigns for US house/senate this wave
 * (isCampaignEligible.ts), so only US (rate 1.0) is load-bearing today.
 */

// source: src/lib/constants/currencies.ts INITIAL_RATES (base/1953-anchored table)
const INITIAL_RATES: Readonly<Record<string, number>> = {
  US: 1.0,
  UK: 0.75,
  JP: 106.0,
  DE: 0.92,
  IE: 0.92,
  BR: 5.0,
  CN: 7.2,
  NG: 1550,
  RU: 2.22,
  DD: 2.22,
  FR: 4.2,
  IT: 833,
  ES: 67,
  SE: 4.29,
  TR: 34.5,
  GR: 37.0,
  AT: 13.4,
  FI: 3.9,
  SCO: 0.75,
  WAL: 0.75,
};

/** Frozen base local-per-anchor rate. Falls back to 1.0 (US parity) for unmapped countries. */
export function campaignLocalRate(countryId: string): number {
  return INITIAL_RATES[countryId] ?? 1.0;
}

/** Convert an anchor campaign amount to local currency at the frozen base rate. */
export function campaignAnchorToLocal(anchor: number, countryId: string): number {
  return Math.round(anchor * campaignLocalRate(countryId));
}

/** Convert a local campaign amount back to anchor at the frozen base rate. */
export function campaignLocalToAnchor(local: number, countryId: string): number {
  const rate = campaignLocalRate(countryId);
  return rate !== 1 ? local / rate : local;
}
