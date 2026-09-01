/**
 * Committee model to the depth billLifecycle requires.
 * In mainline, committee stage is not yet live (wiki/committees: not live),
 * so bills flow directly to floor. Solo mirrors: committees exist, can be
 * assigned to bills, but do not gate lifecycle. This file provides the
 * minimal model needed for chamber routing and future assignment.
 */

import type { Committee } from "./types.js";

let committeeCounter = 0;

export function createCommittee(
  countryId: string,
  chamberKey: string,
  name: string,
  memberIds: string[],
  chairId: string | null,
  jurisdiction: string[],
  turn: number
): Committee {
  committeeCounter++;
  return {
    id: `com-${countryId}-${chamberKey}-${committeeCounter}`,
    countryId,
    chamberKey,
    name,
    memberIds: [...memberIds],
    chairId,
    jurisdiction,
    createdAtTurn: turn,
  };
}

export function seedCommitteesForCountry(
  countryId: string,
  chambers: Array<{ key: string; elected: boolean; seats: number }>,
  politicians: Array<{ id: string; chamberKey: string; countryId: string }>,
  turn: number
): Committee[] {
  const committees: Committee[] = [];
  for (const chamber of chambers) {
    if (!chamber.elected) continue;
    const members = politicians.filter((p) => p.countryId === countryId && p.chamberKey === chamber.key).map((p) => p.id);
    if (members.length === 0) continue;
    // Create 2 standing committees per elected chamber for coverage
    const chair = members[0] ?? null;
    committees.push(
      createCommittee(countryId, chamber.key, `${chamber.key} Finance`, members.slice(0, Math.ceil(members.length / 2)), chair, ["economy", "infrastructure"], turn)
    );
    committees.push(
      createCommittee(countryId, chamber.key, `${chamber.key} Judiciary`, members.slice(Math.ceil(members.length / 2)), chair, ["governance", "order"], turn)
    );
  }
  return committees;
}

/**
 * Assign a bill to an appropriate committee based on category jurisdiction.
 * Returns committee id or null if no matching committee (bill goes straight to floor).
 * Does not gate lifecycle; just records assignment for display/governance depth.
 */
export function assignBillToCommittee(
  billCategory: string,
  committees: Committee[],
  countryId: string,
  chamberKey: string
): string | null {
  const candidates = committees.filter((c) => c.countryId === countryId && c.chamberKey === chamberKey);
  for (const c of candidates) {
    if (c.jurisdiction.includes(billCategory)) return c.id;
  }
  return candidates[0]?.id ?? null;
}
