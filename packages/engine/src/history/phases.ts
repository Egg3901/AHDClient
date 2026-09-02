/**
 * WorldHistory recording — W41.
 *
 * Registered at the END of the turn pipeline (phases/registry.ts), just
 * before newsMaintenancePhase — the same tail slot mainline's own history
 * cluster occupies (turnPhaseNames.ts runs metricHistory..ledgerReconcile
 * immediately before economicVitalSigns, which solo also places last before
 * newsMaintenance). Unlike almost every other W-numbered cluster in
 * registry.ts, this is NOT an ordering deviation from mainline: both engines
 * put their snapshot family at the very end of the turn, after every phase
 * that could still move a metric this turn has already run, so every
 * recorded point reflects the FINAL post-turn state rather than a
 * mid-pipeline value some later phase would overwrite.
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import { HISTORY_CAP } from "./types.js";
import { BOND_UNIT_FACE_VALUE } from "../bonds/constants.js";

function pushCapped<T>(arr: T[], point: T): void {
  arr.push(point);
  if (arr.length > HISTORY_CAP) arr.splice(0, arr.length - HISTORY_CAP);
}

/**
 * Player's sovereign bond holdings valued at current marketPrice.
 * Source: bonds/bondTurn.ts getTraceBonds playerUnits pattern (holders
 * array, holderId "player"); BOND_UNIT_FACE_VALUE is the $1,000/unit face
 * value (bonds/constants.ts), marketPrice is a ratio vs par.
 */
export function computePlayerBondsValue(world: WorldState): number {
  let total = 0;
  for (const bond of Object.values(world.bonds)) {
    const holding = bond.holders.find((h) => h.holderId === "player");
    if (!holding || holding.units <= 0) continue;
    total += holding.units * BOND_UNIT_FACE_VALUE * bond.marketPrice;
  }
  return Math.round(total * 100) / 100;
}

/**
 * Player's corporation share holdings valued at current sharePrice.
 * Source: actions/execute.ts buyShares/sellShares notional formula
 * (shares * corp.sharePrice, no brokerage fee — market/constants.ts).
 */
export function computePlayerSharesValue(world: WorldState): number {
  let total = 0;
  for (const corp of Object.values(world.corporations)) {
    const holding = corp.shareholders.find((sh) => sh.holder === "player");
    if (!holding || holding.shares <= 0) continue;
    total += holding.shares * corp.sharePrice;
  }
  return Math.round(total * 100) / 100;
}

export function recordWorldHistory(world: WorldState): void {
  const turn = world.meta.turn;

  for (const [id, country] of Object.entries(world.countries)) {
    let arr = world.history.macro[id];
    if (!arr) {
      arr = [];
      world.history.macro[id] = arr;
    }
    pushCapped(arr, {
      turn,
      gdp: country.economy.gdp,
      growthRate: country.economy.growthRate,
      inflationRate: country.economy.inflationRate,
      unemploymentRate: country.economy.unemploymentRate,
      outputGap: country.economy.outputGap,
    });
  }

  for (const [id, bank] of Object.entries(world.centralBanks)) {
    let rateArr = world.history.primeRate[id];
    if (!rateArr) {
      rateArr = [];
      world.history.primeRate[id] = rateArr;
    }
    pushCapped(rateArr, { turn, primeRate: bank.primeRate });

    let moneyArr = world.history.moneySupply[id];
    if (!moneyArr) {
      moneyArr = [];
      world.history.moneySupply[id] = moneyArr;
    }
    pushCapped(moneyArr, { turn, externalBroadMoney: bank.externalBroadMoney });
  }

  for (const [id, party] of Object.entries(world.parties)) {
    let arr = world.history.partyStrength[id];
    if (!arr) {
      arr = [];
      world.history.partyStrength[id] = arr;
    }
    pushCapped(arr, { turn, politicalStrength: party.politicalStrength, treasury: party.treasury });
  }

  const bondsValue = computePlayerBondsValue(world);
  const sharesValue = computePlayerSharesValue(world);
  const netWorth = world.player.cash + world.player.savings + world.player.funds + bondsValue + sharesValue;
  pushCapped(world.history.playerWealth, {
    turn,
    cash: world.player.cash,
    savings: world.player.savings,
    funds: world.player.funds,
    bondsValue,
    sharesValue,
    netWorth,
  });
}

export const recordWorldHistoryPhase: TurnPhase = {
  name: "recordWorldHistory",
  run(world) {
    recordWorldHistory(world);
  },
};
