/**
 * Policy ledger — the DECAY-path analogue of mainline's `statePolicies`
 * collection (src/lib/db/types/legislation.ts StatePolicy), trimmed to what
 * computeMetricTarget needs: which law, which country, what direction, what
 * scope. Created by legislation/billLifecycle.ts applyBillEffects on
 * enactment (mirrors world.enactedLaws' creation site) and read every turn
 * by policyEffectsPhase. Repeal is not modeled this wave (matches
 * EnactedLaw.repealedAtTurn, which is also unused so far) — every ledger
 * entry is treated as active for the life of the world.
 */
export interface PolicyLedgerEntry {
  id: string;
  /** Catalog entry id (legislation/catalog.ts CatalogEntry.id). */
  legislationTypeId: string;
  /** Level/option selected at enactment, if any (bill.enactedLevel). */
  policyOptionId: string;
  /** -1 | 0 | 1 ladder direction. Source: Bill.effectDirection. */
  effectDirection: number;
  scope: "national" | "regional";
  countryId: string;
  enactedTurn: number;
  enactedAt: string;
}
