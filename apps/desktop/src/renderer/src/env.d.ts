import type { GameApi } from "../../preload/index.js";

declare global {
  interface Window {
    game: GameApi;
  }
}

export {};
