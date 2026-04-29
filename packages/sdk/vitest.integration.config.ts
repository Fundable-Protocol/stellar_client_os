import { defineConfig } from 'vitest/config';

/**
 * Vitest config for integration tests.
 *
 * These tests require a running local Soroban node (stellar-cli local network)
 * and deployed contracts. They are intentionally excluded from the standard
 * `test` / `test:watch` scripts and must be triggered explicitly via:
 *
 *   pnpm test:integration
 *
 * Environment variables (can be set in packages/sdk/.env.integration):
 *   SOROBAN_RPC_URL          – defaults to http://localhost:8000/soroban/rpc
 *   SOROBAN_NETWORK_PASSPHRASE – defaults to the standalone passphrase
 *   PAYMENT_STREAM_WASM_PATH – path to compiled payment-stream .wasm
 *   DISTRIBUTOR_WASM_PATH    – path to compiled distributor .wasm
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__integration_tests__/**/*.integration.test.ts'],
    // Give each test file a generous timeout – local node startup + contract
    // deployment can take several seconds.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Run integration test files sequentially so they don't race over the
    // shared local node.
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    // Never run in watch mode from this config.
    watch: false,
  },
});
