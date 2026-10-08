/**
 * Generate targets/<target>/package.json from a face's pebble.appinfo.json.
 *
 * pebble.appinfo.json holds the Pebble appinfo (uuid, messageKeys, the whole resource
 * list) plus the per-face build identity: the release name, the watchface flag, and (for
 * an app) which bundled icon is the launcher menu icon. The author/version come from the
 * root package.json, so there is one place for each fact.
 *
 * A face can declare either one build target inline or a `targets` map naming several, so
 * one source face can produce more than one .pbw. Each target builds to its own staging
 * sandbox targets/<target name>/, so there is one manifest per target rather than per face.
 * The manifest is a gitignored build input written as plain JSON. Nobody reads it by hand.
 * `pebble build` needs package.json to exist before it runs, so each build regenerates it
 * via tools/build.ts. A file whose contents would not change is left alone, so its mtime does too.
 *
 * A face can also set C defines for its own build, such as a raised ENGINE_MAX_SLOTS. They are checked
 * here and carried into the manifest, where the waf build turns each one into a -D flag.
 *
 * Usage: node tools/manifest/build-manifests.ts [--targets] <face>
 */
import fs from 'node:fs';
import path from 'node:path';
import { appinfoPath, faceRelative, familyCoreFor, familyNameFor, listFaceNames } from '../shared/faces.ts';
import { writeIfChanged } from '../shared/files.ts';
import { ENGINE, ENGINE_REL, WORKSPACE } from '../shared/paths.ts';
import { ToolError, reportFailure } from '../shared/tool-error.ts';
import { isMainScript } from '../shared/entry.ts';

const ROOT = WORKSPACE;
const ROOT_PKG = path.join(ROOT, 'package.json');
// every target's wscript comes from one template with only its folders filled in, so it is
// generated rather than committed per face. a sandbox missing its wscript makes `pebble build`
// report "This project is very outdated" instead of anything useful
const WSCRIPT_TEMPLATE = path.join(ENGINE, 'waf', 'wscript.template');

/**
 * One entry in pebble.appinfo.json's resources.media: a bitmap or font the SDK
 * packs. generate-icons.ts rewrites the bitmap rows, so it reads this shape too.
 */
export type MediaEntry = { type: string; name: string; file?: string; menuIcon?: boolean; [key: string]: unknown };

/**
 * The per-face build identity: the bits that make a manifest a watchface or a watchapp.
 *
 * A target shares the face's uuid unless it names its own. Sharing one means the watch holds only
 * one of the face's targets at a time and they share the phone's saved settings. A uuid of its own
 * lets a target be installed beside the others, with settings of its own.
 */
type Target = { name: string; watchface: boolean; menuIcon?: string; uuid?: string };

/**
 * The shared Pebble fields common to every face, plus the C defines the face sets for its own build.
 * This is what building a manifest reads. The per-face build identity (name/watchface/menuIcon)
 * rides alongside these in the file but is split out into a Target before buildManifest sees it.
 */
export type SharedAppinfo = {
  displayName: string;
  uuid: string;
  sdkVersion: string;
  enableMultiJS: boolean;
  targetPlatforms: string[];
  capabilities: unknown;
  messageKeys: unknown;
  resources: { media: MediaEntry[] };
  defines?: unknown;
};

/**
 * A face's build identity is either a single target inlined at the top level (the common case:
 * one .pbw per face) or a targets map naming several. Gridlock ships a watchface and a watchapp
 * from one source, so it lists both here.
 */
type TargetsMap = Record<string, Target>;

/**
 * The whole appinfo file: the shared Pebble fields plus this face's build identity and its
 * own version. Faces version independently (each keeps its own CHANGELOG.md), so the version
 * lives here rather than in the root package.json. A face declares its identity one of two ways:
 * the single-target fields (name/watchface/menuIcon) inline, or a `targets` map for many.
 */
type Appinfo = SharedAppinfo & Partial<Target> & { version?: string; targets?: TargetsMap };

/** The C defines a face sets for its own build, each a macro name and a whole number. */
export type Defines = Record<string, number>;

/**
 * The C defines a face sets for its own build, checked so each one is safe to hand the compiler.
 *
 * Every define goes straight onto the compiler's command line, so only a macro name and a whole
 * number get through. A name the build sets itself, a HAS_ feature switch or BUILD_WATCHAPP, is
 * turned away too, since those follow from the face's message keys, resources, and targets.
 *
 * @param config The face's appinfo.
 * @param face The face the appinfo belongs to, which a mistake in it names.
 * @return The defines, empty when the face sets none.
 */
export function readDefines(config: SharedAppinfo, face: string): Defines {
  if (config.defines === undefined) {
    return {};
  }

  if (typeof config.defines !== 'object' || config.defines === null || Array.isArray(config.defines)) {
    throw new ToolError(`${face}'s appinfo defines has to be a map of macro name to whole number`);
  }

  const defines: Defines = {};

  for (const [name, value] of Object.entries(config.defines)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
      throw new ToolError(`${face}'s appinfo defines ${name}, which is not a macro name such as ENGINE_MAX_SLOTS`);
    }

    if (/^HAS_/.test(name) || name === 'BUILD_WATCHAPP') {
      throw new ToolError(`${face}'s appinfo defines ${name}, which the build sets itself`);
    }

    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new ToolError(`${face}'s appinfo defines ${name} as ${JSON.stringify(value)}, which is not a whole number`);
    }

    defines[name] = value;
  }

  return defines;
}

/**
 * The build targets a face declares, as a flat list. A `targets` map wins. Otherwise the inline
 * single target is the whole list. One source face can produce several .pbw
 * targets, each with its own sandbox under targets/<target name>/.
 *
 * @param config The parsed appinfo to read the target or targets from.
 * @param face The face the appinfo belongs to, which a mistake in it names.
 * @return Every build target this face declares.
 */
export function resolveTargets(config: Appinfo, face: string): Target[] {
  if (config.targets) {
    // an empty map or a target with no name reached the sandbox step as targets/undefined, or as
    // a TypeError that named nothing
    const targets = Object.entries(config.targets);

    if (targets.length === 0) {
      throw new ToolError(`${face}'s appinfo declares an empty targets map`);
    }

    const unnamed = targets.find(([, target]) => !target || !target.name);

    if (unnamed) {
      throw new ToolError(`${face}'s appinfo target "${unnamed[0]}" has no name`);
    }

    return targets.map(([, target]) => target);
  }

  if (!config.name) {
    throw new ToolError(`${face}'s appinfo declares neither a targets map nor a top-level name`);
  }

  return [{ name: config.name, watchface: config.watchface ?? false, menuIcon: config.menuIcon }];
}

/** The facts each manifest copies out of the root package.json. */
type RootPkg = { author: string; version: string };

/**
 * Builds one target's media list, marking its menu icon if it declares one.
 *
 * @param config The shared appinfo fields, including the media list to copy.
 * @param target The build target, checked for a menuIcon to mark.
 * @return The target's own copy of the media list.
 */
export function buildMedia(config: SharedAppinfo, target: Target): MediaEntry[] {
  const media: MediaEntry[] = JSON.parse(JSON.stringify(config.resources.media));

  if (target.menuIcon) {
    const entry = media.find((item) => item.name === target.menuIcon);

    if (!entry) {
      throw new ToolError(`target ${target.name}'s menuIcon ${target.menuIcon} is not in the media list`);
    }

    entry.menuIcon = true;
  }

  return media;
}

/**
 * Builds one target's whole package.json manifest from the shared config and the root package.
 *
 * @param config The shared appinfo fields.
 * @param rootPkg The author and version to copy in from the root package.json.
 * @param target The build target this manifest is for.
 * @param defines The C defines the face sets for its own build.
 * @return The finished manifest, ready to write out as package.json.
 */
export function buildManifest(config: SharedAppinfo, rootPkg: RootPkg, target: Target, defines: Defines = {}) {
  return {
    name: target.name,
    author: rootPkg.author,
    version: rootPkg.version,
    private: true,
    pebble: {
      displayName: config.displayName,
      // every target shares the face's uuid unless it names its own, so a face's targets install
      // as one app with one set of phone settings, and installing one replaces the other
      uuid: target.uuid || config.uuid,
      sdkVersion: config.sdkVersion,
      enableMultiJS: config.enableMultiJS,
      targetPlatforms: config.targetPlatforms,
      watchapp: { watchface: target.watchface },
      capabilities: config.capabilities,
      messageKeys: config.messageKeys,
      resources: { media: buildMedia(config, target) },
    },
    // outside the pebble block, which the SDK reads. left out when there are none, so a face that
    // sets none gets a manifest with no defines key
    ...(Object.keys(defines).length > 0 ? { defines: defines } : {}),
  };
}

/**
 * Where one sandbox's sources sit, each folder relative to the repo root with forward slashes, plus the
 * family's name and what the target installs as.
 */
export interface SandboxDirs {
  engine: string;     // the framework, such as paf
  face: string;       // the face, such as gridlock in a family, or . for a face on its own
  familyCore: string; // the face's family core, which is core in a family, or empty for none
  family: string;     // the family's name, such as mosaic, or empty for none
  watchface: boolean; // true for a face target, false for an app one, which builds with -DBUILD_WATCHAPP
}

/**
 * A value as it goes inside the template's single-quoted Python strings. A backslash or a quote in a
 * folder name, as in Andrew's Faces, would otherwise end the string and break the wscript.
 */
function pythonQuoted(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Fills the wscript template in with where one sandbox's sources sit.
 *
 * The build runs from inside targets/<target>/, and everything it needs about where the framework, the
 * face and its family core are is written into the wscript here, so waf never goes looking for them.
 * The watchface flag rides along, since it decides whether the target compiles with
 * -DBUILD_WATCHAPP, and it is spelled the way Python reads a boolean.
 *
 * @param template The wscript template's text.
 * @param dirs The folders to fill in, and what the target installs as.
 * @return The finished wscript.
 */
export function fillWscript(template: string, dirs: SandboxDirs): string {
  return template
    .split('{{ENGINE_DIR}}').join(pythonQuoted(dirs.engine))
    .split('{{FACE_DIR}}').join(pythonQuoted(dirs.face))
    .split('{{FAMILY_CORE_DIR}}').join(pythonQuoted(dirs.familyCore))
    .split('{{FAMILY}}').join(pythonQuoted(dirs.family))
    .split('{{WATCHFACE}}').join(dirs.watchface ? 'True' : 'False');
}

/**
 * The version a face builds as. The face's own version wins, and the root package.json is the fallback.
 * The release check reads it from here too, so a tag is held to the version the pbw is built with.
 *
 * @param config The face's appinfo.
 * @param rootPkg The root package.json.
 * @return The version, or undefined when neither file has one.
 */
export function faceVersion(config: { version?: string }, rootPkg: { version?: string }): string | undefined {
  return config.version || rootPkg.version;
}

/**
 * Writes one target's sandbox: targets/<target name>/{package.json,wscript}.
 *
 * @return The sandbox's absolute path.
 */
function writeTarget(face: string, config: Appinfo, rootPkg: RootPkg, target: Target): string {
  // the root package.json still owns the author
  const version = faceVersion(config, rootPkg) as string;
  const manifest = buildManifest(config, { author: rootPkg.author, version }, target, readDefines(config, face));

  const outDir = path.join(ROOT, 'targets', target.name);

  fs.mkdirSync(outDir, { recursive: true });
  writeIfChanged(path.join(outDir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');

  // the waf entry point has to exist before `pebble build` runs in this sandbox. the sandbox is
  // named after the target, but its sources are the face's, and one face can feed several targets,
  // so the wscript is told where the face, its family core and the framework sit
  const rel = faceRelative(face);
  const core = familyCoreFor(ROOT, rel);
  const dirs: SandboxDirs = {
    engine: ENGINE_REL,
    face: rel,
    familyCore: core ? path.relative(ROOT, core).split(path.sep).join('/') : '',
    family: familyNameFor(ROOT, rel) || '',
    watchface: target.watchface,
  };

  writeIfChanged(path.join(outDir, 'wscript'), fillWscript(fs.readFileSync(WSCRIPT_TEMPLATE, 'utf8'), dirs));

  // stdout is kept for the sandbox paths the bare face prints, so the note goes to stderr
  console.error(`Sandbox targets/${target.name} is ready (source face ${face} ${version}, watchface=${target.watchface}).`);
  return outDir;
}

/**
 * The first target name two faces share, or null when every name is unique.
 *
 * A sandbox is named after its target, so two faces with the same name build into one folder and
 * the second quietly replaces the first's .pbw.
 *
 * @param targetsByFace Each face's target names, keyed by face.
 * @return A message naming the target and both faces, or null.
 */
export function findTargetClash(targetsByFace: Record<string, string[]>): string | null {
  const owner = new Map<string, string>();

  for (const [face, names] of Object.entries(targetsByFace)) {
    for (const name of names) {
      const other = owner.get(name);

      if (other === face) {
        return `target "${name}" is declared twice by ${face}, so one would build over the other in targets/${name}`;
      }

      if (other) {
        return `target "${name}" is declared by both ${other} and ${face}, so one would build over the other in targets/${name}`;
      }

      owner.set(name, face);
    }
  }

  return null;
}

/**
 * A face's appinfo, read from its pebble.appinfo.json.
 *
 * @param face The face to read.
 * @return The parsed appinfo.
 */
export function readAppinfo(face: string): Appinfo {
  return JSON.parse(fs.readFileSync(appinfoPath(face), 'utf8'));
}

/**
 * The name of every target a face declares, which is also the name of each one's sandbox.
 *
 * @param face The face to read.
 * @return The target names, in the order the face declares them.
 */
export function faceTargetNames(face: string): string[] {
  return resolveTargets(readAppinfo(face), face).map((target) => target.name);
}

/** Every face's target names, kept once read, since a build of every face checks each against them. */
let targetNames: Record<string, string[]> | null = null;

/** Every face's target names, leaving out a face whose appinfo does not read, since its own build reports that. */
function allTargetNames(): Record<string, string[]> {
  if (targetNames) {
    return targetNames;
  }

  const byFace: Record<string, string[]> = {};

  for (const name of listFaceNames()) {
    try {
      byFace[name] = faceTargetNames(name);
    } catch {
      // unreadable, so it has no targets to clash with
    }
  }

  targetNames = byFace;
  return byFace;
}

/**
 * Writes every target sandbox a face declares.
 *
 * A target name another face already uses stops it before anything is written, since the two would
 * build into one sandbox and the second would quietly replace the first's .pbw.
 *
 * @param face The face to write sandboxes for.
 * @return Each sandbox's absolute path, in the order the face declares its targets.
 */
export function writeSandboxes(face: string): string[] {
  const config = readAppinfo(face);
  const targets = resolveTargets(config, face);

  const clash = findTargetClash({ ...allTargetNames(), [face]: targets.map((target) => target.name) });

  if (clash) {
    throw new ToolError(clash);
  }

  const rootPkg: RootPkg = JSON.parse(fs.readFileSync(ROOT_PKG, 'utf8'));

  return targets.map((target) => writeTarget(face, config, rootPkg, target));
}

/**
 * What the command line asks for, as the lines it prints.
 *
 * With --targets it is a face's target names, so a script outside the framework's TypeScript uses
 * the same lookup every tool does. A bare face writes its sandboxes and gives their paths.
 * tools/build.ts calls writeSandboxes itself, so that is there for running by hand.
 */
function run(args: string[]): string[] {
  const listOnly = args[0] === '--targets';
  const face = listOnly ? args[1] : args[0];

  if (!face) {
    throw new ToolError('usage: build-manifests.ts [--targets] <face>');
  }

  if (listOnly) {
    return faceTargetNames(face);
  }

  return writeSandboxes(face);
}

function main() {
  try {
    for (const line of run(process.argv.slice(2))) {
      console.log(line);
    }
  } catch (error) {
    reportFailure(error);
  }
}

if (isMainScript(import.meta)) {
  main();
}
