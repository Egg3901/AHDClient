import {
  advanceTurn,
  applyCheat as engineApplyCheat,
  createWorld,
  deserializeSave,
  serializeSave,
  executeAction as engineExecuteAction,
  SCHEMA_VERSION,
  type NewWorldOptions,
  type TurnReport,
  type WorldState,
  type ExecuteActionParams,
  type ExecuteActionResult,
  type CheatOp,
} from "@rotunda/engine";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

let world: WorldState | null = null;

export interface GameApi {
  newGame(options: NewWorldOptions): Promise<WorldState>;
  resumeGame(loadedWorld: WorldState): WorldState;
  endGame(): void;
  advanceTurn(): Promise<{ report: TurnReport; world: WorldState }>;
  getState(): Promise<WorldState | null>;
  getStateSync(): WorldState | null;
  applyCheat(op: CheatOp): void;
  replaceWorldFromJson(raw: string): WorldState;
  executeAction(actionId: string, params?: ExecuteActionParams): ExecuteActionResult;
  save(): Promise<{ saved: boolean; path?: string }>;
  load(): Promise<WorldState | null>;
}

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>)["__game"] = null;
}
export const game: GameApi = {
  async newGame(options: NewWorldOptions): Promise<WorldState> {
    world = createWorld(options);
    return world;
  },

  resumeGame(loadedWorld: WorldState): WorldState {
    world = loadedWorld;
    return world;
  },

  endGame(): void {
    world = null;
  },

  async advanceTurn(): Promise<{ report: TurnReport; world: WorldState }> {
    if (!world) throw new Error("No game in progress");
    const report = advanceTurn(world, { now: () => performance.now() });
    return { report, world };
  },

  async getState(): Promise<WorldState | null> {
    return world;
  },

  getStateSync(): WorldState | null {
    return world;
  },

  applyCheat(op: CheatOp): void {
    if (!world) throw new Error("No game in progress");
    engineApplyCheat(world, op);
  },

  replaceWorldFromJson(raw: string): WorldState {
    let candidate: unknown;
    try {
      candidate = JSON.parse(raw);
    } catch {
      throw new Error("World JSON is not valid JSON");
    }
    const validated = deserializeSave(JSON.stringify({
      format: "ahdsolo-save",
      schemaVersion: SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      world: candidate,
    }));
    validated.meta.cheatsUsed = true;
    world = validated;
    return validated;
  },

  executeAction(actionId: string, params: ExecuteActionParams = {}): ExecuteActionResult {
    if (!world) throw new Error("No game in progress");
    return engineExecuteAction(world, "player", actionId, params);
  },

  async save(): Promise<{ saved: boolean; path?: string }> {
    if (!world) return { saved: false };
    const defaultPath = `rotunda-${world.meta.seed}-t${world.meta.turn}.json`;
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
    return game.resumeGame(deserializeSave(raw));
  },
};

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>)["__game"] = game;
}
