import { describe, it, expect } from 'vitest';
import { processArchetypeApprovalDecay, DECAY_RATE, ZERO_THRESHOLD } from './approvalDecay.js';

describe('processArchetypeApprovalDecay', () => {
  it('should decay a single character approval', () => {
    const input = {
      characters: [
        { id: 'char1', archetypeApprovals: { archetypeA: 2 } },
      ],
      npps: [],
    };

    const result = processArchetypeApprovalDecay(input);
    expect(result.charactersProcessed).toBe(1);
    expect(result.updatedCharacters[0]).toEqual({
      id: 'char1',
      // 2 * 0.995 = 1.99; mainline rounds to 2 decimals (source line 48).
      // Note 1 * 0.995 = 0.995 rounds back to 1, so small values only move
      // when the step crosses a 0.01 boundary, exactly as mainline behaves.
      archetypeApprovals: { archetypeA: 1.99 },
    });
  });

  it('should zero out values below threshold', () => {
    const input = {
      characters: [
        { id: 'char1', archetypeApprovals: { archetypeA: 0.005 } },
      ],
      npps: [],
    };

    const result = processArchetypeApprovalDecay(input);
    // 0.005 * 0.995 = 0.004975, abs < 0.01 -> 0
    expect(result.updatedCharacters[0]!.archetypeApprovals).toEqual({ archetypeA: 0 });
  });

  it('should not process empty approvals', () => {
    const input = {
      characters: [
        { id: 'char1', archetypeApprovals: {} },
        { id: 'char2' },
      ],
      npps: [],
    };

    const result = processArchetypeApprovalDecay(input);
    expect(result.charactersProcessed).toBe(0);
    expect(result.updatedCharacters).toEqual([]);
  });

  it('should skip retired NPPs', () => {
    const input = {
      characters: [],
      npps: [
        { id: 'npp1', archetypeApprovals: { a: 2 }, retiredAt: null },
        { id: 'npp2', archetypeApprovals: { a: 2 }, retiredAt: '2020-01-01' },
      ],
    };

    const result = processArchetypeApprovalDecay(input);
    expect(result.nppsProcessed).toBe(1);
    expect(result.updatedNpps).toHaveLength(1);
    expect(result.updatedNpps[0]!.id).toBe('npp1');
  });

  it('should handle negative values (decay toward zero)', () => {
    const input = {
      characters: [
        { id: 'char1', archetypeApprovals: { a: -1 } },
      ],
      npps: [],
    };

    const result = processArchetypeApprovalDecay(input);
    // -1 * 0.995 = -0.995; Math.round(-99.5)/100 = -0.99 (JS rounds half toward +inf)
    expect(result.updatedCharacters[0]!.archetypeApprovals).toEqual({ a: -0.99 });
  });
});
