// TEMPORARY - engine applyCheat/overrides pending — delete when engine ships v2
// Implements CheatOp application against the current world via the game module.
import { advanceTurn } from "@rotunda/engine";
import type { WorldState } from "@rotunda/engine";
import { game } from "./game.js";

export type CheatOp =
  | { kind: "setPlayerCash"; amount: number }
  | {
      kind: "setCountryEconomy";
      countryId: string;
      field: "gdp" | "growthRate" | "inflationRate" | "unemploymentRate" | "outputGap";
      value: number;
    }
  | { kind: "advanceTurns"; count: number }
  | { kind: "addNews"; headline: string };

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function validateCheatOp(op: CheatOp, world: WorldState): void {
  switch (op.kind) {
    case "setPlayerCash": {
      if (!isFiniteNumber(op.amount) || op.amount < 0) {
        throw new Error(`setPlayerCash amount must be a finite number >= 0, got ${String(op.amount)}`);
      }
      break;
    }
    case "setCountryEconomy": {
      const cid = op.countryId;
      if (typeof cid !== "string" || cid.trim() === "") {
        throw new Error("setCountryEconomy countryId must be a non-empty string");
      }
      if (!world.countries[cid]) {
        throw new Error(`Unknown country: ${cid}`);
      }
      const field = op.field;
      const validFields = ["gdp", "growthRate", "inflationRate", "unemploymentRate", "outputGap"] as const;
      if (!(validFields as readonly string[]).includes(field)) {
        throw new Error(`Unknown economy field: ${String(field)}`);
      }
      if (!isFiniteNumber(op.value)) {
        throw new Error(`setCountryEconomy value must be finite, got ${String(op.value)}`);
      }
      if (field === "gdp") {
        if (op.value <= 0) throw new Error(`gdp must be > 0, got ${String(op.value)}`);
      } else if (field === "outputGap") {
        // outputGap is a level; allow finite range inclusive, but require finite only per minimal contract
        // we enforce finite already; no additional 0-1 clamp for output gap
      } else {
        // growthRate, inflationRate, unemploymentRate are fractions in [0,1]
        if (op.value < 0 || op.value > 1) {
          throw new Error(`${field} must be in [0,1], got ${String(op.value)}`);
        }
      }
      break;
    }
    case "advanceTurns": {
      if (!isFiniteNumber(op.count) || !Number.isInteger(op.count) || op.count <= 0) {
        throw new Error(`advanceTurns count must be a finite integer > 0, got ${String(op.count)}`);
      }
      if (op.count > 1000) {
        throw new Error(`advanceTurns count must be <= 1000, got ${String(op.count)}`);
      }
      break;
    }
    case "addNews": {
      if (typeof op.headline !== "string" || op.headline.trim() === "") {
        throw new Error("addNews headline must be a non-empty string");
      }
      if (op.headline.length > 500) {
        throw new Error("addNews headline must be <= 500 characters");
      }
      break;
    }
    default: {
      const _exhaustive: never = op;
      throw new Error(`Unknown cheat op: ${String((_exhaustive as { kind: string }).kind)}`);
    }
  }
}

/**
 * Apply a cheat op against the current world via game.mutate.
 * Validates per contract and throws on bad input.
 * For advanceTurns, runs N turns without intermediate rendering and returns elapsedMs.
 */
export function applyCheat(op: CheatOp): { elapsedMs?: number } {
  const world = game.getStateSync();
  if (!world) throw new Error("No game in progress");

  validateCheatOp(op, world);

  switch (op.kind) {
    case "setPlayerCash": {
      game.mutate((w) => {
        w.player.cash = op.amount;
      });
      return {};
    }
    case "setCountryEconomy": {
      game.mutate((w) => {
        const c = w.countries[op.countryId];
        if (!c) throw new Error(`Unknown country: ${op.countryId}`);
        (c.economy as unknown as Record<string, number>)[op.field] = op.value;
      });
      return {};
    }
    case "advanceTurns": {
      const start = performance.now();
      game.mutate((w) => {
        for (let i = 0; i < op.count; i++) {
          advanceTurn(w);
        }
      });
      const elapsedMs = performance.now() - start;
      return { elapsedMs };
    }
    case "addNews": {
      game.mutate((w) => {
        w.news.push({ turn: w.meta.turn, date: w.meta.date, headline: op.headline.trim() });
      });
      return {};
    }
  }
}

// Helper to describe a cheat for logging
export function describeCheat(op: CheatOp, extra?: string): string {
  switch (op.kind) {
    case "setPlayerCash":
      return `set cash = ${op.amount.toLocaleString("en-US")}${extra ? ` ${extra}` : ""}`;
    case "setCountryEconomy":
      return `set ${op.countryId}.${op.field} = ${op.value}${extra ? ` ${extra}` : ""}`;
    case "advanceTurns":
      return `advance ${op.count} turn${op.count === 1 ? "" : "s"}${extra ? ` ${extra}` : ""}`;
    case "addNews":
      return `news: "${op.headline}"${extra ? ` ${extra}` : ""}`;
  }
}
