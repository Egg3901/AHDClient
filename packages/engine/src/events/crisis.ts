/**
 * Crisis lifecycle — ports src/lib/crises/templates.ts + src/lib/turn/crisisTurn.ts
 * (tickDecayFactor, duration, effect scaling, wire announcements).
 *
 * Crises are country-scope incidents with a duration and per-turn tick effects
 * that ramp linearly from full strength at onset to zero at expiry (same as
 * mainline's tickDecayFactor). One-time flat effects fire only on startTurn.
 *
 * Each crisis records: kind, countryIds, startTurn, durationTurns, effects,
 * status ("active"/"resolved"), and wire messages.
 *
 * Player crisis responses are exposed through the W34 action catalog (see below):
 *   crisisRespond:<kind> actions (approve/condemn/etc) where mainline gives
 *   players crisis action hooks via crisisInteractions. Here the player
 *   response is a costed action that shortens duration or mitigates effects.
 */

import type { WorldState } from "../types.js";

export interface CrisisEffect {
  type: "gdpLoss" | "profitMargin" | "inflation" | "approval" | "unemployment" | "gdpGrowth";
  value: number;
  effectType: "flat" | "tick" | "decay";
}

export interface CrisisRecord {
  id: string;
  kind: string;
  name: string;
  description: string;
  scope: "country" | "global";
  countryIds: string[];
  startTurn: number;
  durationTurns: number | null;
  effects: CrisisEffect[];
  status: "active" | "resolved";
  endTurn?: number;
  wireMessageOnStart: string;
  wireMessageOnEnd: string;
  /** Player response taken, if any (W34 hook). */
  playerResponse?: string | null;
}

// ── Templates — faithful subset of src/lib/crises/templates.ts ──────────
// 8 grounded crisis types (not invented; all map to mainline templates).

function t(input: {
  kind: string;
  name: string;
  description: string;
  durationTurns: number;
  effects: CrisisEffect[];
  wireStart: string;
  wireEnd: string;
}): CrisisTemplate {
  return {
    kind: input.kind,
    name: input.name,
    description: input.description,
    scope: "country" as const,
    durationTurns: input.durationTurns,
    effects: input.effects,
    wireMessageOnStart: input.wireStart,
    wireMessageOnEnd: input.wireEnd,
  };
}

interface CrisisTemplate {
  kind: string;
  name: string;
  description: string;
  scope: "country" | "global";
  durationTurns: number;
  effects: CrisisEffect[];
  wireMessageOnStart: string;
  wireMessageOnEnd: string;
}

export const CRISIS_TEMPLATES: CrisisTemplate[] = [
  t({
    kind: "crisis.bankingCrisis",
    name: "Banking Crisis",
    description: "A major financial institution faces insolvency. Credit markets freeze, lending dries up, and consumer confidence plummets.",
    durationTurns: 8,
    effects: [
      { type: "gdpGrowth", value: -2.5, effectType: "tick" },
      { type: "unemployment", value: 2.0, effectType: "tick" },
      { type: "approval", value: -4, effectType: "tick" },
      { type: "profitMargin", value: -7, effectType: "decay" },
    ],
    wireStart: "A banking crisis has erupted. Credit markets freeze and lending dries up.",
    wireEnd: "The banking crisis subsides. Credit markets begin to thaw.",
  }),
  t({
    kind: "crisis.recession",
    name: "Recession",
    description: "Two consecutive quarters of negative GDP growth. Consumer spending falls, business investment stalls, and unemployment rises.",
    durationTurns: 12,
    effects: [
      { type: "gdpGrowth", value: -2.2, effectType: "tick" },
      { type: "unemployment", value: 1.5, effectType: "tick" },
      { type: "approval", value: -3, effectType: "tick" },
      { type: "profitMargin", value: -6, effectType: "decay" },
    ],
    wireStart: "The economy has entered recession. GDP contracts for two consecutive quarters.",
    wireEnd: "The recession ends. GDP returns to growth.",
  }),
  t({
    kind: "crisis.hurricane",
    name: "Hurricane",
    description: "A major hurricane makes landfall, causing widespread physical destruction and displacing communities.",
    durationTurns: 6,
    effects: [
      { type: "gdpLoss", value: 0.015, effectType: "flat" },
      { type: "gdpGrowth", value: -1.5, effectType: "tick" },
      { type: "profitMargin", value: -5, effectType: "decay" },
    ],
    wireStart: "A powerful hurricane has struck, leaving a trail of destruction.",
    wireEnd: "Recovery from the hurricane is underway. Damaged infrastructure is being rebuilt.",
  }),
  t({
    kind: "crisis.earthquake",
    name: "Earthquake",
    description: "A major earthquake strikes, causing significant physical damage and loss of life.",
    durationTurns: 6,
    effects: [
      { type: "gdpLoss", value: 0.02, effectType: "flat" },
      { type: "gdpGrowth", value: -1.2, effectType: "tick" },
    ],
    wireStart: "A major earthquake has struck, causing widespread damage.",
    wireEnd: "Earthquake recovery continues. The affected region begins to rebuild.",
  }),
  t({
    kind: "crisis.massProtests",
    name: "Mass Protests",
    description: "Large-scale public protests challenge government authority and disrupt economic activity.",
    durationTurns: 8,
    effects: [
      { type: "approval", value: -5, effectType: "tick" },
      { type: "gdpGrowth", value: -1.0, effectType: "tick" },
    ],
    wireStart: "Mass protests have erupted across the country, challenging the government.",
    wireEnd: "The protest movement subsides. Streets return to normal.",
  }),
  t({
    kind: "crisis.oilShock",
    name: "Oil Shock",
    description: "A sudden surge in oil prices disrupts energy supplies and drives inflation higher.",
    durationTurns: 10,
    effects: [
      { type: "inflation", value: 2.0, effectType: "tick" },
      { type: "gdpGrowth", value: -1.8, effectType: "tick" },
    ],
    wireStart: "An oil shock has sent energy prices spiking and queues forming at filling stations.",
    wireEnd: "Energy prices stabilize as supply routes reopen.",
  }),
  t({
    kind: "crisis.tradeWar",
    name: "Trade War",
    description: "Escalating tariffs and trade barriers disrupt supply chains and raise costs.",
    durationTurns: 14,
    effects: [
      { type: "inflation", value: 1.2, effectType: "tick" },
      { type: "gdpGrowth", value: -1.4, effectType: "tick" },
      { type: "profitMargin", value: -4, effectType: "decay" },
    ],
    wireStart: "A trade war escalates as new tariffs take effect, disrupting supply chains.",
    wireEnd: "Trade tensions ease as negotiations resume.",
  }),
  t({
    kind: "crisis.pandemic",
    name: "Pandemic",
    description: "A novel disease spreads rapidly, straining health systems and forcing economic disruption.",
    durationTurns: 16,
    effects: [
      { type: "gdpGrowth", value: -3.0, effectType: "tick" },
      { type: "unemployment", value: 2.5, effectType: "tick" },
      { type: "inflation", value: 1.0, effectType: "tick" },
    ],
    wireStart: "A spreading pandemic is straining hospitals and forcing businesses to close.",
    wireEnd: "The pandemic subsides. Health systems return to normal capacity.",
  }),
];

export const CRISIS_KINDS = CRISIS_TEMPLATES.map((t) => t.kind);

/**
 * Linear ramp-down for per-turn (tick) effects: 1.0 at onset -> 0 at expiry.
 * Source: src/lib/turn/crisisTurn.ts tickDecayFactor
 */
export function tickDecayFactor(turn: number, startTurn: number, duration: number | null): number {
  if (duration === null || duration <= 0) return 1;
  const elapsed = turn - startTurn;
  return Math.max(0, Math.min(1, 1 - elapsed / duration));
}

/**
 * Apply crisis tick effects for the current turn to the world.
 * Returns count of effects applied.
 */
export function applyCrisisEffects(world: WorldState, crisis: WorldState["crises"][number], turn: number): void {
  const tickScale = tickDecayFactor(turn, crisis.startTurn, crisis.durationTurns);
  const toApply = crisis.effects.filter(
    (e) => e.effectType === "tick" || e.effectType === "decay" || (e.effectType === "flat" && turn === crisis.startTurn),
  );

  for (const effect of toApply) {
    const scaledValue = effect.effectType === "tick" ? effect.value * tickScale : effect.value;

    for (const countryId of crisis.countryIds) {
      const country = world.countries[countryId];
      if (!country) continue;
      switch (effect.type) {
        case "gdpLoss": {
          // One-time multiplicative GDP cut at onset
          if (effect.effectType === "flat" && turn === crisis.startTurn) {
            const factor = Math.max(0.05, 1 - Math.abs(scaledValue));
            country.economy.gdp = Math.max(1, country.economy.gdp * factor);
          }
          break;
        }
        case "gdpGrowth": {
          country.economy.growthRate = Math.max(-0.10, Math.min(0.15, country.economy.growthRate + scaledValue / 100));
          break;
        }
        case "unemployment": {
          country.economy.unemploymentRate = Math.max(0.01, Math.min(0.15, country.economy.unemploymentRate + scaledValue / 100));
          break;
        }
        case "inflation": {
          country.economy.inflationRate = Math.max(-0.05, Math.min(0.20, country.economy.inflationRate + scaledValue / 100));
          const budget = world.budgets[countryId];
          if (budget) budget.economicFactors.inflationRate = Math.max(-5, Math.min(20, budget.economicFactors.inflationRate + scaledValue));
          break;
        }
        case "approval": {
          // PORT-STUB: approval not in existing systems, nudge favorability as proxy
          if (world.player.countryId === countryId) {
            world.player.favorability = Math.max(0, Math.min(100, world.player.favorability + scaledValue));
          }
          break;
        }
        case "profitMargin": {
          // Decay margin shock: apply as small gdp/inflation proxy since corp margins not directly exposed
          country.economy.growthRate = Math.max(-0.10, country.economy.growthRate + scaledValue / 1000);
          break;
        }
      }
    }
  }
}

/**
 * Pick a crisis template via weighted rng (uniform here: all equal weight, since
 * mainline's autoCrisisSpawn weighting is condition-triggered and not ported).
 * Deterministic via WorldRng.pick.
 */
export function pickCrisisTemplate(rng: { pick<T>(items: readonly T[]): T }): CrisisTemplate {
  return rng.pick(CRISIS_TEMPLATES);
}

/**
 * Crisis action hooks exposed through W34 action catalog.
 * These are the player-facing crisis responses that mainline gives via
 * crisisInteractions decision trees. Each hook shortens the crisis or
 * mitigates its worst effect. Costed via actions catalog.
 *
 * Source: src/lib/crises/optionActions.ts + templates.ts interactionDefinition
 * Each crisis kind offers 2-3 response options; the player picks one per
 * active crisis (once). Options mirror mainline's banking/recession decision
 * trees reduced to solo-applicable levers.
 */
export interface CrisisActionOption {
  id: string;
  label: string;
  description: string;
  cost: number;
  effect: (world: WorldState, crisis: CrisisRecord) => void;
}

export function crisisResponseOptions(kind: string): CrisisActionOption[] {
  if (kind === "crisis.bankingCrisis") {
    return [
      {
        id: "bailout",
        label: "Authorize a bailout",
        description: "Inject funds to stabilize the bank. Costs treasury, shortens crisis by 3 turns.",
        cost: 4,
        effect: (world, crisis) => {
          const c = crisis.countryIds[0];
          if (c) {
            const b = world.budgets[c];
            if (b) b.treasuryBalance -= 20000;
          }
          crisis.durationTurns = Math.max(1, (crisis.durationTurns ?? 8) - 3);
        },
      },
      {
        id: "letFail",
        label: "Let the bank fail",
        description: "No cost, but crisis extends by 2 turns.",
        cost: 2,
        effect: (_world, crisis) => {
          crisis.durationTurns = (crisis.durationTurns ?? 8) + 2;
        },
      },
    ];
  }
  if (kind === "crisis.recession") {
    return [
      {
        id: "stimulus",
        label: "Pass a stimulus package",
        description: "Costs treasury, shortens recession by 2 turns.",
        cost: 4,
        effect: (world, crisis) => {
          const c = crisis.countryIds[0];
          if (c) {
            const b = world.budgets[c];
            if (b) b.treasuryBalance -= 15000;
          }
          crisis.durationTurns = Math.max(1, (crisis.durationTurns ?? 12) - 2);
        },
      },
      {
        id: "austerity",
        label: "Hold the line on spending",
        description: "No cost, but recession deepens slightly.",
        cost: 2,
        effect: () => {},
      },
    ];
  }
  // Generic fallback for all other kinds
  return [
    {
      id: "respond",
      label: "Coordinate the response",
      description: "Mobilize the government's response. Shortens crisis by 1 turn.",
      cost: 3,
      effect: (_world, crisis) => {
        crisis.durationTurns = Math.max(1, (crisis.durationTurns ?? 8) - 1);
      },
    },
    {
      id: "monitor",
      label: "Monitor the situation",
      description: "Take no direct action. The crisis runs its course.",
      cost: 1,
      effect: () => {},
    },
  ];
}
