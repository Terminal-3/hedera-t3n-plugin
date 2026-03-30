import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import { loadDotenvSafe } from './src/utils/env.js';

loadDotenvSafe({ path: resolve(process.cwd(), '.env') });

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'tests/', '**/*.config.ts']
    },
    testTimeout: 120000
  }
});
