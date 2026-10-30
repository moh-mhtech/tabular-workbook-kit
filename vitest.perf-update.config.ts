import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/perf/updateBaseline.test.ts"],
    env: {
      PERF_UPDATE_BASELINE: "1",
    },
  },
});
