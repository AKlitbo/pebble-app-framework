/**
 * Stitches the clay builder pieces into the self contained component files
 * Clay ships into its config webview.
 *
 * Clay serializes a component's initialize and re-runs it in an isolated
 * webview where require does not exist, so the shipped file has to carry
 * everything inline. The pieces under src/pkjs/clay/builder/ stay small,
 * importable and testable (the waf pkjs glob skips that subtree, only the
 * generated files ship), and esbuild bundles them into one ES2015 IIFE that
 * becomes the component's initialize.
 *
 * Per component the generator builds a tiny entry that pulls in every piece and
 * re-exports the piece that declares init, bundles it, and drops the bundle into
 * initialize followed by `init.call(this)` so the manipulator's this still binds
 * the Clay component.
 *
 * Run with `paf gen <face> clay`, or by hand with no face to rebuild every face that has a builder.
 * Outputs are committed, and check-components.ts fails when they drift from the pieces.
 */

import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import { createRequire } from 'node:module';
import { faceDir, familyCoreDir, listFaceNames } from '../shared/faces.ts';
import { ENGINE, WORKSPACE } from '../shared/paths.ts';
import { readText } from '../shared/files.ts';
import { ToolError, reportFailure } from '../shared/tool-error.ts';
import { isMainScript } from '../shared/entry.ts';

// the manifests are loaded by path at runtime which an import specifier cannot do
// require(esm) hands back the namespace so the manifest lands on .default
const requireManifest = createRequire(import.meta.url);

const ROOT = WORKSPACE;

/** Where a root keeps its builder pieces, relative to the root itself. */
const FACE_BUILDER_REL = path.join('pkjs', 'clay', 'builder');
const ENGINE_BUILDER_REL = path.join('clay', 'builder');

/** One place builder pieces can live: the directory holding them. */
export type Root = { base: string; builder: string };

/**
 * The three roots a builder piece can come from, face first.
 *
 * Each mirrors the others: the same path below a root's builder dir names the same piece
 * wherever it lives, so a lookup falls back by swapping one builder dir for another. That is the
 * same rule the C build follows, where a face-local header wins over the family's, and the
 * family's over the framework's.
 *
 * The framework's root is never null. A face in no family has no core, and reaches the framework
 * directly.
 */
export type Roots = { face: Root; core: Root | null; engine: Root; faceRoot: string };

/**
 * Builds the three builder roots this face pulls pieces from: its own src, its family core if
 * it has one, and the framework.
 *
 * @param face The face to look up.
 * @return The face's roots, in precedence order.
 */
export function rootsFor(face: string): Roots {
  const core = familyCoreDir(face);
  return {
    face: { base: path.join(faceDir(face), 'src'), builder: FACE_BUILDER_REL },
    core: core ? { base: core, builder: FACE_BUILDER_REL } : null,
    engine: { base: path.join(ENGINE, 'ts'), builder: ENGINE_BUILDER_REL },
    faceRoot: faceDir(face),
  };
}

/** The roots in precedence order: a face shadows its family, and both shadow the framework. */
function rootList(roots: Roots): Root[] {
  return [roots.face, roots.core, roots.engine].filter(Boolean) as Root[];
}

/** A root's builder directory. */
function builderDir(root: Root): string {
  return path.join(root.base, root.builder);
}

/** The first root whose builder dir actually holds this relative path, or null. */
function resolveIn(roots: Roots, rel: string): string | null {
  for (const root of rootList(roots)) {
    const full = path.join(builderDir(root), rel);
    if (fs.existsSync(full)) {
      return full;
    }
  }

  return null;
}

/**
 * Where a path inside any root's builder dir could come from, in precedence order.
 *
 * The path is taken back to its place below the builder dir and tried under every root, face
 * first, whichever root the import was written in. A path outside every builder dir only has the
 * one place it names.
 *
 * @param roots The roots to try it under.
 * @param full The full path an import resolved to.
 * @return The same relative path under each root, face first, or just the path itself.
 */
export function inPrecedence(roots: Roots, full: string): string[] {
  const all = rootList(roots);

  for (const from of all) {
    const rel = path.relative(builderDir(from), full);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      continue;
    }

    return all.map((to) => path.join(builderDir(to), rel));
  }

  return [full];
}

/** One component's build recipe: which pieces to bundle and what to emit. */
export type Manifest = {
  name: string;
  output: string;
  template: string;
  styles: string[];
  pieces: string[];
  hookPrefix: string;
  doc: string[];
};

/**
 * Every *.manifest.ts recipe across all three builder roots.
 *
 * A face that ships its own copy of a manifest shadows the family's, and the family's shadows
 * the framework's, so they are keyed by filename rather than concatenated.
 *
 * @param roots The roots to search.
 * @return Every manifest's full path, one per filename, sorted.
 */
export function findManifests(roots: Roots): string[] {
  const byName = new Map<string, string>();

  // least specific first so a family shadows the framework and a face shadows both
  for (const root of rootList(roots).slice().reverse()) {
    const dir = builderDir(root);
    if (!fs.existsSync(dir)) {
      continue;
    }

    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.manifest.ts')) {
        byName.set(name, path.join(dir, name));
      }
    }
  }

  return [...byName.values()].sort();
}

/**
 * The manifest piece that declares init(), the entry the bundle re-exports.
 * Matched by filename so it works before esbuild runs and whatever extension the
 * piece carries (Node cannot require a .ts to look at its exports).
 *
 * @param manifest The manifest to search, its name and pieces list.
 * @return The init piece's path.
 */
export function findInitPiece(manifest: Pick<Manifest, 'name' | 'pieces'>): string {
  const initPiece = manifest.pieces.find((piece) => path.basename(piece).replace(/\.[jt]s$/, '') === 'init');
  if (!initPiece) {
    throw new ToolError(`${manifest.name}: no piece named init`);
  }
  return initPiece;
}

/**
 * The entry source esbuild bundles: a require for every piece so none is tree
 * shaken away, then the init piece re-exported as the bundle's value.
 *
 * @param manifest The manifest whose pieces to require, its pieces list.
 * @param initPiece The piece to re-export as the bundle's value.
 * @return The entry source, ready to hand esbuild as its stdin input.
 */
export function buildEntrySource(manifest: Pick<Manifest, 'pieces'>, initPiece: string): string {
  const lines = manifest.pieces.map((piece) => `require(${JSON.stringify('./' + piece)});`);
  lines.push(`module.exports = require(${JSON.stringify('./' + initPiece)});`);
  return lines.join('\n');
}

/**
 * Resolves every relative import inside a builder dir through the roots, face first.
 *
 * A shared piece can name a face-specific neighbour (the layout builder's geometry, say, or that
 * face's presets) and a face piece can name a shared one, so no side has to spell out where the
 * others live. A face's own copy wins even when a core or framework piece is the one importing
 * it, the same way the manifests themselves shadow each other.
 *
 * There is no bail on a missing core: a face in no family still reaches the framework through here.
 */
function overlayPlugin(roots: Roots): esbuild.Plugin {
  return {
    name: 'builder-root-overlay',
    setup(build) {
      build.onResolve({ filter: /^\.\.?\// }, (args) => {
        if (!args.importer) {
          return null;
        }

        const wanted = path.resolve(args.resolveDir, args.path);

        for (const candidate of inPrecedence(roots, wanted)) {
          for (const suffix of ['', '.ts', '.js', '.json', '/index.ts', '/index.js']) {
            const full = candidate + suffix;
            if (fs.existsSync(full) && fs.statSync(full).isFile()) {
              return { path: full };
            }
          }
        }

        return null;
      });
    },
  };
}

/** Bundles a manifest's pieces into the ES2015 IIFE that becomes initialize. */
async function bundleInitialize(manifest: Manifest, manifestDir: string, roots: Roots): Promise<string> {
  const initPiece = findInitPiece(manifest);
  const result = await esbuild.build({
    stdin: {
      contents: buildEntrySource(manifest, initPiece),
      resolveDir: manifestDir,
      sourcefile: 'component-entry.js',
      loader: 'js',
    },
    plugins: [overlayPlugin(roots)],
    // esbuild names each bundled module in a comment relative to this folder. left to default it
    // is wherever the command ran from, and a run from a subfolder would rewrite every path
    absWorkingDir: ROOT,
    bundle: true,
    format: 'iife',
    globalName: '__clayComponent',
    target: 'es2015',
    write: false,
    legalComments: 'none',
    logLevel: 'silent',
  });
  return result.outputFiles[0].text.replace(/\r\n/g, '\n').replace(/\n+$/, '');
}

/**
 * Trims blank edges and indents every non empty line for the initialize body.
 *
 * The indent reaches the lines inside a multi-line template literal too, which would change that
 * string. No builder piece holds one, and keeping them apart means parsing the bundle, where the
 * indent only has to keep the generated file readable.
 */
function indentBlock(text: string, indent: string): string {
  return text
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')
    .split('\n')
    .map((line) => (line.length > 0 ? indent + line : line))
    .join('\n');
}

/**
 * The template file flattened to the one line string Clay expects.
 *
 * The lines are joined with nothing between them, so text wrapped across two lines would run
 * together. No template wraps text, and a space between every line would change every generated
 * component, so a template keeps each run of text on one line.
 */
function buildTemplate(templatePath: string): string {
  return readText(templatePath)
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .join('');
}

/**
 * Squeezes a stylesheet down for the shipped string: comments out, whitespace
 * collapsed, punctuation tightened. The source files stay pretty, only the
 * inlined copy shrinks.
 *
 * A quoted string, such as a content value or an attribute selector, is kept as written, since
 * squeezing the spaces or commas inside it changes the text it shows or what it matches.
 *
 * @param css The stylesheet source to squeeze.
 * @return The squeezed stylesheet, ready to inline.
 */
export function minifyCss(css: string): string {
  // comments and quoted strings come out in one pass, so a quote inside a comment cannot start a
  // string. each string waits under a marker the squeeze cannot touch and goes back after it
  const strings: string[] = [];
  const held = css.replace(/\/\*[^]*?\*\/|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (match) => {
    if (match.startsWith('/*')) {
      return '';
    }
    strings.push(match);
    return `@@css-string-${strings.length - 1}@@`;
  });

  return held
    .replace(/\s+/g, ' ')
    // a space before a colon can be a descendant selector, as in .grid :first-child, so only the
    // space after one comes out
    .replace(/\s*([{};,>])\s*/g, '$1')
    .replace(/:\s+/g, ':')
    .replace(/;\}/g, '}')
    .trim()
    .replace(/@@css-string-(\d+)@@/g, (marker, index: string) => strings[Number(index)]);
}

/** The css files minified and joined into the one style string Clay injects. */
function buildStyle(stylePaths: string[]): string {
  return stylePaths.map((stylePath) => minifyCss(readText(stylePath))).join('');
}

/**
 * Builds the finished component source for one manifest file, plus where it lands.
 *
 * @param manifestPath The manifest file to build.
 * @param roots The roots to resolve the manifest's template, styles, and pieces from.
 * @return The component's source and the output path it belongs at.
 */
export async function buildComponentSource(manifestPath: string, roots: Roots): Promise<{ output: string; source: string }> {
  const manifest: Manifest = requireManifest(manifestPath).default;
  const manifestDir = path.dirname(manifestPath);
  // repo-root relative so the line reads the same whichever root the manifest came
  // from and whether or not the face sits inside a family folder
  const relManifest = path.relative(ROOT, manifestPath).replace(/\\/g, '/');

  // the template and the stylesheets follow the same face-then-core-then-framework lookup
  // as the pieces so a face can restyle just its own builder and take the rest from
  // the family
  const asset = (name: string): string => resolveIn(roots, name) || path.join(manifestDir, name);

  const bundle = indentBlock(await bundleInitialize(manifest, manifestDir, roots), '    ');
  const template = buildTemplate(asset(manifest.template));
  const style = buildStyle(manifest.styles.map(asset));
  const doc = manifest.doc.map((line) => (line ? ` * ${line}` : ' *')).join('\n');

  const source = `// generated from ${relManifest} by the Clay generator
// do not edit by hand: run \`paf gen <face> clay\` after changing the sources
/**
${doc}
 */
module.exports = {
  name: ${JSON.stringify(manifest.name)},

  template: ${JSON.stringify(template)},

  style: ${JSON.stringify(style)},

  manipulator: {
    set: function (value) {
      this.$element[0].${manifest.hookPrefix}Set(value || '');
    },
    get: function () {
      return this.$element[0].${manifest.hookPrefix}Get();
    }
  },

  initialize: function () {
${bundle}

    __clayComponent.init.call(this);
  }
};
`;

  // the finished file has to at least parse before it ships into the webview
  new Function('module', 'exports', 'require', source);

  // the component always lands in the face being built and never in the shared core
  return { output: path.join(roots.faceRoot, manifest.output), source };
}

/** Builds and writes every component for one face. */
async function generateAll(face: string): Promise<void> {
  const roots = rootsFor(face);
  const manifests = findManifests(roots);

  // a face with no builder stops the run, since one that writes nothing and exits 0 reads as a
  // generate that worked
  if (manifests.length === 0) {
    throw new ToolError(`${face} has no Clay builder to generate from, under src/pkjs/clay/builder in the face or pkjs/clay/builder in its family core`);
  }

  for (const manifestPath of manifests) {
    const built = await buildComponentSource(manifestPath, roots);
    fs.writeFileSync(built.output, built.source);
    console.log(`wrote ${path.relative(roots.faceRoot, built.output)} (${built.source.length} bytes)`);
  }
}

if (isMainScript(import.meta)) {
  const face = process.argv[2];
  // esbuild only takes a resolve plugin through its async API, so the run ends on a promise. the
  // faces are found inside it too, so a lookup that fails reports the same way a failed build does
  Promise.resolve()
    // no face means every face that has a builder, found by its manifests the way check-components.ts finds them
    .then(() => (face ? [face] : listFaceNames().filter((name) => findManifests(rootsFor(name)).length > 0)))
    .then((faces) => faces.reduce((chain, name) => chain.then(() => generateAll(name)), Promise.resolve()))
    .catch(reportFailure);
}
