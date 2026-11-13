/**
 * Builds a face's .pbw, or every face's, from WSL with the Pebble SDK installed.
 *
 * For each face it reads and checks the face's pebble.appinfo.json, compiles the phone code into each
 * target's sandbox emit/, reads which features that code passes startPebbleApp, writes every target's
 * sandbox with the keys those features need added, loads the settings page from that code, checks it
 * against the appinfo, and writes what the watch needs from it into each sandbox's
 * page/settings_page.h, then runs pebble build in each sandbox. The face project is one face, or a
 * family with its faces beside its core/.
 *
 * A plugin app has no watch code, no phone build, and no settings page header. Its sandbox gets its
 * script bundled into plugin.js, and pebble build runs on that.
 *
 * Usage, from the unit: paf build <face|all> [--clean] [--dev] [pebble build args...]
 *   --clean runs pebble clean first, which a message key change needs
 *   --dev turns the dev plugin's dev mode on, with the harness in the unit's paf.dev.config.json
 *   anything else goes on to pebble build, such as --debug
 *
 * paf build runs it as node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON paf/tools/build.ts, and
 * adds --clean itself when a message key, a dependency, or the framework changed. A sandbox whose
 * message keys differ from the ones its last passing build recorded also starts clean, since the
 * features and the defines change the keys without the appinfo's list changing. Otherwise, run by
 * hand, it cleans only when asked.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PLUGIN_CONFIG_PAGE, PLUGIN_SCRIPT, forgetBuiltKeys, prepareFace, readAppinfo, recordBuiltKeys, writeSandboxes, type PreparedFace, type WrittenSandboxes } from './manifest/build-manifests.ts';
import { NO_START, type FaceStartFacts } from './manifest/feature-keys.ts';
import { buildFace, describeBuild, type FaceBuild } from './pkjs/build-pkjs.ts';
import { bundlePlugin } from './pkjs/build-plugin.ts';
import { readPluginPage, renderPluginPage } from './pkjs/plugin-page.ts';
import { KNOWN_FIELDS, checkPage, describePage, loadFacePage, pageFacts, readFaceStart, writeSettingsPage, type PlatformPage } from './pkjs/settings-page.ts';
import { appliedSettings } from './manifest/dev-header.ts';
import { checkSettingTypes } from './manifest/dev-settings.ts';
import { runPebble, type PebbleRun, type PebbleRunner } from './shared/pebble.ts';
import { ToolError, reportFailure } from './shared/tool-error.ts';
import { faceDir, listFaceNames } from './shared/faces.ts';
import { isMainScript } from './shared/entry.ts';

/** How each face is built. */
export type BuildOptions = {
  /** Whether each sandbox runs pebble clean before it builds. */
  clean: boolean;
  /** Whether dev mode is on, which boots each face on the dev plugin's fixture. */
  dev: boolean;
  /** Everything else, handed on to pebble build as given. */
  forward: string[];
  /** Whether a dev build passes over a plugin app with a line rather than stopping on it, as `all --dev` does. */
  passOverPluginApps?: boolean;
};

/** What a build was asked for. */
export type BuildArgs = BuildOptions & {
  /** A face, or all. */
  target: string;
};

/** The flags the build takes for itself, which never reach pebble build. */
const OWN_FLAGS = ['--clean', '--dev'];

/**
 * Reads what a build was asked for.
 *
 * The face comes first, since a flag in its place would be taken for a face and build nothing. Any
 * `--clean` or `--dev` is taken out wherever it sits, and the rest goes on to pebble build in the order
 * given.
 *
 * @param args The command line after the script.
 * @return The face or all, whether to clean, whether dev mode is on, and the arguments for pebble build.
 */
export function parseBuildArgs(args: string[]): BuildArgs {
  const [target, ...rest] = args;

  if (!target || target.startsWith('-')) {
    throw new ToolError('usage: paf build <face|all> [--clean] [--dev] [pebble build args...]');
  }

  return {
    target,
    clean: rest.includes('--clean'),
    dev: rest.includes('--dev'),
    forward: rest.filter((arg) => !OWN_FLAGS.includes(arg)),
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
 * sandbox never builds on top of a failure and CI sees the failure rather than the last success. Each
 * sandbox is handed to starting before its first pebble step, and to built once its pebble build
 * passes, which is where the build takes its key record away and writes it again.
 *
 * @param face The face the sandboxes belong to.
 * @param sandboxes Each sandbox's absolute path.
 * @param clean Whether each sandbox runs pebble clean first, or the sandboxes that do.
 * @param forward The arguments for pebble build.
 * @param run What runs pebble, which is the real one outside a spec.
 * @param hooks What runs before each sandbox's first pebble step, and after its pebble build passes.
 */
export function buildSandboxes(face: string, sandboxes: string[], clean: boolean | readonly string[], forward: string[], run: PebbleRunner = spawnPebble, hooks: SandboxHooks = {}): void {
  for (const sandbox of sandboxes) {
    console.log(`== building ${path.basename(sandbox)} (${face}) ==`);
    hooks.starting?.(sandbox);

    if (clean === true || (Array.isArray(clean) && clean.includes(sandbox))) {
      runPebble(['clean'], sandbox, run);
    }

    runPebble(['build', ...forward], sandbox, run);
    hooks.built?.(sandbox);
  }
}

/** What buildSandboxes runs around each sandbox's pebble steps. */
export type SandboxHooks = {
  /** Runs before the sandbox's pebble clean or pebble build. */
  starting?: (sandbox: string) => void;
  /** Runs once the sandbox's pebble build passed. */
  built?: (sandbox: string) => void;
};

/** The steps one face's build runs, which a spec swaps for ones that record the order. */
export type BuildSteps = {
  /** Reads the face's appinfo once and checks everything that needs no features, with dev mode on when asked. */
  prepare: (face: string, dev: boolean) => PreparedFace;
  /** Compiles the phone code into each sandbox's emit/. */
  phone: (face: string, prepared: PreparedFace) => FaceBuild;
  /** Reads which features the first target's compiled code passes startPebbleApp, without starting them. */
  start: (face: string, prepared: PreparedFace) => FaceStartFacts;
  /** Writes every target's sandbox and gives back each one's absolute path, with the appinfo as it checked it. */
  sandboxes: (face: string, prepared: PreparedFace, start: FaceStartFacts) => WrittenSandboxes;
  /** Loads the settings page from the first target's compiled code once per platform, or none for a face without one. */
  page: (face: string, prepared: PreparedFace, messageKeys: unknown) => PlatformPage[];
  /** Stops the build on a page the watch or the phone would get wrong. */
  check: typeof checkPage;
  /** Writes page/settings_page.h into each sandbox. */
  header: typeof writeSettingsPage;
  /** Records the keys a sandbox's pebble build passed with. */
  record: (sandbox: string, messageKeys: unknown) => void;
  /** Takes a sandbox's key record away before its pebble steps run. */
  forget: (sandbox: string) => void;
  /** Bundles a plugin app's script into each of its sandboxes' plugin.js, and builds its settings page into config.html when it has one. */
  plugin?: (face: string, sandboxes: string[]) => Promise<void>;
  /** What runs pebble. */
  run?: PebbleRunner;
};

/**
 * Bundles a plugin app's script into each of its sandboxes, and builds its settings page there when its
 * appinfo names config.html, since pebble build stops on either file missing.
 */
async function bundleIntoSandboxes(face: string, sandboxes: string[]): Promise<void> {
  // the page is the same for every sandbox, so it is built once
  const page = readAppinfo(face).configPage === PLUGIN_CONFIG_PAGE ? renderPluginPage(await readPluginPage(faceDir(face), face), face) : null;

  for (const sandbox of sandboxes) {
    await bundlePlugin(faceDir(face), path.join(sandbox, PLUGIN_SCRIPT), face);

    if (page !== null) {
      fs.writeFileSync(path.join(sandbox, PLUGIN_CONFIG_PAGE), page);
    }
  }
}

/** The real steps. */
const BUILD_STEPS: BuildSteps = {
  prepare: (face, dev) => prepareFace(face, dev),
  phone: (face, prepared) => buildFace(face, prepared.info),
  start: readFaceStart,
  sandboxes: writeSandboxes,
  page: loadFacePage,
  check: checkPage,
  header: writeSettingsPage,
  record: recordBuiltKeys,
  forget: forgetBuiltKeys,
  plugin: bundleIntoSandboxes,
};

/**
 * Builds one face: its appinfo checks, its phone code, its sandboxes, its settings page checks and
 * header, then pebble build in each sandbox. A plugin app goes from its appinfo checks to its sandbox
 * to its bundled script to pebble build, since it has no phone build, keys, page, or header. It takes
 * away any key record a face's build left in its sandbox and writes none. It has no watch code for dev
 * mode to change, so a dev build stops on one before anything is written, or passes over it with a line
 * when the options say so.
 *
 * The appinfo is read once, and everything that needs no features is checked before the phone build,
 * so those refusals leave nothing written. The features the face passes bring message keys, and only
 * the compiled phone code says which ones it passes, so the phone build comes next. Nothing in it reads
 * a message key. The sandboxes, whose manifests carry the keys, are written once the features are read,
 * and the SDK reads the keys only in pebble build. A sandbox whose keys differ from the ones its last
 * passing build recorded starts clean. The record is taken away before a sandbox's pebble steps run
 * and written again only once its pebble build passes, so a build that stops partway cleans the next
 * time, whatever keys it comes back with.
 *
 * The header comes from the compiled phone code and the C includes it, so it is written after the
 * phone build and before pebble build reads it. The page is read once, with the keys the manifests
 * carry, and checked against the appinfo the sandbox step already checked before the header is written,
 * so a page the build refuses leaves no header that names its counts and defaults.
 *
 * @param face The face to build.
 * @param options Whether to clean, whether dev mode is on, and the arguments for pebble build.
 * @param steps The steps the build runs, which are the real ones outside a spec.
 * @return Settles once pebble build has run in every sandbox, or rejects on the first step that fails.
 */
export async function buildOne(face: string, options: BuildOptions, steps: BuildSteps = BUILD_STEPS): Promise<void> {
  const { clean, dev, forward } = options;
  const prepared = steps.prepare(face, dev);

  // the prepare step has already read the appinfo, so whether the face is a plugin app is known here
  if (prepared.pluginApp && dev) {
    if (options.passOverPluginApps) {
      console.log(`${face} is a plugin app, which has no watch code for dev mode to change, so the dev build skips it`);
      return;
    }

    throw new ToolError(`${face} is a plugin app, which has no watch code for dev mode to change. Build it without --dev`);
  }

  // a plugin app has no phone code to read features from and no keys to record
  if (prepared.pluginApp) {
    const written = steps.sandboxes(face, prepared, NO_START);

    // its pebble build replaces whatever a face built in the sandbox, so a face's record left there
    // would let the next face build of the target skip the clean its keys need
    written.paths.forEach(steps.forget);
    await (steps.plugin ?? bundleIntoSandboxes)(face, written.paths);
    console.log(`${face} is a plugin app, so it builds ${PLUGIN_SCRIPT}, and ${PLUGIN_CONFIG_PAGE} when it has a settings page, with no phone build`);
    buildSandboxes(face, written.paths, clean, forward, steps.run);
    return;
  }

  // the phone code is compiled before every build, since the .ts is the source of truth and the
  // Pebble bundler reads only emit/. a face usually builds one target, the face itself, but can
  // declare several, such as a watchface and a watchapp from one source
  const built = steps.phone(face, prepared);

  console.log(describeBuild(face, built));

  const written = steps.sandboxes(face, prepared, steps.start(face, prepared));

  // the page is loaded from the first target, since every target's emit/ is a copy of it, once for
  // each platform the face targets
  const loaded = steps.page(face, prepared, written.messageKeys);
  const facts = pageFacts(loaded);

  steps.check(face, loaded, facts, { messageKeys: written.messageKeys, textDefines: written.checked.textDefines });

  // a dev build's settings go through the same catalogue as the page's, so each value is held to what
  // the page offers on its key before the watch would quietly skip it or reset it
  const devSwitches = prepared.info.devSwitches;

  if (devSwitches) {
    for (const { where, settings } of appliedSettings(devSwitches)) {
      checkSettingTypes(settings, { counts: facts.counts, controls: facts.controls, known: KNOWN_FIELDS }, face, where);
    }
  }

  // a face's own key whose platforms open on different values gets no default, which a field reading it finds at compile
  facts.unsettled.forEach((key) => {
    console.log(`${face}'s settings page opens ${key} on different values on different platforms, so page/settings_page.h holds no SETTINGS_DEFAULT_${key}`);
  });

  steps.header(face, built.targets, facts);
  console.log(describePage(face, loaded.length > 0, facts));

  if (!clean) {
    written.rekeyed.forEach((sandbox) => {
      console.log(`${path.basename(sandbox)}'s message keys differ from the ones its last passing build recorded, so it builds clean`);
    });
  }

  buildSandboxes(face, written.paths, clean || written.rekeyed, forward, steps.run, {
    starting: steps.forget,
    built: (sandbox) => steps.record(sandbox, written.messageKeys),
  });
}

/**
 * Builds each face a build covers, in the order the repo lists them.
 *
 * A plugin app has no watch code for dev mode to change, so `all --dev` has buildOne pass over one with
 * a line saying so and build the rest. Named on its own with --dev, a plugin app still stops the build.
 *
 * @param target A face, or all.
 * @param faces Every face in the unit.
 * @param options Whether to clean, whether dev mode is on, and the arguments for pebble build.
 * @param build Builds one face, which is buildOne outside a spec.
 * @return Settles once every face it covers has built, or rejects on the first that fails.
 */
export async function buildFaces(target: string, faces: string[], options: BuildOptions, build: (face: string, options: BuildOptions) => Promise<void> = buildOne): Promise<void> {
  for (const face of facesToBuild(target, faces)) {
    await build(face, { ...options, passOverPluginApps: target === 'all' });
  }
}

async function main(): Promise<void> {
  try {
    const { target, ...options } = parseBuildArgs(process.argv.slice(2));

    await buildFaces(target, listFaceNames(), options);
  } catch (error) {
    reportFailure(error);
  }
}

if (isMainScript(import.meta)) {
  // a plugin app's script bundles through esbuild's async API, so the run ends on a promise, and
  // main reports its own failure
  void main();
}
