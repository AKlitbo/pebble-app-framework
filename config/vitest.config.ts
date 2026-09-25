/**
 * Vitest config.
 *
 * Runs the host spec suite (every *.spec.ts) under node by default. Specs that need a
 * browser environment opt in per file with a jsdom pragma. Live API blocks stay off
 * unless RUN_LIVE_WEATHER=1, RUN_LIVE_STOCK=1 or RUN_LIVE_CALENDAR=1 is set along with any
 * key the provider needs, so the default run is offline and deterministic.
 *
 * Works from the framework on its own and from a repo mounting it at lib/.
 *
 * Run via npm test, or npm run test:watch and test:coverage.
 */
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { icaljsBundle } from '../tools/paths.ts';

// where the watch's ical.js actually lives. ts/calendar/icaljs.d.ts describes it but the source
// tree has no such file. the build copies ical.js's prebuilt ES5 CommonJS bundle into emit/ beside
// the compiled calendar code, so the specs aim at that same bundle and run what the watch runs.
// the lookup is the one the build uses, so the specs and the build can never find different copies
const ICALJS = icaljsBundle();
if (!ICALJS) {
  throw new Error('ical.js is not installed, run npm install');
}

// the framework's folder as seen from wherever the run starts. empty in the framework on its own, and
// whatever name a repo of faces mounts it under otherwise
const ENGINE_REL = path.relative(process.cwd(), path.resolve(import.meta.dirname, '..')).split(path.sep).join('/');
const ENGINE_PREFIX = ENGINE_REL ? `${ENGINE_REL}/` : '';

export default defineConfig({
  resolve: {
    alias: [{ find: /^\.\/icaljs$/, replacement: ICALJS }],
  },
  test: {
    // the action scripts in .github/actions/ and .github/shared/ are plain JavaScript, so their specs are too
    include: ['**/*.spec.ts', '.github/actions/**/*.spec.js', '.github/shared/**/*.spec.js'],
    // targets/ holds build-time copies of the shared sources including the specs
    // the real specs live at the root so skip the staged duplicates
    // the docs site tools import packages only the docs install has, so they run on their own config
    // and a repo of faces never needs those packages to run its tests
    exclude: ['**/node_modules/**', '**/build/**', 'targets/**', `${ENGINE_PREFIX}docs/**`],
    // dotenv/config reads .env for the live-API vars
    setupFiles: ['dotenv/config'],
    // a zone whose clocks change, so a spec built from local dates runs across daylight saving
    // wherever it runs. a UTC runner, or a zone that never changes, passed the old all-day sum too
    env: { TZ: 'America/Toronto' },
    // generous enough to cover a live API round-trip when those blocks are on
    testTimeout: 15000,
    // text for the console. html for the pages site. json-summary for the landing-page percent
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      // every tree that has specs so the number covers the whole suite, whether the run starts
      // in the framework or in a repo mounting it
      include: [
        `${ENGINE_PREFIX}ts/**`, `${ENGINE_PREFIX}tools/**`,
        'src/pkjs/**', 'src/tools/**',
        'watchfaces/**/src/pkjs/**', 'watchfaces/**/src/tools/**',
      ],
      exclude: [
        '**/*.spec.ts',
        '**/*.d.ts',
        // generated from the clay-components pieces which carry their own coverage
        // counting the assembled copies would double-book them
        '**/*.g.js',
        '**/fixtures/**',
        // the helpers the specs share, which a default run only partly touches
        `${ENGINE_PREFIX}ts/testing/**`,
        'targets/**',
        '**/build/**',
      ],
    },
  },
});
