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
  | { kind: "addNews"; headline: string; category?: string }
  | { kind: "forceResolveElection"; electionId: string }
  | {
      kind: "setPoliticianField";
      politicianId: string;
      field: "favorability" | "funds" | "ideologyEconomic" | "ideologySocial";
      value: number;
    }
  | {
      kind: "setPartyField";
      partyId: string;
      field: "treasury" | "politicalStrength" | "organization";
      value: number;
    };

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
        // fractions; growth and inflation may be negative, unemployment cannot
        const min = field === "unemploymentRate" ? 0 : -1;
        if (op.value < min || op.value > 1) {
          throw new Error(`${field} must be in [${min},1], got ${String(op.value)}`);
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
      if (op.category !== undefined) {
        if (typeof op.category !== "string" || op.category.trim() === "") {
          throw new Error("addNews category must be a non-empty string when provided");
        }
        if (op.category.length > 32) {
          throw new Error("addNews category must be <= 32 characters");
        }
        if (!/^[a-zA-Z0-9 _-]+$/.test(op.category)) {
          throw new Error("addNews category must be alphanumeric, space, hyphen or underscore");
        }
      }
      break;
    }
    case "forceResolveElection": {
      if (typeof op.electionId !== "string" || op.electionId.trim() === "") {
        throw new Error("forceResolveElection electionId must be a non-empty string");
      }
      const rec = world.elections.find((e) => e.id === op.electionId);
      if (!rec) {
        throw new Error(`Unknown election: ${op.electionId}`);
      }
      if (rec.status !== "active") {
        throw new Error(`Election not active: ${op.electionId} is ${rec.status}`);
      }
      break;
    }
    case "setPoliticianField": {
      if (typeof op.politicianId !== "string" || op.politicianId.trim() === "") {
        throw new Error("setPoliticianField politicianId must be a non-empty string");
      }
      const pol = world.politicians.find((p) => p.id === op.politicianId);
      if (!pol) {
        throw new Error(`Unknown politician: ${op.politicianId}`);
      }
      const valid = ["favorability", "funds", "ideologyEconomic", "ideologySocial"] as const;
      if (!(valid as readonly string[]).includes(op.field)) {
        throw new Error(`Unknown politician field: ${String(op.field)}`);
      }
      if (!isFiniteNumber(op.value)) {
        throw new Error(`setPoliticianField value must be finite, got ${String(op.value)}`);
      }
      if (op.field === "favorability") {
        if (op.value < 0 || op.value > 100) {
          throw new Error(`favorability must be in [0,100], got ${String(op.value)}`);
        }
      } else if (op.field === "funds") {
        if (op.value < 0) {
          throw new Error(`funds must be >= 0, got ${String(op.value)}`);
        }
      } else if (op.field === "ideologyEconomic" || op.field === "ideologySocial") {
        if (op.value < -5 || op.value > 5) {
          throw new Error(`${op.field} must be in [-5,5], got ${String(op.value)}`);
        }
      }
      break;
    }
    case "setPartyField": {
      if (typeof op.partyId !== "string" || op.partyId.trim() === "") {
        throw new Error("setPartyField partyId must be a non-empty string");
      }
      const party = world.parties[op.partyId];
      if (!party) {
        throw new Error(`Unknown party: ${op.partyId}`);
      }
      const valid = ["treasury", "politicalStrength", "organization"] as const;
      if (!(valid as readonly string[]).includes(op.field)) {
        throw new Error(`Unknown party field: ${String(op.field)}`);
      }
      if (!isFiniteNumber(op.value)) {
        throw new Error(`setPartyField value must be finite, got ${String(op.value)}`);
      }
      if (op.field === "treasury") {
        if (op.value < 0) {
          throw new Error(`treasury must be >= 0, got ${String(op.value)}`);
        }
      } else if (op.field === "politicalStrength") {
        if (op.value < 0 || op.value > 1000) {
          throw new Error(`politicalStrength must be in [0,1000], got ${String(op.value)}`);
        }
      } else if (op.field === "organization") {
        if (op.value < 0 || op.value > 100) {
          throw new Error(`organization must be in [0,100], got ${String(op.value)}`);
        }
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
        w.meta.cheatsUsed = true;
      });
      return {};
    }
    case "setCountryEconomy": {
      game.mutate((w) => {
        const c = w.countries[op.countryId];
        if (!c) throw new Error(`Unknown country: ${op.countryId}`);
        (c.economy as unknown as Record<string, number>)[op.field] = op.value;
        w.meta.cheatsUsed = true;
      });
      return {};
    }
    case "advanceTurns": {
      const start = performance.now();
      game.mutate((w) => {
        w.meta.cheatsUsed = true;
        for (let i = 0; i < op.count; i++) {
          advanceTurn(w);
        }
      });
      const elapsedMs = performance.now() - start;
      return { elapsedMs };
    }
    case "addNews": {
      game.mutate((w) => {
        const headline = op.headline.trim();
        const cat = op.category?.trim();
        const full = cat ? `[${cat}] ${headline}` : headline;
        w.news.push({ turn: w.meta.turn, date: w.meta.date, headline: full });
        w.meta.cheatsUsed = true;
      });
      return {};
    }
    case "forceResolveElection": {
      game.mutate((w) => {
        const rec = w.elections.find((e) => e.id === op.electionId);
        if (!rec) throw new Error(`Unknown election: ${op.electionId}`);
        if (rec.status !== "active") throw new Error(`Election not active: ${op.electionId} is ${rec.status}`);
        rec.endTurn = w.meta.turn;
        w.meta.cheatsUsed = true;
      });
      return {};
    }
    case "setPoliticianField": {
      game.mutate((w) => {
        const pol = w.politicians.find((p) => p.id === op.politicianId);
        if (!pol) throw new Error(`Unknown politician: ${op.politicianId}`);
        if (op.field === "favorability") {
          pol.favorability = op.value;
        } else if (op.field === "funds") {
          pol.funds = op.value;
        } else if (op.field === "ideologyEconomic") {
          pol.ideology.economic = op.value;
        } else if (op.field === "ideologySocial") {
          pol.ideology.social = op.value;
        }
        w.meta.cheatsUsed = true;
      });
      return {};
    }
    case "setPartyField": {
      game.mutate((w) => {
        const party = w.parties[op.partyId];
        if (!party) throw new Error(`Unknown party: ${op.partyId}`);
        if (op.field === "treasury") {
          party.treasury = op.value;
        } else if (op.field === "politicalStrength") {
          party.politicalStrength = op.value;
        } else if (op.field === "organization") {
          party.organization = op.value;
        }
        w.meta.cheatsUsed = true;
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
    case "addNews": {
      const cat = op.category ? `[${op.category}] ` : "";
      return `news: "${cat}${op.headline}"${extra ? ` ${extra}` : ""}`;
    }
    case "forceResolveElection":
      return `force resolve ${op.electionId} (resolves on next turn)${extra ? ` ${extra}` : ""}`;
    case "setPoliticianField":
      return `set politician ${op.politicianId}.${op.field} = ${op.value}${extra ? ` ${extra}` : ""}`;
    case "setPartyField":
      return `set party ${op.partyId}.${op.field} = ${op.value}${extra ? ` ${extra}` : ""}`;
  }
}
