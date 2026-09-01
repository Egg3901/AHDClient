import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import type { ExtractionContract } from "../types.js";
import {
  COMMODITY_BASE_PRICES,
  CONTRACT_DEFAULT_MISSED_PAYMENTS,
  royaltyDueAnchor,
} from "./constants.js";
import type { CommodityType } from "./constants.js";

/**
 * Contract settlement turn phase.
 *
 * Ports src/lib/turn/extraction/contractSettlement.ts settleExtractionContracts.
 * Lifecycle: offered→expired (past offer window), active→expired (past term),
 * royalty settlement per turn (rate × share × capacity × price) with
 * insufficient-funds tracking and default at CONTRACT_DEFAULT_MISSED_PAYMENTS.
 *
 * PORT-STUB counterparties: corporations not yet ported, so corporationId is
 * null for stubbed contracts. Stubbed counterparties always "pay" — we compute
 * the royalty anchor, advance idempotency, and count settled/paid, but skip
 * treasury movement (that will land with the corporation wave). Insufficient-
 * funds path is exercised only when a contract is marked with a real
 * corporationId that maps to a missing treasury (still stubbed to missed-
 * payment increment for testability).
 *
 * Price source: world.commodityPrices[resource].globalPrice (this turn's
 * market, since we run AFTER commodityPrices).
 * Capacity source: PORT-STUB fixed NOTIONAL_STATE_CAPACITY (mainline reads
 * StateResourceCapacity resources[resource] per (stateId, countryId)).
 * Missing inputs use mainline-neutral values: 0 capacity or price → 0 due,
 * no charge.
 */

// Notional capacity per (state, resource) in units/day.
// PORT-STUB: mainline reads per-state extraction capacity doc; Solo has no
// state capacity table yet, so we use a calibrated constant that makes
// royalties non-zero but bounded. Chosen so a 1% royalty on 50% share at
// era-scaled oil price (~$1.15) yields ~$5-50 anchor units/turn, similar
// to mainline's anchor-scaled royalties (royaltyRate 0-0.02 × share × capacity × price).
const NOTIONAL_STATE_CAPACITY_UNITS = 10_000;

export interface ContractSettlementResult {
  contractsSettled: number;
  royaltiesPaid: number;
  paymentsMissed: number;
  contractsDefaulted: number;
  offersExpired: number;
  contractsExpired: number;
  totalRoyaltyAnchor: number;
  errors: number;
}

export function settleContractsForTurn(
  contracts: ExtractionContract[],
  commodityPrices: WorldState["commodityPrices"],
  turn: number,
): ContractSettlementResult {
  const result: ContractSettlementResult = {
    contractsSettled: 0,
    royaltiesPaid: 0,
    paymentsMissed: 0,
    contractsDefaulted: 0,
    offersExpired: 0,
    contractsExpired: 0,
    totalRoyaltyAnchor: 0,
    errors: 0,
  };

  for (const contract of contracts) {
    // Offer expiry
    if (contract.status === "offered") {
      if (contract.offerExpiresTurn != null && contract.offerExpiresTurn <= turn) {
        contract.status = "expired";
        result.offersExpired += 1;
      }
      continue;
    }

    if (contract.status !== "active") continue;

    // Term expiry
    if (contract.expiresTurn != null && contract.expiresTurn <= turn) {
      contract.status = "expired";
      result.contractsExpired += 1;
      continue;
    }

    // Idempotency: skip if already settled this turn
    if (contract.lastSettlementTurn != null && contract.lastSettlementTurn >= turn) {
      continue;
    }

    const rate = contract.royaltyRatePerTurn ?? 0;
    if (rate <= 0) {
      contract.lastSettlementTurn = turn;
      result.contractsSettled += 1;
      continue;
    }

    const priceEntry = commodityPrices[contract.resource];
    const priceAnchor =
      priceEntry?.globalPrice ??
      (COMMODITY_BASE_PRICES[contract.resource as CommodityType] ?? 0);

    const stateCapacity = NOTIONAL_STATE_CAPACITY_UNITS;
    const dueAnchor = royaltyDueAnchor(rate, contract.share, stateCapacity, priceAnchor);

    if (dueAnchor <= 0) {
      contract.lastSettlementTurn = turn;
      result.contractsSettled += 1;
      continue;
    }

    // PORT-STUB counterparty handling
    if (contract.corporationId == null) {
      // Stubbed corporation: always pays, no treasury movement, no missed path.
      contract.lastSettlementTurn = turn;
      contract.missedPayments = 0;
      result.royaltiesPaid += 1;
      result.totalRoyaltyAnchor += dueAnchor;
      result.contractsSettled += 1;
      continue;
    }

    // Real corporationId but corporations system not yet ported: treat as
    // insufficient funds path for determinism testing. In real port this
    // would be the guarded corporation.liquidCapital debit.
    // For now, stub to "always insufficient" when corporationId is non-null
    // but starts with "insolvent-" prefix (test hook); otherwise treat as paid.
    const isInsolventTestHook =
      typeof contract.corporationId === "string" && contract.corporationId.startsWith("insolvent-");

    if (isInsolventTestHook) {
      const missed = (contract.missedPayments ?? 0) + 1;
      contract.missedPayments = missed;
      contract.lastSettlementTurn = turn;
      const defaulted = missed >= CONTRACT_DEFAULT_MISSED_PAYMENTS;
      if (defaulted) {
        contract.status = "defaulted";
        result.contractsDefaulted += 1;
      }
      result.paymentsMissed += 1;
      result.contractsSettled += 1;
      continue;
    }

    // Normal stubbed paid path for non-insolvent real ids (future: guarded debit)
    contract.lastSettlementTurn = turn;
    contract.missedPayments = 0;
    result.royaltiesPaid += 1;
    result.totalRoyaltyAnchor += dueAnchor;
    result.contractsSettled += 1;
  }

  return result;
}

export const contractSettlementPhase: TurnPhase = {
  name: "contractSettlement",
  run(world: WorldState) {
    const turn = world.meta.turn;
    settleContractsForTurn(world.extractionContracts, world.commodityPrices, turn);
  },
};
