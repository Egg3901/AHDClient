import type { WorldState } from "./types.js";
import { advanceTurn } from "./engine.js";
import { OUTPUT_GAP_BOUND } from "./economy/macroConstants.js";
import { isWorldFeatureFlag } from "./featureFlags.js";
import type { WorldFeatureFlag } from "./featureFlags.js";
import type { WorldFeatureFlags } from "./featureFlags.js";

export type PlayerNumericField = "cash" | "actions" | "funds" | "donorBaseLevel" | "politicalInfluence" | "favorability" | "infamy" | "savings" | "wireQuotaUsedAnchor";
export type PoliticianNumericField = "favorability" | "funds" | "cash" | "actions" | "donorBaseLevel" | "politicalInfluence" | "infamy" | "partyInfluence" | "bonusActions" | "age" | "ideologyEconomic" | "ideologySocial";
export type PartyNumericField = "treasury" | "politicalStrength" | "organization" | "economicPosition" | "socialPosition" | "memberCount";

export type CheatOp =
  | { kind: "setPlayerCash"; amount: number }
  | { kind: "setPlayerField"; field: PlayerNumericField; value: number }
  | { kind: "setCountryEconomy"; countryId: string; field: "gdp" | "growthRate" | "inflationRate" | "unemploymentRate" | "outputGap"; value: number }
  | { kind: "advanceTurns"; count: number }
  | { kind: "addNews"; headline: string; category?: string }
  | { kind: "forceResolveElection"; electionId: string }
  | { kind: "setPoliticianField"; politicianId: string; field: PoliticianNumericField; value: number }
  | { kind: "setPartyField"; partyId: string; field: PartyNumericField; value: number }
  | { kind: "setFeatureFlag"; flag: WorldFeatureFlag; enabled: boolean }
  | { kind: "setFeatureFlags"; flags: Partial<WorldFeatureFlags> };

const ALLOWED_ECONOMY_FIELDS = new Set(["gdp", "growthRate", "inflationRate", "unemploymentRate", "outputGap"]);
const ALLOWED_PLAYER_FIELDS = new Set(["cash", "actions", "funds", "donorBaseLevel", "politicalInfluence", "favorability", "infamy", "savings", "wireQuotaUsedAnchor"]);
const ALLOWED_POLITICIAN_FIELDS = new Set(["favorability", "funds", "cash", "actions", "donorBaseLevel", "politicalInfluence", "infamy", "partyInfluence", "bonusActions", "age", "ideologyEconomic", "ideologySocial"]);
const ALLOWED_PARTY_FIELDS = new Set(["treasury", "politicalStrength", "organization", "economicPosition", "socialPosition", "memberCount"]);

function requireFinite(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number, got ${String(value)}`);
  }
}

function requireRange(value: number, label: string, min: number, max: number): void {
  if (value < min || value > max) throw new Error(`${label} must be in [${min},${max}], got ${String(value)}`);
}

function requireNonNegative(value: number, label: string): void {
  if (value < 0) throw new Error(`${label} must be >= 0, got ${String(value)}`);
}

function requireInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer, got ${String(value)}`);
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
    case "setPlayerField": {
      if (!ALLOWED_PLAYER_FIELDS.has(op.field)) throw new Error(`Invalid setPlayerField field: ${String(op.field)}`);
      requireFinite(op.value, `setPlayerField ${op.field}`);
      if (op.field === "politicalInfluence" || op.field === "favorability" || op.field === "infamy") {
        requireRange(op.value, op.field, 0, 100);
      } else if (op.field === "donorBaseLevel") {
        requireInteger(op.value, op.field);
        requireRange(op.value, op.field, 0, 75);
      } else if (op.field === "actions" || op.field === "wireQuotaUsedAnchor") {
        requireInteger(op.value, op.field);
        requireNonNegative(op.value, op.field);
      } else {
        requireNonNegative(op.value, op.field);
      }
      (world.player as unknown as Record<string, number>)[op.field] = op.value;
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
      if (op.field === "favorability" || op.field === "politicalInfluence" || op.field === "infamy" || op.field === "partyInfluence") {
        requireRange(op.value, op.field, 0, 100);
        politician[op.field] = op.value;
      } else if (op.field === "funds" || op.field === "cash") {
        requireNonNegative(op.value, op.field);
        politician[op.field] = op.value;
      } else if (op.field === "actions" || op.field === "bonusActions") {
        requireInteger(op.value, op.field);
        requireNonNegative(op.value, op.field);
        politician[op.field] = op.value;
      } else if (op.field === "donorBaseLevel") {
        requireInteger(op.value, op.field);
        requireRange(op.value, op.field, 0, 75);
        politician.donorBaseLevel = op.value;
      } else if (op.field === "age") {
        requireInteger(op.value, op.field);
        requireRange(op.value, op.field, 18, 120);
        politician.age = op.value;
      } else if (op.field === "ideologyEconomic") {
        requireRange(op.value, op.field, -5, 5);
        politician.ideology.economic = op.value;
      } else {
        requireRange(op.value, op.field, -5, 5);
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
        requireNonNegative(op.value, op.field);
        party.treasury = op.value;
      } else if (op.field === "politicalStrength") {
        requireRange(op.value, op.field, 0, 1000);
        party.politicalStrength = op.value;
      } else if (op.field === "organization") {
        requireRange(op.value, op.field, 0, 100);
        party.organization = op.value;
      } else if (op.field === "memberCount") {
        requireInteger(op.value, op.field);
        requireNonNegative(op.value, op.field);
        party.memberCount = op.value;
      } else if (op.field === "economicPosition") {
        requireRange(op.value, op.field, -5, 5);
        party.economicPosition = op.value;
      } else {
        requireRange(op.value, op.field, -5, 5);
        party.socialPosition = op.value;
      }
      world.meta.cheatsUsed = true;
      return;
    }
    case "setFeatureFlag": {
      if (!isWorldFeatureFlag(op.flag)) throw new Error(`Unknown feature flag: ${String(op.flag)}`);
      if (typeof op.enabled !== "boolean") throw new Error(`Feature flag ${op.flag} must be boolean`);
      world.featureFlags[op.flag] = op.enabled;
      world.meta.cheatsUsed = true;
      return;
    }
    case "setFeatureFlags": {
      if (typeof op.flags !== "object" || op.flags === null || Array.isArray(op.flags)) {
        throw new Error("Feature flags must be an object");
      }
      const updates = Object.entries(op.flags);
      if (updates.length === 0) throw new Error("Feature flags update must not be empty");
      for (const [flag, enabled] of updates) {
        if (!isWorldFeatureFlag(flag)) throw new Error(`Unknown feature flag: ${flag}`);
        if (typeof enabled !== "boolean") throw new Error(`Feature flag ${flag} must be boolean`);
      }
      for (const [flag, enabled] of updates) {
        world.featureFlags[flag as WorldFeatureFlag] = enabled as boolean;
      }
      world.meta.cheatsUsed = true;
      return;
    }
    default:
      throw new Error(`Unknown cheat kind: ${(op as { kind: string }).kind}`);
  }
}
