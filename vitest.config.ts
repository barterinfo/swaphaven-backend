import { defineConfig } from "vitest/config";
import dotenv from "dotenv";

// Load test env vars before vitest workers are spawned so all processes inherit them
dotenv.config({ path: ".env.test" });

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/helpers/setup.ts"],
    globalSetup: "./tests/helpers/global-setup.ts",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Run test files sequentially — they share a single database
    fileParallelism: false,
    reporters: ["verbose"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/openapi/**", "src/index.ts"],
    },
  },
});
