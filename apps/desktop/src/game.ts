import {
  advanceTurn,
  createWorld,
  deserializeSave,
  serializeSave,
  type NewWorldOptions,
  type TurnReport,
  type WorldState,
} from "./engineContract.js";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

let world: WorldState | null = null;

export interface GameApi {
  newGame(options: NewWorldOptions): Promise<WorldState>;
  advanceTurn(): Promise<{ report: TurnReport; world: WorldState }>;
  getState(): Promise<WorldState | null>;
  save(): Promise<{ saved: boolean; path?: string }>;
  load(): Promise<WorldState | null>;
}

export const game: GameApi = {
  async newGame(options: NewWorldOptions): Promise<WorldState> {
    world = createWorld(options);
    return world;
  },

  async advanceTurn(): Promise<{ report: TurnReport; world: WorldState }> {
    if (!world) throw new Error("No game in progress");
    const report = advanceTurn(world);
    return { report, world };
  },

  async getState(): Promise<WorldState | null> {
    return world;
  },

  async save(): Promise<{ saved: boolean; path?: string }> {
    if (!world) return { saved: false };
    const defaultPath = `ahdsolo-${world.meta.seed}-t${world.meta.turn}.json`;
    const filePath = await save({
      defaultPath,
      filters: [{ name: "AHD Solo save", extensions: ["json"] }],
    });
    if (!filePath) return { saved: false };
    await writeTextFile(filePath, serializeSave(world, new Date().toISOString()));
    return { saved: true, path: filePath };
  },

  async load(): Promise<WorldState | null> {
    const selected = await open({
      multiple: false,
      filters: [{ name: "AHD Solo save", extensions: ["json"] }],
    });
    if (!selected || Array.isArray(selected)) return null;
    const raw = await readTextFile(selected);
    world = deserializeSave(raw);
    return world;
  },
};
