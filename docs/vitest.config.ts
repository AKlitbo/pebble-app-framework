/**
 * Vitest config for the docs site tools.
 *
 * Their specs import marked from the docs package's own install, so they run apart from the framework's
 * suite, which skips docs/. That keeps a repo of faces from needing the docs packages just to run its
 * tests.
 *
 * Run via npm --prefix docs run test, after npm ci and npm ci --prefix docs.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    include: ['tools/**/*.spec.ts'],
  },
});
