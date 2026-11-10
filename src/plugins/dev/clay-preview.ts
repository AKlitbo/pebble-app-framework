/**
 * Local Clay preview.
 *
 * Builds a face's real settings page (the same @rebble/clay the watch build uses, with its own
 * custom components and every normal item) into a plain HTML file you can open in a browser. Lets
 * you click around the config UI without loading it onto the watch after every change. It also
 * shows you the console error when the page refuses to render, which on the phone just looks like
 * a settings screen that never opens. That is the real reason it earns its keep.
 *
 * The page, its components, and its customClay come from what the face hands startPebbleApp in its
 * own src/pkjs/index.ts, so a component the face forgets to pass fails here the same way it fails
 * on the phone. A face whose appinfo lists providers gets its page narrowed to them, as the phone
 * narrows it. On a face built with a plugin define, the face's features start too, and their page
 * hooks change the page the way they do each time the phone opens it. With --plugins the phone seems
 * to have the Pebble app plugins a file lists, which is what such a face offers as a source.
 *
 * Run from the unit that holds the face, through paf. USAGE below lists the options.
 *
 * Opens to: paf/plugins/dev/clay-preview.html, or the file --out names.
 *
 * The Save button does nothing here: it talks to the phone. This is for eyeballing the page.
 */
import fs from 'node:fs';
import path from 'node:path';
import { facePaths, compile, fillEmit, writeTsconfig, type FacePaths } from '../../tools/pkjs/build-pkjs.ts';
import { readAppinfo, readDefines } from '../../tools/manifest/build-manifests.ts';
import { readProviders } from '../../tools/manifest/providers.ts';
import type { ProviderLists } from '../../tools/manifest/providers.ts';
import { pluginKindsOn } from '../../tools/manifest/plugin-kinds.ts';
import { appinfoPath, familyCoreDir } from '../../tools/shared/faces.ts';
import { ENGINE } from '../../tools/shared/paths.ts';
import { stubModuleLoad } from '../../ts/testing/module-load.ts';
import { ToolError, reportFailure } from '../../tools/shared/tool-error.ts';
import { isMainScript } from '../../tools/shared/entry.ts';
import { forgetCompiled, installHost, loadSettingsPage, messageKeysFrom, type PhonePlugins } from '../../tools/pkjs/settings-page.ts';

const OUT = path.join(import.meta.dirname, 'clay-preview.html');

/** What -h prints. */
const USAGE = `usage: paf tool <face> clay-preview [options]

Builds the face's settings page into paf/plugins/dev/clay-preview.html for a desktop browser, run
from the unit that holds the face.

  --watch             rebuild the page after every save until stopped, then refresh the browser
  --platform=<name>   open the page as if from that watch, emery by default
  --settings=<file>   open the page filled from a file of saved values, as a returning wearer
                      sees it, rather than as a fresh install
  --plugins=<file>    open the page on a phone with the Pebble app plugins the file lists, and
                      with what each plugin source last saved
  --out=<file>        write the page to this file rather than clay-preview.html
  -h, --help          print this`;

/** What a preview was asked for. */
export type ClayPreviewArgs = {
  /** The face to preview, or empty when only the usage was asked for. */
  face: string;
  /** Whether to keep rebuilding after every save. */
  watch: boolean;
  /** The watch the page should think it was opened from. */
  platform: string;
  /** The file of saved values to fill the page from, or null for a fresh install. */
  settings: string | null;
  /** The file of plugins and their saved state, or null for a phone that lists none. */
  plugins: string | null;
  /** Where to write the page, or null for clay-preview.html beside this script. */
  out: string | null;
  /** Whether -h or --help asked for the usage. */
  help: boolean;
};

/** The flags that take a value after an equals sign, each with the example a refusal shows. */
const VALUE_FLAGS: Record<string, string> = {
  '--platform': '--platform=gabbro',
  '--settings': '--settings=saved.json',
  '--plugins': '--plugins=plugins.json',
  '--out': '--out=page.html',
};

/** The page a preview built, and the page before the features changed it. */
export type RenderedPage = {
  /** The page as the browser opens it. */
  html: string;
  /** The settings page as Clay built it from the face's own page, as JSON. A face that lists providers has the providers' open pass run on it, as an open that falls back gets it. */
  unfolded: string;
  /** The settings page that opens, after the features' page hooks, as JSON. */
  folded: string;
  /** The custom function's text, as Clay writes it into the page. */
  customFn: string;
};

/**
 * Reads what a preview was asked for.
 *
 * The face comes first, and the flags can follow in any order. -h or --help anywhere asks for the
 * usage and nothing else. Any other argument stops it, since a typo or `--settings saved.json` with a
 * space would otherwise preview a fresh install with no word that the flag was missed.
 *
 * @param args The command line after the script.
 * @return The face, the flags, and whether only the usage was asked for.
 */
export function parseClayPreviewArgs(args: string[]): ClayPreviewArgs {
  const parsed: ClayPreviewArgs = { face: '', watch: false, platform: 'emery', settings: null, plugins: null, out: null, help: false };

  if (args.includes('-h') || args.includes('--help')) {
    return { ...parsed, help: true };
  }

  const [face, ...rest] = args;

  if (!face || face.startsWith('-')) {
    throw new ToolError('no face given. Pass it first, as in paf tool my-face clay-preview --watch');
  }

  parsed.face = face;

  for (const arg of rest) {
    // paf hands a tool every argument as typed, so a -- marking the end of paf's own options is skipped
    if (arg === '--') {
      continue;
    }

    const equals = arg.indexOf('=');
    const flag = equals === -1 ? arg : arg.slice(0, equals);
    const value = equals === -1 ? '' : arg.slice(equals + 1);

    if (arg === '--watch') {
      parsed.watch = true;
    } else if (equals !== -1 && flag in VALUE_FLAGS) {
      if (!value) {
        throw new ToolError(`${flag} needs a value after the =, as in ${VALUE_FLAGS[flag]}`);
      }

      parsed[flag.slice(2) as 'platform' | 'settings' | 'plugins' | 'out'] = value;
    } else {
      throw new ToolError(`unknown argument: ${arg}. Run with --help for the options`);
    }
  }

  return parsed;
}

/** Whether a value is a plain object, the shape JSON gives `{}`. */
function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Reads what a --plugins file says about the phone.
 *
 * The file is an object. `plugins` is the list Pebble.enumeratePlugins hands back, each entry as the
 * Pebble app lists a plugin. A current Pebble app always has the call, and with plugins switched off
 * it lists nothing, so an empty list is plugins off. Leaving it out is an older Pebble app with no
 * plugin calls at all. `state` holds what each plugin source last saved, by its category and
 * item, such as `weather/location`, which is what the settings page reads to pick its warnings.
 * `unreadable: true` is a phone whose list call throws, so the page cannot tell what is installed.
 *
 * Each state goes into localStorage under the key the plugin source saves it under, which is
 * `pluginSource:` and then the category and item. ts/plugin-sources/subscription.ts builds that key,
 * and the spec beside this file checks the two agree. The state itself is passed on as written, so a
 * file can hold a state the page has to turn away.
 *
 * Anything else stops the preview, since a misspelt field would otherwise open a page on a phone
 * the developer never asked for.
 *
 * @param parsed The file's contents, parsed.
 * @param file The file's name, which a refusal names.
 * @return The plugin list and the saved states, by their localStorage key.
 */
export function previewPlugins(parsed: unknown, file: string): PhonePlugins {
  if (!isObject(parsed)) {
    throw new ToolError(`--plugins=${file} has to hold an object, with plugins and state in it`);
  }

  const unknownField = Object.keys(parsed).find((name) => name !== 'plugins' && name !== 'state' && name !== 'unreadable');

  if (unknownField !== undefined) {
    throw new ToolError(`--plugins=${file} has a field called ${unknownField}. It takes plugins, state, and unreadable`);
  }

  if (parsed.unreadable !== undefined && typeof parsed.unreadable !== 'boolean') {
    throw new ToolError(`--plugins=${file} has an unreadable that is not true or false`);
  }

  if (parsed.plugins !== undefined && !Array.isArray(parsed.plugins)) {
    throw new ToolError(`--plugins=${file} has a plugins that is not a list. Leave it out for a phone without plugins`);
  }

  if (parsed.state !== undefined && !isObject(parsed.state)) {
    throw new ToolError(`--plugins=${file} has a state that is not an object of category/item to the saved state`);
  }

  const storage: Record<string, string> = {};

  Object.entries(parsed.state || {}).forEach(([source, saved]) => {
    if (!/^[^/]+\/[^/]+$/.test(source) || !isObject(saved)) {
      throw new ToolError(`--plugins=${file} has a state for ${source}. Each one is a category and item, such as weather/location, holding an object`);
    }

    storage[`pluginSource:${source}`] = JSON.stringify(saved);
  });

  return { plugins: Array.isArray(parsed.plugins) ? parsed.plugins : null, unreadable: parsed.unreadable === true, storage };
}

/**
 * Reads a --plugins file from disk.
 *
 * @param file The file's path.
 * @return The plugin list and the saved states, by their localStorage key.
 */
export function readPluginsFile(file: string): PhonePlugins {
  if (!fs.existsSync(file)) {
    throw new ToolError(`--plugins=${file} names no file`);
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new ToolError(`--plugins=${file} is not valid JSON. ${(error as Error).message}`);
  }

  return previewPlugins(parsed, file);
}

/** Pull the raw HTML out of the data url generateUrl hands back. */
function htmlFromDataUrl(url: string): string {
  const comma = url.indexOf(',');
  const head = url.slice(0, comma);
  const body = url.slice(comma + 1);

  return head.indexOf(';base64') !== -1
    ? Buffer.from(body, 'base64').toString('utf8')
    : decodeURIComponent(body);
}

/**
 * Fills the compiled emit/ the way the build does before the bundler reads it.
 *
 * That is the committed components, ical.js for a face that uses the calendar, and the entry files
 * written from the face's defines and providers, which decide whether its plugin code is there and
 * what its settings page offers. fillEmit runs them in the build's own order, with no other targets
 * to copy into.
 *
 * @param paths The paths for the face's sandbox.
 * @param defines The face's defines, from its appinfo.
 * @param providers The face's checked providers list, from readProviders. Left out, the face lists none.
 */
export function fillPreviewEmit(paths: FacePaths, defines: Record<string, number>, providers: ProviderLists = {}): void {
  fillEmit(paths, [], defines, providers);
}

/**
 * A face's defines and its checked providers list, read from its appinfo alone. The preview builds no
 * watch app, so it never looks at the face's targets, and a face whose targets would not resolve still
 * previews. A providers list the build would refuse stops the preview the same way.
 */
function faceBuild(face: string): { defines: Record<string, number>; providers: ProviderLists } {
  const appinfo = readAppinfo(face);
  const defines = readDefines(appinfo, face);

  return { defines, providers: readProviders(appinfo, face, defines) };
}

/**
 * Whether the preview starts the face's features, which it does only for a face built with a plugin
 * define. Only such a face's features change the page, so every other face previews the page Clay
 * builds from the face's own config, with none of its features started.
 *
 * @param defines The face's defines, from its appinfo.
 * @return True when any plugin define is on.
 */
export function hasPluginDefines(defines: Record<string, number>): boolean {
  return pluginKindsOn(defines).length > 0;
}

/**
 * Builds the settings page the phone would open, from the face's compiled code.
 *
 * loadSettingsPage builds the page the way startPebbleApp does, narrowed to the providers the build
 * wrote, from what the face hands startPebbleApp. faceStart settles the saved settings a --settings
 * file gave, as the phone does at launch. With withFeatures the features start and their page hooks
 * change the page the way they do each time the wearer opens it. A sandbox with no compiled index.js
 * stops here, and so does a face whose start-up never calls startPebbleApp, since there is then no
 * settings page the phone would build. Each says which it is.
 *
 * @param args The face and the platform.
 * @param paths The paths for the face's sandbox, already compiled and filled.
 * @param messageKeys The face's message keys, as messageKeysFrom gives them.
 * @param withFeatures Whether to start the features and run their hooks, as hasPluginDefines decides.
 * @return The page, and the settings page before and after the features changed it.
 */
export function renderPage(args: Pick<ClayPreviewArgs, 'face' | 'platform'>, paths: FacePaths, messageKeys: Record<string, number>, withFeatures: boolean): RenderedPage {
  // the build compiles index.ts to index.js, so a sandbox without it never compiled the face's own
  // start-up, which is a different stop from a start-up that never calls startPebbleApp
  if (!fs.existsSync(path.join(paths.emitPkjs, 'index.js'))) {
    throw new ToolError(`${args.face}'s src/pkjs/index.ts compiled to no index.js in ${path.relative(process.cwd(), paths.emitPkjs)}, so there is no settings page to build. Check that tsc compiled the face`);
  }

  const loaded = loadSettingsPage(paths, messageKeys, withFeatures);

  if (loaded === null) {
    throw new ToolError(`${args.face}'s src/pkjs/index.ts never calls startPebbleApp, which is where the phone builds the settings page`);
  }

  const { clay, built } = loaded;

  // Clay fills meta from the Pebble global, which the preview does not have
  // left alone the page carries activeWatchInfo: null, and any item with capabilities throws on it
  // filling it with --platform's watch is what lets the capability filter run off the phone
  (clay as { meta?: unknown }).meta = {
    activeWatchInfo: { platform: args.platform, firmware: { major: 4, minor: 3, patch: 0 } },
    accountToken: '',
    watchToken: '',
    userData: {},
  };

  return {
    html: htmlFromDataUrl(clay.generateUrl()),
    unfolded: JSON.stringify(built.config),
    folded: JSON.stringify(clay.config),
    customFn: String(clay.customFn),
  };
}

/** Renders the settings page to the out file so a browser can open it. */
function build(args: ClayPreviewArgs, paths: FacePaths, messageKeys: Record<string, number>, defines: Record<string, number>): void {
  const out = args.out === null ? OUT : path.resolve(args.out);
  const page = renderPage(args, paths, messageKeys, hasPluginDefines(defines));

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, page.html);

  const stamp = new Date().toISOString().slice(11, 19);

  console.log('[' + stamp + '] wrote ' + out + ' (' + page.html.length + ' bytes) for ' + args.face);
}

/** Rebuilds the page after every save under the face's sources until stopped. */
function watch(args: ClayPreviewArgs, paths: FacePaths, messageKeys: Record<string, number>): void {
  // the face's page, the family core's shared sections, and the framework's ts, which the page
  // builders and the Clay components both come from
  const core = familyCoreDir(args.face);
  const watched = [
    paths.faceSrc,
    core ? path.join(core, 'pkjs') : '',
    path.join(ENGINE, 'ts'),
  ].filter((dir) => dir && fs.existsSync(dir));

  // fs.watch fires more than once per save and every pass shells out to a synchronous tsc, so
  // roll a burst of events into one rebuild
  let timer: ReturnType<typeof setTimeout> | null = null;

  const rebuild = (): void => {
    // node caches required modules, so drop the face's compiled ones before the next build
    forgetCompiled(paths);

    try {
      const { defines, providers } = faceBuild(args.face);

      // no cleanEmit here: wiping emit/ would mean a cold tsc on every keystroke
      compile(paths);
      fillPreviewEmit(paths, defines, providers);
      // each build starts the features again, so each one starts from the saved state the files gave
      installHost(args, args.plugins === null ? null : readPluginsFile(args.plugins));
      build(args, paths, messageKeys, defines);
    } catch (error) {
      console.error('build failed: ' + (error as Error).message);
    }
  };

  console.log('watching for changes. refresh the browser after each save.');
  console.log('note: edits under clay/builder need `paf gen ' + args.face + ' clay` first.');
  watched.forEach((dir) => {
    fs.watch(dir, { recursive: true }, () => {
      if (timer) { clearTimeout(timer); }

      timer = setTimeout(rebuild, 150);
    });
  });
}

function main(): void {
  let args: ClayPreviewArgs;
  let paths: FacePaths;
  let messageKeys: Record<string, number>;

  // a bad face, flag, or first build stops with the one line every tool gives, and tsc's own exit code
  try {
    args = parseClayPreviewArgs(process.argv.slice(2));

    if (args.help) {
      console.log(USAGE);
      return;
    }

    paths = facePaths(args.face);

    // the page comes from the face's own src/pkjs/index.ts and what it hands startPebbleApp. a face
    // without one has nothing to preview, and going on would stop on a missing file with a stack that
    // reads as a bug here
    if (!fs.existsSync(path.join(paths.faceSrc, 'index.ts'))) {
      throw new ToolError(`${args.face} has no src/pkjs/index.ts of its own, which is where the phone builds the settings page`);
    }

    const plugins = args.plugins === null ? null : readPluginsFile(args.plugins);
    const keys = messageKeysFrom(appinfoPath(args.face));
    const { defines, providers } = faceBuild(args.face);

    messageKeys = keys;
    stubModuleLoad((id) => (id === 'message_keys' ? keys : undefined));
    installHost(args, plugins);
    writeTsconfig(args.face, paths);
    compile(paths);
    // the face's start-up loads every feature it passes, the calendar one reads ical.js, the face's
    // defines decide which plugin code its features find and whether they start at all, and its
    // providers decide what its page offers
    fillPreviewEmit(paths, defines, providers);
    build(args, paths, messageKeys, defines);
  } catch (error) {
    reportFailure(error);
    return;
  }

  if (args.watch) {
    watch(args, paths, messageKeys);
  }
}

if (isMainScript(import.meta)) {
  main();
}
