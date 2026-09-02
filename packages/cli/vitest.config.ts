import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The QA suite intentionally runs every shipped era/country pair.
    testTimeout: 180_000,
  },
});
