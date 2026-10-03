/**
 * Bakes a face's HTML frame into a background bitmap.
 *
 * Renders frame/<name>~<platform>.html in Firefox at a supersampled deviceScaleFactor, strips the
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
 *   paf gen <face> background                    the default frame of a face without themes
 *   paf gen <face> background --frame voyager    one frame
 *   paf gen <face> background --theme mono       one theme of a face with themes
 *   paf gen <face> background --frame voyager --scale 4 --out resources/images/preview.png
 *
 * --frame and --theme each take a name or all. all bakes every one the face has, and where the face
 * has only the one frame, or no themes, it bakes what there is. paf gen <face> all passes --frame all
 * --theme all, which re-bakes every background of a face without themes and of a face with themes
 * and one frame. A face with themes and more than one frame is refused, since a themed background is
 * named after its theme alone and each frame would be written over the last. A face with themes and
 * no theme sheet is refused too, since there is no theme to bake.
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
 * A face either bakes each look from its own frame/<name>~<platform>.html (supportsTheme: false,
 * one HTML per look) or swaps a palette over one HTML (supportsTheme: true, a theme_<name>.css
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

/** The paths the generator reads and writes for one face, all inside the face's folder. */
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
 * Every frame a face can bake, by the name its <frame>~<platform>.html pages share.
 *
 * A page for a platform the face does not target is never baked, so a frame with only such pages is
 * left out. A draft page for a round screen would otherwise count as a second frame of a face that
 * only builds for a rectangular one. A frame's name holds no ~, since that is what sets the platform
 * tag apart, so a page with two of them is no frame.
 *
 * @param frameDir The face's frame folder.
 * @param platforms The platforms the face targets.
 * @return Each frame's name once, however many of those platforms it has a page for, sorted.
 */
export function discoverFrames(frameDir: string, platforms: string[]): string[] {
  const names = fs
    .readdirSync(frameDir)
    .map((file) => file.match(/^([^~]+)~([a-z]+)\.html$/))
    .filter((match): match is RegExpMatchArray => match !== null && platforms.includes(match[2]))
    .map((match) => match[1]);

  return [...new Set(names)].sort();
}

/** The usage line, as paf runs the generator. */
const USAGE = 'usage: paf gen <face> background [--frame name|all] [--theme name|all] [--scale N] [--out path]';

/** Parsed command-line options. */
interface Options {
  /** The frame named, all, or null when the run names none. */
  frame: string | null;
  scale: number;
  /** The theme named, all, or null when the run names none. */
  theme: string | null;
  outOverride: string | null;
}

/**
 * Parses the command-line arguments the generator is run with.
 *
 * Anything that is not one of its flags is refused, so a frame named without --frame stops the run
 * rather than baking the default frame over its background.
 *
 * --frame takes the page's file name as well as the frame's, so .html and a ~<platform> tag are taken
 * off it. The tag picks no platform. Every platform the face targets is baked whichever page is named.
 * A name with nothing left is refused, and so is a file name that comes out as all, since only the
 * bare word means every frame.
 *
 * @param argv The arguments after the face, in order.
 * @param face The face's config, used for its default scale.
 * @return The parsed frame, scale, theme, and out-path override.
 */
export function parseArgs(argv: string[], face: FaceConfig): Options {
  let outOverride: string | null = null;
  let scale = face.defaultScale;
  let theme: string | null = null;
  let frame: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];

    if (!['--out', '--scale', '--theme', '--frame'].includes(flag)) {
      throw new ToolError(`${flag} is not something the background generator takes. ${USAGE}`);
    }

    const value = argv[++i];

    if (value === undefined || value.startsWith('--')) {
      throw new ToolError(`${flag} needs a value. ${USAGE}`);
    }

    if (flag === '--out') {
      outOverride = value;
    } else if (flag === '--scale') {
      scale = parseInt(value, 10) || face.defaultScale;
    } else if (flag === '--theme') {
      theme = value;
    } else {
      // the page's file name works too, with or without its .html and its platform tag
      frame = value.replace(/\.html$/i, '').replace(/~[a-z]+$/, '');

      if (frame === '') {
        throw new ToolError(`--frame ${value} names no frame. ${USAGE}`);
      }

      // only the bare word means every frame, so a page called all cannot be picked by its file name
      if (frame === 'all' && value !== 'all') {
        throw new ToolError(`--frame ${value} reads as all, which means every frame. Give the page another name to bake it on its own`);
      }
    }
  }

  return { frame, scale, theme, outOverride };
}

/** The frames and themes one run bakes. A null theme is a bake with the page's own stylesheets. */
export interface Plan {
  frames: string[];
  themes: (string | null)[];
}

/**
 * Works out which frames and themes a run bakes, from its flags and what the face has.
 *
 * all on either flag means every one the face has. A face without themes has none to pick from, so
 * --theme all there bakes each frame as it stands, and a named theme is refused rather than dropped,
 * since the run would bake something other than what was asked for.
 *
 * A face with themes has to be told which, since a bake with no theme writes a background named
 * after the frame, which no theme loads. It also bakes one frame only, since a themed background is
 * named after its theme alone and two frames would land on the same file.
 *
 * The frame is the one --frame names, or the config's defaultFrame when the run names none. A frame
 * or a theme the face does not have is refused with the ones it has, and so is a face with no frame
 * it can bake, since the run would otherwise open Firefox, write nothing, and pass. A frame or a
 * theme called all is refused wherever it comes from, since the word means every one.
 *
 * @param opts The parsed command-line options.
 * @param face The face's config.
 * @param name The face's name, for a refusal.
 * @param found The frames the face can bake on the platforms it targets, and the themes it has a sheet for.
 * @return The frames and themes to bake.
 */
export function planBakes(opts: Options, face: FaceConfig, name: string, found: { frames: string[]; themes: string[] }): Plan {
  if (found.frames.length === 0) {
    throw new ToolError(`${name} has no frame/<name>~<platform>.html page for a platform it targets, so there is nothing to bake`);
  }

  // all means every one on both flags, so a page or a sheet by that name could never be baked on its own
  if (found.frames.includes('all') || (face.supportsTheme && found.themes.includes('all'))) {
    const what = found.frames.includes('all') ? 'frame page' : 'theme sheet';

    throw new ToolError(`${name} has a ${what} called all, which is the word for every one. Give it another name`);
  }

  const picked = opts.frame ?? face.defaultFrame;

  if (picked !== 'all' && !found.frames.includes(picked)) {
    const from = opts.frame === null ? ', the defaultFrame in its frame.config.json' : '';

    throw new ToolError(`${name} has no frame called ${picked}${from}. Its frames are ${found.frames.join(', ')}`);
  }

  const frames = picked === 'all' ? found.frames : [picked];

  if (!face.supportsTheme) {
    if (opts.theme !== null && opts.theme !== 'all') {
      throw new ToolError(`${name} has no themes, since its frame.config.json sets supportsTheme to false, so --theme ${opts.theme} has nothing to pick. Name one of its frames with --frame`);
    }

    return { frames, themes: [null] };
  }

  if (opts.theme === null) {
    throw new ToolError(`${name} bakes its background once for each theme, so say which with --theme <name> or --theme all`);
  }

  if (frames.length > 1) {
    throw new ToolError(`${name} has themes and more than one frame, ${frames.join(', ')}. A themed background is named after its theme alone, so each frame would be written over the last. Name one with --frame`);
  }

  if (found.themes.length === 0) {
    throw new ToolError(`${name} has no frame/css/theme_<name>.css sheet to bake a theme from`);
  }

  if (opts.theme !== 'all' && !found.themes.includes(opts.theme)) {
    throw new ToolError(`${name} has no theme called ${opts.theme}. Its themes are ${found.themes.join(', ')}`);
  }

  return { frames, themes: opts.theme === 'all' ? found.themes : [opts.theme] };
}

/**
 * Where one bake's PNG lands.
 *
 * @param bake The frame and theme being baked, the theme null for a face with no themes.
 * @param counts How many frames and themes this run bakes.
 * @param outOverride The path --out named, or null.
 * @param face The face's config, used for its bare background base name.
 * @param imagesDir The face's resources/images directory.
 * @param platform The platform being baked, which the file carries as its ~<platform> tag.
 * @return The absolute path the PNG should be written to.
 */
export function outFor(
  bake: { frame: string; theme: string | null },
  counts: { frames: number; themes: number },
  outOverride: string | null,
  face: FaceConfig,
  imagesDir: string,
  platform: string
): string {
  const tag = '~' + platform;
  const themeName = bake.theme;

  if (outOverride) {
    // several frames or several themes each get their own file beside the one --out names, rather
    // than landing over each other or the committed backgrounds
    const frameSuffix = counts.frames > 1 ? `-${bake.frame}` : '';
    const themeSuffix = themeName && counts.themes > 1 ? `-${themeName}` : '';
    const suffix = frameSuffix + themeSuffix;

    return path.resolve(ROOT, outOverride).replace(/(\.png)?$/i, suffix + tag + '.png');
  }

  const base = bake.frame;
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

/** Bakes one or more background PNGs for a face, from the command-line arguments. */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const face = argv[0];

  if (!face || face.startsWith('-')) {
    throw new ToolError(USAGE);
  }

  const dirs = faceDirs(face);
  const faceCfg = loadFaceConfig(face, dirs);
  const opts = parseArgs(argv.slice(1), faceCfg);

  const platforms = facePlatforms(dirs.appinfo);
  const { frames, themes } = planBakes(opts, faceCfg, face, { frames: discoverFrames(dirs.frameDir, platforms), themes: discoverThemes(dirs.cssDir) });

  // each platform bakes from its own HTML, and one without it is skipped so the rest still bake
  // every frame here has a page for at least one platform, so there is always something to bake
  const bakes = frames
    .flatMap((frame) => platforms.map((platform) => ({ frame, platform, html: path.join(dirs.frameDir, `${frame}~${platform}.html`) })))
    .filter((bake) => {
      if (fs.existsSync(bake.html)) {
        return true;
      }

      console.warn(`warning: ${path.relative(ROOT, bake.html)} not found, so ${bake.platform} gets no ${bake.frame} frame`);
      return false;
    });

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
      const out = outFor({ frame: bake.frame, theme: themeName }, { frames: frames.length, themes: themes.length }, opts.outOverride, faceCfg, dirs.imagesDir, bake.platform);

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
