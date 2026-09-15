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
 * via build.sh.
 *
 * Usage: node tools/manifest/build-manifests.ts [--targets] <face>
 */
import fs from 'node:fs';
import path from 'node:path';
import { faceDir } from '../faces.ts';
import { ENGINE, WORKSPACE } from '../paths.ts';

const ROOT = WORKSPACE;
const ROOT_PKG = path.join(ROOT, 'package.json');
// every face's wscript is identical (waf_helpers keys off the sandbox dir name), so it is
// generated from one template rather than committed per face. a face missing its wscript
// makes `pebble build` report "This project is very outdated" instead of anything useful
const WSCRIPT_TEMPLATE = path.join(ENGINE, 'tools', 'waf', 'wscript.template');

/** A face's config/pebble.appinfo.json. */
function appinfoPath(face: string): string {
  return path.join(faceDir(face), 'config', 'pebble.appinfo.json');
}

/**
 * One entry in config/pebble.appinfo.json's resources.media: a bitmap or font the SDK
 * packs. generate-icons.ts rewrites the bitmap rows, so it reads this shape too.
 */
export type MediaEntry = { type: string; name: string; file?: string; menuIcon?: boolean; [key: string]: unknown };

/** The per-face build identity: the bits that make a manifest a watchface or a watchapp. */
type Target = { name: string; watchface: boolean; menuIcon?: string };

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
    return Object.values(config.targets);
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
      uuid: config.uuid,
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

/** Writes one target's sandbox: targets/<target name>/{package.json,wscript,.source-face}. */
function writeTarget(face: string, config: Appinfo, rootPkg: RootPkg, target: Target): void {
  // the face's own version wins. the root package.json is the fallback and still owns the author
  const version = config.version || rootPkg.version;
  const manifest = buildManifest(config, { author: rootPkg.author, version }, target);

  const outDir = path.join(ROOT, 'targets', target.name);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');

  // the waf entry point has to exist before `pebble build` runs in this sandbox
  fs.copyFileSync(WSCRIPT_TEMPLATE, path.join(outDir, 'wscript'));

  // the sandbox is named after the target, but its sources live in the face's folder. one
  // face can feed several targets, so waf_helpers and build.sh read this marker to map the
  // sandbox back to its source face rather than assuming sandbox name == face name
  fs.writeFileSync(path.join(outDir, '.source-face'), face + '\n');

  console.log(`Wrote targets/${target.name}/package.json and wscript (source face ${face} ${version}, watchface=${target.watchface}).`);
}

/**
 * Writes every target sandbox for a face, or with --targets prints their sandbox names (one per
 * line) so build.sh can loop over them. Each target the face declares gets its own
 * targets/<target name>/ sandbox.
 */
function main() {
  const args = process.argv.slice(2);
  const listOnly = args[0] === '--targets';
  const face = listOnly ? args[1] : args[0];
  if (!face) {
    console.error('usage: build-manifests.ts [--targets] <face>');
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

  const rootPkg: RootPkg = JSON.parse(fs.readFileSync(ROOT_PKG, 'utf8'));
  for (const target of targets) {
    writeTarget(face, config, rootPkg, target);
  }
}

if (import.meta.main) {
  main();
}
