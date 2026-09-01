/**
 * Forex turn phase — W4 port of src/lib/turn/forexTurn.ts processForexTurn.
 *
 * Solo is a pure in-memory phase: no DB, no volumes, no tradeHistory.
 * Reads: centralBanks primeRate, countries economy (inflation/growth), exchangeRates current.
 * Writes: exchangeRates updated rates + history.
 *
 * Era awareness: initial peg from INITIAL_RATES_1953 (preset-keyed), Bretton
 * Woods peg regime for 1953 (managed peg vs float), rate evolution from
 * inflation differentials + central bank policy (the systems that exist).
 * See constants.ts and regime.ts citations.
 *
 * Command-economy currencies (SUR/DDM) are non-convertible pegs held at baseRate
 * regardless of macro (see regime.ts shouldHoldPeg). Admin hardPeg not yet
 * ported (no admin surface); the structure is there for it.
 */

import type { WorldState } from "../types.js";
import type { WorldRng } from "../rng.js";
import {
  INITIAL_RATES_1953,
  RATE_NOISE_MAX,
} from "./constants.js";
import { clampToRegimeBand, driftMultiplierForRegime, regimeForEra, shouldHoldPeg } from "./regime.js";
import { computeRateUpdate } from "./rateCalculation.js";
import type { ExchangeRate } from "./types.js";

function finiteOr(v: unknown, fb: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fb;
}

export function forexTurnPhase(world: WorldState, rng: WorldRng): void {
  const era = world.meta.era ?? "1953";
  const regime = regimeForEra(era);
  const driftMult = driftMultiplierForRegime(regime);

  for (const [countryId, ex] of Object.entries(world.exchangeRates ?? {})) {
    const country = world.countries[countryId];
    const bank = world.centralBanks[countryId];
    if (!country || !bank) continue;

    const baseRate = finiteOr((ex as ExchangeRate).baseRate, INITIAL_RATES_1953[countryId] ?? 1);
    let currentRate = finiteOr((ex as ExchangeRate).rate, baseRate);

    // Hard peg short-circuit: command-economy & 1953 Bretton Woods peg holds par
    // Do NOT drift — the rate is the parity. This mirrors mainline's
    // hardPeg / isCommandEconomy pegActive short-circuit in forexTurn.ts
    // (peggedRate != null → skip drift). For 1953, every non-command currency
    // is also pegged at par per regime.ts; that is the Bretton Woods contract:
    // managed pegs, not floats.
    if (shouldHoldPeg(ex as ExchangeRate, regime)) {
      // Still refresh macroTarget for bookkeeping (what the float would target)
      const macro = {
        primeRate: finiteOr(bank.primeRate, 0),
        inflationRate: finiteOr(country.economy.inflationRate * 100, 0),
        gdpGrowth: finiteOr(country.economy.growthRate * 100, 0),
        tradeGrowth: 0,
      };
      const { macroTarget } = computeRateUpdate(currentRate, baseRate, countryId, macro, 0, era, driftMult);
      (ex as ExchangeRate).macroTarget = macroTarget;
      // Pegged rate stays at baseRate but within the Bretton Woods band
      // (for 1953 band 1%, this is baseRate itself; future devaluation would widen)
      (ex as ExchangeRate).rate = clampToRegimeBand(baseRate, baseRate, regime);
      (ex as ExchangeRate).rateHistory = [...((ex as ExchangeRate).rateHistory ?? []), { turn: world.meta.turn, rate: (ex as ExchangeRate).rate }].slice(-120);
      (ex as ExchangeRate).updatedTurn = world.meta.turn;
      continue;
    }

    // Floating: full drift + deterministic noise + guardrail
    const macro = {
      primeRate: finiteOr(bank.primeRate, 0),
      inflationRate: finiteOr(country.economy.inflationRate * 100, 0),
      gdpGrowth: finiteOr(country.economy.growthRate * 100, 0),
      tradeGrowth: 0,
    };
    // Deterministic noise in [-RATE_NOISE_MAX, +RATE_NOISE_MAX] via WorldRng
    const unit = rng.next() * 2 - 1; // rng.next() in [0,1)
    const noise = unit * RATE_NOISE_MAX;
    const { rate: drifted, macroTarget } = computeRateUpdate(currentRate, baseRate, countryId, macro, noise, era, driftMult);
    const clamped = clampToRegimeBand(drifted, baseRate, regime);
    (ex as ExchangeRate).rate = clamped;
    (ex as ExchangeRate).macroTarget = macroTarget;
    (ex as ExchangeRate).rateHistory = [...((ex as ExchangeRate).rateHistory ?? []), { turn: world.meta.turn, rate: clamped }].slice(-120);
    (ex as ExchangeRate).updatedTurn = world.meta.turn;
  }
}
