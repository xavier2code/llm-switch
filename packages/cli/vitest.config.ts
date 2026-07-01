import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/cli.ts',
        'src/config.ts',
        'src/detector.ts',
        'src/errors.ts',
        'src/fs-utils.ts',
        'src/migrate.ts',
        'src/providers.ts',
        'src/validator.ts',
        'src/state/**',
        'src/store/**',
        'src/adapters/**',
        'src/commands/register/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 74,
        statements: 80,
      },
    },
  },
});
