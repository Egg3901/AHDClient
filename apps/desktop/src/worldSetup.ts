import { listCountries as listEngineCountries } from "@rotunda/engine";
import type {
  CountryEconomy,
  CountryEconomyOverride,
  NewWorldOptions,
  WorldOverrides,
  WorldState,
} from "@rotunda/engine";
import { game } from "./game.js";

export type { CountryEconomyOverride, WorldOverrides } from "@rotunda/engine";

export interface CountryRow {
  id: string;
  name: string;
  playable: boolean;
  economy: CountryEconomy;
}

export function listCountries(era: string): CountryRow[] {
  return listEngineCountries(era);
}

export function createWorldWithOverrides(
  options: NewWorldOptions,
  overrides: WorldOverrides,
): Promise<WorldState> {
  return game.newGame({ ...options, overrides });
}
