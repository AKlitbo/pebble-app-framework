#!/usr/bin/env node
/**
 * Rasterize the watchface's SVG glyphs into its Pebble PNG resources.
 *
 * The SVG sources sit in a folder of their own, outside the framework, one set per subfolder:
 *   weather-icons/svg, by Erik Flowers (key "wi")
 *   uxwing, heart, feet, thermometer, and friends (key "ux")
 *   svgrepo, bluetooth on and slash (key "sr")
 *
 * The folder is whatever the unit's paf.config.json names as the icons plugin's sources setting,
 * relative to the unit. Without one, the ICON_SOURCES environment variable names it, which is how a
 * tool that fetched the sources for the unit passes them in.
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

// manifest svg key -> the subfolder of the icon sources holding those svgs
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

// "wi/wi-day-sunny" -> <icon sources>/weather-icons/svg/wi-day-sunny.svg
function svgPath(sources: string, ref: string): string {
  const slash = ref.indexOf('/');
  const key = slash === -1 ? '' : ref.slice(0, slash);
  const dir = VENDOR_DIRS[key];

  if (!dir) {
    throw new ToolError(`Unknown vendor key in svg ref "${ref}" (expected one of: ${Object.keys(VENDOR_DIRS).join(', ')})`);
  }

  return path.join(sources, dir, `${ref.slice(slash + 1)}.svg`);
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
 * Whether a folder holds at least one of the icon sets. One holding none is the wrong folder, such as a
 * level too deep, rather than a machine that lacks a set, and every icon would keep its PNG and pass.
 *
 * @param sources The icon sources folder.
 * @return Whether any set's folder is in it.
 */
export function holdsIconSets(sources: string): boolean {
  return Object.values(VENDOR_DIRS).some((dir) => fs.existsSync(path.join(sources, dir)));
}

/**
 * Renders every icon a manifest asks for into the face's resources/icons folder.
 *
 * An icon whose source is missing keeps the PNG already there, with a warning, so a face drawing
 * from a set this machine does not have still regenerates the rest. Without a PNG to keep, or with one
 * that is not the size icons.json asks for, it stops, since the build would fail on the missing
 * resource or draw the old size. A mistyped source name on an icon that has a PNG only warns, and the
 * old PNG ships. A sources folder that is missing, or holds none of the icon sets, still stops the run
 * before this, which catches the common mistake, so the warning is worth keeping a partial set working.
 *
 * @param dir The face's folder.
 * @param manifest The face's icons.json.
 * @param sources The icon sources folder.
 * @return How many icons it rendered.
 */
export async function renderFace(dir: string, manifest: IconManifest, sources: string): Promise<number> {
  const outDir = path.join(dir, 'resources', 'icons');

  await fs.promises.mkdir(outDir, { recursive: true });

  const entries = Object.entries(manifest);
  let next = 0;
  let rendered = 0;

  // each worker takes the next icon off the shared list until none are left
  const worker = async (): Promise<void> => {
    while (next < entries.length) {
      const [name, spec] = entries[next++];
      const src = svgPath(sources, spec.svg);
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

  await Promise.all(Array.from({ length: Math.min(RENDER_CONCURRENCY, entries.length) }, worker));

  return rendered;
}

/** Renders every icon a face's manifest asks for, then syncs its media list from the same manifest. */
async function iconsFor(face: string, sources: string): Promise<void> {
  const dir = faceDir(face);
  // resources (icons.json + rendered PNGs) and the appinfo live under the face dir
  const manifestPath = iconsManifestPath(face);
  const manifest: IconManifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
  const rendered = await renderFace(dir, manifest, sources);

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

  if (!holdsIconSets(sources)) {
    const sets = Object.values(VENDOR_DIRS).map((dir) => dir.split(path.sep).join('/')).join(', ');

    throw new ToolError(`The icon sources folder ${sources} holds none of the icon sets (${sets}). Check that it is the folder holding them.`);
  }

  for (const name of faces) {
    await iconsFor(name, sources);
  }
}

if (isMainScript(import.meta)) {
  main().catch(reportFailure);
}
