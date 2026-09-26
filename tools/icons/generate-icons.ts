#!/usr/bin/env node
/**
 * Rasterize the watchface's SVG glyphs into its Pebble PNG resources.
 *
 * Sources are vendored under vendor/:
 *   weather-icons, by Erik Flowers (key "wi")
 *   uxwing, heart, feet, thermometer, and friends (key "ux")
 *   svgrepo, bluetooth on and slash (key "sr")
 *
 * The face declares what it needs in resources/icons.json,
 * mapping an icon name to its vendored svg and final pixel size:
 *
 *   { "wi-clear": { "svg": "wi/wi-day-sunny", "size": [24, 24] } }
 *
 * The icon name is the file basename. Its Pebble resource id comes from it
 * (wi-clear -> ICON_WI_CLEAR). Faces own their sizes, so the same condition can
 * ship at 24px on one face and 12px on another with no shared -sm/-md variants.
 *
 * Glyphs are forced to white because upstream SVGs do not define a consistent
 * fill or stroke colour. Faces recolour the loaded bitmap's palette at runtime, so
 * one white master serves every tint. Each icon is rasterized at its final size:
 * Pebble clips bitmaps rather than scaling them at draw time.
 *
 * This:
 *   1. renders each glyph into resources/icons/<name>.png
 *   2. rewrites config/pebble.appinfo.json's media block so name -> file stays in sync
 *
 * Re-run after editing a manifest:
 *   npm run gen:icons -- <face>    for one face
 *   npm run gen:icons              for every face with a resources/icons.json
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
// the media list this rewrites is the same one build-manifests reads, so share its shape
import type { MediaEntry } from '../manifest/build-manifests.ts';
import { appinfoPath, faceDir, listFaceNames } from '../faces.ts';
import { WORKSPACE } from '../paths.ts';

/** One icon's row in resources/icons.json: which vendored svg and its final pixel size. */
export type IconSpec = { svg: string; size: [number, number]; trim?: boolean };

/** resources/icons.json, keyed by icon name (the file basename). */
export type IconManifest = Record<string, IconSpec>;

const ROOT = WORKSPACE;
const VENDOR = path.resolve(ROOT, 'vendor');

// manifest svg key -> the vendor subdir holding those svgs
const VENDOR_DIRS: Record<string, string> = {
  wi: path.join('weather-icons', 'svg'),
  ux: 'uxwing',
  sr: 'svgrepo',
};

const WHITE = '#ffffff';

const TRANSPARENT = {
  r: 0,
  g: 0,
  b: 0,
  alpha: 0,
};

/**
 * Forces a glyph white so the face can recolour the loaded bitmap's palette at runtime.
 *
 * @param svgText The svg source to recolour.
 * @return The same svg source with its glyph forced white.
 */
export function whiten(svgText: string): string {
  // recolour any hard-coded black so stroke-style glyphs (which set their own colour on the path) come through white
  let out = svgText.replace(
    /(fill|stroke)="(#000000|#000|black)"/gi,
    `$1="${WHITE}"`
  );

  // glyphs that never set a fill on the root default to black so force white there
  // glyphs that already set a root fill (like fill="none" on stroke icons) are left alone
  // so their outlines stay open instead of getting flooded white. poking white into the
  // root svg tag with a regex saves loading a whole dom parser just to change colours
  if (!/<svg\b[^>]*\bfill=/i.test(out)) {
    out = out.replace(
      /<svg\b/,
      `<svg fill="${WHITE}" stroke="${WHITE}"`
    );
  }

  return out;
}

// rasterize the svg big then find the opaque bounding box and crop the PNG to just the glyph
// lets a small glyph in a padded viewBox fill the final icon at a size that matches its
// siblings instead of shrinking with the empty viewBox padding
async function trimToGlyph(svgText: string): Promise<Buffer> {
  const HI = 240;
  const png = await sharp(Buffer.from(svgText))
    .resize(HI, HI, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer();

  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  let minX = HI, minY = HI, maxX = -1, maxY = -1;
  for (let y = 0; y < HI; y++) {
    for (let x = 0; x < HI; x++) {
      if (data[(y * HI + x) * channels + 3] > 16) {
        if (x < minX) {
          minX = x;
        }
        if (x > maxX) {
          maxX = x;
        }
        if (y < minY) {
          minY = y;
        }
        if (y > maxY) {
          maxY = y;
        }
      }
    }
  }

  if (maxX < 0) {
    return png; // fully transparent so nothing to trim
  }

  return sharp(png)
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .png()
    .toBuffer();
}

/** Rasterizes one svg to a PNG at the given size, trimming to its glyph first when asked. */
async function render(
  svgText: string,
  [width, height]: [number, number],
  outputFile: string,
  opts: { trim?: boolean } = {}
): Promise<void> {
  // sharp requires a buffer here instead of a file path because we modified the raw svg string in memory above
  const input = opts.trim ? await trimToGlyph(svgText) : Buffer.from(svgText);
  await sharp(input)
    .resize(width, height, {
      // fit contain ensures svgs with weird aspect ratios dont stretch padding the rest of the bounding box with the transparent background
      fit: 'contain',
      background: TRANSPARENT,
    })
    .png()
    .toFile(outputFile);
}

// "wi/wi-day-sunny" -> vendor/weather-icons/svg/wi-day-sunny.svg
function svgPath(ref: string): string {
  const slash = ref.indexOf('/');
  const key = slash === -1 ? '' : ref.slice(0, slash);
  const dir = VENDOR_DIRS[key];
  if (!dir) {
    throw new Error(`Unknown vendor key in svg ref "${ref}" (expected one of: ${Object.keys(VENDOR_DIRS).join(', ')})`);
  }

  return path.join(VENDOR, dir, `${ref.slice(slash + 1)}.svg`);
}

/**
 * Turns an icon's basename into its Pebble resource id, for example "wi-clear" into
 * "ICON_WI_CLEAR".
 *
 * @param basename The icon's file basename.
 * @return Its Pebble resource id.
 */
export function resourceName(basename: string): string {
  return 'ICON_' + basename.toUpperCase().replace(/-/g, '_');
}

// a media entry is a face icon when it is a bitmap under an icons/ dir. media file paths
// are relative to the face's resources/ dir, so this matches both a face's own
// "icons/foo.png" and a shared "../../../lib/resources/icons/foo.png"
function isIconEntry(entry: MediaEntry): boolean {
  return entry.type === 'bitmap' && typeof entry.file === 'string' && /(^|\/)icons\//.test(entry.file);
}

/**
 * Merges a manifest's icons into an existing media array. Non-icon entries (fonts,
 * background images) keep their place and order. The icon block is replaced in
 * full and lands where the first old icon sat (or just before the fonts on a face
 * that had none). An icon the old block already had keeps its own extra fields, such
 * as a `memoryFormat` or `targetPlatforms`, while its path points at the face's own
 * render. Pure so it can be tested without touching disk.
 *
 * @param media The face's current media array.
 * @param manifest The face's icons.json manifest.
 * @return The media array with its icon block replaced from the manifest.
 */
export function buildMedia(media: MediaEntry[], manifest: IconManifest): MediaEntry[] {
  const previous = new Map(media.filter(isIconEntry).map((entry) => [entry.name, entry]));
  const icons: MediaEntry[] = Object.keys(manifest).map((name) => ({
    ...previous.get(resourceName(name)),
    type: 'bitmap',
    name: resourceName(name),
    file: `icons/${name}.png`,
  }));

  let insertAt = media.findIndex(isIconEntry);
  if (insertAt === -1) {
    const firstFont = media.findIndex((entry) => entry.type === 'font');
    insertAt = firstFont === -1 ? media.length : firstFont;
  }

  const keptBefore = media.slice(0, insertAt).filter((entry) => !isIconEntry(entry));
  const keptAfter = media.slice(insertAt).filter((entry) => !isIconEntry(entry));

  return [...keptBefore, ...icons, ...keptAfter];
}

// serialize one media entry. bitmaps ride on a single line for a scannable list
// fonts keep their multi-line block so their extra fields (like characterRegex) stay put.
// every field a bitmap has goes on its line, so a background's memoryFormat or
// targetPlatforms survives. type, name, and file lead so a plain entry reads the same as always
function formatEntry(entry: MediaEntry, indent: string): string {
  if (entry.type === 'bitmap') {
    const lead = ['type', 'name', 'file'].filter((key) => key in entry);
    const keys = [...lead, ...Object.keys(entry).filter((key) => lead.indexOf(key) === -1)];
    const fields = keys.map((key) => `${JSON.stringify(key)}: ${JSON.stringify((entry as Record<string, unknown>)[key])}`);
    return `${indent}{ ${fields.join(', ')} }`;
  }

  return JSON.stringify(entry, null, 2)
    .split('\n')
    .map((line) => indent + line)
    .join('\n');
}

/**
 * Splices the rebuilt media array back into the raw package.json text and leaves every
 * other byte of the file untouched. Bracket matching steps over array-valued fields
 * inside an entry (like a font's targetPlatforms) and quoted brackets in strings.
 *
 * @param raw The face's package.json text, unparsed.
 * @param newMedia The media array to splice in, in place of the existing one.
 * @return The same text with its media array replaced.
 */
export function replaceMediaArray(raw: string, newMedia: MediaEntry[]): string {
  // the key followed by its array, since "media" can also sit earlier in the file as a string value
  const key = /"media"\s*:\s*\[/.exec(raw);
  if (!key) {
    throw new Error('no "media" array in package.json');
  }

  const keyAt = key.index;
  const open = keyAt + key[0].length - 1;
  let depth = 0, close = -1, inString = false, escaped = false;
  for (let i = open; i < raw.length; i++) {
    const char = raw[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '[') {
      depth++;
    } else if (char === ']') {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) {
    throw new Error('unterminated "media" array in package.json');
  }

  const lineStart = raw.lastIndexOf('\n', keyAt) + 1;
  // the pattern matches an empty run too so the fallback only keeps the types honest
  const mediaIndent = (raw.slice(lineStart, keyAt).match(/^\s*/) || [''])[0];
  const entryIndent = mediaIndent + '  ';

  const body = newMedia.map((entry) => formatEntry(entry, entryIndent)).join(',\n');
  return raw.slice(0, open + 1) + '\n' + body + '\n' + mediaIndent + raw.slice(close);
}

// rewrite a face's config so its media icon block matches the manifest. the media array sits
// under pebble.resources (a generated package.json) or top-level resources
// (pebble.appinfo.json the manifests are generated from) so accept either
function syncMedia(pkgPath: string, manifest: IconManifest): void {
  const raw = fs.readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(raw);
  const resources = (pkg.pebble && pkg.pebble.resources) || pkg.resources;
  const media = resources && resources.media;
  if (!Array.isArray(media)) {
    throw new Error(`no resources.media array in ${pkgPath}`);
  }

  fs.writeFileSync(pkgPath, replaceMediaArray(raw, buildMedia(media, manifest)));
}

// how many icons render at once. each one is a few sharp passes and a pixel scan, and a face
// can ask for over a hundred, so one at a time leaves most of the machine idle
const RENDER_CONCURRENCY = 8;

// render every icon a manifest asks for into the face's resources/icons dir
async function renderFace(dir: string, manifest: IconManifest): Promise<number> {
  const outDir = path.join(dir, 'resources', 'icons');
  await fs.promises.mkdir(outDir, { recursive: true });

  const entries = Object.entries(manifest);
  let next = 0;

  // each worker takes the next icon off the shared list until none are left
  const worker = async (): Promise<void> => {
    while (next < entries.length) {
      const [name, spec] = entries[next++];
      const src = svgPath(spec.svg);
      try {
        await fs.promises.access(src);
      } catch {
        throw new Error(`Missing source: ${src} (for ${name})`);
      }

      const svg = await fs.promises.readFile(src, 'utf8');
      await render(whiten(svg), spec.size, path.join(outDir, `${name}.png`), { trim: Boolean(spec.trim) });
    }
  };

  await Promise.all(Array.from({ length: Math.min(RENDER_CONCURRENCY, entries.length) }, worker));

  return entries.length;
}

/** Renders every icon a face's manifest asks for, then syncs its media list from the same manifest. */
async function iconsFor(face: string): Promise<void> {
  const dir = faceDir(face);
  // resources (icons.json + rendered PNGs) and the appinfo live under the face dir
  const manifestPath = path.join(dir, 'resources', 'icons.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No resources/icons.json under ${dir}`);
  }

  const manifest: IconManifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
  const rendered = await renderFace(dir, manifest);
  // the media list is synced into the face's appinfo. its package.json is regenerated from
  // it at build time (or with npm run build:manifests -- <face>)
  syncMedia(appinfoPath(face), manifest);

  console.log(`Rendered ${rendered} icons for ${face}.`);
}

/** Renders the icons for the face named on the command line, or for every face with a resources/icons.json. */
async function main(): Promise<void> {
  const face = process.argv[2];
  const faces = face ? [face] : listFaceNames().filter((name) => fs.existsSync(path.join(faceDir(name), 'resources', 'icons.json')));
  for (const name of faces) {
    await iconsFor(name);
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
