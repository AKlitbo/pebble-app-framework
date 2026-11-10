/**
 * Specs for bundling a plugin app's script.
 *
 * The Pebble app loads a plugin's script as one file, so everything the plugin reaches has to be in
 * plugin.js, ical.js included. The parts worth pinning are the ones that only show on a phone or in a
 * published pbw: the framework's `./icaljs` import landing on the prebuilt ical.js, the bundle running
 * with no module loader, ical.js's MPL header surviving the bundle, which is what its licence asks of a
 * larger work, and no path from the machine that built it. The fixture plugin app under fixtures/
 * reaches the framework's iCal reader for all of them, and is bundled once for the specs that read it.
 *
 * The feed's moment is fixed at Friday 10 July 2026, 12:00 UTC.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { afterAll, beforeAll, describe, test, expect } from 'vitest';
import esbuild from 'esbuild';
import { bundlePlugin, icaljsPlugin } from './build-plugin';
import { checkPluginApp } from '../manifest/build-manifests';
import { tempDir } from '../../ts/testing/temp-dir.ts';

const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'plugin-app');
const FIXTURE_APPINFO = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'pebble.appinfo.json'), 'utf8'));

// Friday 10 July 2026, 12:00 UTC
const NOW = Date.UTC(2026, 6, 10, 12) / 1000;

const FEED = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n' +
  'BEGIN:VEVENT\r\nUID:standup@example.com\r\nDTSTART:20240108T090000Z\r\nDTEND:20240108T093000Z\r\n' +
  'RRULE:FREQ=WEEKLY;BYDAY=MO\r\nSUMMARY:Standup\r\nEND:VEVENT\r\n' +
  'END:VCALENDAR\r\n';

type Parsed = Array<{ title: string; startEpoch: number; uid?: string }>;

/** Runs a bundle where there is no require and no module loader, as on the phone, and hands back what it parsed. */
function runBundle(bundle: string): Parsed | undefined {
  const scope: { feed: string; now: number; parsed?: Parsed } = { feed: FEED, now: NOW };

  vm.runInNewContext(bundle, { globalThis: scope, console });

  return scope.parsed;
}

describe('bundlePlugin', () => {
  // bundled once for every spec that only reads it. tempDir cleans up after a test, so the shared
  // folder is made and removed here
  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'paf-plugin-bundle-'));
  let bundle = '';

  beforeAll(async () => {
    const outFile = path.join(shared, 'plugin.js');

    await bundlePlugin(FIXTURE, outFile, FIXTURE_APPINFO.name);
    bundle = fs.readFileSync(outFile, 'utf8');
  });

  afterAll(() => {
    fs.rmSync(shared, { recursive: true, force: true });
  });

  /** The specs below bundle this fixture as a plugin app, so it has to be one the build accepts. */
  test('bundles a fixture the build accepts as a plugin app', () => {
    const result = () => checkPluginApp(FIXTURE_APPINFO, 'fixture-plugin');

    expect(result).not.toThrow();
  });

  /** A `./icaljs` that did not land on the prebuilt ical.js fails on the phone, and the plugin serves nothing. */
  test('bundles the iCal reader and ical.js into one script that runs with no module loader', () => {
    const result = runBundle(bundle);

    expect(result?.map((event) => [event.title, event.startEpoch, event.uid])).toEqual([['Standup', Date.UTC(2026, 6, 13, 9) / 1000, 'standup@example.com']]);
  });

  /** esbuild leaves a plain comment out of a bundle, and the MPL asks that ical.js keep its notice in a larger work. */
  test('keeps ical.js\'s MPL licence header in the bundle', () => {
    const result = bundle.includes('This Source Code Form is subject to the terms of the Mozilla Public');

    expect(result).toBe(true);
  });

  /** A path from the machine that built it would ship in the pbw and make every build of the same plugin differ. */
  test('names no absolute path from the machine that built it', () => {
    // a Windows drive followed by a backslash, or a home folder on Linux, WSL, or macOS. a URL's scheme
    // is followed by a forward slash, so ical.js's own licence link does not count
    const result = bundle.match(/(?<![A-Za-z])[A-Za-z]:\\|\/(home|Users|mnt)\/|paf-icaljs:/g);

    expect(result).toBeNull();
  });

  /** The SDK stops on a plugin.js that does not exist, far from the plugin app that has no script. */
  test('refuses a plugin app with no script, naming where it starts', async () => {
    const empty = tempDir('paf-plugin-empty-');

    const result = bundlePlugin(empty, path.join(empty, 'plugin.js'), 'empty-plugin');

    await expect(result).rejects.toThrow('empty-plugin is a plugin app with no src/plugin/index.ts, which is where its script starts');
  });
});

describe('icaljsPlugin', () => {
  /** esbuild drops an unmarked header, so an ical.js whose header moved would ship in a pbw with no MPL notice and nothing said. */
  test('stops a bundle whose ical.js does not open with its MPL header', async () => {
    const dir = tempDir('paf-plugin-header-');
    const reader = path.join(dir, 'reader.js');
    const ical = path.join(dir, 'ical.cjs');

    fs.writeFileSync(reader, "import ICAL from './icaljs';\nglobalThis.ICAL = ICAL;\n");
    fs.writeFileSync(ical, "'use strict';\nmodule.exports = {};\n");

    const result = esbuild.build({ entryPoints: [reader], bundle: true, write: false, logLevel: 'silent', plugins: [icaljsPlugin(ical)] });

    await expect(result).rejects.toThrow(/does not open with its MPL licence header/);
  });
});
