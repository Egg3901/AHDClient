/**
 * NPC bank charter seeding — W12 port of src/lib/banking/npcBanks.ts
 * seedNpcBanks.
 *
 * Deviation from mainline (cited in constants.ts NPC_BANKS_PER_COUNTRY doc):
 * mainline spawns 2 dedicated NPP corporations per eligible country and
 * charters each with issueCharter (era-anchored capital requirement, a
 * legalCharterTypes eligibility gate, an NPP_CAPITAL_STATES headquarters
 * check). Rotunda's W9 corporation founding already seeds exactly ONE
 * "financial" sector NPC corporation per playable country unconditionally
 * (corporation/founding.ts — every playable country in every shipped era
 * pack has a nonzero financial weight, see sectorSeedWeights1953.ts), so
 * this module charters THAT corp rather than spawning new ones. There is
 * therefore no eligibility gate to port (issueCharter's legalCharterTypes/
 * NPP_CAPITAL_STATES checks — mainline's own reasons for those, era Glass-
 * Steagall separation and having no HQ state configured, do not apply: the
 * corp already exists and is always chartered retail-only).
 *
 * Capital: real cash moves from the corp's own `liquidCapital` into the new
 * `bankCharter.postedCapital`/`cashReserves` (see constants.ts
 * CHARTER_CAPITAL_LIQUID_CAPITAL_FRACTION doc) — conservation-respecting,
 * unlike mainline's FX-anchored fixed requirement which this module cannot
 * reproduce without an FX/anchor system (see constants.ts file doc).
 *
 * `runNpcBankPolicy` (mainline: pushes CEO-set rate offsets back to the
 * Regulation Q corridor midpoint) is NOT ported: solo charters every bank
 * with depositOffset/lendingOffset = 0 and has no rate-console action to
 * move them away from that, so there is nothing for a policy pass to correct
 * — see types.ts BankCharter file doc for the Regulation Q scope cut.
 */

import type { WorldState } from "../types.js";
import type { Corporation } from "../corporation/types.js";
import type { BankCharter } from "./types.js";
import { CHARTER_CAPITAL_LIQUID_CAPITAL_FRACTION, DEFAULT_LENDING_PROFILE } from "./constants.js";

export interface SeedNpcBanksResult {
  chartered: number;
  skippedExisting: number;
  skippedNoFinancialCorp: number;
}

/**
 * Charter the "financial" sector NPC corp of every playable country as a
 * retail bank. Idempotent (skips a corp that already carries an active
 * charter). Called once at world creation (see world.ts createWorld).
 */
export function seedNpcBanks(world: WorldState): SeedNpcBanksResult {
  const result: SeedNpcBanksResult = { chartered: 0, skippedExisting: 0, skippedNoFinancialCorp: 0 };

  for (const country of Object.values(world.countries)) {
    if (!country.playable) continue;
    const corp: Corporation | undefined = world.corporations[`${country.id}-financial`];
    if (!corp) {
      result.skippedNoFinancialCorp += 1;
      continue;
    }
    if (corp.bankCharter && corp.bankCharter.status === "active") {
      result.skippedExisting += 1;
      continue;
    }

    const posted = Math.max(0, Math.round(corp.liquidCapital * CHARTER_CAPITAL_LIQUID_CAPITAL_FRACTION));
    corp.liquidCapital = Math.max(0, corp.liquidCapital - posted);

    const charter: BankCharter = {
      status: "active",
      charteredTurn: world.meta.turn,
      postedCapital: posted,
      cashReserves: posted,
      npcDeposits: 0,
      totalDeposits: 0,
      totalLoans: 0,
      depositOffset: 0,
      lendingOffset: 0,
      lendingProfile: DEFAULT_LENDING_PROFILE,
      depositCeiling: 0,
      confidence: 1,
      warningBand: "green",
      panicTurns: 0,
      lastBankingTurn: null,
      lastSolvencyTurn: null,
      failedTurn: null,
      depositorsResolvedTurn: null,
    };
    corp.bankCharter = charter;
    result.chartered += 1;
  }

  return result;
}
