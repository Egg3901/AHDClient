import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  advanceTurn,
  createWorld,
  deserializeSave,
  serializeSave,
  type NewWorldOptions,
  type WorldState,
} from "@ahdsolo/engine";

/**
 * The main process owns the world; the renderer only sees snapshots over IPC.
 * Turns are synchronous for now; move the engine to a worker thread once
 * ported systems make a turn take noticeable time.
 */
let world: WorldState | null = null;

function requireWorld(): WorldState {
  if (!world) throw new Error("No game in progress");
  return world;
}

function registerIpc(): void {
  ipcMain.handle("game:new", (_event, options: NewWorldOptions) => {
    world = createWorld(options);
    return world;
  });

  ipcMain.handle("game:advance", () => {
    const report = advanceTurn(requireWorld());
    return { report, world };
  });

  ipcMain.handle("game:state", () => world);

  ipcMain.handle("game:save", async (event) => {
    const current = requireWorld();
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { saved: false };
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: join(app.getPath("documents"), `ahdsolo-${current.meta.seed}-t${current.meta.turn}.json`),
      filters: [{ name: "AHD Solo save", extensions: ["json"] }],
    });
    if (canceled || !filePath) return { saved: false };
    await writeFile(filePath, serializeSave(current, new Date().toISOString()), "utf8");
    return { saved: true, path: filePath };
  });

  ipcMain.handle("game:load", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "AHD Solo save", extensions: ["json"] }],
    });
    const path = filePaths[0];
    if (canceled || !path) return null;
    world = deserializeSave(await readFile(path, "utf8"));
    return world;
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }
}

void app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
