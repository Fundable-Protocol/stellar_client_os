import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['e2e/**', 'node_modules/**'],
    server: {
      deps: {
        // The wallet kit is inlined so the `@stellar/freighter-api` alias
        // below applies to the import it makes.
        inline: ['@creit.tech/stellar-wallets-kit'],
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `@stellar/freighter-api` ships a UMD bundle whose named exports
      // cannot be detected by Node's CJS lexer, so the wallet kit's
      // `import { getAddress } from "@stellar/freighter-api"` throws at
      // runtime. The shim re-exports them explicitly.
      '@stellar/freighter-api': path.resolve(
        __dirname,
        './src/test-utils/freighter-api.ts'
      ),
    },
  },
});
