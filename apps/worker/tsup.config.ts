import { defineConfig } from 'tsup';

// Bundles the worker and all of its dependencies into a single file, so the runtime
// image needs no node_modules. The banner lets bundled CommonJS code call require().
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  sourcemap: true,
  noExternal: [/.*/],
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
