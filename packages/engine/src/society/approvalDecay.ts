/**
 * Ported from mainline `src/lib/turn/archetypeApprovalDecay.ts` to a pure,
 * deterministic function. All database reads are replaced by plain input
 * arrays; the function returns updated records instead of writing.
 *
 * The mainline used MongoDB and async/await; here we use synchronous pure
 * functions. The logic, constants, and formulas are preserved exactly.
 */

// source: src/lib/turn/archetypeApprovalDecay.ts
export const DECAY_RATE = 0.005;
// source: src/lib/turn/archetypeApprovalDecay.ts
export const ZERO_THRESHOLD = 0.01;

export interface ApprovalDecayInput {
  characters: Array<{ id: string; archetypeApprovals?: Record<string, number> }>;
  npps: Array<{ id: string; archetypeApprovals?: Record<string, number>; retiredAt?: string | null }>;
}

export interface ApprovalDecayOutput {
  charactersProcessed: number;
  nppsProcessed: number;
  updatedCharacters: Array<{ id: string; archetypeApprovals: Record<string, number> }>;
  updatedNpps: Array<{ id: string; archetypeApprovals: Record<string, number> }>;
}

/**
 * Decay a single approvals record.
 * Returns the decayed record if any value changed, otherwise null.
 */
function decayApprovals(
  approvals: Record<string, number> | undefined
): Record<string, number> | null {
  if (!approvals || Object.keys(approvals).length === 0) return null;

  const decayed: Record<string, number> = {};
  let hasChanges = false;

  for (const [archetypeId, value] of Object.entries(approvals)) {
    if (value === 0) {
      decayed[archetypeId] = 0;
      continue;
    }

    // Decay toward 0: multiply by (1 - DECAY_RATE)
    const newValue = value * (1 - DECAY_RATE);

    // Zero out values below threshold
    if (Math.abs(newValue) < ZERO_THRESHOLD) {
      decayed[archetypeId] = 0;
    } else {
      decayed[archetypeId] = Math.round(newValue * 100) / 100;
    }

    if (decayed[archetypeId] !== value) {
      hasChanges = true;
    }
  }

  return hasChanges ? decayed : null;
}

/**
 * Pure version of processArchetypeApprovalDecay.
 * Returns counts and updated records. Does not mutate inputs.
 */
export function processArchetypeApprovalDecay(input: ApprovalDecayInput): ApprovalDecayOutput {
  const { characters, npps } = input;

  const updatedCharacters: ApprovalDecayOutput['updatedCharacters'] = [];
  for (const character of characters) {
    const decayed = decayApprovals(character.archetypeApprovals);
    if (decayed) {
      updatedCharacters.push({ id: character.id, archetypeApprovals: decayed });
    }
  }

  const updatedNpps: ApprovalDecayOutput['updatedNpps'] = [];
  for (const npp of npps) {
    if (npp.retiredAt != null) continue; // skip retired NPPs
    const decayed = decayApprovals(npp.archetypeApprovals);
    if (decayed) {
      updatedNpps.push({ id: npp.id, archetypeApprovals: decayed });
    }
  }

  return {
    charactersProcessed: updatedCharacters.length,
    nppsProcessed: updatedNpps.length,
    updatedCharacters,
    updatedNpps,
  };
}
