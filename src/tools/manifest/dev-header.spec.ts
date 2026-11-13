/**
 * Specs for the C header a dev build compiles its harness from.
 *
 * The header is C written from JSON, so what is worth pinning is what the C would get wrong without a
 * word: text that has to land on the watch byte for byte, the slice of the settings table each step
 * reads, a heart rate curve that has to end on the latest minute, and a struct tm date the watch never
 * works out for itself. A header left behind by a dev build must not survive a release build either.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { tempDir } from '../../ts/testing/temp-dir.ts';
import { DEV_HEADER, cString, completeSteps, renderDevHeader, writeDevHeader, type HeaderFacts } from './dev-header.ts';
import { readDevHarness, switchesFor, type DevSwitches } from './dev-switches.ts';

const FILE = 'mosaic/paf.dev.config.json';

/** A face with the keys and defines the specs below seed. */
const FACTS: HeaderFacts = { face: 'gridlock', keys: ['APPEARANCE_THEME', 'LAYOUT', 'CLOCK_TIMEZONE_1'], defines: {}, thumbnails: [] };

/** The switches the file gives a face with no entry of its own. */
function switches(file: Record<string, unknown>): DevSwitches {
  return readDevHarness(file, FILE, () => ['gridlock']).unit;
}

describe('cString', () => {
  /** The watch's buffers hold UTF-8, so each byte has to land as written, and a hex escape would eat the digit after it. */
  test('writes a quote, a backslash, and each byte past ASCII as an escape', () => {
    const result = cString('Mom\'s "é" \\ 1');

    expect(result).toBe('"Mom\'s \\"\\303\\251\\" \\\\ 1"');
  });

  /** Two question marks can make a trigraph, which an older compiler turns into another character. */
  test('escapes a question mark', () => {
    const result = cString('??=');

    expect(result).toBe('"\\077\\077="');
  });
});

describe('renderDevHeader', () => {
  /** The catalogue reads each setting off its MESSAGE_KEY, and text goes in as a string for a face's own field. */
  test('writes each launch setting on its message key', () => {
    const result = renderDevHeader(switches({ settings: { APPEARANCE_THEME: 1, CLOCK_TIMEZONE_1: '0,Time Zone 1' } }), FACTS);

    expect(result).toContain('    { &MESSAGE_KEY_APPEARANCE_THEME, DEV_VALUE_NUMBER, 1, NULL },\n    { &MESSAGE_KEY_CLOCK_TIMEZONE_1, DEV_VALUE_TEXT, 0, "0,Time Zone 1" },\n');
    expect(result).toContain('#define DEV_CONFIG_DICT_SIZE 33\n');
  });

  /** A struct tm counts years from 1900 and months from 0, and the watch never works out the weekday itself. */
  test('writes a pinned date the way a struct tm counts it', () => {
    const result = renderDevHeader(switches({ date: '2026-07-13' }), FACTS);

    expect(result).toContain('#define DEV_CONFIG_YEAR 126 ///< years since 1900, as a struct tm counts them\n#define DEV_CONFIG_MONTH 6 ///< 0 for January\n#define DEV_CONFIG_DAY 13\n#define DEV_CONFIG_WEEKDAY 1 ///< 0 for Sunday\n#define DEV_CONFIG_YEAR_DAY 193');
  });

  /** Each step reads its own slice of one settings table, so an offset one out applies the next step's settings. */
  test('gives each step of a step walk its slice of the settings table', () => {
    const file = { walk: 'presets', walks: { presets: { steps: [{ settings: { APPEARANCE_THEME: 1 }, layout: '1,0,0,4,1' }, { layout: '2,0,0,2,2' }, { settings: { APPEARANCE_THEME: 3 } }] } } };

    const result = renderDevHeader(switches(file), FACTS);

    expect(result).toContain('static const DevStep s_dev_steps[] = {\n    { 0, 1, "1,0,0,4,1" },\n    { 1, 1, "2,0,0,2,2" },\n    { 2, 1, "2,0,0,2,2" },\n};');
  });

  /** The store keeps the last hour newest last, so a shorter curve has to be the latest minutes, not the earliest. */
  test('pads a short heart rate curve at the front', () => {
    const result = renderDevHeader(switches({ stores: { health: { hrHistory: [90, 91] } } }), FACTS);

    expect(result).toContain(`static const uint8_t s_dev_hr_history[60] = { ${'0, '.repeat(58)}90, 91 };`);
  });

  /** A panel walk's ids are the face's C names, so the header has to include where they come from. */
  test('includes the panels header ahead of a panel walk\'s table', () => {
    const file = {
      walk: 'new',
      walks: { new: { panels: { '1x2': ['phone-battery'] } } },
      panels: { include: 'engine/catalog.h', sizes: { '1x2': { id: 'MSIZE_1x2', crop: { left: 4, top: 94, width: 94, height: 40 } } }, ids: { 'phone-battery': 'MOD_SYSTEM_PHONE_BATTERY' } },
    };

    const result = renderDevHeader(switches(file), FACTS);

    expect(result).toContain('#include "engine/catalog.h"\n#define DEV_CONFIG_WALK_PANELS 1\n#define DEV_CONFIG_WALK_COUNT 1\nstatic const DevPanel s_dev_panels[] = {\n    { MOD_SYSTEM_PHONE_BATTERY, MSIZE_1x2 }, // phone-battery-1x2\n};');
  });

  /** A setting on a key the face lacks would stop the C on an undeclared MESSAGE_KEY with nothing to say where it came from. */
  test('refuses a step setting on a key the face does not declare', () => {
    const file = { walk: 'presets', walks: { presets: { steps: [{ settings: { APPEARANCE_ANALOG_STYLE: 1 } }, { layout: '2,0,0,2,2' }] } } };

    const call = () => renderDevHeader(switches(file), FACTS);

    expect(call).toThrow("sets gridlock's walks.presets.steps[0].settings.APPEARANCE_ANALOG_STYLE, which gridlock does not declare");
  });

  /** The watch dates each HRV reading back from the pinned clock, so a walk's earlier clock would put the face's log in the future. */
  test('refuses an HRV log past the clock a walk pins', () => {
    const file = { clock: '20:42', stores: { health: { hrvLog: [{ from: '20:00', ms: [40] }] } }, walk: 'clocks', walks: { clocks: { clock: '10:09', steps: [{ layout: 'a' }, { layout: 'b' }] } } };
    const picked = switchesFor(readDevHarness(file, FILE, () => ['gridlock']), 'gridlock');

    const call = () => renderDevHeader(picked, { ...FACTS, defines: { HEALTH_HRV: 1 } });

    expect(call).toThrow("pins gridlock's clock at 10:09, but its HRV log has a reading at 20:00");
  });

  /** A panel walk with no panels block has no ids to show and no crops to cut. */
  test('refuses a panel walk with no panels block', () => {
    const call = () => renderDevHeader(switches({ walk: 'new', walks: { new: { panels: 'all' } } }), FACTS);

    expect(call).toThrow("walks gridlock's new through panels, but has no panels block");
  });
});

describe('completeSteps', () => {
  /** A step that only set its own settings left the last step's behind, so the walk never came back to its first screen. */
  test('gives every step every setting the walk touches, from the launch settings where it sets none', () => {
    const steps = [
      { settings: { LAYOUT_NIGHT_START: 42, LAYOUT_NIGHT_MODE: 2 }, layout: 'day' },
      { settings: { LAYOUT_NIGHT_START: 41, APPEARANCE_THEME: 3 }, layout: null },
    ];

    const result = completeSteps(steps, { APPEARANCE_THEME: 1 }, 'gridlock', 'night');

    expect(result).toEqual([
      { settings: { LAYOUT_NIGHT_START: 42, LAYOUT_NIGHT_MODE: 2, APPEARANCE_THEME: 1 }, layout: 'day' },
      { settings: { LAYOUT_NIGHT_START: 41, LAYOUT_NIGHT_MODE: 2, APPEARANCE_THEME: 3 }, layout: 'day' },
    ]);
  });

  /** The watch's own saved value is not known to the build, so a key set only by a later step has nothing to go back to. */
  test('refuses a key only a later step sets', () => {
    const steps = [{ settings: {}, layout: 'a' }, { settings: { APPEARANCE_THEME: 3 }, layout: 'b' }];

    const call = () => completeSteps(steps, {}, 'gridlock', 'presets');

    expect(call).toThrow("walks gridlock's presets through APPEARANCE_THEME, which neither its settings nor the walk's first step sets");
  });

  /** A layout only later steps set would stay on screen when the walk comes back round to the first. */
  test('refuses a first step with no layout when a later one has one', () => {
    const steps = [{ settings: { APPEARANCE_THEME: 1 }, layout: null }, { settings: {}, layout: 'b' }];

    const call = () => completeSteps(steps, {}, 'gridlock', 'presets');

    expect(call).toThrow('but its first step has none');
  });
});

describe('writeDevHeader', () => {
  /** The release build leaves dev mode off, and a header an earlier dev build left would sit there unread but stale. */
  test('takes the header away for a build without --dev', () => {
    const sandbox = tempDir('dev-header-');

    writeDevHeader(sandbox, '#pragma once\n');

    writeDevHeader(sandbox, null);

    expect(fs.existsSync(path.join(sandbox, DEV_HEADER))).toBe(false);
  });
});
