/**
 * Generate targets/<target>/package.json from a face's config/pebble.appinfo.json.
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
 * via build.sh. A file whose contents would not change is left alone, so its mtime does too.
 *
 * Usage: node tools/manifest/build-manifests.ts --faces | [--targets] <face>
 */
import fs from 'node:fs';
import path from 'node:path';
import { appinfoPath, faceRelative, familyCoreFor, listFaceNames } from '../faces.ts';
import { writeIfChanged } from '../files.ts';
import { ENGINE, ENGINE_REL, WORKSPACE } from '../paths.ts';

const ROOT = WORKSPACE;
const ROOT_PKG = path.join(ROOT, 'package.json');
// every target's wscript comes from one template with only its folders filled in, so it is
// generated rather than committed per face. a sandbox missing its wscript makes `pebble build`
// report "This project is very outdated" instead of anything useful
const WSCRIPT_TEMPLATE = path.join(ENGINE, 'tools', 'waf', 'wscript.template');

/**
 * One entry in config/pebble.appinfo.json's resources.media: a bitmap or font the SDK
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
 * The shared Pebble fields common to every face. This is what building a manifest reads.
 * The per-face build identity (name/watchface/menuIcon) rides alongside these in the file
 * but is split out into a Target before buildManifest sees it.
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

/**
 * The build targets a face declares, as a flat list. A `targets` map wins. Otherwise the inline
 * single target is the whole list. One source face can produce several .pbw
 * targets, each with its own sandbox under targets/<target name>/.
 *
 * @param config The parsed appinfo to read the target or targets from.
 * @return Every build target this face declares.
 */
export function resolveTargets(config: Appinfo): Target[] {
  if (config.targets) {
    // an empty map or a target with no name reached the sandbox step as targets/undefined, or as
    // a TypeError that named nothing
    const targets = Object.entries(config.targets);
    if (targets.length === 0) {
      throw new Error('appinfo declares an empty targets map');
    }
    const unnamed = targets.find(([, target]) => !target || !target.name);
    if (unnamed) {
      throw new Error(`appinfo target "${unnamed[0]}" has no name`);
    }
    return targets.map(([, target]) => target);
  }
  if (!config.name) {
    throw new Error('appinfo declares neither a targets map nor a top-level name');
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
      throw new Error(`menuIcon ${target.menuIcon} is not in the media list`);
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
 * @return The finished manifest, ready to write out as package.json.
 */
export function buildManifest(config: SharedAppinfo, rootPkg: RootPkg, target: Target) {
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
  };
}

/** Where one sandbox's sources sit, each folder relative to the repo root with forward slashes. */
export interface SandboxDirs {
  engine: string;     // the framework, such as lib
  face: string;       // the face, such as watchfaces/mosaic/gridlock, or . for a face at the root
  familyCore: string; // the face's family core, such as watchfaces/mosaic/core, or empty for none
  watchface: boolean; // true for a face target, false for an app one, which builds with -DBUILD_WATCHAPP
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
    .split('{{ENGINE_DIR}}').join(dirs.engine)
    .split('{{FACE_DIR}}').join(dirs.face)
    .split('{{FAMILY_CORE_DIR}}').join(dirs.familyCore)
    .split('{{WATCHFACE}}').join(dirs.watchface ? 'True' : 'False');
}

/**
 * Writes one target's sandbox: targets/<target name>/{package.json,wscript}.
 *
 * @return The sandbox's absolute path.
 */
function writeTarget(face: string, config: Appinfo, rootPkg: RootPkg, target: Target): string {
  // the face's own version wins. the root package.json is the fallback and still owns the author
  const version = config.version || rootPkg.version;
  const manifest = buildManifest(config, { author: rootPkg.author, version }, target);

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
    watchface: target.watchface,
  };
  writeIfChanged(path.join(outDir, 'wscript'), fillWscript(fs.readFileSync(WSCRIPT_TEMPLATE, 'utf8'), dirs));

  // stdout carries only the sandbox paths build.sh reads back, so the note goes to stderr
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

/** Every face's target names, leaving out a face whose appinfo does not read, since its own build reports that. */
function allTargetNames(): Record<string, string[]> {
  const byFace: Record<string, string[]> = {};
  for (const name of listFaceNames()) {
    try {
      byFace[name] = resolveTargets(JSON.parse(fs.readFileSync(appinfoPath(name), 'utf8'))).map((target) => target.name);
    } catch {
      // unreadable, so it has no targets to clash with
    }
  }

  return byFace;
}

/**
 * Writes every target sandbox for a face and prints each sandbox's absolute path, one per line, so
 * build.sh writes and finds them in one run. With --targets it only prints the face's target names,
 * and with --faces every face in the repo, one per line, so build.sh can check a name and loop over
 * them with the same lookup every other tool uses.
 */
function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--faces') {
    for (const name of listFaceNames()) {
      console.log(name);
    }
    return;
  }

  const listOnly = args[0] === '--targets';
  const face = listOnly ? args[1] : args[0];
  if (!face) {
    console.error('usage: build-manifests.ts --faces | [--targets] <face>');
    process.exit(1);
  }

  const config: Appinfo = JSON.parse(fs.readFileSync(appinfoPath(face), 'utf8'));
  const targets = resolveTargets(config);

  if (listOnly) {
    for (const target of targets) {
      console.log(target.name);
    }
    return;
  }

  const clash = findTargetClash({ ...allTargetNames(), [face]: targets.map((target) => target.name) });
  if (clash) {
    console.error(clash);
    process.exit(1);
  }

  const rootPkg: RootPkg = JSON.parse(fs.readFileSync(ROOT_PKG, 'utf8'));
  for (const target of targets) {
    console.log(writeTarget(face, config, rootPkg, target));
  }
}

if (import.meta.main) {
  main();
}
