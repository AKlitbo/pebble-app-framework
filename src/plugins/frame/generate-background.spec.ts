/**
 * Specs for the pure parts of the background generator.
 *
 * facePlatforms picks which screens a background gets baked for, so a wrong read ships a build
 * with no frame for one of them, or one baked at another screen's size. parseArgs, planBakes, and
 * outFor decide which frames and themes get baked and which PNG each is written over, so a slip there
 * quietly replaces the wrong theme's or the wrong platform's background. capColors folds a bake down to the colour cap after the
 * resize. A bitmap over 16 colours packs at eight bits per pixel instead of four, which doubles
 * the heap the watch needs to hold the frame and can keep a full-screen frame from loading at all,
 * so which pixels get folded and which are left alone is worth pinning. missingStylesheets stops a
 * bake whose colours sheet is gone, which Firefox renders without complaint. discoverFrames and
 * discoverThemes decide which frames and themes all bakes, so one missed keeps an old
 * background and a stray one bakes over a real one. The render pipeline
 * itself drives Firefox and sharp and is left to integration use, `paf gen <face> background`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, test, expect, vi, afterEach } from 'vitest';
import { capColors, discoverFrames, discoverThemes, facePlatforms, missingStylesheets, outFor, parseArgs, planBakes } from './generate-background';
import type { FaceConfig } from './generate-background';
import { WORKSPACE } from '../../tools/shared/paths';
import { tempDir } from '../../ts/testing/temp-dir';

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
  /** A bare run names no frame and no theme, so the plan can tell it from one that asked for something. */
  test('names no frame and no theme when no options are given', () => {
    const result = parseArgs([], THEMED);

    expect(result).toEqual({ frame: null, scale: 4, theme: null, outOverride: null });
  });

  /** Passing the file name as it sits on disk would otherwise look for voyager~emery.html~emery.html and stop. */
  test.each(['voyager', 'voyager.html', 'voyager~emery', 'voyager~emery.html'])('reads --frame %s as the frame voyager', (value) => {
    const result = parseArgs(['--frame', value], UNTHEMED);

    expect(result.frame).toBe('voyager');
  });

  /**
   * A frame named with no flag, taken for nothing, would bake the default frame over its own
   * background and leave the one that was asked for stale.
   */
  test('refuses a frame named without --frame', () => {
    const result = () => parseArgs(['voyager'], UNTHEMED);

    expect(result).toThrow(/voyager is not something the background generator takes/);
  });

  /** A page called all, picked by its file name, read as every frame and baked over every background the face has. */
  test('refuses a file name that reads as all', () => {
    const result = () => parseArgs(['--frame', 'all.html'], UNTHEMED);

    expect(result).toThrow(/reads as all, which means every frame/);
  });

  /** A name that is only an extension or a platform tag left an empty frame, and the run went looking for ~emery.html. */
  test.each(['.html', '~emery', '~emery.html'])('refuses --frame %s, which has no name in it', (value) => {
    const result = () => parseArgs(['--frame', value], UNTHEMED);

    expect(result).toThrow(/names no frame/);
  });

  /** A flag with its value left off would take the next flag as its value, and bake a theme called --out. */
  test('refuses a flag with no value', () => {
    const result = () => parseArgs(['--theme', '--out', 'preview.png'], THEMED);

    expect(result).toThrow(/--theme needs a value/);
  });

  /** A typo in --scale still bakes, at the face's default scale, rather than handing the browser a scale of NaN. */
  test('falls back to the default scale when --scale is not a number', () => {
    const result = parseArgs(['--scale', 'big'], THEMED);

    expect(result.scale).toBe(4);
  });
});

describe('planBakes', () => {
  // a face without themes with a page per look, which also keeps a theme_ sheet for each page
  const THREE_PAGES = { frames: ['classic', 'padd', 'voyager'], themes: ['classic', 'padd', 'voyager'] };
  // a face with themes, with its one page and a sheet per colourway
  const ONE_PAGE = { frames: ['classic'], themes: ['mono', 'stealth'] };

  /** A bare run on a face without themes bakes its default frame, or it has nothing to render. */
  test('bakes the default frame of a face without themes when none is named', () => {
    const result = planBakes(parseArgs([], UNTHEMED), UNTHEMED, 'lcars', THREE_PAGES);

    expect(result).toEqual({ frames: ['classic'], themes: [null] });
  });

  /**
   * paf gen <face> all passes --frame all --theme all to every face. A face without themes keeps one
   * sheet per page under css/, so reading those as themes would bake every page once per sheet.
   */
  test('bakes every frame once, with no theme, when a face without themes is asked for all of both', () => {
    const result = planBakes(parseArgs(['--frame', 'all', '--theme', 'all'], UNTHEMED), UNTHEMED, 'lcars', THREE_PAGES);

    expect(result).toEqual({ frames: ['classic', 'padd', 'voyager'], themes: [null] });
  });

  /** The same arguments on a face with themes have to reach every colourway, or one keeps its old background. */
  test('bakes the one frame once per theme when a face with themes is asked for all of both', () => {
    const result = planBakes(parseArgs(['--frame', 'all', '--theme', 'all'], THEMED), THEMED, 'radar', ONE_PAGE);

    expect(result).toEqual({ frames: ['classic'], themes: ['mono', 'stealth'] });
  });

  /** A face whose only pages are for a platform it does not target opened Firefox, baked nothing, and passed. */
  test('refuses a face with no frame it can bake', () => {
    const result = () => planBakes(parseArgs(['--frame', 'all'], UNTHEMED), UNTHEMED, 'lcars', { frames: [], themes: [] });

    expect(result).toThrow(/nothing to bake/);
  });

  /** A page called all as the default frame made a bare run bake every background rather than that page. */
  test('refuses a face with a frame page called all', () => {
    const face: FaceConfig = { ...UNTHEMED, defaultFrame: 'all' };

    const result = () => planBakes(parseArgs([], face), face, 'lcars', { frames: ['all', 'classic'], themes: [] });

    expect(result).toThrow(/has a frame page called all/);
  });

  /** A sheet called theme_all.css could only be baked with every other theme, so asking for it rewrote them all. */
  test('refuses a face with a theme sheet called all', () => {
    const result = () => planBakes(parseArgs(['--theme', 'all'], THEMED), THEMED, 'radar', { frames: ['classic'], themes: ['all', 'mono'] });

    expect(result).toThrow(/has a theme sheet called all/);
  });

  /** A mistyped frame got a warning for each platform and no word on which frames the face has. */
  test('refuses a frame the face has no page for, and names the ones it has', () => {
    const result = () => planBakes(parseArgs(['--frame', 'voyger'], UNTHEMED), UNTHEMED, 'lcars', THREE_PAGES);

    expect(result).toThrow(/no frame called voyger\. Its frames are classic, padd, voyager/);
  });

  /** A default frame whose page was renamed away has to say where the name came from, since nobody typed it. */
  test('names the config when the default frame has no page', () => {
    const face: FaceConfig = { ...UNTHEMED, defaultFrame: 'gone' };

    const result = () => planBakes(parseArgs([], face), face, 'lcars', THREE_PAGES);

    expect(result).toThrow(/no frame called gone, the defaultFrame in its frame\.config\.json/);
  });

  /** A named theme dropped without a word baked the default frame, which is not what the run asked for. */
  test('refuses a named theme on a face without themes', () => {
    const result = () => planBakes(parseArgs(['--theme', 'mono'], UNTHEMED), UNTHEMED, 'lcars', THREE_PAGES);

    expect(result).toThrow(/lcars has no themes/);
  });

  /** A themed face baked with no theme wrote a background named after the frame, which no theme loads. */
  test('refuses a face with themes when no theme is named', () => {
    const result = () => planBakes(parseArgs([], THEMED), THEMED, 'radar', ONE_PAGE);

    expect(result).toThrow(/say which with --theme/);
  });

  /** A themed background is named after its theme alone, so a second frame would be written over the first. */
  test('refuses every frame of a face with themes that has more than one', () => {
    const result = () => planBakes(parseArgs(['--frame', 'all', '--theme', 'all'], THEMED), THEMED, 'radar', THREE_PAGES);

    expect(result).toThrow(/each frame would be written over the last/);
  });

  /** A mistyped theme stopped partway through on a missing file's path, with nothing saying which themes there are. */
  test('refuses a theme the face has no sheet for, and names the ones it has', () => {
    const result = () => planBakes(parseArgs(['--theme', 'nope'], THEMED), THEMED, 'radar', ONE_PAGE);

    expect(result).toThrow(/no theme called nope\. Its themes are mono, stealth/);
  });

  /** A themed face with no theme sheet baked nothing and still passed, so a moved css folder went unnoticed. */
  test('refuses every theme of a face with themes that has no theme sheet', () => {
    const result = () => planBakes(parseArgs(['--theme', 'all'], THEMED), THEMED, 'radar', { frames: ['classic'], themes: [] });

    expect(result).toThrow(/no frame\/css\/theme_<name>\.css sheet/);
  });
});

describe('outFor', () => {
  const ONE_OF_EACH = { frames: 1, themes: 1 };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Two themes landing on one file name would leave only the last colourway's background in the build. */
  test('names a themed bake after its theme', () => {
    const result = outFor({ frame: 'classic', theme: 'mono' }, ONE_OF_EACH, null, THEMED, IMAGES, 'emery');

    expect(result).toBe(path.join(IMAGES, 'background-mono~emery.png'));
  });

  /** The face loads background.png as its plain frame, so the bare base has to land there and not under its own name. */
  test('writes the bare background base to background.png', () => {
    const result = outFor({ frame: 'classic', theme: null }, ONE_OF_EACH, null, UNTHEMED, IMAGES, 'emery');

    expect(result).toBe(path.join(IMAGES, 'background~emery.png'));
  });

  /** Any other frame gets its own file, or baking it would overwrite the face's plain background. */
  test('names any other frame after its base', () => {
    const result = outFor({ frame: 'padd', theme: null }, ONE_OF_EACH, null, UNTHEMED, IMAGES, 'emery');

    expect(result).toBe(path.join(IMAGES, 'background-padd~emery.png'));
  });

  /** A face with no plain background names every frame after itself, so its default frame never lands on background.png. */
  test('names the default frame after its base when the face has no bare background base', () => {
    const face: FaceConfig = { ...UNTHEMED, bareBackgroundBase: null };

    const result = outFor({ frame: 'classic', theme: null }, ONE_OF_EACH, null, face, IMAGES, 'emery');

    expect(result).toBe(path.join(IMAGES, 'background-classic~emery.png'));
  });

  /** Two platforms landing on one file name would leave only the last screen's frame in the build. */
  test('tags the file with the platform it was baked for', () => {
    const result = outFor({ frame: 'classic', theme: null }, ONE_OF_EACH, null, UNTHEMED, IMAGES, 'gabbro');

    expect(result).toBe(path.join(IMAGES, 'background~gabbro.png'));
  });

  /**
   * Each theme lands beside the --out path under its own name. Sharing one --out across several
   * themes would overwrite the face's committed backgrounds during a preview run meant to leave them alone.
   */
  test('names each theme beside --out when more than one theme is baked', () => {
    vi.spyOn(process, 'cwd').mockReturnValue(WORKSPACE);

    const result = outFor({ frame: 'classic', theme: 'mono' }, { frames: 1, themes: 2 }, 'preview/override.png', THEMED, IMAGES, 'emery');

    expect(result).toBe(path.join(WORKSPACE, 'preview', 'override-mono~emery.png'));
  });

  /** Every frame of a face without themes baked to one --out name would leave only the last frame there. */
  test('names each frame beside --out when more than one frame is baked', () => {
    vi.spyOn(process, 'cwd').mockReturnValue(WORKSPACE);

    const result = outFor({ frame: 'padd', theme: null }, { frames: 3, themes: 1 }, 'preview/override.png', UNTHEMED, IMAGES, 'emery');

    expect(result).toBe(path.join(WORKSPACE, 'preview', 'override-padd~emery.png'));
  });

  /**
   * A relative --out is meant from the workspace root, not from wherever the command happened to run.
   *
   * npm runs the script from the workspace root, so the working folder is moved elsewhere here.
   * Without that, resolving against the working folder would land on the same path and pass.
   */
  test('resolves a single-bake --out against the workspace root', () => {
    vi.spyOn(process, 'cwd').mockReturnValue(path.join(WORKSPACE, 'somewhere', 'else'));

    const result = outFor({ frame: 'classic', theme: 'mono' }, ONE_OF_EACH, 'resources/images/override.png', THEMED, IMAGES, 'emery');

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

describe('missingStylesheets', () => {
  /**
   * A frame that links the framework's colours by a path that no longer lands on them bakes with
   * every colour variable unresolved, and Firefox says nothing about it.
   */
  test('names a file: sheet that is not there', () => {
    const dir = tempDir('frame-');

    fs.writeFileSync(path.join(dir, 'frame.css'), '');
    const here = pathToFileURL(path.join(dir, 'frame.css')).href;
    const gone = pathToFileURL(path.join(dir, 'paf', 'plugins', 'frame', 'css', 'pebble-colors.css')).href;

    const result = missingStylesheets([here, gone]);

    expect(result).toEqual([gone]);
  });

  /** A web font sheet cannot be checked from disk, and one that fails shows as the wrong font rather than a bare frame. */
  test('leaves sheets from the web alone', () => {
    const result = missingStylesheets(['https://fonts.googleapis.com/css2?family=Share+Tech+Mono']);

    expect(result).toEqual([]);
  });

  /** The page resolves C:/x.css to a scheme called c, so Firefox never loads it, and the frame baked bare. */
  test('names a sheet the browser reads as another scheme', () => {
    const result = missingStylesheets(['c:/frames/colours.css']);

    expect(result).toEqual(['c:/frames/colours.css']);
  });

  /** A path running through a file threw ENOTDIR, so the run stopped on a raw error rather than naming the sheet. */
  test('names a sheet whose path runs through a file', () => {
    const dir = tempDir('frame-');

    fs.writeFileSync(path.join(dir, 'frame.css'), '');
    const through = pathToFileURL(path.join(dir, 'frame.css', 'extra.css')).href;

    const result = missingStylesheets([through]);

    expect(result).toEqual([through]);
  });
});

describe('discoverFrames', () => {
  /** A frame counted once per platform would be baked, and written, once per platform over itself. */
  test('names each frame once however many platforms it has a page for', () => {
    const dir = tempDir('frames-');

    for (const file of ['classic~emery.html', 'classic~gabbro.html', 'padd~emery.html', 'frame.config.json']) {
      fs.writeFileSync(path.join(dir, file), '');
    }

    const result = discoverFrames(dir, ['emery', 'gabbro']);

    expect(result).toEqual(['classic', 'padd']);
  });

  /**
   * A draft page for a round screen, in a face with themes that builds only for emery, counted as a
   * second frame. paf gen <face> all then refused the face for having more than one.
   */
  test('leaves out a frame whose only page is for a platform the face does not target', () => {
    const dir = tempDir('frames-');

    for (const file of ['radar~emery.html', 'round~gabbro.html']) {
      fs.writeFileSync(path.join(dir, file), '');
    }

    const result = discoverFrames(dir, ['emery']);

    expect(result).toEqual(['radar']);
  });

  /** A frame named lower~decks was listed, and --frame takes a trailing ~word for a platform tag, so it could not be picked. */
  test('takes no page with a ~ in its name before the platform tag', () => {
    const dir = tempDir('frames-');

    for (const file of ['lower~decks~emery.html', 'classic~emery.html']) {
      fs.writeFileSync(path.join(dir, file), '');
    }

    const result = discoverFrames(dir, ['emery']);

    expect(result).toEqual(['classic']);
  });
});

describe('discoverThemes', () => {
  /**
   * A theme missed here is never baked by --theme all, so that colourway keeps the background it had
   * before. A sheet read as a theme that is not one, such as theme_.css, bakes the base frame over its own
   * background with a theme's colours.
   */
  test('names each theme from its sheet and skips other stylesheets and a sheet with no name', () => {
    const dir = tempDir('themes-');

    for (const file of ['theme_red.css', 'theme_blue.css', 'frame.css', 'pebble-colors.css', 'theme_.css']) {
      fs.writeFileSync(path.join(dir, file), '');
    }

    const result = discoverThemes(dir);

    expect(result).toEqual(['blue', 'red']);
  });

  /** A face that keeps no css folder has no themes, and reading the missing folder would stop the run on a raw error. */
  test('names no themes when the face has no css folder', () => {
    const dir = tempDir('themes-');

    const result = discoverThemes(path.join(dir, 'css'));

    expect(result).toEqual([]);
  });
});
