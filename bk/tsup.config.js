/**
 * @file Build configuration using tsup for bundling the library.
 * @author Alan Chen
 */
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.js'],
  format: ['cjs', 'esm'], // Build for commonJS and ESmodules
  dts: true, // Generate declaration files
  splitting: false,
  sourcemap: true,
  clean: true,
});
