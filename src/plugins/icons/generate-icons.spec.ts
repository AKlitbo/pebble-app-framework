/**
 * Specs for the icon rasterizer's pure steps.
 *
 * whiten decides whether a glyph comes through visible white or invisible black.
 * resourceName/buildMedia/replaceMediaArray own the package.json sync: which
 * Pebble id a file maps to, how a manifest's icons fold into an existing media
 * array, and how that array is spliced back without disturbing the rest of the
 * file. iconSourcesDir decides where the SVGs are read from, and renderFace what
 * happens to an icon whose source this machine does not have. Everything else in
 * the pipeline is sharp I/O, covered by eyeballing the PNGs.
 *
 * Whether a face's committed media block still matches its icons.json is check-icons.ts, which paf
 * check runs in the face's unit.
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, test, expect } from 'vitest';
import { whiten, iconSourcesDir, renderFace, holdsIconSets } from './generate-icons';
import { resourceName, buildMedia, replaceMediaArray } from './media';
import type { IconManifest } from './media';
import { tempDir } from '../../ts/testing/temp-dir';

describe('whiten', () => {
  /** A black fill left untouched renders an invisible glyph on the watch's dark face. */
  test.each([
    ['#000000'],
    ['#000'],
    ['black'],
  ])('recolors a hard-coded fill="%s" to white', (color) => {
    const result = whiten(`<svg><path fill="${color}" d="M0 0"/></svg>`);

    expect(result).toContain('fill="#ffffff"');
    expect(result).not.toContain(`fill="${color}"`);
  });

  /** Stroke-styled glyphs set their colour on stroke, not fill. A missed stroke comes through black. */
  test('recolors a hard-coded stroke to white', () => {
    const result = whiten('<svg><path stroke="#000" d="M0 0"/></svg>');

    expect(result).toContain('stroke="#ffffff"');
  });

  /** Upstream SVGs are inconsistent about casing, so BLACK/uppercase hex must match too. */
  test('recolors black regardless of case', () => {
    const result = whiten('<svg><path fill="BLACK" stroke="#000000" d="M0 0"/></svg>');

    expect(result).toContain('fill="#ffffff"');
    expect(result).not.toMatch(/fill="BLACK"/i);
  });

  /** A glyph that never declares a root fill defaults to black, so white must be injected on the root. */
  test('injects white fill and stroke on a root svg that declares no fill', () => {
    const result = whiten('<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>');

    expect(result).toContain('<svg fill="#ffffff" stroke="#ffffff" viewBox="0 0 24 24"');
  });

  /** Flooding a stroke icon's fill="none" root with white fills the outline solid, destroying the shape. */
  test('leaves a root that already declares a fill untouched', () => {
    const input = '<svg fill="none" stroke="#000" viewBox="0 0 24 24"><path d="M0 0"/></svg>';

    const result = whiten(input);

    expect(result).toContain('<svg fill="none"');
    expect(result).not.toContain('fill="#ffffff"');
  });
});

describe('resourceName', () => {
  /** The manifest key is the file basename. Its Pebble id is that uppercased with dashes as underscores. */
  test.each([
    ['wi-clear', 'ICON_WI_CLEAR'],
    ['wi-night-partly-cloudy', 'ICON_WI_NIGHT_PARTLY_CLOUDY'],
    ['bluetooth-slash', 'ICON_BLUETOOTH_SLASH'],
    ['hilo-up', 'ICON_HILO_UP'],
    ['uv', 'ICON_UV'],
  ])('maps %s -> %s', (basename, expected) => {
    const result = resourceName(basename);

    expect(result).toBe(expected);
  });
});

describe('buildMedia', () => {
  const manifest: IconManifest = {
    'wi-clear': { svg: 'wi/wi-day-sunny', size: [24, 24] },
    'bluetooth': { svg: 'sr/bluetooth-on', size: [14, 14] },
  };

  /** Icons render into the face, so the media file paths must point at its own resources/icons dir. */
  test('emits a bitmap entry per manifest key pointing at the local resources dir', () => {
    const result = buildMedia([], manifest);

    expect(result).toEqual([
      { type: 'bitmap', name: 'ICON_WI_CLEAR', file: 'icons/wi-clear.png' },
      { type: 'bitmap', name: 'ICON_BLUETOOTH', file: 'icons/bluetooth.png' },
    ]);
  });

  /** A re-gen must replace the existing icon block wholesale, not stack a second copy beside it. */
  test('replaces existing icon entries instead of appending', () => {
    const media = [
      { type: 'bitmap', name: 'ICON_WI_CLEAR', file: '../../../lib/resources/icons/wi-clear.png' },
      { type: 'bitmap', name: 'ICON_DROPPED', file: 'icons/dropped.png' },
    ];

    const result = buildMedia(media, manifest);

    expect(result.map((entry) => entry.name)).toEqual(['ICON_WI_CLEAR', 'ICON_BLUETOOTH']);
  });

  /**
   * An icon packed in a set format or only for some platforms loses that on a re-gen otherwise,
   * and the next build packs it in the default format with nothing to say so.
   */
  test('keeps the extra fields an existing icon entry carries', () => {
    const media = [{ type: 'bitmap', name: 'ICON_BLUETOOTH', file: 'icons/bluetooth.png', memoryFormat: '1Bit' }];

    const result = buildMedia(media, manifest);

    expect(result[1]).toEqual({ type: 'bitmap', name: 'ICON_BLUETOOTH', file: 'icons/bluetooth.png', memoryFormat: '1Bit' });
  });

  /** Backgrounds and fonts are not the generator's to touch, so they keep their place around the icon block. */
  test('keeps non-icon entries in order with icons landing where the first icon sat', () => {
    const media = [
      { type: 'bitmap', name: 'IMAGE_BG', file: 'images/bg.png' },
      { type: 'bitmap', name: 'ICON_OLD', file: 'icons/old.png' },
      { type: 'font', name: 'FONT_STM', file: 'fonts/stm.ttf' },
    ];

    const result = buildMedia(media, manifest);

    expect(result.map((entry) => entry.name)).toEqual([
      'IMAGE_BG', 'ICON_WI_CLEAR', 'ICON_BLUETOOTH', 'FONT_STM',
    ]);
  });

  /** A face gaining its first icons should slot them ahead of the fonts, not after them. */
  test('inserts icons before the fonts when the face had none', () => {
    const media = [
      { type: 'bitmap', name: 'IMAGE_BG', file: 'images/bg.png' },
      { type: 'font', name: 'FONT_STM', file: 'fonts/stm.ttf' },
    ];

    const result = buildMedia(media, manifest);

    expect(result.map((entry) => entry.name)).toEqual([
      'IMAGE_BG', 'ICON_WI_CLEAR', 'ICON_BLUETOOTH', 'FONT_STM',
    ]);
  });
});

describe('replaceMediaArray', () => {
  /** A "media" string earlier in the file was taken for the key, and the icons went over another array. */
  test('finds the media key past a string that reads media', () => {
    const raw = [
      '{',
      '  "displayName": "media",',
      '  "targetPlatforms": ["emery"],',
      '  "resources": {',
      '    "media": []',
      '  }',
      '}',
    ].join('\n');
    const media = [{ type: 'bitmap', name: 'ICON_WI_CLEAR', file: 'icons/wi-clear.png' }];

    const result = JSON.parse(replaceMediaArray(raw, media));

    expect(result.targetPlatforms).toEqual(['emery']);
    expect(result.resources.media).toEqual(media);
  });

  /** Bitmaps ride on one line for a scannable list. Fonts keep their multi-line block so extra fields survive. */
  test('renders bitmaps inline and fonts as blocks', () => {
    const raw = [
      '{',
      '  "resources": {',
      '    "media": [',
      '      { "type": "bitmap", "name": "ICON_OLD", "file": "resources/icons/old.png" }',
      '    ]',
      '  }',
      '}',
    ].join('\n');
    const media = [
      { type: 'bitmap', name: 'ICON_WI_CLEAR', file: 'icons/wi-clear.png' },
      { type: 'font', name: 'FONT_STM', file: 'fonts/stm.ttf', characterRegex: '[0-9]' },
    ];

    const result = replaceMediaArray(raw, media);

    expect(result).toContain('      { "type": "bitmap", "name": "ICON_WI_CLEAR", "file": "icons/wi-clear.png" },');
    expect(result).toContain('        "characterRegex": "[0-9]"');
    expect(JSON.parse(result)).toHaveProperty('resources.media');
  });

  /**
   * A bitmap that is not an icon keeps every field it had. Writing only type, name, and file
   * dropped a background's memoryFormat and targetPlatforms on every gen:icons run, so it came
   * back at the wrong colour depth or on platforms it was never meant for.
   */
  test('keeps the extra fields on a bitmap that is not an icon', () => {
    const raw = '{ "media": [] }';
    const background = { type: 'bitmap', name: 'IMAGE_BG', file: 'bg.png', memoryFormat: 'Smallest', targetPlatforms: ['emery'] };

    const result = replaceMediaArray(raw, [background]);

    expect(JSON.parse(result).media).toEqual([background]);
  });

  /** The splice must survive an array-valued field inside an entry rather than closing the media array early. */
  test('does not stop at a nested array inside an entry', () => {
    const raw = '{ "media": [ { "type": "font", "name": "F", "file": "f.ttf", "targetPlatforms": ["emery"] } ] }';
    const media = [{ type: 'bitmap', name: 'ICON_A', file: 'icons/a.png' }];

    const result = replaceMediaArray(raw, media);

    expect(JSON.parse(result).media).toEqual(media);
  });

  /** Only the media array is the generator's to rewrite. Text on either side must come through byte-for-byte. */
  test('leaves surrounding text untouched', () => {
    const raw = '{\n  "uuid": "keep-me",\n  "media": [\n    { "type": "bitmap", "name": "ICON_OLD", "file": "resources/icons/old.png" }\n  ],\n  "trailing": true\n}';

    const result = replaceMediaArray(raw, [{ type: 'bitmap', name: 'ICON_A', file: 'icons/a.png' }]);

    expect(result).toContain('"uuid": "keep-me"');
    expect(result).toContain('"trailing": true');
  });
});

describe('iconSourcesDir', () => {
  /** A repo that keeps its sources somewhere of its own must not be pointed at a copy fetched for it. */
  test('takes the unit setting over the environment', () => {
    const result = iconSourcesDir(path.join('/work', 'mosaic'), { plugins: { icons: { sources: '../../vendor' } } }, '/cache/icons');

    expect(result).toBe(path.resolve('/vendor'));
  });

  /** A tool that fetched the sources passes them this way, and a unit with no setting has to take them. */
  test('falls back to the environment', () => {
    const result = iconSourcesDir(path.join('/work', 'mosaic'), {}, '/cache/icons');

    expect(result).toBe(path.resolve('/cache/icons'));
  });

  /** A guessed folder that turns out empty fails on every icon, so with nothing named there is no folder. */
  test('gives no folder when nothing names one', () => {
    const result = iconSourcesDir(path.join('/work', 'mosaic'), {}, undefined);

    expect(result).toBeNull();
  });
});

/** A face folder holding a committed bt-on.png of the given square size. */
async function faceWithPng(size: number): Promise<string> {
  const face = tempDir('icons-face-');
  const png = path.join(face, 'resources', 'icons', 'bt-on.png');
  fs.mkdirSync(path.dirname(png), { recursive: true });
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toFile(png);
  return face;
}

describe('holdsIconSets', () => {
  /** A folder a level off holds none of the sets, and keeping every PNG passed a run that rendered nothing. */
  test('finds no sets in a folder that holds none', () => {
    const sources = tempDir('icons-src-');
    fs.mkdirSync(path.join(sources, 'vendor'));

    const result = holdsIconSets(sources);

    expect(result).toBe(false);
  });

  /** A machine that fetched only some sets still renders from them, so one set is enough. */
  test('finds a folder holding one of the sets', () => {
    const sources = tempDir('icons-src-');
    fs.mkdirSync(path.join(sources, 'uxwing'));

    const result = holdsIconSets(sources);

    expect(result).toBe(true);
  });
});

describe('renderFace', () => {
  /**
   * A face drawing only from a set this machine never fetched stopped the whole run, so the faces after it
   * were never regenerated. It keeps its PNGs and the run carries on.
   */
  test('keeps every PNG of a face whose only set is missing', async () => {
    const face = await faceWithPng(12);
    const sources = tempDir('icons-src-');
    fs.mkdirSync(path.join(sources, 'uxwing'));

    const result = await renderFace(face, { 'bt-on': { svg: 'sr/bluetooth-on', size: [12, 12] } }, sources);

    expect(result).toBe(0);
  });

  /** A face whose icons.json uses a set this machine never fetched still has its committed PNGs to build with. */
  test('keeps the PNG it has when the source is missing', async () => {
    const face = await faceWithPng(12);
    const sources = tempDir('icons-src-');
    fs.mkdirSync(path.join(sources, 'weather-icons', 'svg'), { recursive: true });
    fs.writeFileSync(path.join(sources, 'weather-icons', 'svg', 'dot.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3"/></svg>');

    const result = await renderFace(face, { 'bt-on': { svg: 'sr/bluetooth-on', size: [12, 12] }, dot: { svg: 'wi/dot', size: [8, 8] } }, sources);

    expect(result).toBe(1);
    expect((await sharp(path.join(face, 'resources', 'icons', 'bt-on.png')).metadata()).width).toBe(12);
  });

  /** A PNG made before icons.json changed its size would draw the old size in the new spot, with only a warning in the log. */
  test('stops when the PNG it would keep is not the size icons.json asks for', async () => {
    const face = await faceWithPng(12);

    const result = renderFace(face, { 'bt-on': { svg: 'sr/bluetooth-on', size: [16, 16] } }, tempDir('icons-src-'));

    await expect(result).rejects.toThrow(/its PNG is 12x12 where icons.json asks for 16x16/);
  });

  /** With no source and no PNG the build would fail on the resource later, so it stops here with the icon named. */
  test('stops when the source is missing and there is no PNG to keep', async () => {
    const face = tempDir('icons-face-');

    const result = renderFace(face, { 'bt-on': { svg: 'sr/bluetooth-on', size: [12, 12] } }, tempDir('icons-src-'));

    await expect(result).rejects.toThrow(/Missing source: .*bluetooth-on\.svg \(for bt-on\)/);
  });
});
