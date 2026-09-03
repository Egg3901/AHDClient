/**
 * Alignment pole configuration — port of src/lib/constants/alignmentEras.ts
 * AlignmentPoleId (subset) + src/lib/alignment/normalize.ts AlignmentShares.
 *
 * Mainline's full pole set is "WEST" | "EAST" | "WASHINGTON" | "MOSCOW" |
 * "BEIJING" — the latter three are era-gated multipolar poles that only
 * exist once the Non-Aligned Movement (1961) and Sino-Soviet split enter
 * play. AHDClient's 1953 pack is bipolar, so only WEST/EAST are ported —
 * B13, named blocker: multipolar poles have no era-crossing trigger in
 * AHDClient yet (no era after 1953/1960 is playable).
 */
export type AlignmentPoleId = "WEST" | "EAST";

/**
 * A nation's alignment is a set of shares, one per pole, plus a non-aligned
 * remainder — never a single scalar. Source: normalize.ts AlignmentShares.
 * INVARIANT: every share is a multiple of 0.01 in [0,100], and
 * sum(shares) + nonAligned === 100 (enforced by normalizeShares, the single
 * write path).
 */
export interface AlignmentShares {
  shares: Partial<Record<AlignmentPoleId, number>>;
  nonAligned: number;
}

export interface AlignmentRecord extends AlignmentShares {
  countryId: string;
  updatedTurn: number;
}
