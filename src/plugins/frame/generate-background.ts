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
 * --theme all, which re-bakes every background the face has. A face with themes bakes its default
 * frame under every theme, and each other frame under the themes its frameThemes lists. A face with
 * themes and more than one frame has to set frameThemes for --frame all, or it is refused rather than
 * baking each other frame under every theme. A face with themes and no theme sheet is refused, since
 * there is no theme to bake.
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
 * bake is pure chrome. Every file ends in its ~<platform> tag. A face without themes bakes its
 * bareBackgroundBase frame to background~<platform>.png and every other frame to
 * background-<frame>~<platform>.png.
 *
 * A themed face bakes its defaultFrame under each theme to background-<theme>~<platform>.png. A
 * themed face with more than one frame bakes each other frame under each theme frameThemes lists to
 * background-<frame>-<theme>~<platform>.png. A frame named on its own bakes under every theme when
 * frameThemes is left out, and --frame all is refused without it. Under bareFrameTheme such a frame
 * leaves the theme out of its file name and bakes to background-<frame>~<platform>.png. The bake still
 * applies that theme's sheet, so only the name changes. Both are read only on a themed face with a
 * frame other than its default.
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
  frameThemes?: string[];
  bareFrameTheme?: string | null;
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
 * it at. A face with no appinfo yet, or none of its platforms known, bakes for emery.
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
// alpha snaps to the same four levels as the colour, and every fully clear pixel is one colour
// whatever its rgb, since the SDK turns clear pixels into a single palette entry
function bucketKey(red: number, green: number, blue: number, alpha: number): number {
  const level = snapChannel(alpha);

  if (level === 0) {
    return 0;
  }

  return ((snapChannel(red) << 24) | (snapChannel(green) << 16) | (snapChannel(blue) << 8) | level) >>> 0;
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

/**
 * One background a run bakes: the frame, the theme it bakes under, and the file name it lands on
 * without its platform tag. The theme is null on a face without themes, which bakes the page with its
 * own stylesheets.
 */
export interface Bake {
  frame: string;
  theme: string | null;
  name: string;
}

/** The backgrounds one run bakes, in the order they bake. */
export interface Plan {
  bakes: Bake[];
}

/**
 * The frame a themed face names after its theme alone. A face with one frame names that frame so,
 * whatever its defaultFrame says, so it bakes the same files however the config names it. A face with
 * more than one frame names its defaultFrame, so one that is not among its frames leaves no frame to
 * name, and is refused.
 */
function themedFrame(face: FaceConfig, name: string, frames: string[]): string {
  if (frames.length === 1) {
    return frames[0];
  }

  if (!frames.includes(face.defaultFrame)) {
    throw new ToolError(`${name} has no frame called ${face.defaultFrame}, the defaultFrame in its frame.config.json, which is the frame its theme backgrounds are named after. Its frames are ${frames.join(', ')}`);
  }

  return face.defaultFrame;
}

/**
 * The themes a frame other than the themed frame bakes under, from frameThemes and bareFrameTheme. A
 * theme either names that the face has no sheet for would never bake, so it is refused with the themes
 * the face has, and so is a bareFrameTheme that frameThemes leaves out, since nothing would bake to
 * its name. The themes come back in the order the face's sheets sort in. Only a face with a frame
 * other than the themed one reads them, so a face with one frame never trips over them.
 */
function otherFrameThemes(face: FaceConfig, name: string, themes: string[]): string[] {
  const listed = face.frameThemes ?? themes;

  if (!Array.isArray(listed) || listed.length === 0) {
    throw new ToolError(`${name} sets frameThemes in its frame.config.json to no theme. List the themes its other frames bake under, or leave it out for every theme`);
  }

  const unknown = listed.filter((theme) => !themes.includes(theme));

  if (unknown.length) {
    throw new ToolError(`${name} lists ${unknown.join(', ')} under frameThemes in its frame.config.json, which it has no theme sheet for. Its themes are ${themes.join(', ')}`);
  }

  const bare = face.bareFrameTheme;

  if (bare !== undefined && bare !== null && !themes.includes(bare)) {
    throw new ToolError(`${name} sets bareFrameTheme in its frame.config.json to ${bare}, and it has no theme sheet by that name. Its themes are ${themes.join(', ')}`);
  }

  if (bare !== undefined && bare !== null && !listed.includes(bare)) {
    throw new ToolError(`${name} sets bareFrameTheme to ${bare}, which its frameThemes leaves out, so no frame bakes under it. Its frameThemes are ${listed.join(', ')}`);
  }

  return themes.filter((theme) => listed.includes(theme));
}

/**
 * The file name one bake lands on, without its platform tag.
 *
 * A face without themes names its bareBackgroundBase frame background and every other frame after
 * itself. A themed face names the themed frame after its theme alone, and every other frame after
 * itself and its theme, or after itself alone under bareFrameTheme.
 */
function backgroundName(frame: string, theme: string | null, face: FaceConfig, themed: string | null): string {
  if (theme === null) {
    return face.bareBackgroundBase && frame === face.bareBackgroundBase ? 'background' : `background-${frame}`;
  }

  if (frame === themed) {
    return `background-${theme}`;
  }

  if (theme === face.bareFrameTheme) {
    return `background-${frame}`;
  }

  return `background-${frame}-${theme}`;
}

/**
 * Works out which frames and themes a run bakes, and the file each lands on, from its flags and what
 * the face has.
 *
 * all on either flag means every one the face has. A face without themes has none to pick from, so
 * --theme all there bakes each frame as it stands, and a named theme is refused rather than dropped,
 * since the run would bake something other than what was asked for.
 *
 * A face with themes has to be told which, since a bake with no theme writes a background named
 * after the frame, which no theme loads. Its default frame bakes under every theme, and each other
 * frame under the themes its frameThemes lists, or every theme when it is left out. A named frame asked
 * for under a theme it does not bake under is refused. With --frame all, a frame that does not bake
 * under the theme named is left out.
 *
 * --frame all on a face with more than one frame and no frameThemes is refused. Every theme a frame
 * other than the default could bake under is rarely every look it has, and baking them all leaves PNGs
 * nothing loads beside the real ones. Setting frameThemes says which looks there are. A frame named on
 * its own still bakes under every theme the run asks for.
 *
 * Every file name is worked out over every frame and theme the face has, not only the ones this run
 * bakes, so two bakes that would land on one file are refused before either is written. A frame
 * called dark beside a theme called dark, for one, gives both background-dark.
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
 * @return The bakes, frame by frame, each frame's themes in sorted order.
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

    return { bakes: frames.map((frame) => ({ frame, theme: null, name: backgroundName(frame, null, face, null) })) };
  }

  if (opts.theme === null) {
    throw new ToolError(`${name} bakes its background once for each theme, so say which with --theme <name> or --theme all`);
  }

  if (found.themes.length === 0) {
    throw new ToolError(`${name} has no frame/css/theme_<name>.css sheet to bake a theme from`);
  }

  if (opts.theme !== 'all' && !found.themes.includes(opts.theme)) {
    throw new ToolError(`${name} has no theme called ${opts.theme}. Its themes are ${found.themes.join(', ')}`);
  }

  const themed = themedFrame(face, name, found.frames);
  const hasOthers = found.frames.some((frame) => frame !== themed);

  if (hasOthers && picked === 'all' && (face.frameThemes ?? null) === null) {
    throw new ToolError(`${name} has themes and more than one frame, ${found.frames.join(', ')}, and its frame.config.json sets no frameThemes. To bake every frame, set frameThemes to the themes its frames other than ${themed} bake under, and bareFrameTheme to the one that leaves the theme out of the name if there is one. Name one frame with --frame to bake it alone`);
  }

  const others = hasOthers ? otherFrameThemes(face, name, found.themes) : [];
  const every = found.frames.flatMap((frame) =>
    (frame === themed ? found.themes : others).map((theme) => ({ frame, theme, name: backgroundName(frame, theme, face, themed) }))
  );
  const seen = new Map<string, Bake>();

  for (const bake of every) {
    const earlier = seen.get(bake.name);

    if (earlier) {
      throw new ToolError(`${name} bakes ${earlier.frame} under ${earlier.theme} and ${bake.frame} under ${bake.theme} to the one file, ${bake.name}. Rename a frame or a theme so each lands on its own`);
    }

    seen.set(bake.name, bake);
  }

  const bakes = every.filter((bake) => frames.includes(bake.frame) && (opts.theme === 'all' || bake.theme === opts.theme));

  if (bakes.length === 0) {
    throw new ToolError(`${name} bakes ${picked} only under ${others.join(', ')}, the frameThemes in its frame.config.json, so it has no ${opts.theme} background`);
  }

  return { bakes };
}

/**
 * Where one bake's PNG lands.
 *
 * @param bake The bake, with the file name it lands on.
 * @param counts How many different frames and themes this run bakes.
 * @param outOverride The path --out named, or null.
 * @param imagesDir The face's resources/images directory.
 * @param platform The platform being baked, which the file carries as its ~<platform> tag.
 * @return The absolute path the PNG should be written to.
 */
export function outFor(bake: Bake, counts: { frames: number; themes: number }, outOverride: string | null, imagesDir: string, platform: string): string {
  const tag = '~' + platform;

  if (outOverride) {
    // several frames or several themes each get their own file beside the one --out names, rather
    // than landing over each other or the committed backgrounds
    const frameSuffix = counts.frames > 1 ? `-${bake.frame}` : '';
    const themeSuffix = bake.theme && counts.themes > 1 ? `-${bake.theme}` : '';
    const suffix = frameSuffix + themeSuffix;

    return path.resolve(ROOT, outOverride).replace(/(\.png)?$/i, suffix + tag + '.png');
  }

  return path.join(imagesDir, bake.name + tag + '.png');
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
  const plan = planBakes(opts, faceCfg, face, { frames: discoverFrames(dirs.frameDir, platforms), themes: discoverThemes(dirs.cssDir) });
  const frames = [...new Set(plan.bakes.map((bake) => bake.frame))];
  const counts = { frames: frames.length, themes: new Set(plan.bakes.map((bake) => bake.theme)).size };

  // each platform bakes from its own HTML, and one without it is skipped so the rest still bake
  // every frame here has a page for at least one platform, so there is always something to bake
  const pages = frames
    .flatMap((frame) => platforms.map((platform) => ({ frame, platform, html: path.join(dirs.frameDir, `${frame}~${platform}.html`) })))
    .filter((page) => {
      if (fs.existsSync(page.html)) {
        return true;
      }

      console.warn(`warning: ${path.relative(ROOT, page.html)} not found, so ${page.platform} gets no ${page.frame} frame`);
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
  const themed = faceCfg.supportsTheme;

  for (const one of pages) {
    await page.goto(pathToFileURL(one.html).href, { waitUntil: 'networkidle' });
    const links = await page.$$eval('link[rel~="stylesheet" i]', (found) => found.map((link) => (link as HTMLLinkElement).href));
    const missing = missingStylesheets(links).filter((url) => !(themed && url.includes('theme_')));

    if (missing.length) {
      await browser.close();
      throw new ToolError(`${path.relative(ROOT, one.html)} links stylesheets the browser cannot load: ${missing.join(', ')}`);
    }
  }

  const clearSel = faceCfg.clearTextSelectors.join(', ');
  const hideSel = faceCfg.hideSelectors.join(', ');
  const unpaintSel = (faceCfg.unpaintSelectors || []).join(', ');

  for (const one of pages) {
    const { w: screenW, h: screenH } = PLATFORM_DIMS[one.platform];
    const html = one.html;
    const fileUrl = pathToFileURL(html).href;

    for (const bake of plan.bakes.filter((each) => each.frame === one.frame)) {
      const themeName = bake.theme;

      await page.goto(fileUrl, { waitUntil: 'networkidle' });

      if (themeName) {
        const themeCss = path.join(dirs.cssDir, `theme_${themeName}.css`);

        await page.evaluate(() => {
          document.querySelectorAll('link[href*="theme_"]').forEach((link) => link.remove());
        });
        // a link rather than inlined text, so a url() in the sheet resolves from css/ as it does in a browser.
        // the sheet loading does not wait for an image it points at, so the bake waits for the network to settle
        await page.addStyleTag({ url: pathToFileURL(themeCss).href });
        await page.waitForLoadState('networkidle');
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
      const out = outFor(bake, counts, opts.outOverride, dirs.imagesDir, one.platform);

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
