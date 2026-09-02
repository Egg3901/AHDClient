/**
 * Currency union adoption — port of src/lib/billEnactment.ts
 * applyEuroAdoptionProvision (lines 298-315). Mainline's only currency-
 * adoption bill path is Eurozone accession: each member country votes in
 * (idempotent add), and once every member in EU_EUROZONE_MEMBERS (DE, IE)
 * has joined, gameState.eurozoneEnabled flips true.
 *
 * PORT-STUB: neither Eurozone member (DE, IE) is a Rotunda-playable country
 * in the 1953 pack (US/UK/RU/DD only), so there is no real union to seed —
 * B08. This module ports the MECHANISM generically (a union is a member set
 * + a per-member join vote + an active flag once all members have joined),
 * proven against a synthetic union in tests. A real union definition is a
 * content-authoring task, not an engine one.
 */
import type { WorldState } from "../types.js";

export function applyCurrencyUnionProvision(world: WorldState, countryId: string, unionId: string): void {
  const union = world.currencyUnions[unionId];
  if (!union) return;
  if (!union.members.includes(countryId)) return;
  if (!union.joined.includes(countryId)) union.joined.push(countryId);
  if (union.members.every((m) => union.joined.includes(m))) union.active = true;
}
