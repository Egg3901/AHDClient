/**
 * W25: referendum lifecycle record. Ports the subset of mainline's
 * `Referendum` (src/lib/db/types/referendum.ts:35-60) that this wave's
 * skeleton actually drives — see lifecycle.ts file doc for exactly which
 * status edges are ported vs PORT-STUB this wave.
 */
export type ReferendumKind = "independence" | "reunification";

export type ReferendumStatus =
  | "granted"
  | "campaigning"
  | "polling"
  | "actuating"
  | "completed"
  | "settled"
  | "cancelled";

export interface ReferendumRecord {
  id: string;
  countryId: string;
  /** "SCO" | "WAL" | "NIR" (UK_DEVOLUTION_REGIONS). */
  regionId: string;
  kind: ReferendumKind;
  status: ReferendumStatus;
  /** Denormalized current Yes share (0-100), authoritative in this skeleton
   * (mainline's cohort-aggregate recompute is PORT-STUB — see lifecycle.ts). */
  yesShare: number;
  requestedTurn: number;
  grantedTurn: number | null;
  resolvedTurn?: number;
  /** Set once the popular vote resolves (polling -> actuating|settled). */
  finalYesShare?: number;
  turnout?: number;
  passed?: boolean;
}
