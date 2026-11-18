/**
 * Specs for the walks paf.dev.config.json lays out as lists, and the panels block they read.
 *
 * The thumbnails tool names each screenshot by where it sits in the walk, so the order the steps come
 * in is the contract between the build and the crop. A walk of every panel has to go size by size and
 * name by name, a named list has to keep its own order, and a panel the C cannot show has to stop the
 * build rather than leave a gap that shifts every picture after it. A step walk's `each` multiplies its
 * screens, so the count a tap has to step through is worked out with it, and a step that sets the key
 * each steps through has to stop the build, since its value would never show.
 */
import { describe, expect, test } from 'vitest';
import { panelSteps, readPanels, readWalks, thumbnailPanels } from './dev-walks.ts';

const FILE = 'mosaic/paf.dev.config.json';

/** A panels block with two sizes and three panels. */
const PANELS = readPanels(
  {
    include: 'engine/catalog.h',
    sizes: {
      '1x2': { id: 'MSIZE_1x2', crop: { left: 4, top: 94, width: 94, height: 40 } },
      '2x2': { id: 1, crop: { left: 4, top: 72, width: 94, height: 83 } },
    },
    ids: { battery: 'MOD_SYSTEM_BATTERY', 'phone-battery': 75, steps: 'MOD_HEALTH_STEPS' },
  },
  FILE,
  ''
);

describe('thumbnailPanels', () => {
  /** A panel's own name can hold dashes, so only the part after the last one is the size. */
  test('splits a thumbnail on its last dash and skips a size the block does not list', () => {
    const result = thumbnailPanels(['phone-battery-1x2.png', 'steps-2x4.png', 'notes.txt'], ['1x2', '2x2']);

    expect(result).toEqual([{ panel: 'phone-battery', size: '1x2' }]);
  });
});

describe('panelSteps', () => {
  /** The crop names each shot by its place in the walk, so the order has to be the same on every run. */
  test('walks every thumbnail size by size, then by name', () => {
    const result = panelSteps('all', PANELS, ['steps-2x2.png', 'steps-1x2.png', 'battery-2x2.png', 'phone-battery-1x2.png'], 'gridlock');

    expect(result.map((step) => `${step.panel}-${step.size}`)).toEqual(['phone-battery-1x2', 'steps-1x2', 'battery-2x2', 'steps-2x2']);
  });

  /** A walk of only the new panels is listed by hand, and its order is the one the person wrote. */
  test('keeps a named list in its own order with each panel\'s C ids', () => {
    const result = panelSteps({ '1x2': ['steps', 'battery'] }, PANELS, [], 'gridlock');

    expect(result).toEqual([
      { panel: 'steps', size: '1x2', panelId: 'MOD_HEALTH_STEPS', sizeId: 'MSIZE_1x2' },
      { panel: 'battery', size: '1x2', panelId: 'MOD_SYSTEM_BATTERY', sizeId: 'MSIZE_1x2' },
    ]);
  });

  /** A panel the C has no id for cannot be shown, and leaving it out would shift every picture after it. */
  test('refuses a panel with no id and names it', () => {
    const call = () => panelSteps('all', PANELS, ['weather-1x2.png'], 'gridlock');

    expect(call).toThrow("paf.dev.config.json walks gridlock's weather, which its panels block gives no id");
  });

  /** A size with no crop could be shown but never cut out of the screenshot. */
  test('refuses a size the panels block does not list', () => {
    const call = () => panelSteps({ '2x4': ['steps'] }, PANELS, [], 'gridlock');

    expect(call).toThrow("walks gridlock's panels at 2x4, which its panels block does not list. Its sizes are 1x2, 2x2");
  });
});

describe('readWalks', () => {
  /** themes is the plugin's own walk, so a listed walk by that name could never run. */
  test('refuses a walk named themes', () => {
    const call = () => readWalks({ themes: { panels: 'all' } }, FILE, '');

    expect(call).toThrow(`${FILE} sets walks.themes. A walk's name is lowercase, and themes is the dev plugin's own`);
  });

  /** A tap has to move somewhere, and tap-walk takes a first tap that changes nothing as a broken build. */
  test('refuses a step walk of one step', () => {
    const call = () => readWalks({ presets: { steps: [{ layout: '2,0,0,2,2' }] } }, FILE, '');

    expect(call).toThrow(`${FILE} sets walks.presets to one screen. A step walk takes two or more screens`);
  });

  /** A step's settings go through the same reader as the launch settings, so a toggle lands as 1. */
  test('reads a step walk\'s settings and layouts', () => {
    const result = readWalks({ night: { steps: [{ settings: { LAYOUT_NIGHT_START: 42 }, layout: '1,0,0,4,1' }, { settings: { APPEARANCE_QUIET_TIME_ICON: true } }] } }, FILE, '');

    expect(result.night).toEqual({
      kind: 'steps',
      steps: [
        { settings: { LAYOUT_NIGHT_START: 42 }, layout: '1,0,0,4,1', scene: null },
        { settings: { APPEARANCE_QUIET_TIME_ICON: 1 }, layout: null, scene: null },
      ],
      each: null,
      scene: null,
    });
  });

  /** One layout through every analog style is a walk, since each value of each is a screen of its own. */
  test('takes one step through two values of each as a walk', () => {
    const result = readWalks({ analog: { each: { APPEARANCE_ANALOG_STYLE: [0, true] }, steps: [{ layout: '20,0,0,2,2' }] } }, FILE, '');

    expect(result.analog).toMatchObject({ kind: 'steps', each: { key: 'APPEARANCE_ANALOG_STYLE', values: [0, 1] } });
  });

  /** The walk puts the value each is on over the step's own, so the step's would never show. */
  test('refuses a step that sets the key each steps through', () => {
    const call = () => readWalks({ previews: { each: { APPEARANCE_SCENE: [0, 1] }, steps: [{ settings: { APPEARANCE_SCENE: 3 } }] } }, FILE, '');

    expect(call).toThrow(`${FILE} sets walks.previews.steps[0].settings.APPEARANCE_SCENE, which the walk's each steps through`);
  });

  /** each steps one setting, and two would leave the order they multiply in to guesswork. */
  test('refuses each with two settings', () => {
    const call = () => readWalks({ previews: { each: { APPEARANCE_SCENE: [0, 1], APPEARANCE_THEME: [0, 1] }, steps: [{ layout: 'a' }] } }, FILE, '');

    expect(call).toThrow('It takes one setting and the values to step it through');
  });

  /** An empty step draws whatever the step before it left, which is never what the walk meant. */
  test('refuses an empty step', () => {
    const call = () => readWalks({ presets: { steps: [{ layout: 'a' }, {}] } }, FILE, '');

    expect(call).toThrow(`${FILE} sets walks.presets.steps[1] to {}. A step takes settings, a layout, a clock, a date, stores, or any of them together`);
  });
});

describe('readPanels', () => {
  /** A thumbnail's size is what follows its last dash, so a size holding one could never be cropped to a name that reads back. */
  test('refuses a size whose name holds a dash', () => {
    const call = () => readPanels({ sizes: { 'tall-wide': { id: 0, crop: { left: 0, top: 0, width: 1, height: 1 } } }, ids: {} }, FILE, '');

    expect(call).toThrow('A size\'s name is lowercase letters and digits with no dash');
  });

  /** The id goes into the C as written, so anything but a name or a number would break the build somewhere unhelpful. */
  test('refuses an id that is neither a C name nor a whole number', () => {
    const call = () => readPanels({ sizes: { '1x2': { id: 0, crop: { left: 0, top: 0, width: 1, height: 1 } } }, ids: { battery: 'MOD BATTERY' } }, FILE, '');

    expect(call).toThrow(`${FILE} sets panels.ids.battery to "MOD BATTERY". It takes a whole number or a C name`);
  });

  /** The include goes into a #include line as written, so a quote in it would end the line early. */
  test('refuses an include that is not a header path', () => {
    const call = () => readPanels({ include: 'catalog.h"', sizes: { '1x2': { id: 0, crop: { left: 0, top: 0, width: 1, height: 1 } } }, ids: {} }, FILE, '');

    expect(call).toThrow('It takes a header path as the face\'s C includes it');
  });
});
