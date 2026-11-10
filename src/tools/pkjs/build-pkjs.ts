/**
 * Builds targets/<target>/emit/, the only tree the Pebble bundler reads for a build target.
 *
 * The steps run in this order, which is why they live in one tool rather than an
 * && chain in package.json:
 *
 *   clean    tsc never prunes its outDir, so a deleted or renamed .ts would leave its old
 *            .js behind. waf hands the bundler all of emit/, so a stale require still resolves
 *            against that zombie, which makes a half-finished rename look fine locally while CI
 *            (always building a fresh emit/) disagrees.
 *   compile  the face's src/pkjs + the framework's ts/ -> emit/, as CommonJS for the SDK's bundler.
 *   copy     the *.g.js Clay components are committed, not tsc output, so tsc never puts
 *            them in emit/. The emitted index.js requires them by relative path, so they
 *            have to land beside it.
 *   vendor   ical.js ships from node_modules rather than the source tree, so it lands the
 *            same way for the same reason, and only for a face whose code requires the calendar reader.
 *   entries  writeGeneratedEntries writes the entry files that differ from face to face. The
 *            face's plugin defines decide which plugin code it carries, so the emitted
 *            plugin-sources/index.js is written again from PLUGIN_KINDS, with each kind that
 *            is off set to null. The face's providers list decides what its settings page
 *            offers, so face-providers/index.js is written again with the lists that change
 *            something on the phone, or left as tsc wrote it, null, for a face with none. A face
 *            whose own code reaches past either index is refused first.
 *
 * The SDK's bundler starts at the face's entry and follows require from there, so an emitted file
 * nothing requires is left out of the bundle. The vendor and entries steps rely on that. tsc emits
 * all of the framework's ts/ for every face, and only what the face's entry reaches ships.
 *
 * emit/ is written straight into the target's waf staging sandbox (targets/<target>/) so the
 * native build never has to stage it. tsc roots at the repo root (the framework sits outside any
 * one face), so the tree keeps its source shape: emit/<face>/src/pkjs/index.js for a face in a family,
 * or emit/src/pkjs/index.js for a face on its own, beside the framework's emit/<framework folder>/ts/**.
 * The wscript tells paf_build.build_face which of those the entry is.
 *
 * A face that ships several targets (Gridlock's watchface and watchapp) compiles once. The emit tree
 * does not depend on the target, so the first target's emit/ is copied whole into each of the others.
 *
 * build.ts runs it before every Pebble build, which is what paf build runs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { faceRelative } from '../shared/faces.ts';
import { readFaceBuildInfo } from '../manifest/build-manifests.ts';
import type { Defines } from '../manifest/build-manifests.ts';
import { PLUGIN_KINDS, pluginKindsOn } from '../manifest/plugin-kinds.ts';
import type { PluginKind } from '../manifest/plugin-kinds.ts';
import { providerMode, providersOffered } from '../manifest/providers.ts';
import type { ProviderKind, ProviderLists } from '../manifest/providers.ts';
import { ENGINE, WORKSPACE, icaljsBundle } from '../shared/paths.ts';
import { ToolError, exitCodeOf, reportFailure } from '../shared/tool-error.ts';
import { isMainScript } from '../shared/entry.ts';

const requireHost = createRequire(import.meta.url);

const ROOT = WORKSPACE;

/** The framework's pkjs compiler options, which every face's generated tsconfig extends. */
export const PKJS_BASE_TSCONFIG = path.join(ENGINE, 'tsconfig.pkjs.json');

/**
 * The paths this tool reads and writes. The sandbox is named after the build target. Its
 * sources live under the source face. For a face with one target the two names match, but a
 * face that ships several targets (a watchface and a watchapp, say) compiles the same source
 * face into each target's sandbox.
 */
export interface FacePaths {
  faceSrc: string;   // <sourceFace>/src/pkjs
  sandbox: string;   // targets/<target>
  emit: string;      // targets/<target>/emit
  emitPkjs: string;  // targets/<target>/emit/<sourceFace>/src/pkjs
  icaljsTo: string;  // targets/<target>/emit/<framework folder>/ts/calendar/icaljs.js
  pluginSources: string; // targets/<target>/emit/<framework folder>/ts/plugin-sources
  faceProviders: string; // targets/<target>/emit/<framework folder>/ts/face-providers
  tsconfig: string;  // targets/<target>/tsconfig.pkjs.json (generated)
  skipDir: string;   // <sourceFace>/src/pkjs/clay/builder
}

/**
 * Where a face's sources sit and where a target of it builds.
 *
 * The build looks a face up by name in the repo mounting the framework. Something that builds a face
 * no unit holds, such as a fixture, gives the place itself.
 */
export interface FacePlace {
  /** The folder tsc roots at, which holds both the face and the framework. */
  root: string;
  /** The face's folder relative to root, with forward slashes, or . for a face at the root. */
  rel: string;
  /** The target's sandbox. Left out, it is targets/<target> under root. */
  sandbox?: string;
}

/** Where the build finds a face by name: its folder in the repo mounting the framework. */
function placeOf(sourceFace: string): FacePlace {
  // a face may sit one level deeper inside a family folder, so its real path is looked up
  return { root: ROOT, rel: faceRelative(sourceFace) };
}

/** The framework's folder relative to a root, with forward slashes, written the way ENGINE_REL is. */
function engineFrom(root: string): string {
  return path.relative(root, ENGINE).split(path.sep).join('/') || '.';
}

/**
 * Works out every path this tool reads and writes for one target.
 *
 * @param target The build target, and the name its sandbox is written under.
 * @param sourceFace The face the target's sources live under. Defaults to the target's own name.
 * @param place Where the face sits and where the target builds. Defaults to the source face's folder
 *   in the repo mounting the framework, with the sandbox at targets/<target>.
 * @return The paths this tool reads and writes for the target.
 */
export function facePaths(target: string, sourceFace: string = target, place: FacePlace = placeOf(sourceFace)): FacePaths {
  // the sandbox is named after the target, but the sources are the source face's
  const { root, rel } = place;
  const engineRel = engineFrom(root);
  const faceSrc = path.join(root, rel, 'src', 'pkjs');
  const sandbox = place.sandbox ?? path.join(root, 'targets', target);
  const emit = path.join(sandbox, 'emit');

  return {
    faceSrc,
    sandbox,
    emit,
    emitPkjs: path.join(emit, ...rel.split('/'), 'src', 'pkjs'),
    icaljsTo: path.join(emit, ...engineRel.split('/'), 'ts', 'calendar', 'icaljs.js'),
    pluginSources: path.join(emit, ...engineRel.split('/'), 'ts', 'plugin-sources'),
    faceProviders: path.join(emit, ...engineRel.split('/'), 'ts', 'face-providers'),
    tsconfig: path.join(sandbox, 'tsconfig.pkjs.json'),
    skipDir: path.join(faceSrc, 'clay', 'builder'),
  };
}

/**
 * Empties the face's emit tree. It is entirely built output and gitignored, so this is always safe.
 *
 * @param p The paths for the target being cleaned.
 */
export function cleanEmit(p: FacePaths): void {
  fs.rmSync(p.emit, { recursive: true, force: true });
}

/**
 * Writes the per-face pkjs tsconfig into the staging sandbox.
 *
 * It roots at the repo root (so the framework's ts/, shared across faces, stays inside rootDir) and
 * emits into the sandbox's emit/. All paths are relative to the sandbox where the file is written.
 *
 * @param sourceFace The face whose src/pkjs to include.
 * @param p The paths for the target being built.
 * @param place Where the face sits, the same place its paths came from. Defaults to the source
 *   face's folder in the repo mounting the framework.
 */
export function writeTsconfig(sourceFace: string, p: FacePaths, place: FacePlace = placeOf(sourceFace)): void {
  // the globs follow the face's real folder rather than assuming the name is the folder, and climb
  // from the sandbox back to the root, which for targets/<target> is ../..
  const { rel } = place;
  const up = path.relative(p.sandbox, place.root).split(path.sep).join('/');
  const engineRel = engineFrom(place.root);
  const tsconfig = {
    extends: path.relative(p.sandbox, PKJS_BASE_TSCONFIG).split(path.sep).join('/'),
    compilerOptions: { rootDir: up, outDir: 'emit' },
    include: [path.posix.join(up, rel, 'src/pkjs/**/*.ts'), path.posix.join(up, engineRel, 'ts/**/*.ts')],
    // builder pieces are bundled into the committed *.g.js so compiling them here
    // would ship them a second time as loose modules against the 65535 byte cap
    // the framework's are excluded for every face even the ones carrying no Clay builder
    // ts/testing only holds helpers the specs share, so it never ships either
    exclude: [
      path.posix.join(up, rel, 'src/pkjs/clay/builder/**'),
      path.posix.join(up, engineRel, 'ts/clay/builder/**'),
      path.posix.join(up, engineRel, 'ts/testing/**'),
      path.posix.join(up, '**/*.spec.ts'),
    ],
  };

  fs.mkdirSync(p.sandbox, { recursive: true });
  fs.writeFileSync(p.tsconfig, JSON.stringify(tsconfig, null, 2) + '\n');
}

/**
 * Compiles the pkjs runtime into the face's emit/.
 *
 * Runs tsc's own entry under this node rather than the node_modules/.bin shim, which on
 * Windows is a .cmd that would need a shell and bring its quoting rules along.
 *
 * @param p The paths for the target being compiled, including its generated tsconfig.
 */
export function compile(p: FacePaths): void {
  const result = spawnSync(process.execPath, [requireHost.resolve('typescript/bin/tsc'), '-p', p.tsconfig], {
    stdio: 'inherit',
  });

  // status is null when a signal killed it, so anything but a clean 0 has to fail here.
  // letting a compile error through would copy over a half-built emit/ and still exit 0
  if (result.status !== 0) {
    throw new ToolError(`tsc exited ${result.status === null ? `on signal ${result.signal}` : result.status}`, exitCodeOf(result));
  }
}

/**
 * Every committed *.g.js under the face's src/pkjs/, as paths relative to that dir.
 *
 * @param p The paths for the target being built, including the face's src/pkjs.
 * @return Each generated file's path, relative to the face's src/pkjs.
 */
export function findGenerated(p: FacePaths): string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    if (current === p.skipDir) {
      return;
    }

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);

      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.g.js')) {
        found.push(path.relative(p.faceSrc, full));
      }
    }
  };

  walk(p.faceSrc);
  return found.sort();
}

/**
 * Mirrors each generated component into emit/, keeping its path under the face's src/pkjs/.
 *
 * @param p The paths for the target being built.
 * @return The generated files that were copied, relative to the face's src/pkjs.
 */
export function copyGenerated(p: FacePaths): string[] {
  const names = findGenerated(p);

  for (const name of names) {
    const to = path.join(p.emitPkjs, name);

    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(p.faceSrc, name), to);
  }

  return names;
}

/**
 * Whether a chain of relative requires in the emitted CommonJS leads from one file to another.
 *
 * tsc drops an import that only brings in types, so the requires left in emit/ are the real runtime
 * graph, the same one the Pebble bundler follows from the face's entry. The emitted files alone
 * cannot say, since tsc still emits a file a face only reaches for its types.
 *
 * @param from The emitted file to start from, normally the face's index.js.
 * @param to The emitted file to look for.
 * @return True when the requires lead from one to the other.
 */
export function requires(from: string, to: string): boolean {
  const seen = new Set<string>();
  const pending = [path.resolve(from)];
  const target = path.resolve(to);

  while (pending.length) {
    const file = pending.pop() as string;

    if (file === target) {
      return true;
    }

    if (seen.has(file) || !fs.existsSync(file)) {
      continue;
    }

    seen.add(file);

    for (const match of fs.readFileSync(file, 'utf8').matchAll(/require\(["'](\.{1,2}\/[^"']+)["']\)/g)) {
      const base = path.resolve(path.dirname(file), match[1]);
      const found = [base, base + '.js', path.join(base, 'index.js')].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());

      if (found) {
        pending.push(found);
      }
    }
  }

  return false;
}

/**
 * Copies ical.js's prebuilt ES5 CommonJS file in beside the compiled calendar code, for a face whose
 * code requires the calendar reader.
 *
 * A face that never requires it gets no copy, even though tsc may still have emitted the calendar
 * code for the types another module borrows from it. A face that does need the library and finds it
 * missing throws rather than letting the build carry on, because the require that reaches for it
 * would otherwise fail on the phone, where nobody is watching a build log.
 *
 * @param p The paths for the target being built, including where ical.js should land.
 * @return True when the face needed ical.js and it was copied, false when the face does not use it.
 */
export function copyIcalJs(p: FacePaths): boolean {
  if (!requires(path.join(p.emitPkjs, 'index.js'), path.join(path.dirname(p.icaljsTo), 'ical.js'))) {
    return false;
  }

  // the package is ESM behind an `exports` map and the SDK bundles with webpack 1, which reads
  // neither, so asking for it by name would resolve its ESM build and break. the package ships a
  // prebuilt ES5 CommonJS file for exactly this, and it lands where the framework's
  // ts/calendar/icaljs.d.ts says it does. keeping it a file of its own is also what MPL 2.0 asks of
  // a larger work
  const from = icaljsBundle();

  if (!from || !fs.existsSync(from)) {
    throw new ToolError('ical.js is missing from node_modules, run npm install');
  }

  fs.mkdirSync(path.dirname(p.icaljsTo), { recursive: true });
  fs.copyFileSync(from, p.icaljsTo);
  return true;
}

/**
 * Refuses a face whose own code requires a file in a generated entry's folder, plugin-sources/ or
 * face-providers/, other than its index.
 *
 * A face with every plugin define off has the rest of plugin-sources/ taken out of its emit tree, and
 * a face that lists no providers has the rest of face-providers/ taken out, so such a require fails
 * on the phone with "Cannot find module". With another plugin kind on, the file is still there, so
 * the require works and ships code for a kind the face left off. Only the face's own files are read,
 * since the framework's are held to the same rule by its specs.
 *
 * @param p The paths for the target that compiled.
 */
export function refuseDirectPluginImports(p: FacePaths): void {
  const frameworkTs = path.dirname(p.pluginSources);
  const folders = [
    { dir: p.pluginSources, name: 'plugin-sources', why: 'a face built without that kind\'s define leaves the file out' },
    { dir: p.faceProviders, name: 'face-providers', why: 'a face that lists no providers leaves the file out' },
  ];
  const files = fs.existsSync(p.emit) ? fs.readdirSync(p.emit, { recursive: true, encoding: 'utf8' }) : [];

  for (const name of files) {
    const file = path.join(p.emit, name);

    if (!file.endsWith('.js') || file.startsWith(frameworkTs + path.sep) || !fs.statSync(file).isFile()) {
      continue;
    }

    for (const match of fs.readFileSync(file, 'utf8').matchAll(/require\(["'](\.{1,2}\/[^"']+)["']\)/g)) {
      const target = path.resolve(path.dirname(file), match[1]);
      const folder = folders.find((generated) => target.startsWith(generated.dir + path.sep));
      const allowed = folder ? [path.join(folder.dir, 'index'), path.join(folder.dir, 'index.js')] : [];

      if (folder && !allowed.includes(target)) {
        const where = path.relative(p.emit, file).split(path.sep).join('/');

        throw new ToolError(`${where} imports ${match[1]}, which reaches past the ${folder.name} index. Import from the ${folder.name} folder itself instead, since ${folder.why}`);
      }
    }
  }
}

/**
 * The plugin-sources/index.js a face builds with, written from PLUGIN_KINDS.
 *
 * It reads the same as tsc's output for index.ts, so the features' imports of it work unchanged. A
 * kind that is on is required from its own file. A kind that is off is null, and since nothing
 * requires its file, the bundler leaves that file out, along with any shared file only it reaches.
 *
 * @param kindsOn The kinds the face turns on, from pluginKindsOn.
 * @return The file's text.
 */
export function pluginIndexSource(kindsOn: PluginKind[]): string {
  const lines = ["'use strict';", "Object.defineProperty(exports, '__esModule', { value: true });"];

  for (const kind of PLUGIN_KINDS) {
    lines.push(kindsOn.includes(kind) ? `exports.${kind.exportName} = require('./${kind.file}').${kind.exportName};` : `exports.${kind.exportName} = null;`);
  }

  return lines.join('\n') + '\n';
}

/**
 * Writes the emitted plugin-sources/index.js again from the face's plugin defines.
 *
 * With every kind off, the rest of the emitted plugin-sources/ goes too. The bundler would leave it
 * out anyway, and an emit tree holding only the index shows plainly that the face built without
 * plugins.
 */
function writePluginSourcesEntry(p: FacePaths, kindsOn: PluginKind[]): string[] {
  if (kindsOn.length === 0) {
    fs.rmSync(p.pluginSources, { recursive: true, force: true });
  }

  fs.mkdirSync(p.pluginSources, { recursive: true });
  fs.writeFileSync(path.join(p.pluginSources, 'index.js'), pluginIndexSource(kindsOn));
  return kindsOn.map((kind) => kind.file);
}

/** One kind's list as the phone bundle carries it, the shape faceProvidersFor in ts/face-providers/narrow.ts reads. */
export interface BundledList {
  /** The face's list for the kind, in its own order. */
  offered: string[];
  /** Whether any provider in it needs an API key, from the provider table. */
  needsKey: boolean;
}

/**
 * The lists in a face's providers that change something on the phone, each as the bundle carries it.
 *
 * Every weather or stock list narrows its picker. A calendar list changes the phone only as
 * `["plugin"]`, since a calendar list holding `ical` gets what it needs from the plugin source page.
 * The music and phone lists and `calendarHosts` only change the build's checks and the permissions,
 * so none of them reach the bundle.
 *
 * @param providers The face's checked providers list, from readProviders.
 * @return The lists, by kind, each in the order the face wrote it. Empty for a face that lists none.
 */
export function bundledProviders(providers: ProviderLists): Partial<Record<ProviderKind, BundledList>> {
  const bundled: Partial<Record<ProviderKind, BundledList>> = {};

  for (const kind of ['weather', 'stocks', 'calendar'] as const) {
    const list = providers[kind];

    if (!list || (kind === 'calendar' && providerMode(list) !== 'plugin')) {
      continue;
    }

    bundled[kind] = { offered: [...list], needsKey: providersOffered(kind, list).some((provider) => provider.needsKey) };
  }

  return bundled;
}

/**
 * The face-providers/index.js a face with providers builds with.
 *
 * It reads the same as tsc's output for index.ts, so app.ts's import of it works unchanged, and hands
 * the face's lists to narrow.js, which is what makes them do something on the phone. A face with a
 * stock list hands over the stock cache too.
 *
 * @param bundled The lists, from bundledProviders. At least one kind.
 * @return The file's text.
 */
export function faceProvidersSource(bundled: Partial<Record<ProviderKind, BundledList>>): string {
  const kinds = Object.entries(bundled).map(([kind, list]) => `  ${JSON.stringify(kind)}: ${JSON.stringify(list)}`);

  // the settle empties the stock cache when the stock provider moves, so only a face with a stock
  // list gets the cache handed over, and a face without one never carries its code
  const close = bundled.stocks ? "}, require('../stock/cache'));" : '});';

  return [
    "'use strict';",
    "Object.defineProperty(exports, '__esModule', { value: true });",
    "exports.faceProviders = require('./narrow').faceProvidersFor({",
    kinds.join(',\n'),
    close,
  ].join('\n') + '\n';
}

/**
 * Writes the emitted face-providers/index.js again from the face's providers list.
 *
 * A face whose list changes nothing on the phone keeps tsc's own index.js, which sets faceProviders
 * to null, and the rest of the emitted face-providers/ goes. The bundler would leave it out anyway,
 * and an emit tree holding only the index shows plainly that the face built without providers.
 */
function writeFaceProvidersEntry(p: FacePaths, providers: ProviderLists): string[] {
  const bundled = bundledProviders(providers);
  const kinds = Object.keys(bundled) as ProviderKind[];

  if (kinds.length === 0) {
    const files = fs.existsSync(p.faceProviders) ? fs.readdirSync(p.faceProviders) : [];

    files.filter((file) => file !== 'index.js').forEach((file) => fs.rmSync(path.join(p.faceProviders, file), { recursive: true, force: true }));
    return [];
  }

  fs.mkdirSync(p.faceProviders, { recursive: true });
  fs.writeFileSync(path.join(p.faceProviders, 'index.js'), faceProvidersSource(bundled));
  return kinds.map((kind) => `${kind} ${(bundled[kind] as BundledList).offered.join(' and ')}`);
}

/** What writeGeneratedEntries wrote, for the line printed after the build. */
export interface GeneratedEntries {
  /** The file name of each plugin kind the face built with, such as weather. */
  plugins: string[];
  /** Each list the phone bundle carries, as the build log names it, such as `weather plugin and openmeteo`. */
  providers: string[];
}

/**
 * Writes the emitted entry files that depend on the face's own appinfo rather than on the source.
 *
 * tsc compiles every face's ts/ the same way, so a file that has to differ from face to face is
 * written over its compiled copy here. That is plugin-sources/index.js, which requires only the
 * plugin kinds the face's defines turn on, and face-providers/index.js, which carries the providers
 * the face lists. Each file has a writer of its own, and this runs them in turn. It runs after the
 * compile and before the emit tree is copied into a face's other targets.
 *
 * @param p The paths for the target that compiled.
 * @param defines The face's defines, from readDefines.
 * @param providers The face's checked providers list, from readProviders. Left out, the face lists none.
 * @return What was written, for the build's one line.
 */
export function writeGeneratedEntries(p: FacePaths, defines: Defines, providers: ProviderLists = {}): GeneratedEntries {
  const plugins = writePluginSourcesEntry(p, pluginKindsOn(defines));
  const offered = writeFaceProvidersEntry(p, providers);

  return { plugins, providers: offered };
}

/** What building a face's pkjs did, for the one line printed after it. */
export interface FaceBuild extends GeneratedEntries {
  targets: string[];
  generated: string[];
  icaljs: boolean;
}

/**
 * Fills in the compiled emit/ of a face's first target, then copies it into every other target.
 *
 * Every step that changes the tree runs before the copy, so each target gets the same files. The
 * tree keeps the source's shape and each sandbox sits at the same depth, so they come out the same
 * byte for byte.
 *
 * @param first The paths for the target that compiled.
 * @param rest The paths for every other target the face declares.
 * @param defines The face's defines, from readDefines.
 * @param providers The face's checked providers list, from readProviders. Left out, the face lists none.
 * @return The generated components copied, whether ical.js went in, and what writeGeneratedEntries wrote.
 */
export function fillEmit(first: FacePaths, rest: FacePaths[], defines: Defines, providers: ProviderLists = {}): Omit<FaceBuild, 'targets'> {
  const generated = copyGenerated(first);

  refuseDirectPluginImports(first);

  const icaljs = copyIcalJs(first);
  const entries = writeGeneratedEntries(first, defines, providers);

  for (const p of rest) {
    cleanEmit(p);
    fs.cpSync(first.emit, p.emit, { recursive: true });
  }

  return { generated, icaljs, ...entries };
}

/**
 * Builds emit/ for every target a face declares.
 *
 * The first target compiles, and every other one gets a copy of its emit/. Only the compiling target
 * gets a tsconfig written.
 *
 * @param face The face whose targets to build.
 * @return The targets built, the generated components copied, whether ical.js went in, and the
 *   plugin kinds and providers built with.
 */
export function buildFace(face: string): FaceBuild {
  const { targets, defines, providers } = readFaceBuildInfo(face);
  const [first, ...rest] = targets.map((target) => facePaths(target, face));

  cleanEmit(first);
  writeTsconfig(face, first);
  compile(first);

  return { targets, ...fillEmit(first, rest, defines, providers) };
}

/**
 * The one line that says what a face's pkjs build did.
 *
 * @param face The face that was built.
 * @param built What buildFace returned for it.
 * @return The line, naming the targets, the plugin kinds, the providers the phone carries, the
 *   components copied, and whether ical.js went in.
 */
export function describeBuild(face: string, built: FaceBuild): string {
  const where = path.relative(ROOT, facePaths(built.targets[0], face).emitPkjs).split(path.sep).join('/');

  const plugins = built.plugins.length > 0 ? `with plugin ${built.plugins.join(', ')}` : 'without plugins';
  const offering = built.providers.length > 0 ? `, offering ${built.providers.join(', ')},` : '';

  return `built emit/ for ${built.targets.join(', ')} ${plugins}${offering} and copied ${built.generated.length} generated components into ${where}/${built.icaljs ? ', plus ical.js' : ''}`;
}

function main(): void {
  try {
    const face = process.argv[2];

    if (!face) {
      throw new ToolError('usage: node paf/tools/pkjs/build-pkjs.ts <face>, which paf build runs before every build');
    }

    console.log(describeBuild(face, buildFace(face)));
  } catch (error) {
    reportFailure(error);
  }
}

if (isMainScript(import.meta)) {
  main();
}
