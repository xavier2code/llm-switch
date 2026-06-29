import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/config.ts',
    'src/errors.ts',
    'src/fs-utils.ts',
    'src/migrate.ts',
    'src/providers.ts',
    'src/validator.ts',
    'src/detector.ts',
    'src/adapters/index.ts',
    'src/store/index.ts',
    'src/state/index.ts'
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node20',
});
