/**
 * Builds targets/<target>/emit/, the only tree the Pebble bundler reads for a build target.
 *
 * Four steps that have to happen in this order, which is why they live in one tool
 * rather than an && chain in package.json:
 *
 *   clean    tsc never prunes its outDir, so a deleted or renamed .ts would leave its old
 *            .js behind. waf globs emit/**\/*.js with no filter, so that zombie ships: it
 *            spends bytes against the 65535 cap, and a stale require still resolves
 *            against it, which makes a half-finished rename look fine locally while CI
 *            (always building a fresh emit/) disagrees.
 *   compile  the face's src/pkjs + the framework's ts/ -> emit/, as CommonJS for the SDK's bundler.
 *   copy     the *.g.js Clay components are committed, not tsc output, so tsc never puts
 *            them in emit/. The emitted index.js requires them by relative path, so they
 *            have to land beside it.
 *   vendor   ical.js ships from node_modules rather than the source tree, so it lands the
 *            same way for the same reason, and only for a face whose code requires the calendar reader.
 *
 * emit/ is written straight into the target's waf staging sandbox (targets/<target>/) so the
 * native build never has to stage it. tsc roots at the repo root (the framework sits outside any
 * one face), so the tree keeps its source shape: emit/watchfaces/<face>/src/pkjs/index.js, or
 * emit/src/pkjs/index.js for a face at the repo root, beside the framework's emit/<framework folder>/ts/**.
 * The wscript tells waf_helpers.build_face which of those the entry is.
 *
 * A target's sources default to its own name, but a face that ships several targets passes
 * the source face as a second argument.
 *
 * Run via `npm run build:pkjs -- <target> [sourceFace]`, and by build.sh before every Pebble build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { faceRelative } from '../faces.ts';
import { ENGINE, ENGINE_REL, WORKSPACE } from '../paths.ts';

const requireHost = createRequire(import.meta.url);

const ROOT = WORKSPACE;
const PKJS_BASE_TSCONFIG = path.join(ENGINE, 'config', 'tsconfig.pkjs.json');

// the package is ESM behind an `exports` map and the SDK bundles with webpack 1, which reads
// neither, so asking for it by name would resolve its ESM build and break. the package ships a
// prebuilt ES5 CommonJS file for exactly this, and it lands where the framework's
// ts/calendar/icaljs.d.ts says it does. keeping it a file of its own is also what MPL 2.0 asks of
// a larger work
const ICALJS_FROM = path.join(ROOT, 'node_modules', 'ical.js', 'dist', 'ical.es5.min.cjs');

/**
 * The paths this tool reads and writes. The sandbox is named after the build target. Its
 * sources live under the source face. For a face with one target the two names match, but a
 * face that ships several targets (a watchface and a watchapp, say) compiles the same source
 * face into each target's sandbox.
 */
export interface FacePaths {
  faceSrc: string;   // watchfaces/<sourceFace>/src/pkjs
  sandbox: string;   // targets/<target>
  emit: string;      // targets/<target>/emit
  emitPkjs: string;  // targets/<target>/emit/watchfaces/<sourceFace>/src/pkjs
  icaljsTo: string;  // targets/<target>/emit/<framework folder>/ts/calendar/icaljs.js
  tsconfig: string;  // targets/<target>/tsconfig.pkjs.json (generated)
  skipDir: string;   // watchfaces/<sourceFace>/src/pkjs/clay/builder
}

/**
 * Works out every path this tool reads and writes for one target.
 *
 * @param target The build target, and the name its sandbox is written under.
 * @param sourceFace The face the target's sources live under. Defaults to the target's own name.
 * @return The paths this tool reads and writes for the target.
 */
export function facePaths(target: string, sourceFace: string = target): FacePaths {
  // the sandbox is named after the target, but the sources are the source face's, and that face
  // may sit one level deeper inside a family folder, so its real path is looked up
  const rel = faceRelative(sourceFace);
  const faceSrc = path.join(ROOT, rel, 'src', 'pkjs');
  const sandbox = path.join(ROOT, 'targets', target);
  const emit = path.join(sandbox, 'emit');
  return {
    faceSrc,
    sandbox,
    emit,
    emitPkjs: path.join(emit, ...rel.split('/'), 'src', 'pkjs'),
    icaljsTo: path.join(emit, ...ENGINE_REL.split('/'), 'ts', 'calendar', 'icaljs.js'),
    tsconfig: path.join(sandbox, 'tsconfig.pkjs.json'),
    skipDir: path.join(faceSrc, 'clay', 'builder'),
  };
}

/**
 * Empties the face's emit tree. It is entirely derived and gitignored, so this is always safe.
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
 */
export function writeTsconfig(sourceFace: string, p: FacePaths): void {
  // a face may sit one level deeper, inside a family folder, so the globs follow its real path
  // rather than assuming the name is the folder
  const rel = faceRelative(sourceFace);
  const tsconfig = {
    extends: path.relative(p.sandbox, PKJS_BASE_TSCONFIG).split(path.sep).join('/'),
    compilerOptions: { rootDir: '../..', outDir: 'emit' },
    include: [path.posix.join('../..', rel, 'src/pkjs/**/*.ts'), path.posix.join('../..', ENGINE_REL, 'ts/**/*.ts')],
    // builder pieces are bundled into the committed *.g.js so compiling them here
    // would ship them a second time as loose modules against the 65535 byte cap
    // the framework's are excluded for every face even the ones carrying no Clay builder
    // ts/testing only holds helpers the specs share, so it never ships either
    exclude: [
      path.posix.join('../..', rel, 'src/pkjs/clay/builder/**'),
      path.posix.join('../..', ENGINE_REL, 'ts/clay/builder/**'),
      path.posix.join('../..', ENGINE_REL, 'ts/testing/**'),
      '../../**/*.spec.ts',
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
    throw new Error(`tsc exited ${result.status === null ? `on signal ${result.signal}` : result.status}`);
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
  if (!fs.existsSync(ICALJS_FROM)) {
    throw new Error(`ical.js is missing at ${path.relative(ROOT, ICALJS_FROM)}, run npm install`);
  }
  fs.mkdirSync(path.dirname(p.icaljsTo), { recursive: true });
  fs.copyFileSync(ICALJS_FROM, p.icaljsTo);
  return true;
}

function main(): void {
  const target = process.argv[2];
  // the sandbox is the target; its sources are the source face. they match for a single-target
  // face, so the second arg is optional and defaults to the target name
  const sourceFace = process.argv[3] || target;
  if (!target) {
    console.error('usage: build-pkjs.ts <target> [sourceFace]');
    process.exit(1);
  }

  const p = facePaths(target, sourceFace);
  cleanEmit(p);
  writeTsconfig(sourceFace, p);
  compile(p);
  const names = copyGenerated(p);
  const copiedIcal = copyIcalJs(p);

  const where = path.relative(ROOT, p.emitPkjs).split(path.sep).join('/');
  console.log(`built ${target} emit/ and copied ${names.length} generated components into ${where}/${copiedIcal ? ', plus ical.js' : ''}`);
}

if (import.meta.main) {
  main();
}
