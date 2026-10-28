import { defineConfig } from 'tsup';

// Self-contained bundles: the server and the vendor CLI need no node_modules at runtime.
export default defineConfig({
  entry: ['src/server.ts', 'src/cli.ts'],
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
