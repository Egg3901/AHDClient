import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_"],
  build: {
    target: "esnext",
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "../../scripts/**/*.test.mjs"],
    exclude: ["**/node_modules/**", "src-tauri/**", "dist/**"],
  },
});
