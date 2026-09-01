import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    // Engine ships as TS source from the workspace; bundle it, don't require it.
    plugins: [externalizeDepsPlugin({ exclude: ["@ahdsolo/engine"] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
  },
});
