/**
 * Specs for the module thumbnail generator.
 *
 * The Clay palette and blocks show a real panel picture instead of an emoji, and every one of
 * them is looked up by label. classify is where a filename turns back into a module, so a
 * mis-split name silently hands a thumbnail to the wrong panel or drops it as a stray.
 * buildSource pins the emitted shape and the stable ordering, because an unstable order would
 * churn the committed asset on every run.
 */

import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { listFaceNames, faceDir } from '../faces';
import { indexBySlug, classify, buildSource, missingSlugs, encodeThumbnails, outFile } from './embed-thumbnails';

/**
 * Every face that ships thumbnails, found by looking for the folder rather than by a list here,
 * so a new face is guarded the day it lands.
 */
const THUMB_FACES = listFaceNames()
  .filter((face) => fs.existsSync(path.join(faceDir(face), 'resources', 'thumbnails')));

const bySlug = {
  battery: { label: 'Battery', order: 0 },
  'weekday-dots': { label: 'Weekday Dots', order: 1 },
};

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
    expect(result.stray).toEqual(['nosuch-1x2.png']);
  });

  /** A size the face does not list would ship a thumbnail none of its panels can ever show. */
  test('reports a png with a size the face does not list as stray', () => {
    const result = classify(['battery-9x9.png'], bySlug, SIZES);

    expect(result.found).toEqual([]);
    expect(result.stray).toEqual(['battery-9x9.png']);
  });

  /** The sizes are the face's own, so a fixed-slot face's slot picture has to be taken once the face lists slot. */
  test('accepts any size the face lists', () => {
    const result = classify(['battery-slot.png'], bySlug, ['slot', 'tall']);

    expect(result.found.map((thumb) => thumb.size)).toEqual(['slot']);
  });

  /** A name with no size at all must not be read as a bare slug and encoded under an empty size. */
  test('reports a png with no size suffix as stray', () => {
    const result = classify(['battery.png'], bySlug, SIZES);

    expect(result.stray).toEqual(['battery.png']);
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

    expect(result).toContain('// generated by tools/thumbnails/embed-thumbnails.ts - do not edit by hand');
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

  /** With every slug covered the report must stay empty rather than cry wolf on a healthy run. */
  test('reports nothing when every slug has a png', () => {
    const meta = { 'Battery': { slug: 'battery' } };

    const result = missingSlugs(meta, { battery: true });

    expect(result).toEqual([]);
  });
});

/** The faces that commit a thumbnail asset, found by output so they can check the discovery above. */
const COMMITTING_FACES = listFaceNames()
  .filter((face) => fs.existsSync(outFile(face)));

describe.skipIf(COMMITTING_FACES.length === 0)('generated asset', () => {
  /**
   * The per-face checks below come from what the discovery found, so a discovery that quietly
   * returned nothing would leave this suite green with nothing in it. Every face that commits the
   * asset has to be found by its thumbnails folder. They run where the engine is mounted beside
   * faces that commit the asset.
   */
  test('covers every face that commits a thumbnail asset', () => {
    const result = THUMB_FACES;

    expect(result).toEqual(COMMITTING_FACES);
  });

  THUMB_FACES.forEach((face) => {
    /** A new module or a re-shot png without gen:thumbnails ships a config page showing stale previews. */
    test(`${face}: module-thumbnails.g.js output is not stale`, () => {
      const built = encodeThumbnails(face);

      const committed = fs.readFileSync(outFile(face), 'utf8').replace(/\r\n/g, '\n');

      expect(committed).toBe(built.source);
    });

    /** A png naming no module, or a module with no png, means the previews and the catalog disagree. */
    test(`${face}: every png maps to a module and every module has a png`, () => {
      const result = encodeThumbnails(face);

      expect(result.stray).toEqual([]);
      expect(result.missing).toEqual([]);
    });
  });
});
