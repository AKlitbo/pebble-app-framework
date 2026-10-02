/**
 * Bakes a face's HTML frame into a background bitmap.
 *
 * Renders frame/<name>.html in Firefox at a supersampled deviceScaleFactor, strips the
 * live readouts (the app draws those at runtime), then resizes to the platform's native
 * screen size with a lanczos3 kernel and writes a PNG. Firefox rather than Chromium, because
 * Chromium clips pseudo-elements drawn at z-index:-1, which carve-outs such as the LCARS elbows
 * rely on.
 *
 * A frame is baked once for each platform the face's appinfo targets, since the screens differ in
 * size and a round one needs a frame drawn round. Each platform bakes from its own
 * frame/<name>~<platform>.html to a PNG tagged ~<platform>, which the SDK picks for that build. A
 * platform with no frame of its own is skipped with a warning, and the rest still bake.
 *
 * The build does not bake frames. The PNGs under resources/images/ are committed. Run this
 * by hand to re-bake one during design:
 *   paf gen <face> frame [frame]
 *   paf gen <face> frame <frame> --scale 4 --out resources/images/background.png
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { firefox } from 'playwright';
import sharp from 'sharp';
import { faceDir } from '../../tools/shared/faces.ts';
import { APPINFO_REL, WORKSPACE } from '../../tools/shared/paths.ts';
import { ToolError, reportFailure } from '../../tools/shared/tool-error.ts';
import { isMainScript } from '../../tools/shared/entry.ts';

/** Native screen size per Pebble platform (px). */
interface Dims {
  w: number;
  h: number;
}

export const PLATFORM_DIMS: Record<string, Dims> = {
  emery: { w: 200, h: 228 },
  gabbro: { w: 260, h: 260 },
  chalk: { w: 180, h: 180 },
  basalt: { w: 144, h: 168 },
  aplite: { w: 144, h: 168 },
  diorite: { w: 144, h: 168 },
  flint: { w: 144, h: 168 },
};

const ROOT = WORKSPACE;

/**
 * The per-face render knobs, loaded from the face's frame/frame.config.json.
 *
 * A face either bakes each theme from its own frame/<name>.html (supportsTheme: false, one
 * HTML per look) or swaps a palette over one HTML (supportsTheme: true, a theme_<name>.css
 * per look). clearTextSelectors have their text emptied and hideSelectors are hidden, so the
 * bake is pure chrome. The "bareBackgroundBase" frame bakes to background.png. Every other
 * base lands at background-<base>.png.
 *
 * hideSelectors drop out of the flow, so use them for something nothing else is positioned
 * against. unpaintSelectors keep their box and lose only their pixels, which is what a piece of
 * chrome the watch draws for itself needs: the bake has to leave the space exactly where it was.
 *
 * maxColors caps how many colours the bake may keep. 16 is the number that matters: the SDK packs
 * a 16-colour bitmap at four bits per pixel and anything above it at eight, which doubles the heap
 * the watch needs to hold the frame. See capColors.
 */
export interface FaceConfig {
  defaultFrame: string;
  defaultScale: number;
  supportsTheme: boolean;
  bareBackgroundBase: string | null;
  clearTextSelectors: string[];
  hideSelectors: string[];
  unpaintSelectors?: string[];
  maxColors?: number;
}

/** The paths generate-frame reads and writes for one face, all inside the face's folder. */
interface FaceDirs {
  appinfo: string;
  frameDir: string;
  cssDir: string;
  imagesDir: string;
  config: string;
}

/** Builds a face's FaceDirs by joining its face directory onto the fixed subpaths. */
function faceDirs(face: string): FaceDirs {
  const base = faceDir(face);

  return {
    appinfo: path.join(base, APPINFO_REL),
    frameDir: path.join(base, 'frame'),
    cssDir: path.join(base, 'frame', 'css'),
    imagesDir: path.join(base, 'resources', 'images'),
    config: path.join(base, 'frame', 'frame.config.json'),
  };
}

/** Reads and parses a face's frame.config.json, which a face with a frame to bake holds. */
function loadFaceConfig(face: string, dirs: FaceDirs): FaceConfig {
  if (!fs.existsSync(dirs.config)) {
    throw new ToolError(`${face} has no frame/frame.config.json to bake from`);
  }

  return JSON.parse(fs.readFileSync(dirs.config, 'utf8'));
}

/**
 * The platforms a face's appinfo targets that a frame can be baked for.
 *
 * A platform with no known screen size is left out with a warning, since there is no size to bake
 * it at. A face
 * with no appinfo yet, or none of its platforms known, bakes for emery.
 *
 * @param appinfoPath The face's pebble.appinfo.json path.
 * @return The platforms to bake, in the appinfo's order.
 */
export function facePlatforms(appinfoPath: string): string[] {
  let listed: unknown[] = [];

  try {
    const appinfo = JSON.parse(fs.readFileSync(appinfoPath, 'utf8'));

    listed = Array.isArray(appinfo.targetPlatforms) ? appinfo.targetPlatforms : [];
  } catch {
    // no appinfo yet, so fall through to the default
  }

  const known = listed.map(String).filter((platform) => {
    if (PLATFORM_DIMS[platform]) {
      return true;
    }

    console.warn(`warning: no screen size known for ${platform}, so it gets no frame`);
    return false;
  });

  return known.length ? known : ['emery'];
}

// the watch never sees the anti-aliased bake. the SDK snaps every channel to one of four levels
// on its way to the Pebble-64 palette, so what decides the packed bit depth is how many of those
// 64 a frame lands on, not how many colours the PNG holds
function snapChannel(value: number): number {
  return Math.round(value / 85) * 85;
}

// one Pebble-64 colour as a single number, so the buckets can key a Map
// the >>> 0 matters: a red channel of 255 shifts into the sign bit and would otherwise come back
// negative, which no longer matches the same colour read out of a Uint32Array
function bucketKey(red: number, green: number, blue: number, alpha: number): number {
  return ((snapChannel(red) << 24) | (snapChannel(green) << 16) | (snapChannel(blue) << 8) |
    (alpha >= 128 ? 255 : 0)) >>> 0;
}

/** Splits a bucket key back into its four channel bytes. */
function bucketChannels(key: number): number[] {
  return [(key >>> 24) & 255, (key >>> 16) & 255, (key >>> 8) & 255, key & 255];
}

/**
 * Folds a bake down to at most `limit` Pebble-64 colours.
 *
 * A 16-colour bitmap packs at four bits per pixel and a 17-colour one at eight, so one stray
 * colour doubles the heap the watch needs to hold the frame. A full-screen frame is big enough
 * that the difference is the difference between the image loading and not loading at all.
 *
 * The strays are anti-aliasing crumbs off the curved chrome, a handful of pixels each, so the
 * fix is to drop the least-used bucket into its nearest neighbour until the count comes down.
 * Only the pixels sitting in a dropped bucket are repainted. Every other pixel keeps the value
 * the resize gave it, which is what leaves the anti-aliasing alone.
 *
 * @param rgba The resized bake, four bytes per pixel.
 * @param limit The most colours to keep.
 * @return The same buffer with the stray pixels repainted.
 */
export function capColors(rgba: Uint8Array, limit: number): Uint8Array {
  const counts = new Map<number, number>();
  const keys = new Uint32Array(rgba.length / 4);

  for (let i = 0; i < keys.length; i++) {
    const key = bucketKey(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], rgba[i * 4 + 3]);

    keys[i] = key;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const remap = new Map<number, number>();

  while (counts.size > limit) {
    // ties break on the key so a re-bake of the same art always folds the same way
    let rarest = 0;
    let rarestCount = Infinity;

    for (const [key, count] of counts) {
      if (count < rarestCount || (count === rarestCount && key < rarest)) {
        rarest = key;
        rarestCount = count;
      }
    }

    const [red, green, blue, alpha] = bucketChannels(rarest);
    let nearest = 0;
    let nearestDistance = Infinity;

    for (const key of counts.keys()) {
      if (key === rarest) {
        continue;
      }

      const [r2, g2, b2, a2] = bucketChannels(key);
      const distance = (r2 - red) ** 2 + (g2 - green) ** 2 + (b2 - blue) ** 2 + (a2 - alpha) ** 2;

      if (distance < nearestDistance) {
        nearest = key;
        nearestDistance = distance;
      }
    }

    remap.set(rarest, nearest);
    counts.set(nearest, counts.get(nearest)! + rarestCount);
    counts.delete(rarest);
  }

  if (remap.size === 0) {
    return rgba;
  }

  for (let i = 0; i < keys.length; i++) {
    let target = remap.get(keys[i]);

    if (target === undefined) {
      continue;
    }

    // a bucket can be folded into one that later folds again, so follow the chain to the end
    while (remap.has(target)) {
      target = remap.get(target)!;
    }

    const [red, green, blue, alpha] = bucketChannels(target);

    rgba[i * 4] = red;
    rgba[i * 4 + 1] = green;
    rgba[i * 4 + 2] = blue;
    rgba[i * 4 + 3] = alpha;
  }

  return rgba;
}

/**
 * Every theme a face has, by the name its frame/css/theme_<name>.css sheet carries.
 *
 * @param cssDir The face's frame/css folder.
 * @return Each theme's name, sorted, or none when the face has no css folder.
 */
export function discoverThemes(cssDir: string): string[] {
  if (!fs.existsSync(cssDir)) {
    return [];
  }

  return fs
    .readdirSync(cssDir)
    .map((file) => file.match(/^theme_(.+)\.css$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => match[1])
    .sort();
}

/**
 * Every frame a face has, by the name its <frame>~<platform>.html pages share.
 *
 * @param frameDir The face's frame folder.
 * @return Each frame's name once, however many platforms it has a page for, sorted.
 */
export function discoverFrames(frameDir: string): string[] {
  const names = fs
    .readdirSync(frameDir)
    .map((file) => file.match(/^(.+)~[a-z]+\.html$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => match[1]);

  return [...new Set(names)].sort();
}

/** Parsed command-line options. */
interface Options {
  frame: string;
  scale: number;
  theme: string | null;
  /** Every frame the face has rather than one, which --theme all means for a face without themes when no frame is named. */
  allFrames: boolean;
  outOverride: string | null;
}

/**
 * Parses the command-line arguments generate-frame is run with.
 *
 * @param argv The arguments after the script name, in order.
 * @param face The face's config, used for its default frame and default scale.
 * @return The parsed frame, scale, theme, and out-path override.
 */
export function parseArgs(argv: string[], face: FaceConfig): Options {
  let outOverride: string | null = null;
  let scale = face.defaultScale;
  let theme: string | null = null;
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') {
      outOverride = argv[++i];
    } else if (argv[i] === '--scale') {
      scale = parseInt(argv[++i], 10) || face.defaultScale;
    } else if (argv[i] === '--theme') {
      theme = argv[++i];
    } else {
      positional.push(argv[i]);
    }
  }

  // a face without themes has one page per look, so all there means every frame it has, unless one
  // is named. paf gen <face> all passes --theme all to every face the same way, naming none
  const allFrames = !face.supportsTheme && theme === 'all' && positional.length === 0;

  if (!face.supportsTheme) {
    theme = null;
  }

  const frame = (positional[0] || face.defaultFrame).replace(/\.html$/i, '');

  return { frame, scale, theme, allFrames, outOverride };
}

/**
 * Where a given theme's PNG lands.
 *
 * @param opts The parsed command-line options.
 * @param themeName The theme being baked, or null for a face with no themes.
 * @param themeCount How many themes are being baked in this run.
 * @param face The face's config, used for its bare background base name.
 * @param imagesDir The face's resources/images directory.
 * @param platform The platform being baked, which the file carries as its ~<platform> tag.
 * @return The absolute path the PNG should be written to.
 */
export function outFor(
  opts: Options,
  themeName: string | null,
  themeCount: number,
  face: FaceConfig,
  imagesDir: string,
  platform: string
): string {
  const tag = '~' + platform;

  if (opts.outOverride) {
    // several themes, or every frame of a face without themes, each get their own file beside the
    // one --out names, rather than landing over each other or the committed backgrounds
    const frameSuffix = opts.allFrames ? `-${opts.frame}` : '';
    const themeSuffix = themeName && themeCount > 1 ? `-${themeName}` : '';
    const suffix = frameSuffix + themeSuffix;

    return path.resolve(ROOT, opts.outOverride).replace(/(\.png)?$/i, suffix + tag + '.png');
  }

  const base = opts.frame;
  let name: string;

  if (themeName) {
    name = `background-${themeName}`;
  } else if (face.bareBackgroundBase && base === face.bareBackgroundBase) {
    name = 'background';
  } else {
    name = `background-${base}`;
  }

  return path.join(imagesDir, name + tag + '.png');
}

/**
 * The stylesheets a frame page links that the browser cannot load from disk.
 *
 * Firefox renders a page whose stylesheet is missing without a word, and hands the link an empty sheet
 * rather than none, so the page itself cannot say. A frame whose colours sheet went missing would bake
 * with every colour it declared left out. The links come from the page as the browser resolved them,
 * so comments, quoting, and relative paths are read the way Firefox reads them. A file: link has to be
 * a file that is there. A sheet from the web is not checked, since one that fails shows as the wrong
 * font rather than a bare frame. Anything else, such as C:/x.css, which a URL reads as a scheme called
 * c, is a sheet the browser never loads.
 *
 * @param urls Each stylesheet link's href, resolved by the page.
 * @return The ones the browser cannot load.
 */
export function missingStylesheets(urls: string[]): string[] {
  return urls.filter((url) => {
    let parsed: URL;

    try {
      parsed = new URL(url);
    } catch {
      return true;
    }

    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return false;
    }

    if (parsed.protocol !== 'file:') {
      return true;
    }

    // a path running through a file, such as frame.css/extra.css, throws ENOTDIR, and names a missing sheet
    try {
      return !fs.statSync(fileURLToPath(parsed), { throwIfNoEntry: false })?.isFile();
    } catch {
      return true;
    }
  });
}

/** Bakes one or more theme PNGs for a face, from the command-line arguments. */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const face = argv[0];

  if (!face || face.startsWith('-')) {
    throw new ToolError('usage: node paf/plugins/frame/generate-frame.ts <face> [frame] [--scale N] [--theme name|all] [--out path], which paf gen <face> frame runs');
  }

  const dirs = faceDirs(face);
  const faceCfg = loadFaceConfig(face, dirs);
  const opts = parseArgs(argv.slice(1), faceCfg);

  // each platform bakes from its own HTML, and one without it is skipped so the rest still bake
  const frames = opts.allFrames ? discoverFrames(dirs.frameDir) : [opts.frame];
  const platforms = facePlatforms(dirs.appinfo);
  const bakes = frames
    .flatMap((frame) => platforms.map((platform) => ({ frame, platform, html: path.join(dirs.frameDir, `${frame}~${platform}.html`) })))
    .filter((bake) => {
      if (fs.existsSync(bake.html)) {
        return true;
      }

      console.warn(`warning: ${path.relative(ROOT, bake.html)} not found, so ${bake.platform} gets no ${bake.frame} frame`);
      return false;
    });

  if (bakes.length === 0) {
    throw new ToolError(`No frame HTML found for ${frames.join(', ')} on any platform the face targets`);
  }

  let themes: (string | null)[];

  if (opts.theme === 'all') {
    // a face with no theme sheets has just its base frame. paf gen <face> all asks every face for
    // all its themes the same way, so that is what all means there
    themes = discoverThemes(dirs.cssDir);

    if (themes.length === 0) {
      themes = [null];
    }
  } else if (opts.theme) {
    themes = [opts.theme];
  } else {
    themes = [null];
  }

  const browser = await firefox.launch();
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: opts.scale,
  });

  // every page is checked before any bakes, so a missing sheet on one platform stops the run before
  // another platform's frames are rewritten. a themed bake takes out the page's own theme_ links and
  // adds the theme's sheet itself, so a missing one there is never loaded
  const themed = themes[0] !== null;

  for (const bake of bakes) {
    await page.goto(pathToFileURL(bake.html).href, { waitUntil: 'networkidle' });
    const links = await page.$$eval('link[rel~="stylesheet" i]', (found) => found.map((link) => (link as HTMLLinkElement).href));
    const missing = missingStylesheets(links).filter((url) => !(themed && url.includes('theme_')));

    if (missing.length) {
      await browser.close();
      throw new ToolError(`${path.relative(ROOT, bake.html)} links stylesheets the browser cannot load: ${missing.join(', ')}`);
    }
  }

  const clearSel = faceCfg.clearTextSelectors.join(', ');
  const hideSel = faceCfg.hideSelectors.join(', ');
  const unpaintSel = (faceCfg.unpaintSelectors || []).join(', ');

  for (const bake of bakes) {
    const { w: screenW, h: screenH } = PLATFORM_DIMS[bake.platform];
    const html = bake.html;
    const fileUrl = pathToFileURL(html).href;

    for (const themeName of themes) {
      await page.goto(fileUrl, { waitUntil: 'networkidle' });

      if (themeName) {
        const themeCss = path.join(dirs.cssDir, `theme_${themeName}.css`);

        if (!fs.existsSync(themeCss)) {
          throw new ToolError(`Theme stylesheet not found: ${themeCss}`);
        }

        await page.evaluate(() => {
          document.querySelectorAll('link[href*="theme_"]').forEach((link) => link.remove());
        });
        await page.addStyleTag({ path: themeCss });
      }

      await page.evaluate(
        ({ clear, hide, unpaint }: { clear: string; hide: string; unpaint: string }) => {
          if (clear) {
            document.querySelectorAll(clear).forEach((el) => {
              el.textContent = '';
            });
          }

          if (hide) {
            document.querySelectorAll(hide).forEach((el) => {
              (el as HTMLElement).style.display = 'none';
            });
          }

          // visibility rather than display so the box still takes up its space
          // it also takes the element's ::before and ::after along with it
          // which is where a frame often keeps its decorations, such as the LCARS end notches
          if (unpaint) {
            document.querySelectorAll(unpaint).forEach((el) => {
              (el as HTMLElement).style.visibility = 'hidden';
            });
          }
        },
        { clear: clearSel, hide: hideSel, unpaint: unpaintSel }
      );

      // networkidle does not guarantee custom webfonts are painted, so await the font api
      await page.evaluate(() => document.fonts && document.fonts.ready);
      await page.waitForTimeout(200);

      const screenshot = await page.locator('.viewport').screenshot();
      const out = outFor({ ...opts, frame: bake.frame }, themeName, themes.length, faceCfg, dirs.imagesDir, bake.platform);

      fs.mkdirSync(path.dirname(out), { recursive: true });

      const resized = sharp(screenshot)
        // lanczos3 prevents moire when downscaling the sharp chrome geometry
        .resize(screenW, screenH, { kernel: 'lanczos3' });

      if (faceCfg.maxColors) {
        const raw = await resized.ensureAlpha().raw().toBuffer();

        await sharp(capColors(raw, faceCfg.maxColors), {
          raw: { width: screenW, height: screenH, channels: 4 },
        })
          .png()
          .toFile(out);
      } else {
        await resized.png().toFile(out);
      }

      console.log(
        `Rendered ${path.relative(ROOT, html)}${themeName ? ` [${themeName}]` : ''} -> ` +
          `${path.relative(ROOT, out)} (${screenW}x${screenH})`
      );
    }
  }

  await browser.close();
}

if (isMainScript(import.meta)) {
  // Firefox stays open when a bake throws, and it keeps node running, so the run ends here
  main().catch((error) => {
    reportFailure(error);
    process.exit();
  });
}
