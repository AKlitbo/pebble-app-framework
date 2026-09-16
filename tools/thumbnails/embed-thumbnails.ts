/**
 * Base64-encodes the panel PNGs already sitting in resources/thumbnails/ into the JS asset the
 * Clay builders read, so a palette shows the real panel instead of an emoji.
 *
 * It embeds, it does not draw: the PNGs are made elsewhere and committed, the same way the
 * vendored SVGs behind generate-icons are. All this does is inline them, because a builder runs
 * in a sandboxed config webview that cannot reach local resource files, so the pictures have to
 * travel as data URLs.
 *
 * Input:  resources/thumbnails/<slug>-<size>.png
 * Output: src/pkjs/clay/module-thumbnails.g.js  ->  module.exports = { label: { size: dataUrl } }
 *
 * The slug -> label mapping is not kept here: it comes from module-meta.ts, which is already
 * the label-keyed registry the builders read (each row's `slug` is the filename stem). Keyed by
 * label so the builders look a thumbnail up by name, the same resilient way they map icons and
 * colours, rather than a numeric id that could drift. Row order follows module-meta.ts.
 *
 * The sizes a png may come in belong to the face too, since each face draws its own panel shapes,
 * so module-meta.ts exports them beside the module list as thumbnailSizes.
 *
 * Run: npm run gen:<face>:thumbnails, which reports what it encoded and throws if anything
 * is stray or missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { faceDir } from '../faces.ts';
// the builders read the emitted asset so generate to the types they consume
import type { ModuleMeta } from '../../ts/clay/types.ts';
import type { Thumbs } from '../../ts/clay/builder/ts/types.ts';

// every path this touches hangs off the face it is handed
// the PNGs and that face's module list and the asset it writes
const requireMeta = createRequire(import.meta.url);

function thumbsDir(face: string): string {
  return path.join(faceDir(face), 'resources', 'thumbnails');
}

/**
 * Where the generated thumbnail asset for a face is written.
 *
 * @param face The face to build the path for.
 * @return The generated asset's path, src/pkjs/clay/module-thumbnails.g.js under the face.
 */
export function outFile(face: string): string {
  return path.join(faceDir(face), 'src', 'pkjs', 'clay', 'module-thumbnails.g.js');
}

/** A face's module-meta.ts, loaded by path because which face it is is only known at runtime. */
function moduleMetaFile(face: string): { default: Record<string, ModuleMeta>; thumbnailSizes?: unknown } {
  return requireMeta(path.join(faceDir(face), 'src', 'pkjs', 'clay', 'module-meta.ts'));
}

/** A face's own module list. */
function metaFor(face: string): Record<string, ModuleMeta> {
  return moduleMetaFile(face).default;
}

/**
 * The panel sizes a face's thumbnails come in, which its module-meta.ts exports as thumbnailSizes.
 *
 * The sizes belong to the face, since each one draws its own panel shapes. The Mosaic grid places
 * blocks such as 1x2 and 2x4, and a fixed-slot face has a slot and a tall panel. A face that does
 * not export them leaves nothing to check a png's size against, so that throws.
 *
 * @param face The face to read the sizes for.
 * @return The sizes the face's thumbnails may use.
 */
export function sizesFor(face: string): string[] {
  const sizes = moduleMetaFile(face).thumbnailSizes;
  if (!Array.isArray(sizes) || !sizes.length || !sizes.every((size) => typeof size === 'string')) {
    throw new Error(`module-meta.ts for ${face} has to export thumbnailSizes, the panel sizes its thumbnails come in`);
  }
  return sizes;
}

/**
 * The registry as module-meta.ts exports it, keyed by display label. Narrowed to the one
 * field this reads, so the row type stays the real one but a caller only owes us a slug.
 */
type ModuleMetaRegistry = Record<string, Pick<ModuleMeta, 'slug'>>;

/** slug -> which module owns it and where its row sorts. */
type SlugIndex = Record<string, { label: string; order: number }>;

/** A PNG that matched a known slug and a real size. */
type ThumbFile = { file: string; slug: string; label: string; order: number; size: string };

/**
 * Indexes the label-keyed registry by slug, keeping each row's position as its
 * sort order so the emitted file follows module-meta.ts.
 *
 * @param meta The label-keyed registry to index.
 * @return The same rows keyed by slug, each with its label and sort order.
 */
export function indexBySlug(meta: ModuleMetaRegistry): SlugIndex {
  const bySlug: SlugIndex = {};
  Object.keys(meta).forEach((label, index) => {
    bySlug[meta[label].slug] = { label: label, order: index };
  });
  return bySlug;
}

/**
 * Splits the PNG names into the ones that match a known slug and one of the face's sizes, and
 * the strays. A name is <slug>-<size>, split on the last dash so a slug can hold
 * its own dashes.
 *
 * @param files The PNG filenames to classify.
 * @param bySlug The slug-keyed index to match each filename's slug against.
 * @param sizes The panel sizes the face's thumbnails may come in.
 * @return The matched files plus the strays that matched no known slug or size.
 */
export function classify(files: string[], bySlug: SlugIndex, sizes: string[]): { found: ThumbFile[]; stray: string[] } {
  const found: ThumbFile[] = [];
  const stray: string[] = [];

  files.forEach((file) => {
    const base = file.replace(/\.png$/i, '');
    const dash = base.lastIndexOf('-');
    const slug = dash > 0 ? base.slice(0, dash) : base;
    const size = dash > 0 ? base.slice(dash + 1) : '';
    const entry = bySlug[slug];

    if (!entry || sizes.indexOf(size) === -1) {
      stray.push(file);
      return;
    }

    found.push({ file: file, slug: slug, label: entry.label, order: entry.order, size: size });
  });

  return { found: found, stray: stray };
}

/**
 * Renders the asset source, rows sorted by module order so the file is stable across runs.
 *
 * @param thumbs The encoded thumbnails, keyed by label then size.
 * @param order Each label's sort position, matching module-meta.ts.
 * @return The generated asset's full source text.
 */
export function buildSource(thumbs: Thumbs, order: Record<string, number>): string {
  const lines = [
    '// generated by tools/thumbnails/embed-thumbnails.ts - do not edit by hand',
    'module.exports = {',
  ];
  Object.keys(thumbs)
    .sort((a, b) => order[a] - order[b])
    .forEach((label) => {
      const sizes = thumbs[label];
      const parts = Object.keys(sizes)
        .sort()
        .map((size) => JSON.stringify(size) + ': ' + JSON.stringify(sizes[size]));
      lines.push('  ' + JSON.stringify(label) + ': { ' + parts.join(', ') + ' },');
    });
  lines.push('};', '');
  return lines.join('\n');
}

/**
 * The registry slugs that no PNG covered, so a new module with no picture gets reported.
 *
 * @param meta The label-keyed registry to check.
 * @param seen The slugs a PNG was found for.
 * @return The slugs with no matching PNG.
 */
export function missingSlugs(meta: ModuleMetaRegistry, seen: Record<string, boolean>): string[] {
  return Object.keys(meta)
    .filter((label) => !seen[meta[label].slug])
    .map((label) => meta[label].slug);
}

/** What one run would produce: the asset source plus what it found on the way. */
export interface Built {
  source: string;
  modules: number;
  panels: number;
  missing: string[];
  stray: string[];
}

/**
 * Reads the PNGs and encodes them inline, without touching the output.
 *
 * Split from build so the spec can ask what the generator *would* write and compare it to
 * the committed copy, the way generate-components.ts does.
 *
 * @param face The face to read PNGs and module list for.
 * @return What this run would produce, encoded source plus what it found on the way.
 */
export function encodeThumbnails(face: string): Built {
  const moduleMeta = metaFor(face);
  const bySlug = indexBySlug(moduleMeta);
  const dir = thumbsDir(face);

  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => name.toLowerCase().endsWith('.png'))
    : [];

  const { found, stray } = classify(files, bySlug, sizesFor(face));

  const thumbs: Thumbs = {};
  const order: Record<string, number> = {};
  const seen: Record<string, boolean> = {};

  found.forEach((thumb) => {
    const data = fs.readFileSync(path.join(dir, thumb.file)).toString('base64');
    if (!thumbs[thumb.label]) {
      thumbs[thumb.label] = {};
    }
    thumbs[thumb.label][thumb.size] = 'data:image/png;base64,' + data;
    order[thumb.label] = thumb.order;
    seen[thumb.slug] = true;
  });

  return {
    source: buildSource(thumbs, order),
    modules: Object.keys(thumbs).length,
    panels: files.length - stray.length,
    missing: missingSlugs(moduleMeta, seen),
    stray: stray,
  };
}

/**
 * Writes the asset, once the run is known good. Throws rather than ship a half-right one.
 *
 * @param face The face to build the thumbnail asset for.
 */
export function build(face: string): void {
  const built = encodeThumbnails(face);

  // check before writing. a stray png names a slug no module claims and a missing
  // one leaves a module with no preview
  // writing first would clobber the good committed asset with a broken one on the
  // way to throwing and nothing would force a checkout
  if (built.stray.length) {
    throw new Error(`stray png with no module (${built.stray.length}): ${built.stray.join(', ')}`);
  }
  if (built.missing.length) {
    throw new Error(`module with no png (${built.missing.length}): ${built.missing.join(', ')}`);
  }

  const out = outFile(face);
  fs.writeFileSync(out, built.source);

  const bytes = fs.statSync(out).size;
  console.log('wrote ' + out + ' (' + Math.round(bytes / 1024) + ' KB)');
  console.log('encoded: ' + built.modules + ' modules, ' + built.panels + ' panels');
}

if (import.meta.main) {
  const face = process.argv[2];
  if (!face) {
    throw new Error('usage: embed-thumbnails.ts <face>');
  }
  build(face);
}
