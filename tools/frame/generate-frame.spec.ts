/**
 * Specs for the pure parts of the frame generator.
 *
 * facePlatforms picks which screens a background gets baked for, so a wrong read ships a build
 * with no frame for one of them, or one baked at another screen's size. parseArgs and outFor
 * decide which frame gets baked and which PNG it is written over, so a slip there quietly replaces
 * the wrong theme's or the wrong platform's background. capColors folds a bake down to the colour cap after the
 * resize. A bitmap over 16 colours packs at eight bits per pixel instead of four, which doubles
 * the heap the watch needs to hold the frame and can keep a full-screen frame from loading at all,
 * so which pixels get folded and which are left alone is worth pinning. The render pipeline itself
 * drives Firefox and sharp and is left to integration use, npm run gen:frame.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect, vi, afterEach } from 'vitest';
import { capColors, facePlatforms, outFor, parseArgs } from './generate-frame';
import type { FaceConfig } from './generate-frame';
import { WORKSPACE } from '../paths';

/** Flatten [r, g, b, a] pixels into the raw buffer sharp hands over. */
function raw(pixels: number[][]): Uint8Array {
  return Uint8Array.from(pixels.flat());
}

/** The distinct colours a raw buffer holds, as "r,g,b,a" strings. */
function colorsIn(buffer: Uint8Array): Set<string> {
  const colors = new Set<string>();
  for (let i = 0; i < buffer.length; i += 4) {
    colors.add(Array.from(buffer.slice(i, i + 4)).join(','));
  }

  return colors;
}

/** A face that swaps a theme stylesheet over one HTML, with classic as its plain background. */
const THEMED: FaceConfig = {
  defaultFrame: 'classic',
  defaultScale: 4,
  supportsTheme: true,
  bareBackgroundBase: 'classic',
  clearTextSelectors: [],
  hideSelectors: [],
};

/** The same face baking each look from its own HTML instead of a theme. */
const UNTHEMED: FaceConfig = { ...THEMED, supportsTheme: false };

const IMAGES = path.join('face', 'resources', 'images');

describe('facePlatforms', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Only the first platform was read, so a face on emery and gabbro got one frame at emery's size,
   * and the round build shipped it on a screen it did not fit.
   */
  test('bakes every platform the appinfo targets', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ targetPlatforms: ['emery', 'gabbro'] }));

    const result = facePlatforms('whatever.json');

    expect(result).toEqual(['emery', 'gabbro']);
  });

  /** A face with no appinfo yet still needs a platform to bake for, or the bake stops before it renders anything. */
  test('falls back to emery when the appinfo is missing or unreadable', () => {
    const result = facePlatforms(path.join('no', 'such', 'appinfo.json'));

    expect(result).toEqual(['emery']);
  });

  /** A platform with no known size is left out with a warning rather than stopping the bakes it sits beside. */
  test('leaves out and warns about a platform it has no size for', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ targetPlatforms: ['nope', 'gabbro'] }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = facePlatforms('whatever.json');

    expect(result).toEqual(['gabbro']);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('parseArgs', () => {
  /** A bare run bakes the face's default frame at its default scale, or it has nothing to render. */
  test('falls back to the face defaults when no options are given', () => {
    const result = parseArgs([], THEMED);

    expect(result).toEqual({ frame: 'classic', scale: 4, theme: null, outOverride: null });
  });

  /** Passing the file name as it sits on disk would otherwise look for voyager.html.html and stop. */
  test('drops a trailing .html from the frame name', () => {
    const result = parseArgs(['voyager.html'], THEMED);

    expect(result.frame).toBe('voyager');
  });

  /** A face with no theme stylesheets would otherwise go looking for a theme_<name>.css that is not there and throw partway through. */
  test('ignores --theme for a face without themes', () => {
    const result = parseArgs(['--theme', 'mono'], UNTHEMED);

    expect(result.theme).toBeNull();
  });

  /** --theme all is how every colourway gets re-baked in one run, so it has to reach the bake. */
  test('keeps --theme for a face with themes', () => {
    const result = parseArgs(['--theme', 'all'], THEMED);

    expect(result.theme).toBe('all');
  });

  /** A typo in --scale still bakes, at the face's default scale, rather than handing the browser a scale of NaN. */
  test('falls back to the default scale when --scale is not a number', () => {
    const result = parseArgs(['--scale', 'big'], THEMED);

    expect(result.scale).toBe(4);
  });
});

describe('outFor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Two themes landing on one file name would leave only the last colourway's background in the build. */
  test('names a themed bake after its theme', () => {
    const opts = parseArgs(['--theme', 'mono'], THEMED);

    const result = outFor(opts, 'mono', 1, THEMED, IMAGES, 'emery');

    expect(result).toBe(path.join(IMAGES, 'background-mono~emery.png'));
  });

  /** The face loads background.png as its plain frame, so the bare base has to land there and not under its own name. */
  test('writes the bare background base to background.png', () => {
    const opts = parseArgs(['classic'], UNTHEMED);

    const result = outFor(opts, null, 1, UNTHEMED, IMAGES, 'emery');

    expect(result).toBe(path.join(IMAGES, 'background~emery.png'));
  });

  /** Any other frame gets its own file, or baking it would overwrite the face's plain background. */
  test('names any other frame after its base', () => {
    const opts = parseArgs(['padd'], UNTHEMED);

    const result = outFor(opts, null, 1, UNTHEMED, IMAGES, 'emery');

    expect(result).toBe(path.join(IMAGES, 'background-padd~emery.png'));
  });

  /** A face with no plain background names every frame after itself, so its default frame never lands on background.png. */
  test('names the default frame after its base when the face has no bare background base', () => {
    const face: FaceConfig = { ...UNTHEMED, bareBackgroundBase: null };
    const opts = parseArgs([], face);

    const result = outFor(opts, null, 1, face, IMAGES, 'emery');

    expect(result).toBe(path.join(IMAGES, 'background-classic~emery.png'));
  });

  /** Two platforms landing on one file name would leave only the last screen's frame in the build. */
  test('tags the file with the platform it was baked for', () => {
    const opts = parseArgs(['classic'], UNTHEMED);

    const result = outFor(opts, null, 1, UNTHEMED, IMAGES, 'gabbro');

    expect(result).toBe(path.join(IMAGES, 'background~gabbro.png'));
  });

  /**
   * --out across several themes was ignored, so a preview run meant to leave the face alone wrote
   * over its committed backgrounds. Each theme now lands beside the --out path under its own name.
   */
  test('names each theme beside --out when more than one theme is baked', () => {
    vi.spyOn(process, 'cwd').mockReturnValue(WORKSPACE);
    const opts = parseArgs(['--theme', 'all', '--out', 'preview/override.png'], THEMED);

    const result = outFor(opts, 'mono', 2, THEMED, IMAGES, 'emery');

    expect(result).toBe(path.join(WORKSPACE, 'preview', 'override-mono~emery.png'));
  });

  /**
   * A relative --out is meant from the workspace root, not from wherever the command happened to run.
   *
   * npm runs the script from the workspace root, so the working folder is moved elsewhere here.
   * Without that, resolving against the working folder would land on the same path and pass.
   */
  test('resolves a single-bake --out against the workspace root', () => {
    vi.spyOn(process, 'cwd').mockReturnValue(path.join(WORKSPACE, 'somewhere', 'else'));
    const opts = parseArgs(['--out', 'resources/images/override.png'], THEMED);

    const result = outFor(opts, null, 1, THEMED, IMAGES, 'emery');

    expect(result).toBe(path.join(WORKSPACE, 'resources', 'images', 'override~emery.png'));
  });
});

describe('capColors', () => {
  /** Repainting pixels that are already under the cap would blur the sharp chrome art for no reason. */
  test('leaves the anti-aliasing alone when the bake is already under the cap', () => {
    const buffer = raw([
      [0, 0, 0, 255],
      [10, 200, 90, 255],
      [255, 255, 255, 255],
    ]);

    const result = capColors(buffer, 16);

    expect(Array.from(result)).toEqual([0, 0, 0, 255, 10, 200, 90, 255, 255, 255, 255, 255]);
  });

  /** A bake left one colour over 16 packs at eight bits per pixel instead of four, doubling the heap the watch needs to hold the frame. */
  test('folds the rarest colour into its nearest neighbour to meet the cap', () => {
    // three blacks, three whites, and one stray pixel that snaps to its own Pebble-64 bucket
    const buffer = raw([
      [0, 0, 0, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
      [250, 250, 200, 255],
    ]);

    const result = capColors(buffer, 2);

    expect(colorsIn(result)).toEqual(new Set(['0,0,0,255', '255,255,255,255']));
  });

  /** Counting exact RGBA values would see shades the watch cannot tell apart as separate colours, pushing a bake over the cap that the watch would have rendered fine. */
  test('counts colours by their Pebble-64 bucket, not by their exact value', () => {
    // both pixels snap to the same bucket, so a cap of one leaves them where they are
    const buffer = raw([
      [250, 250, 250, 255],
      [255, 255, 255, 255],
    ]);

    const result = capColors(buffer, 1);

    expect(Array.from(result)).toEqual([250, 250, 250, 255, 255, 255, 255, 255]);
  });
});
