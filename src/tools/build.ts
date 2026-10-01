/**
 * Builds a face's .pbw, or every face's, from WSL with the Pebble SDK installed.
 *
 * For each face it writes every target's sandbox from the face's pebble.appinfo.json,
 * compiles the phone code into each sandbox's emit/, then runs pebble build in each sandbox. The
 * face project is one face, or a family with its faces beside its core/.
 *
 * Usage, from the unit: paf build <face|all> [--clean] [pebble build args...]
 *   --clean runs pebble clean first, which a message key change needs
 *   anything else goes on to pebble build, such as --debug
 *
 * paf build runs it as node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON paf/tools/build.ts, and
 * adds --clean itself when a message key, a dependency, or the framework changed. Run by hand, it
 * cleans only when asked.
 */
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeSandboxes } from './manifest/build-manifests.ts';
import { buildFace, describeBuild } from './pkjs/build-pkjs.ts';
import { runPebble, type PebbleRun, type PebbleRunner } from './shared/pebble.ts';
import { ToolError, reportFailure } from './shared/tool-error.ts';
import { listFaceNames } from './shared/faces.ts';
import { isMainScript } from './shared/entry.ts';

/** What a build was asked for. */
export type BuildArgs = {
  /** A face, or all. */
  target: string;
  /** Whether each sandbox runs pebble clean before it builds. */
  clean: boolean;
  /** Everything else, handed on to pebble build as given. */
  forward: string[];
};

/**
 * Reads what a build was asked for.
 *
 * The face comes first, since a flag in its place would be taken for a face and build nothing. Any
 * `--clean` is taken out wherever it sits, and the rest goes on to pebble build in the order given.
 *
 * @param args The command line after the script.
 * @return The face or all, whether to clean, and the arguments for pebble build.
 */
export function parseBuildArgs(args: string[]): BuildArgs {
  const [target, ...rest] = args;
  if (!target || target.startsWith('-')) {
    throw new ToolError('usage: paf build <face|all> [--clean] [pebble build args...]');
  }
  return {
    target,
    clean: rest.includes('--clean'),
    forward: rest.filter((arg) => arg !== '--clean'),
  };
}

/**
 * The faces a build covers.
 *
 * A face the repo does not have stops the build before anything is written, and names what the
 * repo does have.
 *
 * @param target A face, or all.
 * @param faces Every face in the unit.
 * @return The faces to build, in the order the repo lists them.
 */
export function facesToBuild(target: string, faces: string[]): string[] {
  if (target === 'all') {
    return faces;
  }
  if (!faces.includes(target)) {
    throw new ToolError(`no such face: ${target}. The faces in this repo are: ${faces.join(' ')}`);
  }
  return [target];
}

/**
 * Runs the real pebble, with its output going straight through so CI's log and its memory report
 * see what pebble prints.
 */
function spawnPebble(args: string[], sandbox: string): PebbleRun {
  return spawnSync('pebble', args, { cwd: sandbox, stdio: 'inherit' });
}

/**
 * Runs pebble build in each of a face's sandboxes, after pebble clean when asked.
 *
 * The first pebble step that fails stops the build there, with pebble's own exit code, so a later
 * sandbox never builds on top of a failure and CI sees the failure rather than the last success.
 *
 * @param face The face the sandboxes belong to.
 * @param sandboxes Each sandbox's absolute path.
 * @param clean Whether each sandbox runs pebble clean first.
 * @param forward The arguments for pebble build.
 * @param run What runs pebble, which is the real one outside a spec.
 */
export function buildSandboxes(face: string, sandboxes: string[], clean: boolean, forward: string[], run: PebbleRunner = spawnPebble): void {
  for (const sandbox of sandboxes) {
    console.log(`== building ${path.basename(sandbox)} (face ${face}) ==`);
    if (clean) {
      runPebble(['clean'], sandbox, run);
    }
    runPebble(['build', ...forward], sandbox, run);
  }
}

/**
 * Builds one face: its sandboxes, its phone code, then pebble build in each sandbox.
 *
 * @param face The face to build.
 * @param clean Whether each sandbox runs pebble clean first.
 * @param forward The arguments for pebble build.
 */
export function buildOne(face: string, clean: boolean, forward: string[]): void {
  // a face usually builds one target, the face itself, but can declare several, such as a
  // watchface and a watchapp from one source
  const sandboxes = writeSandboxes(face);

  // the phone code is compiled before every build, since the .ts is the source of truth and the
  // Pebble bundler reads only emit/
  console.log(describeBuild(face, buildFace(face)));

  buildSandboxes(face, sandboxes, clean, forward);
}

function main(): void {
  try {
    const { target, clean, forward } = parseBuildArgs(process.argv.slice(2));
    for (const face of facesToBuild(target, listFaceNames())) {
      buildOne(face, clean, forward);
    }
  } catch (error) {
    reportFailure(error);
  }
}

if (isMainScript(import.meta)) {
  main();
}
