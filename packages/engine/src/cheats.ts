import type { WorldState } from "./types.js";
import { advanceTurn } from "./engine.js";
import { OUTPUT_GAP_BOUND } from "./economy/macroConstants.js";

export type CheatOp =
  | { kind: "setPlayerCash"; amount: number }
  | { kind: "setCountryEconomy"; countryId: string; field: "gdp" | "growthRate" | "inflationRate" | "unemploymentRate" | "outputGap"; value: number }
  | { kind: "advanceTurns"; count: number }
  | { kind: "addNews"; headline: string };

const ALLOWED_ECONOMY_FIELDS = new Set(["gdp", "growthRate", "inflationRate", "unemploymentRate", "outputGap"]);

export function applyCheat(world: WorldState, op: CheatOp): void {
  if (!op || typeof op.kind !== "string") {
    throw new Error("Invalid cheat op: missing kind");
  }
  switch (op.kind) {
    case "setPlayerCash": {
      const amount = (op as { kind: "setPlayerCash"; amount: number }).amount;
      if (!Number.isFinite(amount)) {
        throw new Error(`Invalid setPlayerCash amount: must be a finite number, got ${String(amount)}`);
      }
      world.player.cash = amount;
      world.meta.cheatsUsed = true;
      return;
    }
    case "setCountryEconomy": {
      const cOp = op as { kind: "setCountryEconomy"; countryId: string; field: string; value: number };
      const { countryId, field, value } = cOp;
      if (typeof countryId !== "string" || countryId.trim() === "") {
        throw new Error("Invalid setCountryEconomy countryId: must be a non-empty string");
      }
      if (!world.countries[countryId]) {
        throw new Error(`Unknown country: ${countryId}`);
      }
      if (!ALLOWED_ECONOMY_FIELDS.has(field)) {
        throw new Error(`Invalid setCountryEconomy field: ${String(field)}`);
      }
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid setCountryEconomy value: must be a finite number, got ${String(value)}`);
      }
      if (field === "gdp") {
        if (value <= 0) throw new Error(`Invalid setCountryEconomy gdp: must be > 0, got ${String(value)}`);
      } else if (field === "unemploymentRate") {
        if (value < 0 || value > 1) throw new Error(`Invalid setCountryEconomy unemploymentRate: must be in [0,1], got ${String(value)}`);
      } else if (field === "outputGap") {
        if (value < OUTPUT_GAP_BOUND[0] || value > OUTPUT_GAP_BOUND[1]) {
          throw new Error(`Invalid setCountryEconomy outputGap: must be in [${OUTPUT_GAP_BOUND[0]},${OUTPUT_GAP_BOUND[1]}], got ${String(value)}`);
        }
      } else if (field === "growthRate" || field === "inflationRate") {
        // finite already checked; same bounds as validatePack (no extra clamp)
      }
      const country = world.countries[countryId]!;
      (country.economy as unknown as Record<string, number>)[field] = value;
      world.meta.cheatsUsed = true;
      return;
    }
    case "advanceTurns": {
      const count = (op as { kind: "advanceTurns"; count: number }).count;
      if (!Number.isFinite(count) || !Number.isInteger(count) || count <= 0 || count > 100000) {
        throw new Error(`Invalid advanceTurns count: must be a positive integer <= 100000, got ${String(count)}`);
      }
      world.meta.cheatsUsed = true;
      for (let i = 0; i < count; i++) {
        advanceTurn(world);
      }
      return;
    }
    case "addNews": {
      const headline = (op as { kind: "addNews"; headline: string }).headline;
      if (typeof headline !== "string" || headline.trim() === "") {
        throw new Error("Invalid addNews headline: must be a non-empty string");
      }
      world.news.push({ turn: world.meta.turn, date: world.meta.date, headline });
      world.meta.cheatsUsed = true;
      return;
    }
    default: {
      throw new Error(`Unknown cheat kind: ${(op as { kind: string }).kind}`);
    }
  }
}
