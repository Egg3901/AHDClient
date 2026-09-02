import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Long-run election and invariant proofs execute synchronously. Under the
    // parallel pool, a single 700-turn proof can take about 16 minutes.
    testTimeout: 1_200_000,
  },
});
