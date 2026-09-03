import type { CheatOp } from "@ahdclient/engine";
import { game } from "./game.js";

export type { CheatOp, PartyNumericField, PlayerNumericField, PoliticianNumericField } from "@ahdclient/engine";

export function applyCheat(op: CheatOp): { elapsedMs?: number } {
  const startedAt = op.kind === "advanceTurns" ? performance.now() : undefined;
  game.applyCheat(op);
  return startedAt === undefined ? {} : { elapsedMs: performance.now() - startedAt };
}

export function describeCheat(op: CheatOp, extra?: string): string {
  const suffix = extra ? ` ${extra}` : "";
  switch (op.kind) {
    case "setPlayerCash":
      return `set cash = ${op.amount.toLocaleString("en-US")}${suffix}`;
    case "setPlayerField":
      return `set player.${op.field} = ${op.value}${suffix}`;
    case "setCountryEconomy":
      return `set ${op.countryId}.${op.field} = ${op.value}${suffix}`;
    case "advanceTurns":
      return `advance ${op.count} turn${op.count === 1 ? "" : "s"}${suffix}`;
    case "addNews": {
      const category = op.category ? `[${op.category}] ` : "";
      return `news: "${category}${op.headline}"${suffix}`;
    }
    case "forceResolveElection":
      return `force resolve ${op.electionId} (resolves on next turn)${suffix}`;
    case "setPoliticianField":
      return `set politician ${op.politicianId}.${op.field} = ${op.value}${suffix}`;
    case "setPartyField":
      return `set party ${op.partyId}.${op.field} = ${op.value}${suffix}`;
    case "setFeatureFlag":
      return `${op.enabled ? "enable" : "disable"} ${op.flag}${suffix}`;
    case "setFeatureFlags":
      return `update ${Object.keys(op.flags).length} feature flags${suffix}`;
  }
}
