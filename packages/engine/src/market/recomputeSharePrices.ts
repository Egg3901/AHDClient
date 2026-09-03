/**
 * recomputeSharePrices — W10. Re-prices every corp's shares each turn from
 * fresh, same-turn corp financials.
 *
 * Registered at the END of the phase list (registry.ts), just before
 * newsMaintenancePhase, per the same rng-stream-stability rule the
 * corporation, campaign, intra-party, government, presidential, and
 * cabinet/judiciary tail clusters already follow there — mainline runs
 * recomputeSharePrices mid-pipeline (turnPhaseNames.ts, after bondTurn);
 * inserting it there would shift every downstream rng draw for existing
 * goldens. This phase itself draws no rng (pure repricing), same as
 * corporationTurnPhase.
 *
 * Ordering vs corporationTurnPhase: this phase must run AFTER
 * corporationTurnPhase within the same turn (it reads corp.liquidCapital,
 * corp.currentGrowthRate, and corp.earningsHistory, all written by that
 * phase this same turn). registry.ts places it as the LAST phase before
 * newsMaintenancePhase — after every other tail cluster, including
 * corporationTurnPhase — which trivially guarantees the ordering (no other
 * phase in this worktree mutates world.corporations, so nothing in between
 * matters).
 *
 * Mainline's own recomputeSharePrices exists to fix a lag: it re-prices
 * AFTER bondTurn has applied coupon cash flows, because processCorporationTurn
 * already wrote a placeholder price before bondTurn ran (see
 * turn/corporation/recomputeSharePrices.ts file doc). AHDClient has no bond
 * system (W12/W13), so there is no post-bond lag to eliminate here — this
 * phase simply IS the (only) turn repricing step, reading the same-turn
 * corporationTurn output directly.
 *
 * PORT-STUB — order-flow / sentiment multiplier (human-liquidity gap):
 * mainline's live sharePrice = fundamentalValue x sentimentMultiplier x
 * orderFlowMultiplier, where orderFlowMultiplier is driven by a 15-minute
 * cron windowing REAL buy/sell notional from other actors' trades
 * (src/lib/corporations/orderFlowEngine.ts computeOrderFlowMultiplier), with
 * a wash-trade guard (src/lib/corporations/orderFlowWashGuard.ts) added
 * 2026-08-20 after an actor round-tripped a $10.6bn buy+sell within 10
 * seconds to pin the multiplier. None of that has a solo equivalent: a
 * single-player world has no other human or NPP CEO placing trades to
 * generate order flow, and there is no wall-clock cron in a turn-based
 * engine to window against. Porting the machinery honestly would produce a
 * multiplier that is *always* neutral (no trades ever accumulate in the
 * window), so W10 takes the mainline-neutral value directly:
 * orderFlowMultiplier = sentimentMultiplier = 1.0, i.e. sharePrice IS
 * fundamentalValue. The gap this leaves: a player's own buy/sell actions
 * (market/actions below) do NOT move the price the way a real trade would in
 * mainline (no order-flow pressure signal) — price only moves via the next
 * turn's fundamentals (financials, growth, cost of capital). A future wave
 * could reintroduce a bounded per-turn pressure term keyed off the player's
 * own net trade notional (the one actor W10 actually has), but that is a new
 * design, not a port, so it is left as the named gap rather than invented
 * here.
 */
import type { TurnPhase } from "../phases/types.js";
import { computeEffectivePrimeRate } from "../centralBank/constants.js";
import { normalizedEarningsFromHistory } from "./earnings.js";
import { computeSharePrices, type SharePriceInput } from "./sharePriceFormula.js";
import { SECTOR_RISK_PREMIUM, FALLBACK_PRIME_RATE_PERCENT } from "./constants.js";

export const recomputeSharePricesPhase: TurnPhase = {
  name: "recomputeSharePrices",
  run(world) {
    const corps = Object.values(world.corporations);
    if (corps.length === 0) return;

    const inputs: SharePriceInput[] = [];
    for (const corp of corps) {
      const bank = world.centralBanks[corp.countryId];
      const spotRate = bank?.primeRate ?? FALLBACK_PRIME_RATE_PERCENT;
      const history = bank?.interestRateHistory?.map((h) => h.rate);
      // Smoothed prime rate (30% spot / 70% trailing weighted avg): mirrors
      // mainline's primeRateSmoothedByCountry discount input (recomputeSharePrices.ts
      // "hourly turns" comment) — AHDClient's turns are the same instant-transmission
      // concern the smoothing exists for. computeEffectivePrimeRate is already
      // ported for the inflation monetary term (centralBank/constants.ts); reused
      // directly rather than re-derived.
      const smoothedPrimeRate = computeEffectivePrimeRate(spotRate, history) / 100;
      const riskPremium = SECTOR_RISK_PREMIUM[corp.sectorType] ?? SECTOR_RISK_PREMIUM.default!;

      inputs.push({
        corpId: corp.id,
        liquidCapitalAnchor: corp.liquidCapital,
        normalizedEarningsAnchor: normalizedEarningsFromHistory(corp.earningsHistory),
        sectorGrowthRate: corp.currentGrowthRate / 100,
        costOfCapital: smoothedPrimeRate + riskPremium,
        totalShares: corp.totalShares,
        previousSharePrice: corp.sharePrice,
      });
    }

    const newPrices = computeSharePrices(inputs);
    for (const corp of corps) {
      const price = newPrices.get(corp.id);
      if (price == null) continue;
      corp.fundamentalSharePrice = price;
      // No order-flow/sentiment multiplier ported (see file doc PORT-STUB) —
      // the live price IS the fundamental this wave.
      corp.sharePrice = price;
    }
  },
};
