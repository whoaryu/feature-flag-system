import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['sdk.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  minify: true,
  sourcemap: true,
  external: ['murmurhash-js'],
});
