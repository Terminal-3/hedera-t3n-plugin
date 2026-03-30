/**
 * Purpose: Vitest configuration for end-to-end tests
 * Scope:   Configures test environment, coverage, timeouts, and environment variable handling
 * Inputs:  Process environment, .env file
 * Outputs: Vitest configuration object
 */

import { resolve } from "path";

import { defineConfig } from "vitest/config";

import { loadDotenvSafe } from "./src/utils/env.js";

loadDotenvSafe({ path: resolve(process.cwd(), ".env") });

export default defineConfig({
  test: {
    // E2E phases are dependency-ordered; stop on first failure.
    bail: 1,
    globals: true,
    environment: "node",
    include: ["tests/e2e/**/*.e2e.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "dist/", "tests/", "**/*.config.ts"],
    },
    // Live E2E is dependency-ordered and more stable in a single worker.
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
    testTimeout: 120000,
    // afterEach copies CCF logs on failure and runs identity cleanup; default 10s is tight for E2E.
    hookTimeout: 120000,
  },
});
