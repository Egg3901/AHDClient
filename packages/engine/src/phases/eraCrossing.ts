import type { TurnPhase } from "./types.js";

/**
 * W33: era crossing. Ports mainline `eraCrossing` (src/lib/turn/eraCrossing.ts,
 * live via src/simulation/phases/stateEffectsPhase.ts:311, registered
 * turnPhaseNames.ts:107). Mainline's `shouldCrossEra` fires on a decade
 * boundary (`currentYear % 10 === 0 && currentYear > lastEraCrossedYear`)
 * and, when it fires, `runEraCrossing` does exactly two things: persists the
 * new era id + `lastEraCrossedYear` guard, and posts a system news item
 * (`buildEraCrossingContent` via `createSystemNewsPost`, which uses
 * `new Date()` for the doc timestamp and does a Mongo insert — non-
 * deterministic IO). That IS mainline's entire substantive effect: grep
 * confirms `currentEraId` is read nowhere else in the live turn pipeline,
 * only by a display API route and a React hook — pure UI label, not a
 * gameplay trigger. This phase reproduces the one real effect
 * deterministically: `world.news.push` keyed on `world.meta.turn`/`date`,
 * the same IO substitution every other ported phase in this codebase makes
 * for mainline's news-posting calls.
 *
 * Rotunda's own era system is coarser than mainline's (four shipped packs,
 * "1953"/"1979"/"1991"/"2019", vs mainline's decade buckets), so the edge
 * condition here
 * is "did `world.meta.era` change since this phase last ran", tracked via
 * `meta.lastEra` — the structural analogue of mainline's
 * `lastEraCrossedYear` guard field, adapted from a year-modulo-10 check to
 * an era-id comparison (see world.ts meta seeding + save.ts migration for
 * where `lastEra` is initialized/backfilled). `advanceCalendarPhase`, which
 * runs first every turn, already flips `world.meta.era` the instant the
 * date crosses a threshold; this phase runs at the tail (registry.ts, same
 * append-only placement convention as every other tail-appended wave) and
 * only detects and announces the edge — it never decides what era it is.
 *
 * `metricActivation` (same mainline file, `runMetricActivation`) is
 * deliberately NOT ported as a phase: mainline's own turn-phase side of it
 * is *also* just a news+Discord bookkeeping effect (non-deterministic IO,
 * gated on a `lastMetricActivationYear` guard analogous to the one above).
 * The actual gameplay-relevant mechanism — `isMetricActive(metricId,
 * countryId, year)` (src/lib/era/metricCatalog.ts:323-334) — is a
 * stateless function of the live year, re-evaluated fresh at every call
 * site (approval scoring, policy cost gates, income-band index, etc.), not
 * an edge-triggered mutation; there is no turn-phase equivalent to port
 * beyond the news bookkeeping already covered above. Rotunda already
 * follows exactly this "continuous re-evaluation" pattern wherever it has
 * era-gated behavior — see forex/regime.ts `regimeForEra(world.meta.era)`,
 * read fresh every forexTurn — so the pattern itself needs no new wiring.
 * The underlying ~40-metric catalog (metricCatalog.ts:50-316) is PORT-STUB:
 * out of scope this wave, as it would require porting the unrelated
 * approval-scoring and policy-cost systems those metrics feed, none of
 * which exist in Rotunda yet.
 */
export const eraCrossingPhase: TurnPhase = {
  name: "eraCrossing",
  run(world) {
    if (world.meta.era === world.meta.lastEra) return;
    const era = world.meta.era;
    world.news.push({
      turn: world.meta.turn,
      date: world.meta.date,
      headline: `A new era begins: the ${era}s`,
    });
    world.meta.lastEra = era;
  },
};
