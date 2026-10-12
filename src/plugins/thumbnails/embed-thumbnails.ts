/**
 * Base64-encodes the panel PNGs already sitting in resources/thumbnails/ into the JS asset the
 * Clay builders read, so a palette shows the real panel instead of an emoji.
 *
 * It embeds and does not draw. The PNGs are made elsewhere and committed with the face. All this
 * does is inline them, because a builder runs in a sandboxed config webview that cannot reach
 * local resource files, so the pictures have to travel as data URLs.
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
 * Run: paf gen <face> thumbnails, or by hand with no face for every face with a resources/thumbnails
 * folder. It reports what it encoded and throws if anything is stray or missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { faceDir, listFaceNames } from '../../tools/shared/faces.ts';
// the builders read the emitted asset so generate to the types they consume
import type { ModuleMeta } from '../../ts/clay/types.ts';
import type { Thumbs } from '../../ts/clay/builder/ts/types.ts';
import { ToolError, reportFailure } from '../../tools/shared/tool-error.ts';
import { isMainScript } from '../../tools/shared/entry.ts';

// loads a face's module-meta.ts by path in moduleMetaFile
const requireMeta = createRequire(import.meta.url);

/**
 * Where a face keeps its panel PNGs.
 *
 * @param face The face.
 * @return The face's resources/thumbnails folder.
 */
export function thumbsDir(face: string): string {
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
  const file = path.join(faceDir(face), 'src', 'pkjs', 'clay', 'module-meta.ts');

  // the thumbnails are matched against the face's module list, so a face without one set up its
  // thumbnails folder too early, which is its mistake rather than the tool's
  if (!fs.existsSync(file)) {
    throw new ToolError(`${face} has a resources/thumbnails folder but no src/pkjs/clay/module-meta.ts to match its thumbnails against`);
  }

  return requireMeta(file);
}

/** A face's own module list. */
function metaFor(face: string): Record<string, ModuleMeta> {
  return moduleMetaFile(face).default;
}

/**
 * The panel sizes a face's thumbnails come in, which its module-meta.ts exports as thumbnailSizes.
 *
 * The sizes belong to the face, since each one draws its own panel shapes. A grid face places
 * blocks such as 1x2 and 2x4, and a fixed-slot face has a slot and a tall panel. A face that does
 * not export them leaves nothing to check a png's size against, so that throws.
 *
 * @param face The face to read the sizes for.
 * @return The sizes the face's thumbnails may use.
 */
export function sizesFor(face: string): string[] {
  const sizes = moduleMetaFile(face).thumbnailSizes;

  if (!Array.isArray(sizes) || !sizes.length || !sizes.every((size) => typeof size === 'string')) {
    throw new ToolError(`module-meta.ts for ${face} has to export thumbnailSizes, the panel sizes its thumbnails come in`);
  }

  // a PNG's size is what follows its last dash, so an empty one is a name no PNG can carry
  if (sizes.some((size) => size === '' || size.includes('-'))) {
    throw new ToolError(`module-meta.ts for ${face} lists an empty size or one holding a dash in thumbnailSizes, which no thumbnail's name can carry`);
  }

  return sizes;
}

/**
 * The registry as module-meta.ts exports it, keyed by display label. Narrowed to the one
 * field this reads, so the row type stays the real one but a caller only owes us a slug.
 */
type ModuleMetaRegistry = Record<string, Pick<ModuleMeta, 'slug'>>;

/** slug -> which module owns it and where its row sorts. Built with no prototype, so only a real slug is a key. */
type SlugIndex = Record<string, { label: string; order: number }>;

/** A PNG that matched a known slug and a real size. */
type ThumbFile = { file: string; slug: string; label: string; order: number; size: string };

/**
 * Indexes the label-keyed registry by slug, keeping each row's position as its
 * sort order so the emitted file follows module-meta.ts.
 *
 * Two modules on one slug would share one set of pictures, and the first one's tile came out blank
 * with nothing to say why, so the index stops and names both.
 *
 * @param meta The label-keyed registry to index.
 * @return The same rows keyed by slug, each with its label and sort order.
 */
export function indexBySlug(meta: ModuleMetaRegistry): SlugIndex {
  // no prototype, so a file named after something every object has, such as toString, is no module
  const bySlug: SlugIndex = Object.create(null);

  Object.keys(meta).forEach((label, index) => {
    const slug = meta[label].slug;

    if (bySlug[slug]) {
      throw new ToolError(`modules "${bySlug[slug].label}" and "${label}" share the slug "${slug}"`);
    }

    bySlug[slug] = { label: label, order: index };
  });
  return bySlug;
}

/**
 * A PNG the face cannot use, and why. Its name matched no module, it named a module with no size
 * after it, or its size is not one the face lists in thumbnailSizes.
 */
export type Stray =
  | { file: string; reason: 'no-module' }
  | { file: string; reason: 'no-size'; slug: string }
  | { file: string; reason: 'size'; slug: string; size: string };

/**
 * Splits the PNG names into the ones that match a known slug and one of the face's sizes, and
 * the strays, each with why it was turned away. A name is <slug>-<size>, split on the last dash so
 * a slug can hold its own dashes.
 *
 * A name that splits into a known slug and a listed size is a picture, even when the whole name is
 * another module's slug. Only when the split finds no picture is a whole name that is a module read
 * as that module with no size. A name nothing matches either way names no module. Names that could
 * be read more than one way, such as a typo in a dashed slug, get the reading this order gives.
 *
 * @param files The PNG filenames to classify.
 * @param bySlug The slug-keyed index to match each filename's slug against.
 * @param sizes The panel sizes the face's thumbnails may come in.
 * @return The matched files plus the strays and why each matched no module or size.
 */
export function classify(files: string[], bySlug: SlugIndex, sizes: string[]): { found: ThumbFile[]; stray: Stray[] } {
  const found: ThumbFile[] = [];
  const stray: Stray[] = [];

  files.forEach((file) => {
    const base = file.replace(/\.png$/i, '');
    const dash = base.lastIndexOf('-');
    const slug = dash > 0 ? base.slice(0, dash) : base;
    const size = dash > 0 ? base.slice(dash + 1) : '';
    const entry = bySlug[slug];

    if (entry && size !== '' && sizes.indexOf(size) !== -1) {
      found.push({ file: file, slug: slug, label: entry.label, order: entry.order, size: size });
      return;
    }

    // the split found no picture, so a whole name that is a module, such as weekday-dots.png, is that
    // module with no size rather than the weekday module at size dots
    if (bySlug[base]) {
      stray.push({ file, reason: 'no-size', slug: base });
    } else if (!entry) {
      stray.push({ file, reason: 'no-module' });
    } else if (size === '') {
      stray.push({ file, reason: 'no-size', slug });
    } else {
      stray.push({ file, reason: 'size', slug, size });
    }
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
    '// generated by the thumbnails plugin',
    '// do not edit by hand: run `paf gen <face> thumbnails` after changing the pictures',
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
 * One picture is enough to count, since a module only has pictures at the sizes it fits. Most
 * fit one or two of the sizes a face offers, so a check for every size would fail every face.
 *
 * A module a stray PNG names, one at a size the face does not list or with no size, is left out, since
 * that stray already names it and a second line saying it has no picture would send the developer
 * looking for a file that is there.
 *
 * @param meta The label-keyed registry to check.
 * @param seen The slugs a PNG was found for.
 * @param stray The PNGs turned away, whose modules are already reported.
 * @return The slugs with no matching PNG.
 */
export function missingSlugs(meta: ModuleMetaRegistry, seen: Record<string, boolean>, stray: Stray[] = []): string[] {
  const named = new Set(stray.flatMap((entry) => (entry.reason === 'no-module' ? [] : [entry.slug])));

  // seen is only ever set to true, so a slug such as toString that every object answers is not seen
  return Object.keys(meta)
    .filter((label) => seen[meta[label].slug] !== true && !named.has(meta[label].slug))
    .map((label) => meta[label].slug);
}

/**
 * The line that says why a PNG was turned away, for the check and the generator alike.
 *
 * @param stray The PNG and why it matched no module or size.
 * @param sizes The panel sizes the face lists in thumbnailSizes.
 * @return The line naming the PNG and what is wrong with its name.
 */
export function describeStray(stray: Stray, sizes: string[]): string {
  const file = `resources/thumbnails/${stray.file}`;

  if (stray.reason === 'no-module') {
    return `${file} names no module`;
  }

  if (stray.reason === 'no-size') {
    return `${file} has no size after the module name, as in ${stray.slug}-<size>.png with one of ${sizes.join(', ')}`;
  }

  return `${file} is at size ${stray.size}, which thumbnailSizes does not list (it lists ${sizes.join(', ')})`;
}

/**
 * The line that says a module has no picture, for the check and the generator alike.
 *
 * @param slug The module's slug.
 * @return The line naming the module.
 */
export function describeMissing(slug: string): string {
  return `the ${slug} module has no thumbnail`;
}

/** What one run would produce: the asset source plus what it found on the way. */
export interface Built {
  source: string;
  modules: number;
  panels: number;
  missing: string[];
  stray: Stray[];
  sizes: string[];
}

/**
 * Reads the PNGs and encodes them inline, without touching the output.
 *
 * Split from build so check-thumbnails.ts can ask what the generator would write and compare it
 * to the committed copy.
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

  const sizes = sizesFor(face);
  const { found, stray } = classify(files, bySlug, sizes);

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
    missing: missingSlugs(moduleMeta, seen, stray),
    stray: stray,
    sizes: sizes,
  };
}

/**
 * Writes the asset, once the run is known good. Throws rather than ship a half-right one.
 *
 * @param face The face to build the thumbnail asset for.
 */
export function build(face: string): void {
  if (!fs.existsSync(thumbsDir(face))) {
    throw new ToolError(`${face} has no resources/thumbnails folder to embed`);
  }

  const built = encodeThumbnails(face);

  // check before writing. a stray png names no module or a size the face does not list,
  // and a missing one leaves a module with no preview
  // writing first would clobber the good committed asset with a broken one on the
  // way to throwing and nothing would force a checkout
  if (built.stray.length) {
    const lines = built.stray.map((stray) => `  ${describeStray(stray, built.sizes)}`);

    throw new ToolError(`${face}: png the face cannot use (${built.stray.length}):\n${lines.join('\n')}`);
  }

  if (built.missing.length) {
    const lines = built.missing.map((slug) => `  ${describeMissing(slug)}`);

    throw new ToolError(`${face}: module with no png (${built.missing.length}):\n${lines.join('\n')}`);
  }

  const out = outFile(face);

  fs.writeFileSync(out, built.source);

  const bytes = fs.statSync(out).size;

  console.log('wrote ' + out + ' (' + Math.round(bytes / 1024) + ' KB)');
  console.log('encoded: ' + built.modules + ' modules, ' + built.panels + ' panels');
}

if (isMainScript(import.meta)) {
  try {
    const face = process.argv[2];
    // no face means every face that ships thumbnails, found by its thumbnails folder
    const faces = face ? [face] : listFaceNames().filter((name) => fs.existsSync(thumbsDir(name)));

    faces.forEach((name) => build(name));
  } catch (error) {
    reportFailure(error);
  }
}
