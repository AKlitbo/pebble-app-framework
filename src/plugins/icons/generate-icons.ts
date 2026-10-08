#!/usr/bin/env node
/**
 * Rasterize the watchface's SVG glyphs into its Pebble PNG resources.
 *
 * The SVG sources sit in a folder of their own, outside the framework, laid out however the unit likes.
 * The folder is whatever the unit's paf.config.json names as the icons plugin's sources setting,
 * relative to the unit. Without one, the ICON_SOURCES environment variable names it, which is how a
 * tool that fetched the sources for the unit passes them in.
 *
 * The face declares what it needs in resources/icons.json,
 * mapping an icon name to its svg, as a path from the sources folder without the .svg, and its final
 * pixel size:
 *
 *   { "wi-clear": { "svg": "weather/day-sunny", "size": [24, 24] } }
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
 *   2. rewrites pebble.appinfo.json's media block so name -> file stays in sync
 *
 * Re-run after editing a manifest:
 *   paf gen <face> icons    for one face
 * Run by hand with no face, it does every face with a resources/icons.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
// the media list this rewrites is the same one build-manifests reads, so share its shape
import { buildMedia, iconsManifestPath, mediaOf, replaceMediaArray } from './media.ts';
import type { IconManifest } from './media.ts';
import { appinfoPath, faceDir, listFaceNames } from '../../tools/shared/faces.ts';
import { WORKSPACE } from '../../tools/shared/paths.ts';
import { ToolError, reportFailure } from '../../tools/shared/tool-error.ts';
import { isMainScript } from '../../tools/shared/entry.ts';

const ROOT = WORKSPACE;

// short keys an svg path could open with, each standing for a subfolder of the icon sources
// a Map so a folder named constructor or toString never finds an object built-in as a key
// TODO: remove these at the next major release
const DEPRECATED_KEYS = new Map([
  ['wi', 'weather-icons/svg'],
  ['ux', 'uxwing'],
  ['sr', 'svgrepo'],
]);

// how many folders the wrong-folder error names before it just counts the rest
const FOLDERS_SHOWN = 5;

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
      // fit: contain keeps an svg with a weird aspect ratio from stretching, and pads the rest of the box with the transparent background
      fit: 'contain',
      background: TRANSPARENT,
    })
    .png()
    .toFile(outputFile);
}

/** The part of a unit's paf.config.json that says where the icon sources are. */
export type IconSourcesConfig = { plugins?: { icons?: { sources?: string } } };

/**
 * The icon sources folder a unit's paf.config.json names, as written, or undefined when it names none.
 *
 * @param config The unit's paf.config.json.
 * @return The icons plugin's sources setting.
 */
export function iconSourcesSetting(config: IconSourcesConfig): string | undefined {
  return config.plugins && config.plugins.icons && config.plugins.icons.sources;
}

/**
 * Where a unit keeps its icon sources, or null when nothing says.
 *
 * The unit's own setting wins, so a repo that keeps its sources somewhere of its own is never
 * pointed elsewhere. The environment is the fallback, which is how a tool that fetched the sources
 * for the unit passes them in. Nothing is assumed past that, since a guessed folder that turns out
 * empty fails on every icon rather than on the missing setting.
 *
 * @param root The unit's folder, which the setting is relative to.
 * @param config The unit's paf.config.json.
 * @param fromEnv The ICON_SOURCES environment variable.
 * @return The folder's absolute path, or null.
 */
export function iconSourcesDir(root: string, config: IconSourcesConfig, fromEnv: string | undefined): string | null {
  const setting = iconSourcesSetting(config);

  if (setting) {
    return path.resolve(root, setting);
  }

  return fromEnv ? path.resolve(fromEnv) : null;
}

/** Where an icon's svg is, and the deprecated key it was named by, if any. */
export type SvgSource = { file: string; deprecatedKey: string | null };

/**
 * Finds the svg file an icon names.
 *
 * The name is a path from the sources folder without the .svg, so "weather/day-sunny" reads
 * weather/day-sunny.svg. A name opening with one of the deprecated keys, such as "wi/wi-day-sunny",
 * reads from the key's subfolder, here weather-icons/svg, unless the svg is at the name as written,
 * which wins. A name leading outside the sources folder stops the run, since a file found out there
 * would pass the wrong-folder check for every other icon.
 *
 * @param sources The icon sources folder.
 * @param ref The svg name from icons.json.
 * @return The svg's path, and the deprecated key when one was used.
 */
export function svgSource(sources: string, ref: string): SvgSource {
  const file = path.join(sources, `${ref}.svg`);
  const fromSources = path.relative(sources, file);

  if (fromSources === '..' || fromSources.startsWith(`..${path.sep}`) || path.isAbsolute(fromSources)) {
    throw new ToolError(`The svg "${ref}" leads outside the icon sources folder ${sources}`);
  }

  const slash = ref.indexOf('/');
  const key = slash === -1 ? '' : ref.slice(0, slash);
  const dir = DEPRECATED_KEYS.get(key);

  if (dir && !fs.existsSync(file)) {
    return { file: path.join(sources, dir, `${ref.slice(slash + 1)}.svg`), deprecatedKey: key };
  }

  return { file, deprecatedKey: null };
}

// rewrite a face's config so its media icon block matches the manifest
function syncMedia(pkgPath: string, manifest: IconManifest): void {
  const raw = fs.readFileSync(pkgPath, 'utf8');
  const media = mediaOf(raw);

  if (!Array.isArray(media)) {
    throw new ToolError(`no resources.media array in ${pkgPath}`);
  }

  fs.writeFileSync(pkgPath, replaceMediaArray(raw, buildMedia(media, manifest)));
}

// how many icons render at once. each one is a few sharp passes and a pixel scan, and a face
// can ask for over a hundred, so one at a time leaves most of the machine idle
const RENDER_CONCURRENCY = 8;

/**
 * Whether the sources folder holds the svg of at least one icon a run asks for. One holding none is
 * most likely the wrong folder, such as a level too deep, and every icon would keep its PNG and pass.
 *
 * It looks for the files rather than their folders, since an svg sitting straight in the sources
 * folder has the sources folder as its folder, and that is always there. The cost is that a run whose
 * every svg is missing stops, even when the folder is right and this machine just lacks those sets.
 * A run that would draw nothing is worth stopping either way.
 *
 * @param sources The icon sources folder.
 * @param refs The svg names from every icons.json in the run.
 * @return Whether any of their svgs is there, or true when the run has no icons.
 */
export function holdsAnyIcon(sources: string, refs: string[]): boolean {
  return refs.length === 0 || refs.some((ref) => fs.existsSync(svgSource(sources, ref).file));
}

/**
 * Renders every icon a manifest asks for into the face's resources/icons folder.
 *
 * An icon whose source is missing keeps the PNG already there, with a warning, so a face drawing
 * from a set this machine does not have still regenerates the rest. Without a PNG to keep, or with one
 * that is not the size icons.json asks for, it stops, since the build would fail on the missing
 * resource or draw the old size. A mistyped source name on an icon that has a PNG only warns, and the
 * old PNG ships. A sources folder that is missing, or holds none of the run's svgs, still stops the run before
 * this, which catches the common mistake, so the warning is worth keeping a partial set working.
 *
 * An svg named by a deprecated key still renders, and the run warns once for each key the face
 * uses, naming the path to write in its place.
 *
 * @param dir The face's folder.
 * @param manifest The face's icons.json.
 * @param sources The icon sources folder.
 * @return How many icons it rendered.
 */
export async function renderFace(dir: string, manifest: IconManifest, sources: string): Promise<number> {
  const outDir = path.join(dir, 'resources', 'icons');

  await fs.promises.mkdir(outDir, { recursive: true });

  const icons = Object.entries(manifest).map(([name, spec]) => ({ name, spec, source: svgSource(sources, spec.svg) }));
  let next = 0;
  let rendered = 0;

  // each worker takes the next icon off the shared list until none are left
  const worker = async (): Promise<void> => {
    while (next < icons.length) {
      const { name, spec, source } = icons[next++];
      const src = source.file;
      const out = path.join(outDir, `${name}.png`);

      if (!fs.existsSync(src)) {
        if (!fs.existsSync(out)) {
          throw new ToolError(`Missing source: ${src} (for ${name})`);
        }

        // every render comes out at exactly the size asked for, so a PNG of another size was made
        // before icons.json changed, and keeping it would draw the old size in the new spot
        const kept = await sharp(out).metadata();

        if (kept.width !== spec.size[0] || kept.height !== spec.size[1]) {
          throw new ToolError(`Missing source: ${src} (for ${name}), and its PNG is ${kept.width}x${kept.height} where icons.json asks for ${spec.size[0]}x${spec.size[1]}`);
        }

        console.warn(`warning: ${src} is missing, so ${name} keeps the PNG it has`);
        continue;
      }

      const svg = await fs.promises.readFile(src, 'utf8');

      await render(whiten(svg), spec.size, out, { trim: Boolean(spec.trim) });
      rendered++;
    }
  };

  // warned before the renders so a face whose run stops partway still hears about them
  const keysUsed = new Set(icons.map((icon) => icon.source.deprecatedKey));

  for (const key of keysUsed) {
    if (key) {
      console.warn(`warning: ${path.join(dir, 'resources', 'icons.json')} names svgs by the deprecated key ${key}, which goes at the next major release. Write ${key}/<name> as ${DEPRECATED_KEYS.get(key)}/<name>`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(RENDER_CONCURRENCY, icons.length) }, worker));

  return rendered;
}

/** Reads a face's resources/icons.json. */
function readManifest(face: string): IconManifest {
  return JSON.parse(fs.readFileSync(iconsManifestPath(face), 'utf8'));
}

/** Renders every icon a face's manifest asks for, then syncs its media list from the same manifest. */
async function iconsFor(face: string, manifest: IconManifest, sources: string): Promise<void> {
  // resources (icons.json + rendered PNGs) and the appinfo live under the face dir
  const rendered = await renderFace(faceDir(face), manifest, sources);

  // the media list is synced into the face's appinfo. its package.json is regenerated from
  // it at build time, when paf build runs build-manifests.ts
  syncMedia(appinfoPath(face), manifest);

  console.log(`Rendered ${rendered} icons for ${face}.`);
}

/** Renders the icons for the face named on the command line, or for every face with a resources/icons.json. */
async function main(): Promise<void> {
  const face = process.argv[2];
  const faces = face ? [face] : listFaceNames().filter((name) => fs.existsSync(iconsManifestPath(name)));

  if (faces.length === 0) {
    return;
  }

  // a named face with no icons says so, before the sources folder it would never read is asked for.
  // with no face named, the list above already holds only faces with icons
  if (face && !fs.existsSync(iconsManifestPath(face))) {
    throw new ToolError(`No resources/icons.json under ${faceDir(face)}`);
  }

  const configFile = path.join(ROOT, 'paf.config.json');
  const config: IconSourcesConfig = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : {};
  const setting = iconSourcesSetting(config);
  const sources = iconSourcesDir(ROOT, config, process.env.ICON_SOURCES);

  if (!sources) {
    throw new ToolError(`No icon sources folder. Name it as "plugins": { "icons": { "sources": "<folder>" } } in ${configFile}`);
  }

  // a folder that is not there would leave every icon on its committed PNG with a warning each and pass,
  // which reads as a run that worked
  if (!fs.existsSync(sources) || !fs.statSync(sources).isDirectory()) {
    const from = setting ? `plugins.icons.sources in ${configFile}` : 'ICON_SOURCES';

    throw new ToolError(`The icon sources folder ${sources} is not there. It comes from ${from}.`);
  }

  const manifests = new Map(faces.map((name) => [name, readManifest(name)]));
  const refs = [...manifests.values()].flatMap((manifest) => Object.values(manifest).map((spec) => spec.svg));

  if (!holdsAnyIcon(sources, refs)) {
    const folders = [...new Set(refs.map((ref) => path.relative(sources, path.dirname(svgSource(sources, ref).file)).split(path.sep).join('/') || '.'))];

    const more = folders.length > FOLDERS_SHOWN ? ` and ${folders.length - FOLDERS_SHOWN} more` : '';

    throw new ToolError(`The icon sources folder ${sources} holds none of the svgs the icons read, which it looked for in ${folders.slice(0, FOLDERS_SHOWN).join(', ')}${more}. Check that it is the folder holding them.`);
  }

  for (const [name, manifest] of manifests) {
    await iconsFor(name, manifest, sources);
  }
}

if (isMainScript(import.meta)) {
  main().catch(reportFailure);
}
