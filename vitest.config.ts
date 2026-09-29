/**
 * Vitest config.
 *
 * Runs the host spec suite (every *.spec.ts) under node by default. Specs that need a
 * browser environment opt in per file with a jsdom pragma. Live API blocks stay off
 * unless RUN_LIVE_WEATHER=1, RUN_LIVE_STOCK=1 or RUN_LIVE_CALENDAR=1 is set along with any
 * key the provider needs, so the default run is offline and deterministic.
 *
 * Run via npm test, or npm run test:coverage.
 */
import { defineConfig } from 'vitest/config';
import { icaljsBundle } from './src/tools/paths.ts';

// where the watch's ical.js actually lives. src/ts/calendar/icaljs.d.ts describes it but the source
// tree has no such file. the build copies ical.js's prebuilt ES5 CommonJS bundle into emit/ beside
// the compiled calendar code, so the specs aim at that same bundle and run what the watch runs.
// the lookup is the one the build uses, so the specs and the build can never find different copies
const ICALJS = icaljsBundle();
if (!ICALJS) {
  throw new Error('ical.js is not installed, run npm install');
}

export default defineConfig({
  resolve: {
    alias: [{ find: /^\.\/icaljs$/, replacement: ICALJS }],
  },
  test: {
    // the action scripts in .github/actions/ and .github/shared/ are plain JavaScript, so their specs are too
    include: ['**/*.spec.ts', '.github/actions/**/*.spec.js', '.github/shared/**/*.spec.js'],
    // the docs site tools import packages only the docs install has, so they run on their own config
    exclude: ['**/node_modules/**', '**/build/**', 'docs/**'],
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
      // every tree that has specs so the number covers the whole suite
      include: ['src/ts/**', 'src/tools/**', 'tools/**'],
      exclude: [
        '**/*.spec.ts',
        '**/*.d.ts',
        // generated from the clay-components pieces which carry their own coverage
        // counting the assembled copies would double-book them
        '**/*.g.js',
        '**/fixtures/**',
        // the helpers the specs share, which a default run only partly touches
        'src/ts/testing/**',
        '**/build/**',
      ],
    },
  },
});
