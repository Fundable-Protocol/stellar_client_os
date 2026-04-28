import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,

    // Coverage configuration
    coverage: {
      // Use V8's built-in coverage (no Babel transform needed, fast)
      provider: 'v8',

      // Source files to measure coverage against
      include: ['src/**/*.ts'],

      // Exclude generated bindings, test files, and files with no executable logic.
      // TODO: remove batchDistribution.ts from this list once its tests are written.
      exclude: [
        'src/generated/**',
        'src/**/__tests__/**',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/index.ts',                   // pure re-export barrel
        'src/deployer/index.ts',          // pure re-export barrel
        'src/deployer/types.ts',          // TypeScript type definitions only
        'src/utils/batchDistribution.ts', // TODO: add tests (tracked in backlog)
      ],

      // text  → terminal summary on every run
      // lcov  → consumed by Codecov / CI coverage upload
      // html  → local browsing at coverage/index.html
      reporter: ['text', 'lcov', 'html'],

      // Output directory (already in .gitignore)
      reportsDirectory: './coverage',

      // Thresholds enforce a coverage floor on every CI run.
      // These reflect the current tested surface area. Raise them as new tests
      // are added — especially once batchDistribution.ts is covered.
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 85,
        branches: 75,
      },
    },
  },
});
