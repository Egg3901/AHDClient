import type { WorldState } from "./types.js";
import { advanceTurn } from "./engine.js";
import { OUTPUT_GAP_BOUND } from "./economy/macroConstants.js";

export type CheatOp =
  | { kind: "setPlayerCash"; amount: number }
  | { kind: "setCountryEconomy"; countryId: string; field: "gdp" | "growthRate" | "inflationRate" | "unemploymentRate" | "outputGap"; value: number }
  | { kind: "advanceTurns"; count: number }
  | { kind: "addNews"; headline: string; category?: string }
  | { kind: "forceResolveElection"; electionId: string }
  | { kind: "setPoliticianField"; politicianId: string; field: "favorability" | "funds" | "ideologyEconomic" | "ideologySocial"; value: number }
  | { kind: "setPartyField"; partyId: string; field: "treasury" | "politicalStrength" | "organization"; value: number };

const ALLOWED_ECONOMY_FIELDS = new Set(["gdp", "growthRate", "inflationRate", "unemploymentRate", "outputGap"]);
const ALLOWED_POLITICIAN_FIELDS = new Set(["favorability", "funds", "ideologyEconomic", "ideologySocial"]);
const ALLOWED_PARTY_FIELDS = new Set(["treasury", "politicalStrength", "organization"]);

function requireFinite(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number, got ${String(value)}`);
  }
}

export function applyCheat(world: WorldState, op: CheatOp): void {
  if (!op || typeof op.kind !== "string") {
    throw new Error("Invalid cheat op: missing kind");
  }

  switch (op.kind) {
    case "setPlayerCash": {
      requireFinite(op.amount, "setPlayerCash amount");
      if (op.amount < 0) throw new Error(`setPlayerCash amount must be >= 0, got ${String(op.amount)}`);
      world.player.cash = op.amount;
      world.meta.cheatsUsed = true;
      return;
    }
    case "setCountryEconomy": {
      const { countryId, field, value } = op;
      if (typeof countryId !== "string" || countryId.trim() === "") {
        throw new Error("Invalid setCountryEconomy countryId: must be a non-empty string");
      }
      if (!world.countries[countryId]) throw new Error(`Unknown country: ${countryId}`);
      if (!ALLOWED_ECONOMY_FIELDS.has(field)) throw new Error(`Invalid setCountryEconomy field: ${String(field)}`);
      requireFinite(value, "setCountryEconomy value");
      if (field === "gdp" && value <= 0) {
        throw new Error(`Invalid setCountryEconomy gdp: must be > 0, got ${String(value)}`);
      }
      if (field === "unemploymentRate" && (value < 0 || value > 1)) {
        throw new Error(`Invalid setCountryEconomy unemploymentRate: must be in [0,1], got ${String(value)}`);
      }
      if (field === "outputGap" && (value < OUTPUT_GAP_BOUND[0] || value > OUTPUT_GAP_BOUND[1])) {
        throw new Error(`Invalid setCountryEconomy outputGap: must be in [${OUTPUT_GAP_BOUND[0]},${OUTPUT_GAP_BOUND[1]}], got ${String(value)}`);
      }
      (world.countries[countryId]!.economy as unknown as Record<string, number>)[field] = value;
      world.meta.cheatsUsed = true;
      return;
    }
    case "advanceTurns": {
      const { count } = op;
      if (!Number.isFinite(count) || !Number.isInteger(count) || count <= 0 || count > 1000) {
        throw new Error(`Invalid advanceTurns count: must be a positive integer <= 1000, got ${String(count)}`);
      }
      world.meta.cheatsUsed = true;
      for (let index = 0; index < count; index++) advanceTurn(world);
      return;
    }
    case "addNews": {
      const { headline, category } = op;
      if (typeof headline !== "string" || headline.trim() === "") {
        throw new Error("Invalid addNews headline: must be a non-empty string");
      }
      if (headline.length > 500) throw new Error("Invalid addNews headline: must be <= 500 characters");
      if (category !== undefined) {
        if (typeof category !== "string" || category.trim() === "") {
          throw new Error("Invalid addNews category: must be a non-empty string when provided");
        }
        if (category.length > 32) throw new Error("Invalid addNews category: must be <= 32 characters");
        if (!/^[a-zA-Z0-9 _-]+$/.test(category)) {
          throw new Error("Invalid addNews category: must be alphanumeric, space, hyphen, or underscore");
        }
      }
      const trimmedCategory = category?.trim();
      const fullHeadline = trimmedCategory ? `[${trimmedCategory}] ${headline.trim()}` : headline.trim();
      world.news.push({ turn: world.meta.turn, date: world.meta.date, headline: fullHeadline });
      world.meta.cheatsUsed = true;
      return;
    }
    case "forceResolveElection": {
      if (typeof op.electionId !== "string" || op.electionId.trim() === "") {
        throw new Error("Invalid forceResolveElection electionId: must be a non-empty string");
      }
      const election = world.elections.find((candidate) => candidate.id === op.electionId);
      if (!election) throw new Error(`Unknown election: ${op.electionId}`);
      if (election.status !== "active") throw new Error(`Election not active: ${op.electionId} is ${election.status}`);
      election.endTurn = world.meta.turn;
      world.meta.cheatsUsed = true;
      return;
    }
    case "setPoliticianField": {
      if (typeof op.politicianId !== "string" || op.politicianId.trim() === "") {
        throw new Error("Invalid setPoliticianField politicianId: must be a non-empty string");
      }
      const politician = world.politicians.find((candidate) => candidate.id === op.politicianId);
      if (!politician) throw new Error(`Unknown politician: ${op.politicianId}`);
      if (!ALLOWED_POLITICIAN_FIELDS.has(op.field)) throw new Error(`Invalid setPoliticianField field: ${String(op.field)}`);
      requireFinite(op.value, "setPoliticianField value");
      if (op.field === "favorability") {
        if (op.value < 0 || op.value > 100) throw new Error(`favorability must be in [0,100], got ${String(op.value)}`);
        politician.favorability = op.value;
      } else if (op.field === "funds") {
        if (op.value < 0) throw new Error(`funds must be >= 0, got ${String(op.value)}`);
        politician.funds = op.value;
      } else if (op.field === "ideologyEconomic") {
        if (op.value < -5 || op.value > 5) throw new Error(`ideologyEconomic must be in [-5,5], got ${String(op.value)}`);
        politician.ideology.economic = op.value;
      } else {
        if (op.value < -5 || op.value > 5) throw new Error(`ideologySocial must be in [-5,5], got ${String(op.value)}`);
        politician.ideology.social = op.value;
      }
      world.meta.cheatsUsed = true;
      return;
    }
    case "setPartyField": {
      if (typeof op.partyId !== "string" || op.partyId.trim() === "") {
        throw new Error("Invalid setPartyField partyId: must be a non-empty string");
      }
      const party = world.parties[op.partyId];
      if (!party) throw new Error(`Unknown party: ${op.partyId}`);
      if (!ALLOWED_PARTY_FIELDS.has(op.field)) throw new Error(`Invalid setPartyField field: ${String(op.field)}`);
      requireFinite(op.value, "setPartyField value");
      if (op.field === "treasury") {
        if (op.value < 0) throw new Error(`treasury must be >= 0, got ${String(op.value)}`);
        party.treasury = op.value;
      } else if (op.field === "politicalStrength") {
        if (op.value < 0 || op.value > 1000) throw new Error(`politicalStrength must be in [0,1000], got ${String(op.value)}`);
        party.politicalStrength = op.value;
      } else {
        if (op.value < 0 || op.value > 100) throw new Error(`organization must be in [0,100], got ${String(op.value)}`);
        party.organization = op.value;
      }
      world.meta.cheatsUsed = true;
      return;
    }
    default:
      throw new Error(`Unknown cheat kind: ${(op as { kind: string }).kind}`);
  }
}
