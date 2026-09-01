import { contextBridge, ipcRenderer } from "electron";
import type { NewWorldOptions, TurnReport, WorldState } from "@ahdsolo/engine";

export interface GameApi {
  newGame(options: NewWorldOptions): Promise<WorldState>;
  advanceTurn(): Promise<{ report: TurnReport; world: WorldState }>;
  getState(): Promise<WorldState | null>;
  save(): Promise<{ saved: boolean; path?: string }>;
  load(): Promise<WorldState | null>;
}

const api: GameApi = {
  newGame: (options) => ipcRenderer.invoke("game:new", options),
  advanceTurn: () => ipcRenderer.invoke("game:advance"),
  getState: () => ipcRenderer.invoke("game:state"),
  save: () => ipcRenderer.invoke("game:save"),
  load: () => ipcRenderer.invoke("game:load"),
};

contextBridge.exposeInMainWorld("game", api);
