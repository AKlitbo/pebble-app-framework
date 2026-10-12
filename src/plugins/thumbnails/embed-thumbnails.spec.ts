/**
 * Specs for the module thumbnail generator.
 *
 * The Clay palette and blocks show a real panel picture instead of an emoji, and every one of
 * them is looked up by label. classify is where a filename turns back into a module, so a
 * mis-split name silently hands a thumbnail to the wrong panel or drops it as a stray.
 * buildSource pins the emitted shape and the stable ordering, because an unstable order would
 * churn the committed asset on every run.
 *
 * Whether a face's committed asset is current is check-thumbnails.ts, which paf check runs in the
 * face's unit.
 */

import { describe, test, expect } from 'vitest';
import { indexBySlug, classify, buildSource, describeStray, missingSlugs } from './embed-thumbnails';

const bySlug = indexBySlug({ 'Battery': { slug: 'battery' }, 'Weekday Dots': { slug: 'weekday-dots' } });

// the sizes a face in these specs says its thumbnails come in
const SIZES = ['1x2', '2x2'];

describe('indexBySlug', () => {
  /** The builders look a thumbnail up by label, so a lost slug key means the panel falls back to an emoji. */
  test('keys each module by its slug and carries its label', () => {
    const meta = { 'Battery': { slug: 'battery' }, 'Weekday Dots': { slug: 'weekday-dots' } };

    const result = indexBySlug(meta);

    expect(result).toEqual({
      battery: { label: 'Battery', order: 0 },
      'weekday-dots': { label: 'Weekday Dots', order: 1 },
    });
  });

  /** Two modules on one slug passed the check, and the first one's tile was blank on the settings page. */
  test('stops on a slug two modules share', () => {
    const meta = { 'Weather': { slug: 'weather' }, 'Weather Now': { slug: 'weather' } };

    const call = () => indexBySlug(meta);

    expect(call).toThrow(/modules "Weather" and "Weather Now" share the slug "weather"/);
  });

  /** Order comes from row position: get it wrong and the emitted asset reshuffles against module-meta. */
  test('takes each row order from its position in the registry', () => {
    const meta = { 'First': { slug: 'a' }, 'Second': { slug: 'b' }, 'Third': { slug: 'c' } };

    const result = indexBySlug(meta);

    expect([result.a.order, result.b.order, result.c.order]).toEqual([0, 1, 2]);
  });
});

describe('classify', () => {
  /** A slug holding its own dash (weekday-dots) must split on the last dash, or its shot lands on the wrong module. */
  test('splits the name on the last dash so a slug can hold dashes', () => {
    const result = classify(['weekday-dots-1x2.png'], bySlug, SIZES);

    expect(result.found).toEqual([
      { file: 'weekday-dots-1x2.png', slug: 'weekday-dots', label: 'Weekday Dots', order: 1, size: '1x2' },
    ]);
    expect(result.stray).toEqual([]);
  });

  /** A PNG for a module the registry does not know must be reported, not silently encoded into the asset. */
  test('reports a png whose slug is not in the registry as stray', () => {
    const result = classify(['nosuch-1x2.png'], bySlug, SIZES);

    expect(result.found).toEqual([]);
    expect(result.stray).toEqual([{ file: 'nosuch-1x2.png', reason: 'no-module' }]);
  });

  /**
   * A size the face does not list would ship a thumbnail none of its panels can ever show. It is kept
   * apart from an unknown module, since telling a developer the battery module does not exist when
   * only its size is off sends them looking in the wrong place.
   */
  test('reports a png with a size the face does not list, naming its module and size', () => {
    const result = classify(['battery-9x9.png'], bySlug, SIZES);

    expect(result.found).toEqual([]);
    expect(result.stray).toEqual([{ file: 'battery-9x9.png', reason: 'size', slug: 'battery', size: '9x9' }]);
  });

  /** The sizes are the face's own, so a fixed-slot face's slot picture has to be taken once the face lists slot. */
  test('accepts any size the face lists', () => {
    const result = classify(['battery-slot.png'], bySlug, ['slot', 'tall']);

    expect(result.found.map((thumb) => thumb.size)).toEqual(['slot']);
  });

  /** A name with no size at all must not be read as a bare slug and encoded under an empty size. */
  test('reports a png with no size suffix as stray', () => {
    const result = classify(['battery.png'], bySlug, SIZES);

    expect(result.stray).toEqual([{ file: 'battery.png', reason: 'no-size', slug: 'battery' }]);
  });

  /**
   * A valid picture comes first. clock-tall.png is the clock module at size tall even when a
   * clock-tall module exists too, or a good picture would be refused for the other module's name.
   */
  test('takes a valid module and size before reading the whole name as a module', () => {
    const index = indexBySlug({ 'Clock': { slug: 'clock' }, 'Clock Tall': { slug: 'clock-tall' } });

    const result = classify(['clock-tall.png'], index, ['slot', 'tall']);

    expect(result.found.map((thumb) => [thumb.slug, thumb.size])).toEqual([['clock', 'tall']]);
  });

  /** A name ending in a dash has no size, and saying it is at size blank tells the developer nothing. */
  test('reads a name ending in a dash as having no size', () => {
    const result = classify(['battery-.png'], bySlug, SIZES);

    expect(result.stray).toEqual([{ file: 'battery-.png', reason: 'no-size', slug: 'battery' }]);
  });

  /** A file named after something every object has is no module, not a module with no label. */
  test('reads a name only the object prototype has as no module', () => {
    const result = classify(['toString-1x2.png'], bySlug, SIZES);

    expect(result.stray).toEqual([{ file: 'toString-1x2.png', reason: 'no-module' }]);
  });

  /** A module whose own name holds a dash would otherwise split into a module that is not there and a size of its tail. */
  test('reads a dashed module name with no size as that module with no size', () => {
    const result = classify(['weekday-dots.png'], bySlug, SIZES);

    expect(result.stray).toEqual([{ file: 'weekday-dots.png', reason: 'no-size', slug: 'weekday-dots' }]);
  });
});

describe('describeStray', () => {
  /** The line a developer acts on has to say a size is off, not that a module they can see is missing. */
  test('names the size and the sizes the face lists', () => {
    const result = describeStray({ file: 'battery-3x3.png', reason: 'size', slug: 'battery', size: '3x3' }, ['1x2', '2x2']);

    expect(result).toBe('resources/thumbnails/battery-3x3.png is at size 3x3, which thumbnailSizes does not list (it lists 1x2, 2x2)');
  });

  /** An unknown module keeps its own line, since there the module name is what is wrong. */
  test('says a png names no module when its name matches none', () => {
    const result = describeStray({ file: 'nosuch-1x2.png', reason: 'no-module' }, ['1x2']);

    expect(result).toBe('resources/thumbnails/nosuch-1x2.png names no module');
  });

  /** A module name with no size shows the name it wants, so the fix is a rename. */
  test('shows the name a png with no size should have', () => {
    const result = describeStray({ file: 'battery.png', reason: 'no-size', slug: 'battery' }, ['1x2', '2x2']);

    expect(result).toBe('resources/thumbnails/battery.png has no size after the module name, as in battery-<size>.png with one of 1x2, 2x2');
  });
});

describe('buildSource', () => {
  /** An unstable row order would rewrite the committed asset on every run and churn the diff. */
  test('sorts rows by module order rather than by label', () => {
    const thumbs = { 'Weekday Dots': { '1x2': 'data:B' }, 'Battery': { '1x2': 'data:A' } };
    const order = { 'Weekday Dots': 1, 'Battery': 0 };

    const result = buildSource(thumbs, order);

    expect(result.indexOf('"Battery"')).toBeLessThan(result.indexOf('"Weekday Dots"'));
  });

  /** The builders read label -> size -> dataUrl, so a drifted shape means every panel loses its picture. */
  test('emits each label as a size to data url map', () => {
    const thumbs = { 'Battery': { '2x2': 'data:B', '1x2': 'data:A' } };

    const result = buildSource(thumbs, { 'Battery': 0 });

    expect(result).toContain('"Battery": { "1x2": "data:A", "2x2": "data:B" },');
  });

  /** The asset is committed and regenerated, so it needs the do-not-edit banner and the module.exports wrapper. */
  test('emits the generated banner and the module.exports wrapper', () => {
    const result = buildSource({}, {});

    expect(result).toContain('// do not edit by hand: run `paf gen <face> thumbnails` after changing the pictures');
    expect(result).toContain('module.exports = {');
  });
});

describe('missingSlugs', () => {
  /** A new module with no shot yet must be reported, or it quietly ships an emoji instead of a picture. */
  test('reports a registry slug that no png covered', () => {
    const meta = { 'Battery': { slug: 'battery' }, 'Weather': { slug: 'weather' } };

    const result = missingSlugs(meta, { battery: true });

    expect(result).toEqual(['weather']);
  });

  /**
   * A module whose only picture is misnamed is already named by its own line, so a second line saying
   * it has no picture would send the developer looking for a file that is there.
   */
  test('leaves out a module a size or no-size stray already names', () => {
    const meta = { 'Battery': { slug: 'battery' }, 'Weather': { slug: 'weather' } };
    const stray = [{ file: 'battery-3x3.png', reason: 'size' as const, slug: 'battery', size: '3x3' }];

    const result = missingSlugs(meta, {}, stray);

    expect(result).toEqual(['weather']);
  });

  /** A module named with no size is named by its own line too, so it is left out the same way. */
  test('leaves out a module a no-size stray names', () => {
    const meta = { 'Battery': { slug: 'battery' } };
    const stray = [{ file: 'battery.png', reason: 'no-size' as const, slug: 'battery' }];

    const result = missingSlugs(meta, {}, stray);

    expect(result).toEqual([]);
  });

  /** A PNG that names no module says nothing about which module lacks a picture, so it hides none. */
  test('still reports a module when the only stray names no module', () => {
    const meta = { 'Battery': { slug: 'battery' } };
    const stray = [{ file: 'nosuch-1x2.png', reason: 'no-module' as const }];

    const result = missingSlugs(meta, {}, stray);

    expect(result).toEqual(['battery']);
  });

  /** A module whose slug every object answers to, such as toString, is still reported when it has no picture. */
  test('reports a module named like an object built-in when it has no picture', () => {
    const meta = { 'To String': { slug: 'toString' } };

    const result = missingSlugs(meta, {});

    expect(result).toEqual(['toString']);
  });

  /** With every slug covered the report must stay empty rather than cry wolf on a healthy run. */
  test('reports nothing when every slug has a png', () => {
    const meta = { 'Battery': { slug: 'battery' } };

    const result = missingSlugs(meta, { battery: true });

    expect(result).toEqual([]);
  });
});
