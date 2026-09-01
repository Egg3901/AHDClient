/**
 * Central bank turn phases — W3.
 *
 * Two phases, mirroring mainline's relative order (turnPhaseNames.ts:
 * centralBankChairTurn (116) before centralBankChairSelection (121), with
 * fomcMeetings/fomcNominations/nppMonetaryOperations/centralBankChairExecutiveRemoval
 * in between all PORT-STUB — see centralBank/types.ts file doc for why):
 *
 *  1. centralBankChairTurnPhase — scrutiny/credibility update, then the
 *     autonomous Taylor-rule rate move (src/lib/turn/centralBankChairTurn.ts +
 *     src/lib/nppAutonomy/nppChairAutoRate.ts processNppChairAutoRate). Every
 *     solo bank runs the "npp" branch: there is no character chair to run the
 *     NPI-bonus/action-debit side of centralBankChairTurn.ts against (no
 *     character/politician-influence system backs central bank chairs in
 *     solo), so that half of the mainline phase has no solo counterpart —
 *     not stubbed, just structurally inapplicable while chairMode is always
 *     "npp" (mainline's own code skips it identically for npp chairs).
 *
 *  2. centralBankChairSelectionPhase — term-expiry rotation. Mirrors the one
 *     mainline branch that needs no president: src/lib/turn/
 *     centralBankChairSelection.ts's `appointNppChair` fallback, taken when a
 *     term expires and (as always in solo) no player/president candidate
 *     exists. Alignment flips hawk<->dove each rotation (oppositeAlignment),
 *     scrutiny partially carries over (CHAIR_CHANGE_SCRUTINY_RETAINED) — same
 *     as a mainline chair replacement. The presidential-nomination pool, FOMC
 *     board reseating, and player accept/decline flow are PORT-STUB, blocked
 *     on "presidential executive, W24".
 *
 * Registered at the END of the phase list (registry.ts), just before
 * newsMaintenancePhase, per the same rng-stream-stability rule the elections
 * and demographics blocks already follow there.
 */

import type { TurnPhase } from "../phases/types.js";
import {
  CENTRAL_BANK_COUNTRY_ANCHORS,
  CHAIR_CHANGE_SCRUTINY_RETAINED,
  CHAIR_TERM_TURNS,
  INFAMY_DECAY,
  RATE_CHANGE_COOLDOWN_TURNS,
  capScrutinyGain,
  computeNppChairRateStep,
  computeNppChairRateTarget,
  computeScrutinyDelta,
  oppositeAlignment,
  resolveRecoveryDelta,
  snapToPrimeRateGrid,
  stanceIsCorrect,
} from "./constants.js";

const INTEREST_RATE_HISTORY_MAX = 48; // Source: db/types/centralBank.ts interestRateHistory cap comment.

function clamp01to100(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export const centralBankChairTurnPhase: TurnPhase = {
  name: "centralBankChairTurn",
  run(world) {
    for (const bank of Object.values(world.centralBanks)) {
      const country = world.countries[bank.countryId];
      if (!country) continue;
      const anchor = CENTRAL_BANK_COUNTRY_ANCHORS[bank.countryId];
      const targetInflation = anchor?.targetInflation ?? 2.0; // Source: centralBankChairTurn.ts TARGET_INFLATION fallback.
      const inflationRatePct = country.economy.inflationRate * 100;
      const gdpGrowthPct = country.economy.growthRate * 100;
      const currentInfamy = clamp01to100(bank.chairInfamy);

      // ── Scrutiny/credibility ──────────────────────────────────────
      const rawDelta = computeScrutinyDelta(inflationRatePct, gdpGrowthPct, currentInfamy, targetInflation);
      const totalDelta = capScrutinyGain(rawDelta);

      const correctStance = stanceIsCorrect(bank.primeRate, inflationRatePct, targetInflation);
      const resolve = resolveRecoveryDelta({ correctStance, previousStreak: bank.resolveStreak });

      const decayedInfamy = currentInfamy * INFAMY_DECAY;
      bank.chairInfamy = clamp01to100(decayedInfamy + totalDelta - resolve.relief);
      bank.resolveStreak = resolve.resolveStreak;

      // ── Autonomous rate setting (chairMode is always "npp" in solo) ─
      const cooldownActive =
        bank.lastRateChangeTurn !== null && world.meta.turn - bank.lastRateChangeTurn < RATE_CHANGE_COOLDOWN_TURNS;
      if (!cooldownActive && anchor) {
        const targetRate = computeNppChairRateTarget({
          neutralRate: anchor.neutralPrimeRate,
          inflationRate: inflationRatePct,
          targetInflation,
          gdpGrowth: gdpGrowthPct,
          alignment: bank.chairAlignment,
        });
        const step = computeNppChairRateStep({
          currentRate: bank.primeRate,
          targetRate,
          alignment: bank.chairAlignment,
        });
        if (Math.abs(step) > 1e-9) {
          const newRate = snapToPrimeRateGrid(bank.primeRate + step);
          if (newRate !== bank.primeRate) {
            bank.primeRate = newRate;
            bank.lastRateChangeTurn = world.meta.turn;
          }
        }
      }

      bank.interestRateHistory.push({ turn: world.meta.turn, rate: bank.primeRate });
      if (bank.interestRateHistory.length > INTEREST_RATE_HISTORY_MAX) bank.interestRateHistory.shift();
    }
  },
};

export const centralBankChairSelectionPhase: TurnPhase = {
  name: "centralBankChairSelection",
  run(world) {
    for (const bank of Object.values(world.centralBanks)) {
      if (world.meta.turn < bank.chairTermExpiresAtTurn) continue;
      // Term expired. No president/player candidate pool exists in solo, so this
      // always takes appointNppChair's fallback branch: rotate the technocrat,
      // flip temperament, carry over most of the institution's scrutiny.
      bank.chairAlignment = bank.chairAlignment ? oppositeAlignment(bank.chairAlignment) : "hawk";
      bank.chairInfamy = clamp01to100(bank.chairInfamy * CHAIR_CHANGE_SCRUTINY_RETAINED);
      bank.resolveStreak = 0;
      bank.chairTermExpiresAtTurn = world.meta.turn + CHAIR_TERM_TURNS;
    }
  },
};
