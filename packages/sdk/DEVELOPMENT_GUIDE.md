# SDK Development Guide

This guide covers how to set up, develop, test, and maintain the `@fundable/sdk` package within the monorepo.

---

## Prerequisites

- **Node.js** ≥ 20.x
- **pnpm** ≥ 8.x (configured via corepack)
- **Rust** (for Soroban contract compilation, if modifying contracts)

```bash
# Enable corepack to use pnpm
corepack enable
```

---

## Local Development Setup

### 1. Install Dependencies

From the monorepo root:

```bash
cd packages/sdk
pnpm install
```

Or from the monorepo root using workspace filter:

```bash
pnpm install --filter @fundable/sdk
```

### 2. Build the SDK

```bash
pnpm build
```

This runs `tsc` to compile TypeScript to the `dist/` directory.

### 3. Watch Mode (Development)

For incremental builds during development:

```bash
pnpm dev
```

This runs `tsc --watch` to automatically rebuild on file changes.

---

## Running Tests

### Run All Tests

```bash
pnpm test
```

This runs `vitest --run` which executes all test files matching `src/**/*.test.ts`.

### Run Tests in Watch Mode

```bash
pnpm test:watch
```

Useful for TDD — tests re-run on file changes.

### Test Coverage

The SDK is configured with Vitest coverage. Run tests with coverage:

```bash
pnpm test --coverage
```

Coverage thresholds (defined in [vitest.config.ts](packages/sdk/vitest.config.ts)):

| Metric       | Threshold |
|--------------|-----------|
| Lines        | 80%       |
| Statements   | 80%       |
| Functions    | 85%       |
| Branches     | 75%       |

Coverage reports are generated in `packages/sdk/coverage/`.

---

## Linting & Formatting

### Lint

```bash
pnpm lint
```

Runs ESLint on all TypeScript files in `src/`.

### Format

```bash
pnpm format
```

Formats code using Prettier (writes changes).

### Check Formatting

```bash
pnpm format:check
```

Verifies code formatting without making changes.

---

## Project Structure

```
packages/sdk/
├── src/
│   ├── index.ts              # Main exports
│   ├── PaymentStreamClient.ts
│   ├── DistributorClient.ts
│   ├── utils/                # Utility functions
│   ├── deployer/             # Contract deployment helpers
│   ├── generated/            # Auto-generated contract bindings
│   └── __tests__/            # Test files
├── dist/                     # Compiled output (gitignored)
├── vitest.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## Common Tasks

### Adding a New Export

1. Add the export to `src/index.ts`
2. Ensure the source file is in `src/`
3. Run `pnpm build` to verify TypeScript compiles
4. Run `pnpm test` to ensure no regressions

### Writing a New Test

1. Create a test file in `src/__tests__/<feature>.test.ts`
2. Use Vitest's API:

```typescript
import { describe, it, expect } from 'vitest';

describe('myFeature', () => {
  it('should do something', () => {
    expect(true).toBe(true);
  });
});
```

3. Run `pnpm test` to execute

### Building for Publication

```bash
pnpm build
```

The `dist/` folder will contain the compiled JavaScript, types, and source maps ready for npm publication.

---

## Coding Standards

Follow the [STYLE_GUIDE.md](../../STYLE_GUIDE.md) for general TypeScript conventions. SDK-specific rules:

- **No React dependencies** — The SDK is framework-agnostic
- **Peer dependency** — `@stellar/stellar-sdk` is a peer dependency, not bundled
- **Strict TypeScript** — All strict checks enabled in `tsconfig.json`
- **ESM exports** — Use ES modules in `package.json` `exports` field

---

## Troubleshooting

### "Cannot find module '@stellar/stellar-sdk'"

Ensure the peer dependency is installed in your consuming project:

```bash
pnpm add @stellar/stellar-sdk
```

### Type errors after pulling latest

Run a clean build:

```bash
rm -rf dist && pnpm build
```

### Tests failing after merging

Ensure dependencies are up to date:

```bash
pnpm install
pnpm test
```

---

## Related Documentation

- [README.md](packages/sdk/README.md) — SDK usage and API reference
- [STYLE_GUIDE.md](../../STYLE_GUIDE.md) — General coding standards
- [TESTING_GUIDE.md](../../TESTING_GUIDE.md) — Testing best practices