/**
 * Tax-rate phase-in (ticket #1102). Ported verbatim from mainline
 * src/lib/budget/taxRatePhaseIn.ts: an enacted rate change walks toward its
 * target at most TAX_RATE_PHASE_IN_MAX_STEP_PP points per turn so a large move
 * arrives over several turns instead of shocking the economy in one. The
 * pending target lives on the budget (`taxRatePhaseIn[taxType]`) and drops out
 * when reached; a fresh enactment on the same tax replaces a running ramp.
 */
export const TAX_RATE_PHASE_IN_MAX_STEP_PP = 1;

function finite(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function needsPhaseIn(current: number | null | undefined, target: number): boolean {
  return Math.abs(target - finite(current)) > TAX_RATE_PHASE_IN_MAX_STEP_PP;
}

export function stepTaxRate(current: number | null | undefined, target: number): number {
  const from = finite(current);
  const to = finite(target);
  const delta = to - from;
  if (Math.abs(delta) <= TAX_RATE_PHASE_IN_MAX_STEP_PP) return to;
  const next = from + Math.sign(delta) * TAX_RATE_PHASE_IN_MAX_STEP_PP;
  // Guard the float: 0.1 steps accumulate error that would leave a rate a
  // hair off its target forever and keep the phase-in entry alive.
  return Math.round(next * 1000) / 1000;
}

export function phaseInTurns(current: number | null | undefined, target: number): number {
  return Math.ceil(Math.abs(finite(target) - finite(current)) / TAX_RATE_PHASE_IN_MAX_STEP_PP);
}

export function advanceTaxRatePhaseIn(
  rates: Record<string, number | null | undefined>,
  pending: Record<string, number> | undefined,
): { rates: Record<string, number>; pending: Record<string, number>; changed: boolean } {
  const nextRates: Record<string, number> = {};
  const nextPending: Record<string, number> = {};
  let changed = false;
  for (const [taxType, target] of Object.entries(pending ?? {})) {
    if (typeof target !== "number" || !Number.isFinite(target)) continue;
    const current = finite(rates[taxType]);
    const stepped = stepTaxRate(current, target);
    if (stepped !== current) {
      nextRates[taxType] = stepped;
      changed = true;
    }
    if (stepped !== target) nextPending[taxType] = target;
    else changed = true; // reaching the target clears the entry, which is a change
  }
  return { rates: nextRates, pending: nextPending, changed };
}
