/**
 * Events turn phases — W31.
 *
 * Four phases, all at END before newsMaintenance (ordering deviation):
 *   - worldEventsMaintenance: sweep expired modifiers (sector demand, war mitigation)
 *   - worldEventsScheduler: deterministic window/recurring scheduler, at most
 *     one offer per country per turn (PORT-STUB: tension gating at neutral 50)
 *   - playerRandomEvents: weighted pick for the single player, seeded via turn rng
 *   - crisisTurn: tick effects with linear decay, expiration, wire announcements
 *
 * Ordering deviation note (required by brief): Mainline runs these mid-pipeline
 * (turnPhaseRegistry.ts worldEventsMaintenance 53, worldEventsScheduler 54,
 * playerRandomEvents 52, crisisTurn Group 11). Solo defers the entire cluster
 * to the tail before newsMaintenance to avoid shifting shared RNG streams under
 * existing integration goldens — same rule as every other tail cluster. A
 * dedicated re-golden will restore mainline order.
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import type { WorldRng } from "../rng.js";
import { isScheduleDue } from "./scheduler.js";
import { WORLD_EVENTS, PLAYER_RANDOM_EVENTS } from "./catalog.js";
import { applyEffects } from "./effects.js";
import { applyCrisisEffects, CRISIS_TEMPLATES, pickCrisisTemplate } from "./crisis.js";

// ── worldEventsMaintenance ───────────────────────────────────────────
// Source: src/lib/events/substrate/countryModifiers.ts sweepExpiredCountryModifiers
// + turnPhaseRegistry.ts worldEventsMaintenance phase.

export const worldEventsMaintenancePhase: TurnPhase = {
  name: "worldEventsMaintenance",
  run(world: WorldState) {
    const turn = world.meta.turn;
    const before = world.activeWorldModifiers.length;
    world.activeWorldModifiers = world.activeWorldModifiers.filter((m) => m.expiresAtTurn > turn);
    // Return value is not used by engine (phases are void), but test can check.
    void before;
  },
};

// ── worldEventsScheduler ─────────────────────────────────────────────
// Source: src/lib/events/worldEvents/driver.ts processWorldEventsTurn
// Deterministic per-country schedule check. At most one offer per country per
// turn (first due definition wins). Global host events (olympics/worldsFair)
// are treated as recurring picks: one deterministic host per cadence.

export const worldEventsSchedulerPhase: TurnPhase = {
  name: "worldEventsScheduler",
  run(world: WorldState, rng: WorldRng) {
    const turn = world.meta.turn;
    const date = world.meta.date;
    const year = Number(date.slice(0, 4));

    // Tension gating: solo has no coldWarTension subsystem; neutral 50.
    // PORT-STUB blocker: coldwar/tension.ts coldWarTensionTurn not ported.
    const currentTension = 50;

    // Deterministic host selection for olympics/worldsFair: hash-like via rng.pick
    // But we use rng consistently: pick host deterministically by turn.
    // Mainline picks via hashToUint32; solo uses rng order (host list sorted).
    const activeCountryIds = Object.keys(world.countries)
      .filter((id) => world.countries[id]?.playable)
      .sort();
    if (activeCountryIds.length === 0) return;

    // Track which countries already got an event this turn (cap = 1 per country).
    const offeredCountries = new Set<string>();

    // First pass: global recurring hosts (olympics, worldsFair) — pick one host each if due.
    for (const def of WORLD_EVENTS) {
      if (def.schedule?.kind !== "recurring") continue;
      if (!isScheduleDue(turn, "GLOBAL", def.kind, world.worldEventLedger["GLOBAL"]?.[def.kind], def.schedule)) continue;
      if (def.minYear != null && year < def.minYear) continue;
      if (def.maxYear != null && year > def.maxYear) continue;
      // Pick host deterministically via rng (consumes one draw; same order sorted).
      const host = rng.pick(activeCountryIds);
      if (offeredCountries.has(host)) continue;
      if (def.minTension != null && currentTension < def.minTension) continue;
      if (def.requiresCountryIds && !def.requiresCountryIds.includes(host)) continue;
      // Offer
      world.worldEventLedger[host] = world.worldEventLedger[host] ?? {};
      world.worldEventLedger[host]![def.kind] = turn;
      world.worldEventLedger["GLOBAL"] = world.worldEventLedger["GLOBAL"] ?? {};
      world.worldEventLedger["GLOBAL"]![def.kind] = turn;
      const { applied } = applyEffects(world, host, def.effects, turn);
      void applied;
      world.news.push({ turn, date, headline: def.headline });
      offeredCountries.add(host);
    }

    // Second pass: per-country window events — one per country per turn.
    for (const countryId of activeCountryIds) {
      if (offeredCountries.has(countryId)) continue;
      for (const def of WORLD_EVENTS) {
        // Skip recurring definitions (already handled above) and window check below
        if (def.schedule?.kind === "recurring") continue;
        if (!def.schedule) continue;
        if (def.requiresCountryIds && !def.requiresCountryIds.includes(countryId)) continue;
        if (def.minYear != null && year < def.minYear) continue;
        if (def.maxYear != null && year > def.maxYear) continue;
        if (def.minTension != null && currentTension < def.minTension) continue;
        const lastFired = world.worldEventLedger[countryId]?.[def.kind];
        if (!isScheduleDue(turn, countryId, def.kind, lastFired, def.schedule)) continue;
        // Offer: record, apply, news, cap.
        world.worldEventLedger[countryId] = world.worldEventLedger[countryId] ?? {};
        world.worldEventLedger[countryId]![def.kind] = turn;
        const { applied } = applyEffects(world, countryId, def.effects, turn);
        void applied;
        world.news.push({ turn, date, headline: def.headline });
        offeredCountries.add(countryId);
        break; // at most one per country per turn
      }
    }
  },
};

// ── playerRandomEvents ───────────────────────────────────────────────
// Source: src/lib/events/pree/driver.ts processPlayerRandomEventsTurn
// Weighted pick via rng (all randomness via turn rng). One event per turn at
// most. Era gating via minYear. News + applied effects.

export const playerRandomEventsPhase: TurnPhase = {
  name: "playerRandomEvents",
  run(world: WorldState, rng: WorldRng) {
    const turn = world.meta.turn;
    const date = world.meta.date;
    const year = Number(date.slice(0, 4));

    // Simple eligibility: player is always eligible for "all" events.
    // "politician" requires legislative seat, "inElection" requires active candidacy,
    // "ceo" requires corporation ceo — PORT-STUB eligibility filtering (those
    // subsystems not ported for solo player character eligibility).
    // For now, include only "all" events to keep every turn eligible.
    const eligible = PLAYER_RANDOM_EVENTS.filter((def) => {
      if (def.minYear != null && year < def.minYear) return false;
      // Only "all" guaranteed; others need subsystem state we don't fully track for player
      if (def.eligibility.includes("all")) return true;
      // Politician: player has legislative seat
      if (def.eligibility.includes("politician") && world.player.legislativeSeat) return true;
      // Other eligibilities are PORT-STUB at neutral (eligible) for now so events still fire
      // Blocker: ceo/inElection eligibility requires corporation/election candidate subsystems for player
      return false;
    });

    if (eligible.length === 0) return;

    // Weighted pick via rng
    const totalWeight = eligible.reduce((s, e) => s + e.baseWeight, 0);
    if (totalWeight <= 0) return;
    let roll = rng.next() * totalWeight;
    let picked: (typeof eligible)[number] | undefined;
    for (const def of eligible) {
      roll -= def.baseWeight;
      if (roll < 0) {
        picked = def;
        break;
      }
    }
    picked = picked ?? eligible[eligible.length - 1]!;

    // 30% chance to actually offer per turn (mainline has cooldown-based spacing;
    // solo uses a probability so 200-turn runs are not 1 event/turn spam but
    // still well above near-empty). Consumes one rng draw for the gate.
    const gate = rng.next();
    if (gate > 0.30) return;

    // Resolve via default option (deterministic; roll-tier branching deferred to
    // future player-choice flow — W34 will expose option picks via action catalog).
    const effects = picked.effects;
    const countryId = world.player.countryId;
    applyEffects(world, countryId, effects, turn);
    world.news.push({ turn, date, headline: picked.headline });
    // Record for ledger/tests
    world.playerEventLog.push({ turn, kind: picked.kind, headline: picked.headline });
  },
};

// ── crisisTurn ───────────────────────────────────────────────────────
// Source: src/lib/turn/crisisTurn.ts processCrisisTurn
// Handles active crises: tick effects with decay, flat effects at onset,
// wire announcements, and expiration. Also spawns new crises via a small
// per-turn hazard (2% per playable country when no crisis active there),
// grounded in mainline's autoCrisisSpawn but simplified to a turn-rng coin
// so the lifecycle is exercised every 200-turn run without condition systems.

export const crisisTurnPhase: TurnPhase = {
  name: "crisisTurn",
  run(world: WorldState, rng: WorldRng) {
    const turn = world.meta.turn;
    const date = world.meta.date;

    // 1. Auto-spawn: 2% per playable country per turn when no active crisis
    // for that country, up to max 2 active crises world-wide (cap for solo).
    const activeCount = world.crises.filter((c) => c.status === "active").length;
    if (activeCount < 2) {
      const playableIds = Object.keys(world.countries)
        .filter((id) => world.countries[id]?.playable)
        .sort();
      for (const countryId of playableIds) {
        if (activeCount >= 2) break;
        const hasActiveForCountry = world.crises.some((c) => c.status === "active" && c.countryIds.includes(countryId));
        if (hasActiveForCountry) continue;
        // 2% hazard
        if (rng.next() < 0.02) {
          const template = pickCrisisTemplate(rng);
          const id = `crisis-${turn}-${countryId}-${rng.int(1000, 9999)}`;
          const crisis = {
            id,
            kind: template.kind,
            name: template.name,
            description: template.description,
            scope: template.scope as "country" | "global",
            countryIds: [countryId],
            startTurn: turn,
            durationTurns: template.durationTurns,
            effects: template.effects.map((e) => ({ ...e })),
            status: "active" as const,
            wireMessageOnStart: template.wireMessageOnStart,
            wireMessageOnEnd: template.wireMessageOnEnd,
            playerResponse: null as string | null,
          };
          world.crises.push(crisis);
          world.news.push({ turn, date, headline: template.wireMessageOnStart });
        }
      }
    }

    // Ensure CRISIS_TEMPLATES referenced (used via pickCrisisTemplate)
    void CRISIS_TEMPLATES;

    // 2. Process active crises: apply tick effects, check expiry
    for (const crisis of world.crises) {
      if (crisis.status !== "active") continue;

      // Apply per-turn effects (tick/decay scaled, flat only at onset)
      applyCrisisEffects(world, crisis, turn);

      // Expiry check
      if (crisis.durationTurns !== null && turn >= crisis.startTurn + crisis.durationTurns) {
        crisis.status = "resolved";
        crisis.endTurn = turn;
        world.news.push({ turn, date, headline: crisis.wireMessageOnEnd });
      }
    }
  },
};
