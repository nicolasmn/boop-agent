import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['server/**/*.ts'],
      exclude: ['server/env-setup.ts'],
    },
  },
  resolve: {
    // strip .js extensions for ts source imports
    extensionAlias: { '.js': ['.ts', '.js'] },
  },
});
