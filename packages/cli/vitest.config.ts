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
        'src/tui-bootstrap.ts',
        'src/action-runner.ts',
        'src/help-text.ts',
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
