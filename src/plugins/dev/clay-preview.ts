/**
 * Local Clay preview.
 *
 * Builds a face's real settings page (the same @rebble/clay the watch build uses, with its own
 * custom components and every normal item) into a plain HTML file you can open in a browser. Lets
 * you click around the config UI without loading it onto the watch after every change. It also
 * shows you the console error when the page refuses to render, which on the watch just looks like
 * a settings screen that never appears. That is the real reason it earns its keep.
 *
 * The page, its components, and its customClay come from what the face hands startPebbleApp in its
 * own src/pkjs/index.ts, so a component the face forgets to pass fails here the same way it fails
 * on the phone.
 *
 * Run from the unit that holds the face, through paf. USAGE below lists the options.
 *
 * Opens to: paf/plugins/dev/clay-preview.html
 *
 * The Save button does nothing here: it talks to the phone. This is for eyeballing the page.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { facePaths, compile, copyGenerated, copyIcalJs, writeTsconfig, type FacePaths } from '../../tools/pkjs/build-pkjs.ts';
import { appinfoPath, familyCoreDir } from '../../tools/shared/faces.ts';
import { ENGINE, ENGINE_REL } from '../../tools/shared/paths.ts';
import { stubModuleLoad } from '../../ts/testing/module-load.ts';
import { ToolError, reportFailure } from '../../tools/shared/tool-error.ts';
import { isMainScript } from '../../tools/shared/entry.ts';
import type { ClayConfigItem } from '../../ts/clay/types.ts';

const requireHost = createRequire(import.meta.url);

const OUT = path.join(import.meta.dirname, 'clay-preview.html');

/** What -h prints. */
const USAGE = `usage: paf tool <face> clay-preview [options]

Builds the face's settings page into paf/plugins/dev/clay-preview.html for a desktop browser, run
from the unit that holds the face.

  --watch             rebuild the page after every save until stopped, then refresh the browser
  --platform=<name>   open the page as if from that watch, emery by default
  --settings=<file>   open the page filled from a file of saved values, as a returning wearer
                      sees it, rather than as a fresh install
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
  /** Whether -h or --help asked for the usage. */
  help: boolean;
};

/**
 * The part of what a face hands startPebbleApp that builds its settings page.
 *
 * It restates the fields of StartOptions in ts/pkjs/app.ts that the preview reads. Importing that type
 * pulls app.ts into the tools build, which has none of the phone's globals it leans on. So a change to
 * those fields in StartOptions has to be made here too.
 */
export type StartOptions = {
  /** The face's settings page. */
  clayConfig: ClayConfigItem[];
  /** The face's own Clay components, beside the location component every face gets. */
  components?: unknown[];
  /** The code the face runs inside its settings page. */
  customClay?: unknown;
};

/** The part of the Clay page createClay hands back that the preview uses. */
type ClayPage = {
  /** The page as a data url, since a defined Pebble is not "pypkjs". */
  generateUrl(): string;
};

/** The framework's app module as the face's compiled index.js sees it. */
export type StartHost = {
  /** The call a face makes to start, which the preview swaps for one that records it. */
  startPebbleApp: (options: StartOptions) => void;
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
  const parsed: ClayPreviewArgs = { face: '', watch: false, platform: 'emery', settings: null, help: false };

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
    } else if (value && flag === '--platform') {
      parsed.platform = value;
    } else if (value && flag === '--settings') {
      parsed.settings = value;
    } else if (equals !== -1 && (flag === '--platform' || flag === '--settings')) {
      throw new ToolError(`${flag} needs a value after the =, as in ${flag === '--platform' ? '--platform=gabbro' : '--settings=saved.json'}`);
    } else {
      throw new ToolError(`unknown argument: ${arg}. Run with --help for the options`);
    }
  }

  return parsed;
}

/**
 * Runs the face's own start-up with startPebbleApp swapped for one that records what it was handed.
 *
 * The real call is put back whether the load finishes or throws. A face whose start-up never calls
 * it stops here, since there is then no settings page the phone would build.
 *
 * @param host The framework's app module, the same instance the face's code imports.
 * @param load Loads the face's compiled index.js, which calls startPebbleApp as it loads.
 * @param face The face, which a refusal names.
 * @return What the face handed startPebbleApp.
 */
export function captureStart(host: StartHost, load: () => void, face: string): StartOptions {
  const real = host.startPebbleApp;
  const seen: { options: StartOptions | null } = { options: null };

  host.startPebbleApp = (options) => {
    seen.options = options;
  };

  try {
    load();
  } finally {
    host.startPebbleApp = real;
  }

  if (seen.options === null) {
    throw new ToolError(`${face}'s src/pkjs/index.ts never calls startPebbleApp, which is where the phone builds the settings page`);
  }

  return seen.options;
}

/**
 * Gives the bundle the phone's globals under plain node.
 *
 * The bundle pokes at a few host globals while it builds the page, so these are harmless stand-ins.
 * A defined Pebble (not "pypkjs") is what makes generateUrl hand back a self-contained data url
 * instead of a hosted-previewer link. They are deliberately partial, so they go through a loose host
 * view rather than pretending to be a real Navigator or Storage.
 */
function stubHost(args: ClayPreviewArgs): void {
  const host = global as unknown as Record<string, unknown>;

  if (typeof host.navigator === 'undefined') { host.navigator = { userAgent: 'node' }; }

  if (typeof host.window === 'undefined') { host.window = {}; }

  // which watch the page should think it was opened from. Clay filters items by their declared
  // capabilities against this, so it is what shows the round build losing its rectangle-only
  // controls without a watch in hand. firmware is stubbed alongside the platform because Clay
  // reads both when it resolves a capability
  if (typeof host.Pebble === 'undefined') {
    host.Pebble = {
      platform: args.platform,
      addEventListener: function () {},
      getAccountToken: function () { return ''; },
      getWatchToken: function () { return ''; },
      getActiveWatchInfo: function () {
        return { platform: args.platform, firmware: { major: 4, minor: 3, patch: 0 } };
      },
    };
  }

  // Clay reads the values it seeds the page with straight out of localStorage under this key, so
  // pre-loading it is all "open the settings again later" takes
  if (typeof host.localStorage === 'undefined') {
    const store: Record<string, string> = {};

    if (args.settings !== null) {
      if (!fs.existsSync(args.settings)) {
        throw new ToolError(`--settings=${args.settings} names no file`);
      }

      store['clay-settings'] = fs.readFileSync(args.settings, 'utf8');
    }

    host.localStorage = {
      getItem: function (key: string) { return key in store ? store[key] : null; },
      setItem: function (key: string, value: string) { store[key] = String(value); },
    };
  }

  // the watch build aliases "message_keys" to a generated file which does not exist under plain
  // node, so stand in a map built from the appinfo. the real ids do not matter for rendering. the
  // SDK takes messageKeys as a list of names or as a map of name to id, so either one gives the names
  const listed: string[] | Record<string, number> = JSON.parse(fs.readFileSync(appinfoPath(args.face), 'utf8')).messageKeys || [];
  const declared = Array.isArray(listed) ? listed : Object.keys(listed);
  const messageKeysStub: Record<string, number> = {};

  declared.forEach((name, i) => { messageKeysStub[name] = 10000 + i; });

  stubModuleLoad((id) => (id === 'message_keys' ? messageKeysStub : undefined));
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

/** Renders the settings page to clay-preview.html so a browser can open it. */
function build(args: ClayPreviewArgs, paths: FacePaths): void {
  // required per build so each pass picks up the freshly compiled emit/ tree. at module scope it
  // would stay bound to the first load and dropping the require cache would not budge it
  const appPath = path.join(paths.emit, ...ENGINE_REL.split('/'), 'ts', 'pkjs', 'app.js');
  const app = requireHost(appPath) as { default: StartHost; createClay: (options: StartOptions) => ClayPage };

  // the face's own start-up decides the page, and createClay is the same call startPebbleApp builds
  // the phone's page with, so a component the face forgets to pass is missing here as well
  const start = captureStart(app.default, () => requireHost(path.join(paths.emitPkjs, 'index.js')), args.face);
  const clay = app.createClay(start);

  // Clay only fills meta inside its showConfiguration handler, and generateUrl is called here
  // without one, so the page would carry activeWatchInfo: null. Clay then throws on any item that
  // names capabilities, since it has no watch to check them against. filling it is what makes the
  // capability filter testable off-watch
  (clay as { meta?: unknown }).meta = {
    activeWatchInfo: { platform: args.platform, firmware: { major: 4, minor: 3, patch: 0 } },
    accountToken: '',
    watchToken: '',
    userData: {},
  };

  const html = htmlFromDataUrl(clay.generateUrl());

  fs.writeFileSync(OUT, html);

  const stamp = new Date().toISOString().slice(11, 19);

  console.log('[' + stamp + '] wrote ' + OUT + ' (' + html.length + ' bytes) for ' + args.face);
}

/** Rebuilds the page after every save under the face's sources until stopped. */
function watch(args: ClayPreviewArgs, paths: FacePaths): void {
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

  // node caches a module under its real path, so a targets/ reached through a link is matched by
  // where it really is. the separator keeps a sibling folder that shares the name's start out
  const emitRoot = fs.realpathSync(paths.emit) + path.sep;

  const rebuild = (): void => {
    // node caches required modules, so drop the face's compiled ones before the next build. Clay
    // and the rest of node_modules never change between saves, so they stay loaded
    Object.keys(requireHost.cache)
      .filter((key) => key.startsWith(emitRoot))
      .forEach((key) => { delete requireHost.cache[key]; });

    try {
      // no cleanEmit here: wiping emit/ would mean a cold tsc on every keystroke
      compile(paths);
      copyGenerated(paths);
      copyIcalJs(paths);
      build(args, paths);
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

    stubHost(args);
    writeTsconfig(args.face, paths);
    compile(paths);
    copyGenerated(paths);
    // the face's start-up loads every feature it passes, and the calendar one reads ical.js
    copyIcalJs(paths);
    build(args, paths);
  } catch (error) {
    reportFailure(error);
    return;
  }

  if (args.watch) {
    watch(args, paths);
  }
}

if (isMainScript(import.meta)) {
  main();
}
