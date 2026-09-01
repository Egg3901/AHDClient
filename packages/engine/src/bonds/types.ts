/**
 * Bond domain types — solo port of src/lib/db/types/bond.ts + src/lib/bonds/sovereign.ts
 * subset actually needed for W13 sovereign system.
 *
 * Mainline carries many corporate-bond-only fields (corporationId as issuer,
 * bondDefaultCreditPenalty, restructure audit fields, centralBankHoldings, etc.)
 * that have no solo consumer — they are omitted (cited as cut) rather than
 * silently dropped.
 *
 * Fields kept are those the bondTurn pipeline reads or the player action
 * surface writes: sovereign issuance/coupon/maturity, market price, holders,
 * currencyCode, and the minimal audit (issuedAtTurn/maturityTurn).
 */

/** Maturity in turns (48 turns = 1 game year). Source: bond.ts BOND_MATURITY_OPTIONS. */
export type BondMaturityTurns = 48 | 96 | 240 | 336;

export type BondIssuerType = "sovereign";

/** One holder entry. Solo tracks only the single player and the NPC bulk as float — no per-corporation holder roster. */
export interface BondHolder {
  /** Holder id — "player" for the human, "npc" bulk represented via publicFloat, not as a holder row. */
  holderId: string;
  units: number;
}

/**
 * Sovereign bond document. Ports Bond (sovereign subset) — see types.ts file doc
 * for the full cut list. Key differences vs mainline:
 *  - _id is a string id (not ObjectId) for JSON-safe WorldState.
 *  - holders is player-only; publicFloat carries NPC float.
 *  - corporate-only fields (corporationId default penalty, restructure*) omitted.
 *  - currencyCode kept (sovereign bonds denominate in issuing country's currency).
 */
export interface Bond {
  id: string;
  issuerType: BondIssuerType;
  countryId: string;
  issuerName: string;
  faceValue: number;
  couponRate: number;
  maturityTurns: BondMaturityTurns;
  issuedAtTurn: number;
  maturityTurn: number;
  marketPrice: number;
  totalIssued: number;
  /** Units still available from the AI market maker (NPC float). */
  publicFloat: number;
  /** Player + (future) NPC tracked holders. Public float holders are not rows here. */
  holders: BondHolder[];
  /** Whether the bond has matured and been settled. */
  matured: boolean;
  /** Whether the bond is in default — sovereign default is PORT-STUB (no trigger this wave). */
  defaulted: boolean;
  defaultedAtTurn: number | null;
  /** Currency the face/coupon/price are denominated in. Source: bond.currencyCode (v0.2.6+). */
  currencyCode: string;
  createdAt: string;
  updatedAt: string;
}
