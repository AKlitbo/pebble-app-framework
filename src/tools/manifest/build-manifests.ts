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
 * The manifest's message keys are the face's own, then the ones its features and its plugin defines
 * need, which feature-keys.ts works out, so a face never lists the keys a feature brings. The SDK
 * version, multi JS, and the capabilities the features and the settings page need are filled in the
 * same way. The features come from the face's compiled phone code, so tools/build.ts runs prepareFace
 * before the phone build, reads the features after it, and hands both to writeSandboxes.
 *
 * A face whose keys, with those added, hold only part of a key group the watch reads as a unit, such
 * as the weather extras, is refused here too, before any sandbox is written. key-groups.ts holds the
 * groups.
 *
 * A face can also set C defines for its own build, such as a raised ENGINE_SLOTS_MAX. They are checked
 * here and carried into the manifest, where the waf build turns each one into a -D flag. The dev
 * plugin's switches join them, as dev-switches.ts covers. A plugin
 * define, such as PLUGIN_WEATHER, brings the message keys its kind needs, and the keys only a plugin
 * fills, such as the music keys, are refused without their define. A face's
 * providers list, which names what it offers for each kind of data, is checked here too, against its
 * keys and its defines, and stays in the appinfo rather than the manifest.
 *
 * The manifest also carries textDefines, the C defines the build writes as text rather than taking from
 * the face. They are the defaults of the plugin source choices the watch keeps, worked out from the
 * face's providers list, and the waf build turns each into a -D flag holding a string.
 *
 * The manifest also lists the sites and phone features the face's phone-side script uses, as
 * usesPermissions. permissions.ts works them out from the face's message keys and its providers list.
 *
 * A plugin app is a face whose appinfo sets "projectType": "plugin". It is a Pebble app plugin with no
 * watch code, so its appinfo holds the SDK's plugin block and its own usesPermissions rather than
 * message keys, resources, or defines, and both go into the manifest as written. Its sandbox gets the
 * SDK's plugin wscript in place of the framework's. It has no features and no keys, so none of the keys
 * or the fields above are filled in for it, and its appinfo goes in as it is written.
 *
 * Usage: node tools/manifest/build-manifests.ts --targets <face>
 */
import fs from 'node:fs';
import path from 'node:path';
import { appinfoPath, faceRelative, familyCoreFor, familyNameFor, listFaceNames } from '../shared/faces.ts';
import { writeIfChanged } from '../shared/files.ts';
import { isObject } from '../shared/values.ts';
import { ENGINE, ENGINE_REL, WORKSPACE } from '../shared/paths.ts';
import { ToolError, reportFailure } from '../shared/tool-error.ts';
import { isMainScript } from '../shared/entry.ts';
import { isDevDefine, unitDevDefines } from './dev-switches.ts';
import { checkKeyGroups } from './key-groups.ts';
import { NO_START, fillAppinfo, type FaceStartFacts } from './feature-keys.ts';
import { keyNames } from './message-keys.ts';
import { checkOwnPermissions, permissionWarnings, permissionsFor, readOwn } from './permissions.ts';
import { PLUGIN_KINDS, pluginKindsOn } from './plugin-kinds.ts';
import { checkProviderKeys, checkSelectKeys, pluginSourceDefaults, providerWarnings, readProviders } from './providers.ts';
import type { Permission } from './permissions.ts';
import type { ProviderLists } from './providers.ts';

const ROOT = WORKSPACE;
const ROOT_PKG = path.join(ROOT, 'package.json');
// every target's wscript comes from one template with only its folders filled in, so it is
// generated rather than committed per face. a sandbox missing its wscript makes `pebble build`
// report "This project is very outdated" instead of anything useful
const WSCRIPT_TEMPLATE = path.join(ENGINE, 'waf', 'wscript.template');
// a plugin app builds with the SDK's own plugin rules, which name no folders, so it is copied as it is
const PLUGIN_WSCRIPT = path.join(ENGINE, 'waf', 'plugin-wscript.template');

/** The appinfo projectType that makes a face a plugin app, spelled as the Pebble SDK spells it. */
const PLUGIN_PROJECT_TYPE = 'plugin';

/** The projectType `pebble new-project` writes for a watchface or a watchapp, which builds as a face. */
const NATIVE_PROJECT_TYPE = 'native';

/** The script name the build writes a plugin app's code to, which the SDK reads from the plugin block. */
export const PLUGIN_SCRIPT = 'plugin.js';

/** The settings page the build writes into a plugin app's pbw, and the only `configPage` a plugin app can name. */
export const PLUGIN_CONFIG_PAGE = 'config.html';

/**
 * The appinfo fields only a face with watch code uses. A plugin app refuses each one, since the SDK
 * builds a plugin with no platforms and fills in its own resources, so the field would only sit in the
 * pbw meaning nothing, and a face moved to a plugin app would keep keys it never reads.
 */
const WATCH_ONLY_FIELDS = ['messageKeys', 'resources', 'defines', 'textDefines', 'providers', 'targets', 'watchapp', 'watchface', 'menuIcon', 'targetPlatforms', 'enableMultiJS'];

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
export type Target = { name: string; watchface: boolean; menuIcon?: string; uuid?: string };

/**
 * The shared Pebble fields common to every face, plus the C defines the face sets for its own build.
 * This is what building a manifest reads. The per-face build identity (name/watchface/menuIcon)
 * rides alongside these in the file but is split out into a Target before buildManifest sees it.
 * The SDK version, multi JS, and the capabilities can be left out, since fillAppinfo fills them in.
 */
export type SharedAppinfo = {
  displayName: string;
  uuid: string;
  sdkVersion?: string;
  enableMultiJS?: boolean;
  targetPlatforms: string[];
  capabilities?: unknown;
  messageKeys: unknown;
  resources: { media: MediaEntry[] };
  defines?: unknown;
  textDefines?: unknown;
  usesPermissions?: unknown;
  providers?: unknown;
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
export type Appinfo = SharedAppinfo & Partial<Target> & { version?: string; targets?: TargetsMap; projectType?: unknown; configPage?: unknown; plugin?: unknown };

/** The C defines a face sets for its own build, each a macro name and a whole number. */
export type Defines = Record<string, number>;

/** The C defines the build writes as text, each a macro name and the string it holds. */
export type TextDefines = Record<string, string>;

/**
 * The C defines a face sets for its own build, checked so each one is safe to hand the compiler.
 *
 * Every define goes straight onto the compiler's command line, so only a macro name and a whole
 * number get through. A name the build sets itself, a HAS_ feature switch, BUILD_WATCHAPP, a plugin
 * source default, or a dev switch, is turned away too, since those follow from the face's message keys,
 * resources, targets, providers list, and the dev switches. So is a textDefines block in the
 * appinfo, since the build writes the manifest's own from the providers list.
 *
 * @param config The face's appinfo.
 * @param face The face the appinfo belongs to, which a mistake in it names.
 * @return The defines, empty when the face sets none.
 */
export function readDefines(config: SharedAppinfo, face: string): Defines {
  if (config.textDefines !== undefined) {
    throw new ToolError(`${face}'s appinfo sets textDefines, which the build writes itself from the providers list. Take it out of the appinfo, and list the provider the face should default to first in providers instead`);
  }

  if (config.defines === undefined) {
    return {};
  }

  if (typeof config.defines !== 'object' || config.defines === null || Array.isArray(config.defines)) {
    throw new ToolError(`${face}'s appinfo defines has to be a map of macro name to whole number`);
  }

  const defines: Defines = {};

  for (const [name, value] of Object.entries(config.defines)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
      throw new ToolError(`${face}'s appinfo defines ${name}, which is not a macro name such as ENGINE_SLOTS_MAX`);
    }

    if (/^HAS_/.test(name) || name === 'BUILD_WATCHAPP' || PLUGIN_KINDS.some((kind) => kind.defaultDefine === name)) {
      throw new ToolError(`${face}'s appinfo defines ${name}, which the build sets itself`);
    }

    if (isDevDefine(name)) {
      throw new ToolError(`${face}'s appinfo defines ${name}, which the build sets itself from the dev switches. Take it out of the appinfo, and build with paf build ${face} --dev for dev mode`);
    }

    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new ToolError(`${face}'s appinfo defines ${name} as ${JSON.stringify(value)}, which is not a whole number`);
    }

    defines[name] = value;
  }

  return defines;
}

/**
 * Refuses the keys only a plugin fills without that plugin's define, since nothing on the phone would
 * ever answer them, so the mistake shows at build time rather than as a panel that stays empty.
 *
 * The keys a define that is on needs are added by fillAppinfo, so this asks for none of them.
 *
 * @param defines The face's defines, from readDefines.
 * @param messageKeys The message keys the manifest carries.
 * @param face The face the appinfo belongs to, which the refusal names.
 */
export function checkPluginKeys(defines: Defines, messageKeys: unknown, face: string): void {
  const declared = keyNames(messageKeys);
  const kindsOn = pluginKindsOn(defines);

  for (const kind of PLUGIN_KINDS.filter((known) => known.pluginOnly && !kindsOn.includes(known))) {
    const stray = [...kind.keys, ...(kind.optionalKeys || [])].filter((key) => declared.has(key));

    if (stray.length > 0) {
      throw new ToolError(`${face}'s appinfo declares ${stray.join(', ')} without ${kind.define}, and only that plugin fills them. Add "${kind.define}": 1 to its defines, or take the keys out of messageKeys`);
    }
  }
}

/**
 * Runs every check against the message keys the manifest carries, the face's own and the ones
 * fillAppinfo added.
 *
 * It refuses a key group declared in part or without the keys it is read beside, a providers list the
 * keys cannot back, and the keys only a plugin fills without its define. checkAppinfo runs it for the
 * build, and the dev plugin's page check runs it for each scenario, so both refuse the same faces.
 *
 * @param messageKeys The message keys the manifest carries.
 * @param face The face the appinfo belongs to, which a refusal names.
 * @param defines The face's defines, from readDefines.
 * @param providers The face's providers list, from readProviders.
 */
export function checkMessageKeys(messageKeys: unknown, face: string, defines: Defines, providers: ProviderLists): void {
  checkKeyGroups(messageKeys, face);
  checkProviderKeys(providers, messageKeys, face);
  checkPluginKeys(defines, messageKeys, face);
}

/**
 * The build targets a face declares, as a flat list. A `targets` map wins. Otherwise the inline
 * single target is the whole list. One source face can produce several .pbw
 * targets, each with its own sandbox under targets/<target name>/.
 *
 * Every path that learns a face's targets comes through here, so this is also where a plugin app is
 * told apart from a face. A plugin app is checked by checkPluginApp and has the one target its appinfo
 * names. Any projectType other than plugin or native is refused, native being what `pebble new-project`
 * writes for a face, so a misspelled plugin app does not build as a face.
 *
 * @param config The parsed appinfo to read the target or targets from.
 * @param face The face the appinfo belongs to, which a mistake in it names.
 * @return Every build target this face declares.
 */
export function resolveTargets(config: Appinfo, face: string): Target[] {
  if (isPluginApp(config)) {
    checkPluginApp(config, face);

    return [{ name: config.name as string, watchface: false }];
  }

  if (config.projectType !== undefined && config.projectType !== NATIVE_PROJECT_TYPE) {
    throw new ToolError(`${face}'s appinfo sets projectType ${JSON.stringify(config.projectType)}, which the build does not know. Set it to "${PLUGIN_PROJECT_TYPE}" for a plugin app, or to "${NATIVE_PROJECT_TYPE}" or leave it out for a watchface or watchapp`);
  }

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
 * @param permissions The usesPermissions list, from permissionsFor.
 * @param textDefines The C defines the build writes as text, from pluginSourceDefaults.
 * @return The finished manifest, ready to write out as package.json.
 */
export function buildManifest(config: SharedAppinfo, rootPkg: RootPkg, target: Target, defines: Defines = {}, permissions: Permission[] = [], textDefines: TextDefines = {}) {
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
      // left out when there are none, so a face with no phone-side fetches gets no empty list
      ...(permissions.length > 0 ? { usesPermissions: permissions } : {}),
    },
    // outside the pebble block, which the SDK reads. left out when there are none, so a face that
    // sets none gets a manifest with no defines key
    ...(Object.keys(defines).length > 0 ? { defines: defines } : {}),
    ...(Object.keys(textDefines).length > 0 ? { textDefines: textDefines } : {}),
  };
}

/**
 * Whether a face is a plugin app, known by `"projectType": "plugin"` in its appinfo.
 *
 * @param config The face's appinfo.
 * @return True for a plugin app.
 */
export function isPluginApp(config: { projectType?: unknown }): boolean {
  return config.projectType === PLUGIN_PROJECT_TYPE;
}

/**
 * Refuses a plugin app's appinfo the build cannot turn into a working plugin.
 *
 * A plugin app has no watch code, so a field only watch code uses is refused, naming the field. It
 * needs a name, which its sandbox is named after, and the SDK's plugin block, whose own shape the SDK
 * and the Pebble app check. The build writes the plugin's script as plugin.js and its settings page as
 * config.html, so a plugin block naming another script, or a settings page by another name, is refused
 * rather than built into a pbw missing it. Its permissions are checked the way a face's own are.
 *
 * @param config The face's appinfo.
 * @param face The face the appinfo belongs to, which a refusal names.
 */
export function checkPluginApp(config: Appinfo, face: string): void {
  const record = config as unknown as Record<string, unknown>;
  const watchOnly = WATCH_ONLY_FIELDS.filter((field) => record[field] !== undefined);

  if (watchOnly.length > 0) {
    throw new ToolError(`${face} is a plugin app, which has no watch code, so its appinfo cannot set ${watchOnly.join(', ')}. Take ${watchOnly.length === 1 ? 'it' : 'them'} out`);
  }

  if (typeof config.name !== 'string' || !config.name) {
    throw new ToolError(`${face} is a plugin app whose appinfo has no name`);
  }

  if (!isObject(config.plugin)) {
    throw new ToolError(`${face} is a plugin app whose appinfo has no plugin block. Add "plugin": { "description": "...", "sources": [...] }, as the Pebble SDK describes it`);
  }

  if (config.plugin.script !== undefined && config.plugin.script !== PLUGIN_SCRIPT) {
    throw new ToolError(`${face}'s plugin block names its script ${JSON.stringify(config.plugin.script)}, but the build writes it as ${PLUGIN_SCRIPT}. Take script out of the plugin block`);
  }

  if (config.configPage !== undefined && config.configPage !== PLUGIN_CONFIG_PAGE) {
    throw new ToolError(`${face}'s appinfo names its settings page ${JSON.stringify(config.configPage)}, but the build writes it as ${PLUGIN_CONFIG_PAGE}. Set configPage to "${PLUGIN_CONFIG_PAGE}", or take it out for a plugin app with no settings page`);
  }

  readOwn(config.usesPermissions, face);
}

/**
 * Builds a plugin app's package.json manifest.
 *
 * The SDK reads everything about a plugin from its pebble block, projectType included. usesPermissions
 * and the plugin block go in as the appinfo writes them, since each permission's reason and required
 * flag, and each source's callerPermissions, are the Pebble app's to read and the framework's types
 * would drop them.
 *
 * @param config The plugin app's appinfo, checked by checkPluginApp.
 * @param rootPkg The author, and the version the plugin app builds as.
 * @param permissions The usesPermissions list, from checkAppinfo, as the appinfo writes it.
 * @return The finished manifest, ready to write out as package.json.
 */
export function buildPluginManifest(config: Appinfo, rootPkg: RootPkg, permissions: Permission[] = []) {
  const plugin = { ...(isObject(config.plugin) ? config.plugin : {}), script: PLUGIN_SCRIPT };

  return {
    name: config.name,
    author: rootPkg.author,
    version: rootPkg.version,
    private: true,
    pebble: {
      displayName: config.displayName,
      uuid: config.uuid,
      sdkVersion: config.sdkVersion,
      projectType: PLUGIN_PROJECT_TYPE,
      ...(config.capabilities !== undefined ? { capabilities: config.capabilities } : {}),
      ...(config.configPage !== undefined ? { configPage: config.configPage } : {}),
      ...(permissions.length > 0 ? { usesPermissions: permissions } : {}),
      plugin,
    },
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

/** What the build reads and checks in a face's appinfo before the phone build, none of which needs the features. */
export interface AppinfoPrep extends FaceBuildInfo {
  /** The C defines from --dev and the unit's paf.dev.config.json, from unitDevDefines. */
  devDefines: Defines;
}

/** What the build reads and checks in a face's appinfo once, before it writes any target's sandbox. */
export interface CheckedAppinfo extends AppinfoPrep {
  /** The usesPermissions list, from permissionsFor. */
  permissions: Permission[];
  /** The C defines the build writes as text, from pluginSourceDefaults. */
  textDefines: TextDefines;
  /** What the build warns about and carries on past, from providerWarnings and permissionWarnings. */
  warnings: string[];
}

/**
 * Reads and checks the parts of a face's appinfo that do not need the features it passes.
 *
 * It stops on a define, a providers list, a usesPermissions entry, a part of a key group no feature or
 * define completes, half of the settings pair, which a kept plugin source choice brings whole but a
 * face may not list in part, a plugin only list beside its select key, the keys only a plugin fills without
 * its define, a dev build in a unit without the dev plugin, or a paf.dev.config.json the build cannot
 * read. None of these needs the keys the features bring, so the
 * build runs it before the phone build, and a refusal here leaves nothing written. A plugin's keys and
 * a select key are a define's alone, never a feature's, so the face's own keys give the same answer as
 * the whole list. checkAppinfo runs the key checks again on the whole list.
 *
 * @param config The face's appinfo.
 * @param face The face the appinfo belongs to, which a refusal names.
 * @param unit The unit's folder, whose paf.dev.config.json holds the dev switches.
 * @param dev Whether the build was asked for with --dev, which turns dev mode on.
 * @return The targets, defines, providers, and dev defines.
 */
export function prepareAppinfo(config: Appinfo, face: string, unit: string = ROOT, dev: boolean = false): AppinfoPrep {
  const info = faceBuildInfo(config, face);

  // a plugin app has no keys, defines, providers, or dev switches, since it has no watch code. buildOne
  // stops a dev build of one, or passes over it in all --dev
  if (isPluginApp(config)) {
    return { ...info, devDefines: {} };
  }

  checkOwnPermissions(config.usesPermissions, face, info.providers);
  checkKeyGroups(config.messageKeys, face, true);
  checkSelectKeys(info.providers, config.messageKeys, face);
  checkPluginKeys(info.defines, config.messageKeys, face);

  return { ...info, devDefines: unitDevDefines(unit, face, dev) };
}

/**
 * Reads and checks everything in a face's appinfo that every one of its targets shares.
 *
 * It stops on anything prepareAppinfo stops on, and on a key group declared in part or without the
 * keys it is read beside, a providers list the keys cannot back, or a usesPermissions entry the face
 * cannot build with. Every target gets the same answer, so it runs once per face. The checks against
 * the message keys need the keys the face's features bring, so the build runs them after the phone
 * build. A refusal at that point leaves each target's freshly compiled emit/ and its tsconfig.pkjs.json
 * behind, beside whatever package.json, wscript, and page/settings_page.h an earlier build wrote. The
 * header's fingerprint no longer matches the new emit/, so a pebble build run there by hand stops.
 *
 * @param config The face's appinfo, with the keys and the fields fillAppinfo fills in.
 * @param face The face the appinfo belongs to, which a refusal or a warning names.
 * @param unit The unit's folder, whose paf.dev.config.json holds the dev switches.
 * @param dev Whether the build was asked for with --dev, which turns dev mode on.
 * @param prep What prepareAppinfo already read and checked, dev switches included. Left out, it is read here.
 * @return The targets, defines, providers, permissions, text defines, and dev defines every target builds with, and the warnings to print.
 */
export function checkAppinfo(config: Appinfo, face: string, unit: string = ROOT, dev: boolean = false, prep: AppinfoPrep = prepareAppinfo(config, face, unit, dev)): CheckedAppinfo {
  // a plugin app has no keys, defines, or providers, and its permissions go in as it writes them
  if (isPluginApp(config)) {
    return { ...prep, permissions: readOwn(config.usesPermissions, face), textDefines: {}, warnings: [] };
  }

  checkMessageKeys(config.messageKeys, face, prep.defines, prep.providers);

  const permissions = permissionsFor(config.messageKeys, config.usesPermissions, face, prep.defines, prep.providers);
  const textDefines = pluginSourceDefaults(prep.defines, prep.providers);

  return { ...prep, permissions, textDefines, warnings: [...providerWarnings(prep.providers, face), ...permissionWarnings(config.messageKeys, face, prep.providers)] };
}

/**
 * Writes one target's sandbox: targets/<target name>/{package.json,wscript}.
 *
 * @return The sandbox's absolute path.
 */
function writeTarget(face: string, config: Appinfo, rootPkg: RootPkg, target: Target, checked: CheckedAppinfo): string {
  // the root package.json still owns the author
  const version = faceVersion(config, rootPkg) as string;
  const pluginApp = isPluginApp(config);
  // the dev switches are the face's, so every target of one face builds with the same ones
  const defines = { ...checked.defines, ...checked.devDefines };
  const manifest = pluginApp
    ? buildPluginManifest(config, { author: rootPkg.author, version }, checked.permissions)
    : buildManifest(config, { author: rootPkg.author, version }, target, defines, checked.permissions, checked.textDefines);

  const outDir = path.join(ROOT, 'targets', target.name);

  fs.mkdirSync(outDir, { recursive: true });
  writeIfChanged(path.join(outDir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeIfChanged(path.join(outDir, 'wscript'), pluginApp ? fs.readFileSync(PLUGIN_WSCRIPT, 'utf8') : faceWscript(face, target));

  // stdout is kept for the sandbox paths the bare face prints, so the note goes to stderr
  console.error(`Sandbox targets/${target.name} is ready (source ${pluginApp ? `plugin app ${face} ${version}` : `face ${face} ${version}, watchface=${target.watchface}`}).`);
  return outDir;
}

/**
 * A face target's wscript. The waf entry point has to exist before `pebble build` runs in its sandbox.
 * The sandbox is named after the target, but its sources are the face's, and one face can feed several
 * targets, so the wscript is told where the face, its family core and the framework sit.
 */
function faceWscript(face: string, target: Target): string {
  const rel = faceRelative(face);
  const core = familyCoreFor(ROOT, rel);
  const dirs: SandboxDirs = {
    engine: ENGINE_REL,
    face: rel,
    familyCore: core ? path.relative(ROOT, core).split(path.sep).join('/') : '',
    family: familyNameFor(ROOT, rel) || '',
    watchface: target.watchface,
  };

  return fillWscript(fs.readFileSync(WSCRIPT_TEMPLATE, 'utf8'), dirs);
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

/** What the phone build needs from a face's appinfo, read in one go. */
export interface FaceBuildInfo {
  /** The name of every target the face declares, in its order. */
  targets: string[];
  /** The face's defines, from readDefines. */
  defines: Defines;
  /** The face's providers list, from readProviders. */
  providers: ProviderLists;
}

/**
 * The target names, the defines, and the providers list out of a face's appinfo.
 *
 * None of it reads the message keys, since the phone build reads this before the build knows the keys
 * the face's features bring. checkAppinfo checks the keys.
 *
 * A plugin app has no key groups, defines, or providers to read, so it has its one target and nothing
 * else. resolveTargets checks it, and refuses an appinfo that is neither a plugin app nor a face.
 *
 * @param appinfo The face's appinfo.
 * @param face The face the appinfo belongs to, which a refusal names.
 * @return The target names, in the order the face declares them, the defines, and the checked providers.
 */
export function faceBuildInfo(appinfo: Appinfo, face: string): FaceBuildInfo {
  // resolveTargets tells a plugin app from a face and refuses an appinfo that is neither, so it runs first
  const targets = resolveTargets(appinfo, face).map((target) => target.name);

  if (isPluginApp(appinfo)) {
    return { targets, defines: {}, providers: {} };
  }

  const defines = readDefines(appinfo, face);

  return {
    targets,
    defines,
    providers: readProviders(appinfo, face, defines),
  };
}

/**
 * Reads a face's appinfo once for its target names, its defines, and its providers list, for a phone
 * build run on its own. paf build reads them through prepareFace.
 *
 * The phone build compiles into the sandboxes before they are written, so a target name another face
 * already uses stops it here, before either face's sandbox is touched.
 *
 * @param face The face to read.
 * @return The target names, in the order the face declares them, the defines, and the checked providers.
 */
export function readFaceBuildInfo(face: string): FaceBuildInfo {
  const info = faceBuildInfo(readAppinfo(face), face);

  refuseTargetClash(face, info.targets);
  return info;
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

/** Stops on a target name another face uses, or one the face declares twice. */
function refuseTargetClash(face: string, targets: string[]): void {
  const clash = findTargetClash({ ...allTargetNames(), [face]: targets });

  if (clash) {
    throw new ToolError(clash);
  }
}

/** What the build reads of a face before the phone build, read once and handed to every later step. */
export interface PreparedFace {
  /** The face's appinfo, as its file holds it. */
  appinfo: Appinfo;
  /** Every target the face declares, in its order. */
  targets: Target[];
  /** The appinfo checks that need no features, from prepareAppinfo. */
  info: AppinfoPrep;
  /** The face's own keys with its defines' keys added, which the start read stands in before it knows the features. */
  baseKeys: unknown;
  /** Whether the face is a plugin app, which has no phone build, start read, keys, or filled-in fields. */
  pluginApp: boolean;
}

/**
 * Reads a face's appinfo once and checks everything that does not need the features it passes.
 *
 * It stops on a target name another face uses, on anything prepareAppinfo stops on, and on the fields
 * fillAppinfo refuses whatever the features are, such as multi JS turned off. The build runs it before
 * the phone build, so any of these refusals leaves nothing written.
 *
 * @param face The face to read.
 * @param dev Whether the build was asked for with --dev, which turns dev mode on.
 * @param unit The unit's folder, whose paf.dev.config.json holds the dev switches.
 * @return The appinfo, the targets, the checked defines and providers, and the keys before the features.
 */
export function prepareFace(face: string, dev: boolean = false, unit: string = ROOT): PreparedFace {
  const appinfo = readAppinfo(face);
  const targets = resolveTargets(appinfo, face);

  refuseTargetClash(face, targets.map((target) => target.name));

  const info = prepareAppinfo(appinfo, face, unit, dev);
  const pluginApp = isPluginApp(appinfo);
  // a plugin app has no keys and none of the fields fillAppinfo fills, so it goes on as it is written
  const baseKeys = pluginApp ? undefined : fillAppinfo(appinfo, face, NO_START, info.defines, info.providers).messageKeys;

  return { appinfo, targets, info, baseKeys, pluginApp };
}

/** What writeSandboxes wrote, and what it read and checked in the appinfo on the way. */
export interface WrittenSandboxes {
  /** Each sandbox's absolute path, in the order the face declares its targets. */
  paths: string[];
  /** The appinfo as checkAppinfo read it. */
  checked: CheckedAppinfo;
  /** The message keys the manifest carries, the face's own and the ones fillAppinfo added. */
  messageKeys: unknown;
  /** Whether the face is a plugin app, which builds with no phone build, settings page, or header. */
  pluginApp: boolean;
  /** Each sandbox whose message keys differ from the ones its last passing build recorded, which has to build clean. */
  rekeyed: string[];
}

/** The file in each sandbox that holds the message keys its last passing pebble build was made with. */
export const BUILT_KEYS = 'built-keys.json';

/**
 * Whether a sandbox's last passing build was made with other message keys than these.
 *
 * The SDK reads the keys only when a sandbox's build starts clean, so a changed list fails the next
 * build on an undeclared MESSAGE_KEY_. paf starts a build clean when the appinfo's keys change, but the
 * features a face passes and its defines change the list too. The build takes the record away before
 * a sandbox's pebble clean or pebble build runs and writes it again only once pebble build passes, so
 * a record only ever sits beside a build made with its keys. A build that stops partway leaves none,
 * and the next build cleans, whatever keys it comes back with. A sandbox with no record, or one that
 * does not read, counts as changed, which costs one clean build.
 *
 * @param sandbox The sandbox's folder.
 * @param messageKeys The message keys the manifest carries now.
 * @return True when the sandbox has to build clean.
 */
export function keysChanged(sandbox: string, messageKeys: unknown): boolean {
  try {
    return fs.readFileSync(path.join(sandbox, BUILT_KEYS), 'utf8') !== JSON.stringify(messageKeys ?? null);
  } catch {
    return true;
  }
}

/**
 * Takes a sandbox's record away before its pebble clean or pebble build runs, since from then on its
 * build/ may no longer match the keys the record names.
 *
 * @param sandbox The sandbox's folder.
 */
export function forgetBuiltKeys(sandbox: string): void {
  fs.rmSync(path.join(sandbox, BUILT_KEYS), { force: true });
}

/**
 * Records the message keys a sandbox's pebble build passed with, which keysChanged reads next time.
 *
 * @param sandbox The sandbox's folder.
 * @param messageKeys The message keys the manifest carries.
 */
export function recordBuiltKeys(sandbox: string, messageKeys: unknown): void {
  writeIfChanged(path.join(sandbox, BUILT_KEYS), JSON.stringify(messageKeys ?? null));
}

/**
 * Writes every target sandbox a face declares.
 *
 * prepareFace has already stopped a target name another face uses, since the two would build into
 * one sandbox and the second would quietly replace the first's .pbw. Anything checkAppinfo refuses
 * stops it here before anything is written, and its warnings print once for the face rather than once
 * per target.
 *
 * The appinfo is filled in from what the build read of the face's phone code first, so every check
 * and every manifest sees the keys the features and the defines add.
 *
 * The build checks the face's settings page against the same checked appinfo, so it comes back with
 * the paths rather than being read and checked again.
 *
 * @param face The face to write sandboxes for.
 * @param prepared What prepareFace read and checked.
 * @param start What the build read from the face's compiled phone code.
 * @return Each sandbox's absolute path, in the order the face declares its targets, with the checked appinfo, its message keys, and the sandboxes whose keys changed.
 */
export function writeSandboxes(face: string, prepared: PreparedFace, start: FaceStartFacts): WrittenSandboxes {
  const pluginApp = isPluginApp(prepared.appinfo);
  // a plugin app's appinfo goes in as it is written, with nothing filled in
  const config = pluginApp ? prepared.appinfo : fillAppinfo(prepared.appinfo, face, start, prepared.info.defines, prepared.info.providers);
  // prepared.info already holds the dev switches the build was asked for, so dev is not read again here
  const checked = checkAppinfo(config, face, ROOT, false, prepared.info);

  for (const warning of checked.warnings) {
    console.warn(`warning: ${warning}`);
  }

  const rootPkg: RootPkg = JSON.parse(fs.readFileSync(ROOT_PKG, 'utf8'));
  // a plugin app has no message keys, so it never needs a clean for them
  const rekeyed = pluginApp ? [] : prepared.targets.map((target) => path.join(ROOT, 'targets', target.name)).filter((sandbox) => keysChanged(sandbox, config.messageKeys));

  return { paths: prepared.targets.map((target) => writeTarget(face, config, rootPkg, target, checked)), checked, messageKeys: config.messageKeys, pluginApp, rekeyed };
}

/**
 * What the command line asks for, as the lines it prints.
 *
 * With --targets it is a face's target names, so a script outside the framework's TypeScript uses
 * the same lookup every tool does. The sandboxes are written only by paf build, since their keys need
 * the features the face's compiled phone code passes, so a bare face is refused rather than given a
 * manifest missing those keys.
 */
function run(args: string[]): string[] {
  if (args[0] !== '--targets' || !args[1]) {
    throw new ToolError('usage: build-manifests.ts --targets <face>. The sandboxes need the keys the face\'s features bring, which only the compiled phone code says, so write them with paf build <face>');
  }

  return faceTargetNames(args[1]);
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
