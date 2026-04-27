import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,

     exclude: [
      '**/__tests__/integration/**'
    ],
  },
});