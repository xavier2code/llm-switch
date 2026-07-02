import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { cli: 'src/cli.ts' },
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  shims: false,
  bundle: true,
  noExternal: ['@xavier2code/llm-switch-core', '@xavier2code/llm-switch-tui'],
  external: ['react-devtools-core'],
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});
