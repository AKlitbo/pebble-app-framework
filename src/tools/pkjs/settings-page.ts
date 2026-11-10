/**
 * Loads a face's settings page from its compiled phone code, the way the phone builds it.
 *
 * The face's own start-up decides the page. Its compiled index.js runs under node with startPebbleApp
 * swapped for a stand-in that only records what the face hands it, and then the page goes through the
 * framework's own faceStart, createClay, and prepareSettingsPage, the calls startPebbleApp builds the
 * phone's page with. So the page is narrowed to the providers the build wrote, the features start, and
 * their page hooks run, the same as on the phone each time the wearer opens the settings. Nothing calls
 * ready, so no feature fetches.
 *
 * paf build loads the page between the phone build and pebble build, checks it against the face's
 * appinfo, and writes what the watch needs from it into page/settings_page.h in each sandbox. That is a
 * SETTINGS_COUNT_<KEY> for each choice the page offers and a SETTINGS_DEFAULT_<KEY> for each default
 * it opens with, which the KNOWN_* macros and a face's own fields take their counts and defaults from.
 * The dev plugin's clay-preview and page-check load the page here too, so all three see the page the
 * phone would open.
 *
 * The phone's globals are stand-ins, a Pebble with a handful of calls and a localStorage, so a face
 * whose top-level code or whose feature start reaches for anything else stops here, naming the feature.
 * The build loads the page once for each platform the face targets, each time on a fresh phone with no
 * plugin calls and nothing saved, and puts the host's own globals back after each load.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { facePaths, type FacePaths } from './build-pkjs.ts';
import { readDefines, type PreparedFace, type SharedAppinfo } from '../manifest/build-manifests.ts';
import { keyNames } from '../manifest/message-keys.ts';
import { NO_START, featureKeys, fillAppinfo, withAddedKeys, type FaceStartFacts } from '../manifest/feature-keys.ts';
import { PLUGIN_KINDS } from '../manifest/plugin-kinds.ts';
import { PROVIDERS, readProviders } from '../manifest/providers.ts';
import { customClayShape } from '../../ts/clay/custom-fn.ts';
import { readChoice } from '../../ts/pkjs/settings-store.ts';
import { stubModuleLoad } from '../../ts/testing/module-load.ts';
import { ToolError } from '../shared/tool-error.ts';
import { isObject } from '../shared/values.ts';
import type { ClayConfigItem } from '../../ts/clay/types.ts';

const requireHost = createRequire(import.meta.url);

/**
 * The header's format, which paf_build.py's HEADER_FORMAT matches. A header without this line was
 * written before it carried the defaults, so the waf build refuses it rather than build without them.
 */
export const HEADER_FORMAT = 2;

/** Where the header goes in each sandbox, which paf_build.py puts on the include path. */
export const PAGE_HEADER = path.join('page', 'settings_page.h');

/** The highest value a choice can count to, since the watch keeps a count in a uint8_t. */
const CHOICE_MAX = 254;

/**
 * Every platform the SDK builds a face for when its appinfo names no targetPlatforms, as SDK 4.44 ships
 * them. The waf build checks that the platforms a header was counted on cover every one it builds, so
 * an SDK that adds a platform stops the build rather than leaving that platform's page uncounted.
 */
export const PEBBLE_PLATFORMS = ['aplite', 'basalt', 'chalk', 'diorite', 'emery', 'flint', 'gabbro'];

/** The controls whose options are a list of choices the watch can be sent. */
const CHOICE_TYPES = ['select', 'radiogroup', 'themePreview'];

/**
 * What a feature gets when it starts. It restates FeatureContext in ts/pkjs/feature.ts, for the same
 * reason StartOptions below restates the app's.
 */
export type PageFeatureContext = {
  messageKeys: Record<string, number>;
  defaults: Record<string, unknown>;
  queueSend: (...args: unknown[]) => void;
  refetchDelayMs: number;
  providers: Partial<Record<string, readonly string[]>> | null;
};

/**
 * The part of what a face hands startPebbleApp that builds its settings page.
 *
 * It restates the fields of StartOptions in ts/pkjs/app.ts that the loader reads. Importing that type
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
  /** The parts of the phone runtime the face opts into, each started with what the app shares. */
  features?: Array<(context: PageFeatureContext) => unknown>;
};

/** The part of the Clay page createClay hands back that the loader and the preview use. */
export type ClayPage = {
  /** The page as a data url, since a defined Pebble is not "pypkjs". */
  generateUrl(): string;
  /** The settings page the next generateUrl writes. */
  config: unknown[];
  /** The function the page runs before it builds. */
  customFn: unknown;
};

/** The framework's app module as the face's compiled index.js sees it. */
export type StartHost = {
  /** The call a face makes to start, which the loader swaps for one that records it. */
  startPebbleApp: (options: StartOptions) => void;
};

/** What faceStart in ts/pkjs/app.ts makes of a face's start, restated for the same reason as StartOptions. */
export type FaceStart = {
  /** The face's options, with its page narrowed to the providers it lists. */
  options: StartOptions;
  /** The defaults that page declares, with the provider defaults filled in. */
  defaults: Record<string, unknown>;
  /** The lists each feature reads, or null for a face that lists none. */
  providers: PageFeatureContext['providers'];
  /** The providers' own hooks, which run after every feature's. */
  hooks: unknown[];
  /** The page an open falls back to when the features' rows cannot be added. */
  fallbackPage: (config: unknown[]) => unknown[];
};

/** The parts of the framework's compiled app module the loader calls. */
type AppModule = {
  default: StartHost;
  createClay: (options: StartOptions) => ClayPage;
  faceStart: (options: StartOptions) => FaceStart;
  prepareSettingsPage: (clay: ClayPage, options: StartOptions, features: unknown[], built: { config: unknown[]; customFn: unknown }) => void;
  SETTINGS_REFETCH_DELAY_MS: number;
};

/** The phone's plugins, for a page loaded on a phone that lists some. */
export type PhonePlugins = {
  /** What Pebble.enumeratePlugins hands back, or null for a phone without the plugin calls. */
  plugins: unknown[] | null;
  /** Whether the phone has the list call but it throws, so the list cannot be read. */
  unreadable: boolean;
  /** Each plugin source's saved state, as localStorage holds it, by its localStorage key. */
  storage: Record<string, string>;
};

/** The phone a page is loaded on. */
export type Phone = {
  /** The watch the page should think it was opened from. */
  platform: string;
  /** A file of saved values to fill the page from, or null for a fresh install. */
  settings: string | null;
};

/** A face's settings page as the phone would open it, and what the face started it with. */
export type LoadedPage = {
  /** What the face handed startPebbleApp, before its providers list narrowed it. */
  given: StartOptions;
  /** What faceStart made of it: the narrowed options, the defaults, the providers, and their hooks. */
  start: FaceStart;
  /** The Clay page. Its config is the page that opens, after the features' page hooks. */
  clay: ClayPage;
  /** The page and the custom function Clay was built with, before the features' page hooks. */
  built: { config: unknown[]; customFn: unknown };
  /** What each feature handed back as it started, in the order the face lists them. Empty when they did not start. */
  features: unknown[];
};

/** A face's settings page as the phone would open it on one platform. */
export type PlatformPage = LoadedPage & {
  /** The platform the page was opened from. */
  platform: string;
};

/** Each choice the page offers, by message key, as the highest value plus one. */
export type ChoiceCounts = Record<string, number>;

/** Each default the page opens with, by message key, as the C the header writes for it, such as `3` or `"%b %d"`. */
export type PageDefaults = Record<string, string>;

/** One control with a message key on the page that opens on one platform, as the build reads it. */
export type PageControl = {
  /** The platform the page was opened from. */
  platform: string;
  /** Its message key as the page writes it, such as `SLOT_MODE[1]`. */
  messageKey: string;
  /** Its message key without an index, such as `SLOT_MODE`. */
  key: string;
  /** Its Clay component type, such as `select`. */
  type: string;
  /** Every option value it lists, with option groups opened up, empty for a control with none. */
  options: unknown[];
  /** The default it declares, or undefined for one that declares none. */
  defaultValue: unknown;
  /** What it opens on with nothing saved, from opensOn, or undefined when it opens on nothing. */
  opens: unknown;
};

/** What the build reads from the loaded page, which the checks look at and the header is written from. */
export type PageFacts = {
  /** Each choice the page offers, by message key. */
  counts: ChoiceCounts;
  /** Each default the page opens with, by message key. */
  defaults: PageDefaults;
  /** The face's own keys that open on different values on different platforms, which get no default. */
  unsettled: string[];
  /** The platforms the page was counted on, empty for a face with no settings page. */
  platforms: string[];
  /** Every control with a message key on each platform's page, in page order. */
  controls: PageControl[];
};

/** What the page checks read from the face's appinfo, as the sandbox step checked it. */
export type AppinfoFacts = {
  /** The message keys the appinfo declares, as written there, a list or a map. */
  messageKeys: unknown;
  /** The C defines the build writes as text from the providers list, such as `PLUGIN_SOURCE_WEATHER_DEFAULT`. */
  textDefines: Record<string, string>;
};

/** The parts of a loaded page the build reads, so a spec can hand them a page it built by hand. */
export type CheckedPage = {
  /** The platform the page was opened from. */
  platform: string;
  /** What the face handed startPebbleApp, before its providers list narrowed it. */
  given: { clayConfig: unknown[] };
  /** The page that opens. */
  clay: { config: unknown[] };
  /** What each feature handed back as it started. */
  features: unknown[];
  /** The providers' own hooks, which answer requests the same as a feature. */
  start: { hooks: unknown[] };
};

/**
 * The C field a KNOWN_* entry keeps its default in, with the buffer size of a text one, and the count
 * of a choice whose count the framework sets rather than the page.
 */
export type KnownField = { field: 'default_num'; count?: number } | { field: 'default_str'; size: number };

/**
 * The field each KNOWN_* entry in settings_catalog.h keeps its default in, by message key.
 *
 * The page's default for one of these keys has to fit the field, a number for default_num and text
 * short enough for its buffer for default_str, or the face's C stops on a type error far from the
 * page. A choice with a count of the framework's own, such as a vibe, also has to fall below it, since
 * the watch holds no more choices than that whatever the page lists. settings-page.spec.ts reads the
 * catalog and the headers its counts come from, and checks this table against every KNOWN_* macro, so
 * the two cannot drift.
 */
export const KNOWN_FIELDS: Readonly<Record<string, KnownField>> = {
  WEATHER_TEMPERATURE_UNIT: { field: 'default_num', count: 2 },
  CLOCK_DATE_FORMAT: { field: 'default_str', size: 16 },
  APPEARANCE_THEME: { field: 'default_num' },
  APPEARANCE_HEADER_FONT: { field: 'default_num' },
  HEALTH_STEPS_MODE: { field: 'default_num', count: 3 },
  HEALTH_DISTANCE_UNIT: { field: 'default_num', count: 2 },
  CLOCK_TIME_FORMAT: { field: 'default_num', count: 5 },
  CONNECTION_BLUETOOTH_ICON: { field: 'default_num' },
  APPEARANCE_QUIET_TIME_ICON: { field: 'default_num' },
  CONNECTION_VIBE_CONNECT: { field: 'default_num', count: 4 },
  CONNECTION_VIBE_DISCONNECT: { field: 'default_num', count: 4 },
  CLOCK_HOURLY_VIBE: { field: 'default_num', count: 4 },
  BATTERY_DISPLAY: { field: 'default_num', count: 3 },
  WEATHER_WIND_UNIT: { field: 'default_num', count: 4 },
};

/**
 * Runs the face's own start-up with startPebbleApp swapped for one that records each call.
 *
 * The real call is put back whether the load finishes or throws.
 *
 * @param host The framework's app module, the same instance the face's code imports.
 * @param load Loads the face's compiled index.js, which calls startPebbleApp as it loads.
 * @return What the face handed startPebbleApp on each call, in order, empty when it never calls it.
 */
export function captureStarts(host: StartHost, load: () => void): StartOptions[] {
  const real = host.startPebbleApp;
  const seen: StartOptions[] = [];

  host.startPebbleApp = (options) => {
    seen.push(options);
  };

  try {
    load();
  } finally {
    host.startPebbleApp = real;
  }

  return seen;
}

/**
 * Runs the face's own start-up and gives back what its last startPebbleApp call was handed.
 *
 * @param host The framework's app module, the same instance the face's code imports.
 * @param load Loads the face's compiled index.js, which calls startPebbleApp as it loads.
 * @return What the face handed startPebbleApp, or null when its start-up never calls it.
 */
export function captureStart(host: StartHost, load: () => void): StartOptions | null {
  const seen = captureStarts(host, load);

  return seen.length ? seen[seen.length - 1] : null;
}

/**
 * The face's message keys as a map of name to a made up id, in the order they are given.
 *
 * The watch build aliases "message_keys" to a generated file which does not exist under plain node,
 * so the loader stands this map in. The real ids do not matter for building the page. The SDK takes
 * messageKeys as a list of names or as a map of name to id, so either one gives the names. The keys
 * are the manifest's, from fillAppinfo, so nothing here works out which keys a face has.
 *
 * @param appinfo An appinfo or a manifest's pebble block, read for its messageKeys.
 * @return Each key by name.
 */
export function messageKeysOf(appinfo: { messageKeys?: unknown }): Record<string, number> {
  const listed = appinfo.messageKeys || [];
  const declared = Array.isArray(listed) ? listed.map(String) : Object.keys(listed);
  const messageKeys: Record<string, number> = {};

  declared.forEach((name, index) => { messageKeys[name] = 10000 + index; });

  return messageKeys;
}

/**
 * The face's message keys as a map of name to a made up id, read from its appinfo file.
 *
 * The keys are the face's own with its plugin defines' keys added, as fillAppinfo adds them.
 * loadSettingsPage adds the keys the features bring once it reads which ones the face passes. The face
 * is named after the appinfo's folder, which is how the build names it.
 *
 * @param appinfo The face's pebble.appinfo.json.
 * @return Each key by name.
 */
export function messageKeysFrom(appinfo: string): Record<string, number> {
  const config = JSON.parse(fs.readFileSync(appinfo, 'utf8')) as SharedAppinfo;
  const face = path.basename(path.dirname(path.resolve(appinfo)));
  const defines = readDefines(config, face);

  return messageKeysOf(fillAppinfo(config, face, NO_START, defines, readProviders(config, face, defines)));
}

/**
 * Adds the keys the features bring to a stand-in map, after the ones it holds, by fillAppinfo's rule.
 *
 * The map is the one message_keys stands in as, so the face's code and its features see the keys too.
 */
function addFeatureKeys(messageKeys: Record<string, number>, keys: readonly string[], face: string): void {
  const listed = Object.keys(messageKeys);
  const full = withAddedKeys(listed, keys, face) as string[];

  full.slice(listed.length).forEach((key, index) => { messageKeys[key] = 10000 + listed.length + index; });
}

/** The timer calls the face's code is loaded with, which hold what it asks for and never run it. */
const TIMER_CALLS = ['setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval', 'clearImmediate'];

/**
 * Swaps node's timers for ones that hold what they are handed and never run it, while face code loads.
 *
 * The build runs from start to end without a break, so a timer the face starts as it loads would not
 * run before the build ends anyway. A real one would then keep node alive after the build is done,
 * and an interval would hold it open for good. A held timer gives back a handle with the calls node's
 * own has, and clearing one does nothing. A handle from before the swap still clears for real.
 *
 * @return Puts node's own timers back.
 */
function holdTimers(): () => void {
  const host = global as unknown as Record<string, unknown>;
  const before = TIMER_CALLS.map((name) => host[name]);
  const held = new Set<object>();
  const hold = (): object => {
    const handle = { ref: () => handle, unref: () => handle, hasRef: () => false, refresh: () => handle };

    held.add(handle);
    return handle;
  };
  const clear = (real: unknown) => (handle: unknown): void => {
    if (!held.has(handle as object)) {
      (real as (handle: unknown) => void)(handle);
    }
  };

  host.setTimeout = hold;
  host.setInterval = hold;
  host.setImmediate = hold;
  host.clearTimeout = clear(before[3]);
  host.clearInterval = clear(before[4]);
  host.clearImmediate = clear(before[5]);

  return () => {
    TIMER_CALLS.forEach((name, index) => { host[name] = before[index]; });
  };
}

/**
 * Loads the face's compiled index.js, naming the face when its code throws as it loads.
 *
 * The code runs under node on a stand-in phone, so a face that reaches for something the phone has and
 * the stand-in does not stops here with the reason rather than a bare stack. The build's first read of
 * the start runs before it knows the keys the features bring, so a throw there also says that a key
 * the code needs as it loads has to be listed.
 */
function loadFaceCode(face: string, entry: string, firstRead: boolean = false): void {
  try {
    requireHost(entry);
  } catch (error) {
    if (error instanceof ToolError) {
      throw error;
    }

    const before = firstRead ? ' This was the build\'s first read of the code, which runs before it knows the keys the features bring, so a key the code needs as it loads has to be listed in messageKeys.' : '';

    throw new ToolError(`${face}'s phone code threw while the build loaded it: ${(error as Error).message}. The build loads it under node on a phone with only ${STAND_INS}, so code that reaches for anything else as it loads cannot run here.${before}`);
  }
}

/**
 * Gives the face's compiled code the phone's globals under plain node.
 *
 * The bundle pokes at a few host globals while it builds the page, so these are harmless stand-ins.
 * A defined Pebble (not "pypkjs") is what makes generateUrl hand back a self-contained data url
 * instead of a hosted-previewer link. They are deliberately partial, so they go through a loose host
 * view rather than pretending to be a real Navigator or Storage.
 *
 * Pebble and localStorage are put in fresh on every call, so a run that loads several pages starts
 * each one on its own phone. A newer node has a localStorage of its own, which is set aside the same way.
 * The call hands back what puts Pebble, localStorage, window, and navigator back as they were, so the
 * next page starts on a clean phone and node's own globals come back afterwards.
 *
 * @param phone The platform and the file of saved values.
 * @param plugins The phone's plugins and their saved state, or null for a phone that lists none.
 * @return Puts the four globals back as they were before the call.
 */
export function installHost(phone: Phone, plugins: PhonePlugins | null): () => void {
  const host = global as unknown as Record<string, unknown>;
  const names = ['Pebble', 'localStorage', 'window', 'navigator'];
  const before = names.map((name) => Object.getOwnPropertyDescriptor(host, name));
  const restore = (): void => {
    names.forEach((name, index) => {
      const descriptor = before[index];

      if (descriptor) {
        Object.defineProperty(host, name, descriptor);
      } else {
        delete host[name];
      }
    });
  };

  if (typeof host.navigator === 'undefined') { host.navigator = { userAgent: 'node' }; }

  if (typeof host.window === 'undefined') { host.window = {}; }

  // which watch the page should think it was opened from. Clay filters items by their declared
  // capabilities against this, so it is what shows the round build losing its rectangle-only
  // controls without a watch in hand. firmware is stubbed alongside the platform because Clay
  // reads both when it resolves a capability
  const pebble: Record<string, unknown> = {
    platform: phone.platform,
    addEventListener: function () {},
    getAccountToken: function () { return ''; },
    getWatchToken: function () { return ''; },
    getActiveWatchInfo: function () {
      return { platform: phone.platform, firmware: { major: 4, minor: 3, patch: 0 } };
    },
  };

  // a phone with the plugin calls lists what it was given, as a fresh copy each time like the real
  // bridge. a phone without them has no enumeratePlugins at all, which the plugin sources read as none
  const listed = plugins ? plugins.plugins : null;

  if (listed) {
    pebble.enumeratePlugins = function () { return JSON.parse(JSON.stringify(listed)); };
  }

  // a phone whose list call throws, so the plugin sources cannot tell what is installed
  if (plugins && plugins.unreadable) {
    pebble.enumeratePlugins = function () { throw new Error('the plugin list cannot be read'); };
  }

  host.Pebble = pebble;

  // Clay reads the values it seeds the page with straight out of localStorage under this key, so
  // pre-loading it is all "open the settings again later" takes. the plugin sources keep their saved
  // state there too, which is what the page reads to pick its warnings
  const store: Record<string, string> = { ...(plugins ? plugins.storage : {}) };

  if (phone.settings !== null) {
    if (!fs.existsSync(phone.settings)) {
      restore();
      throw new ToolError(`--settings=${phone.settings} names no file`);
    }

    store['clay-settings'] = fs.readFileSync(phone.settings, 'utf8');
  }

  Object.defineProperty(host, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: function (key: string) { return key in store ? store[key] : null; },
      setItem: function (key: string, value: string) { store[key] = String(value); },
      removeItem: function (key: string) { delete store[key]; },
    },
  });

  return restore;
}

/**
 * Drops a sandbox's compiled code from node's module cache, so the next load reads it afresh.
 *
 * Node caches a module under its real path, so a sandbox reached through a link is matched by where
 * it really is. Clay and the rest of node_modules stay loaded, since they never change between builds.
 *
 * @param paths The paths for the sandbox whose code to drop.
 */
export function forgetCompiled(paths: FacePaths): void {
  if (!fs.existsSync(paths.emit)) {
    return;
  }

  // the separator keeps a sibling folder that shares the name's start out
  const emitRoot = fs.realpathSync(paths.emit) + path.sep;

  Object.keys(requireHost.cache)
    .filter((key) => key.startsWith(emitRoot))
    .forEach((key) => { delete requireHost.cache[key]; });
}

/** What the loader's phone has, which a feature that throws as it starts is told. */
const STAND_INS = 'a Pebble with platform, addEventListener, getAccountToken, getWatchToken, getActiveWatchInfo, and enumeratePlugins on a phone that lists plugins, a localStorage with getItem, setItem, and removeItem, and the message_keys map';

/** Starts each feature as startPebbleApp does, naming the one that throws and what the loader's phone has. */
function startFeatures(start: StartOptions, context: PageFeatureContext): unknown[] {
  return (start.features || []).map((feature, index) => {
    try {
      return feature(context);
    } catch (error) {
      const name = feature.name || `feature ${index + 1}`;

      throw new ToolError(`starting the face's ${name} feature threw while its settings page loaded: ${(error as Error).message}. The page loads on a phone with only ${STAND_INS}, so a feature that reaches for anything else as it starts cannot run here`);
    }
  });
}

/** Where the framework's compiled app module sits in a sandbox's emit/. */
function appModulePath(paths: FacePaths): string {
  return path.join(path.dirname(paths.pluginSources), 'pkjs', 'app.js');
}

/**
 * Builds the settings page the phone would open, from the face's compiled code.
 *
 * faceStart and createClay are the calls startPebbleApp builds the phone's page with, so the page is
 * narrowed to the providers the build wrote, and a component the face forgets to pass is missing here
 * as well. faceStart also settles the saved settings the phone's localStorage holds, as the phone does
 * at launch. With withFeatures the features start, with a send queue that sends nothing, and
 * prepareSettingsPage changes the page the way startPebbleApp does each time the wearer opens it, with
 * the features' page hooks and then the providers' own. Without it only the providers' hooks run.
 *
 * The caller stands in message_keys and the phone's globals first, with stubModuleLoad and installHost.
 * Before the face's code runs for the page, startFacts reads which features it passes on the platform
 * the caller's phone is on, and the keys those features bring join that map, as the build adds them to
 * the face's message keys. So a face whose code reads those keys as it loads, or that leaves them to the
 * features, loads the same page. The face's timers are held for the whole load, as holdTimers says.
 *
 * The build's keys already hold every key the features bring, so with keysWhole the start is not read
 * again, and only clay-preview and page-check pay for it.
 *
 * With checks, as the build loads it, the face's customClay is checked before Clay sees it, so a
 * customClay that is not a plain function stops the load with a line naming the face and the fix
 * rather than Clay's own error or the phone's warning. So is each feature once it starts, so a feature
 * that answers a request the keys do not carry stops the load, as checkFeatureRequests says.
 *
 * @param paths The paths for the face's sandbox, already compiled and filled.
 * @param messageKeys The face's message keys, as messageKeysFrom gives them.
 * @param withFeatures Whether to start the features and run their page hooks.
 * @param options The face's name, whether to run the build's checks, and whether the keys are whole.
 * @return The loaded page, or null for a face with no index.js of its own or whose start-up never calls startPebbleApp.
 */
export function loadSettingsPage(paths: FacePaths, messageKeys: Record<string, number>, withFeatures: boolean, options: PageLoadOptions = {}): LoadedPage | null {
  const entry = path.join(paths.emitPkjs, 'index.js');

  if (!fs.existsSync(entry)) {
    return null;
  }

  const name = options.face ?? path.basename(path.dirname(path.dirname(paths.emitPkjs)));

  if (!options.keysWhole) {
    addFeatureKeys(messageKeys, startFacts(paths, name, Object.keys(messageKeys), [hostPlatform()]).featureKeys, name);
    forgetCompiled(paths);
  }

  const restoreTimers = holdTimers();

  try {
    return loadPage(paths, entry, messageKeys, withFeatures, name, options.checks === true);
  } finally {
    restoreTimers();
  }
}

/** How loadSettingsPage loads a face's page. */
export type PageLoadOptions = {
  /** The face the page belongs to, which a refusal or a warning names. Left out, the face's folder names it. */
  face?: string;
  /** Whether to run the build's own checks as the page loads, on the customClay and on each feature. */
  checks?: boolean;
  /** Whether the keys already hold every key the features bring, as the build's do, so the start is not read. */
  keysWhole?: boolean;
};

/**
 * Stops on a started feature that answers a request key the keys do not carry.
 *
 * The build adds a feature's keys from the messageKeys on the function the face passes. A feature the
 * face wraps in a function of its own hides them, so the build adds none, and the watch never sends
 * the request the feature waits for.
 */
function checkFeatureRequests(face: string, features: unknown[], messageKeys: Record<string, number>): void {
  const carried = keyNames(Object.keys(messageKeys));

  features.forEach((hooks) => {
    const requests = isObject(hooks) && Array.isArray(hooks.requests) ? hooks.requests.map(String) : [];
    const key = requests.find((request) => !carried.has(request));

    if (key !== undefined) {
      throw new ToolError(`${face} passes startPebbleApp a feature that answers ${key}, but its message keys do not carry ${key}, so the watch would never ask for it. The build reads a feature's keys off the function the face passes, which a function of the face's own wrapped around the feature hides. Pass the feature itself, or list ${key} in messageKeys`);
    }
  });
}

/** The platform the installed stand-in phone is on, which the start read before a page load uses. */
function hostPlatform(): string {
  const pebble = (global as unknown as { Pebble?: { platform?: unknown } }).Pebble;

  return typeof pebble?.platform === 'string' ? pebble.platform : PEBBLE_PLATFORMS[0];
}

/** Loads the page once the map holds the features' keys, as loadSettingsPage describes. */
function loadPage(paths: FacePaths, entry: string, messageKeys: Record<string, number>, withFeatures: boolean, face: string, checks: boolean): LoadedPage | null {
  // required per load so each pass picks up the freshly compiled emit/ tree. at module scope it
  // would stay bound to the first load and dropping the require cache would not budge it
  const app = requireHost(appModulePath(paths)) as AppModule;

  const given = captureStart(app.default, () => loadFaceCode(face, entry));

  if (given === null) {
    return null;
  }

  if (checks) {
    checkCustomClay(face, given.customClay);
  }

  const start = app.faceStart(given);
  const clay = app.createClay(start.options);
  const built = { config: start.fallbackPage(start.options.clayConfig), customFn: clay.customFn };

  // the features start as startPebbleApp starts them. nothing here calls ready, so none of them
  // fetches, and a send would go nowhere anyway
  const features = withFeatures
    ? startFeatures(start.options, {
      messageKeys,
      defaults: start.defaults,
      queueSend: () => {},
      refetchDelayMs: app.SETTINGS_REFETCH_DELAY_MS,
      providers: start.providers,
    })
    : [];

  if (checks) {
    checkFeatureRequests(face, features, messageKeys);
  }

  const hooks = [...features, ...start.hooks];

  if (hooks.length) {
    app.prepareSettingsPage(clay, start.options, hooks, built);
  }

  return { given, start, clay, built, features };
}

/** Every option value a choice control lists, with Clay's option groups opened up. */
function optionValues(options: unknown): unknown[] {
  if (!Array.isArray(options)) {
    return [];
  }

  return options.flatMap((option) => {
    const value = isObject(option) ? option.value : undefined;

    return Array.isArray(value) ? optionValues(value) : [value];
  });
}

/**
 * A value as a whole number from 0 to max, as a number or as text holding only digits, or null for
 * anything else. A count is held to 254, since the watch keeps a count in a byte, and a default to the
 * largest number that stays exact, since a field such as a poll interval can hold more than a choice.
 */
function wholeNumber(value: unknown, max: number): number | null {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;

  return typeof number === 'number' && Number.isSafeInteger(number) && number >= 0 && number <= max ? number : null;
}

/** Whether a control lists options and every one is a whole number from 0 to max. */
function numbered(options: unknown[], max: number): boolean {
  return options.length > 0 && options.every((option) => wholeNumber(option, max) !== null);
}

/** A message key without its slot index, so `SLOT_MODE[1]` is `SLOT_MODE`, the key the watch reads it on. */
function stripIndex(key: string): string {
  return key.replace(/\[\d+\]$/, '');
}

/**
 * What a control opens on with nothing saved.
 *
 * Clay sets each control through its manipulator to its defaultValue, or to empty text when it has
 * none. A toggle takes empty text as off. A text input shows it, so it opens empty. A colour reads it
 * as 0, which is black. A select, a radio group, and the theme picker pick the option whose value is
 * empty text, and with no such option they open with nothing picked, so the page saves empty text the
 * watch leaves alone. Any other control is a face's own, whose manipulator the build cannot see into.
 *
 * @return The value it opens on, or undefined when it opens on nothing.
 */
function opensOn(type: string, defaultValue: unknown, options: unknown[]): unknown {
  if (defaultValue !== undefined) {
    return defaultValue;
  }

  if (type === 'toggle') {
    return false;
  }

  if (type === 'input') {
    return '';
  }

  if (type === 'color') {
    return 0;
  }

  return CHOICE_TYPES.includes(type) && options.map(String).includes('') ? '' : undefined;
}

/** Every control with a message key on one platform's page, sections opened up, in page order. */
function readControls(items: unknown[], platform: string): PageControl[] {
  return items.flatMap((item): PageControl[] => {
    if (!isObject(item)) {
      return [];
    }

    if (Array.isArray(item.items)) {
      return readControls(item.items, platform);
    }

    if (typeof item.messageKey !== 'string') {
      return [];
    }

    const type = String(item.type);
    const options = optionValues(item.options);

    return [{ platform, messageKey: item.messageKey, key: stripIndex(item.messageKey), type, options, defaultValue: item.defaultValue, opens: opensOn(type, item.defaultValue, options) }];
  });
}

/** A choice control's count, the highest value plus one, or null when any value is not a whole number from 0 to 254. */
function controlCount(control: PageControl): number | null {
  if (!numbered(control.options, CHOICE_MAX)) {
    return null;
  }

  return Math.max(...control.options.map((option) => wholeNumber(option, CHOICE_MAX) as number)) + 1;
}

/** Each key's count on one page's controls, as choiceCounts gives it. */
function countsOf(controls: PageControl[]): ChoiceCounts {
  const counts: Record<string, number | null> = {};

  controls.filter((control) => CHOICE_TYPES.includes(control.type)).forEach((control) => {
    const count = controlCount(control);
    const seen = control.key in counts ? counts[control.key] : 0;

    counts[control.key] = count === null || seen === null ? null : Math.max(seen, count);
  });

  return Object.fromEntries(Object.entries(counts).filter((entry): entry is [string, number] => entry[1] !== null));
}

/**
 * How many choices the page offers on each message key, for the watch to hold its choice fields to.
 *
 * A select, radio group, or theme picker counts when every option value is a whole number from 0 to
 * 254, as a number or as text holding only digits. The count is the highest value plus one rather than
 * the number of options, so a value retired from the middle of a list stays reserved and the last one
 * is still in range. A control with any text value, such as a date format or a provider, gets no
 * count, and nor does one with a value past 254, since the watch keeps a count in a byte and 255 would
 * wrap to 0. A key with an index, such as SLOT[2], counts under its name without the index.
 *
 * A face can put two controls on one key, such as a rectangle-only and a round-only picker kept apart
 * by Clay's capabilities. One pbw holds every platform, so the watch's table has to take the largest,
 * and the key counts as the largest count across its controls. A key with any control that gets no
 * count gets none at all, since the watch cannot hold a text value to a count.
 *
 * @param page The page, as the phone opens it.
 * @return Each count by message key.
 */
export function choiceCounts(page: unknown[]): ChoiceCounts {
  return countsOf(readControls(page, ''));
}

/**
 * Each key's largest count across several pages, such as the same face's page loaded for each platform.
 *
 * @param pages The counts of each page.
 * @return The largest count for every key any page counts.
 */
export function largestCounts(pages: ChoiceCounts[]): ChoiceCounts {
  const largest: ChoiceCounts = {};

  pages.forEach((counts) => {
    Object.entries(counts).forEach(([key, count]) => {
      largest[key] = Math.max(largest[key] ?? 0, count);
    });
  });

  return largest;
}

/**
 * Text as a C string literal.
 *
 * Each byte of its UTF-8 goes in as itself when it is plain ASCII and as a three digit octal escape
 * otherwise, so a multi-byte letter reaches the watch as the same bytes. A question mark is escaped
 * too, since two of them start a trigraph when the compiler runs in a strict C mode.
 */
function cString(text: string): string {
  const body = [...Buffer.from(text, 'utf8')].map((byte) => {
    if (byte === 0x22 || byte === 0x5c || byte === 0x3f) {
      return `\\${String.fromCharCode(byte)}`;
    }

    return byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : `\\${byte.toString(8).padStart(3, '0')}`;
  });

  return `"${body.join('')}"`;
}

/** A whole number as C, with a negative one in brackets so it reads as one value wherever it lands. */
function cNumber(value: number): string {
  return value < 0 ? `(${value})` : String(value);
}

/** A control's opening value as the phone reads it, and whether its shape says the C keeps a number. */
type ReadDefault = {
  /** The control it came from. */
  control: PageControl;
  /** The value as the phone reads it, a number or text. */
  read: number | string;
  /** Whether the control is a toggle, a colour, a choice with whole number options, or opens on a value that is not text. */
  numeric: boolean;
};

/**
 * A control's opening value as the phone reads it, or null when it has none the watch can hold.
 *
 * It reads the way readChoice does on the phone, so a toggle's true and the text "1" are both 1, and
 * digit text is its number. A whole number below 0 is itself. A colour's hex text, such as `0xFF0000`,
 * is the number the colour picker saves. Other text stays text. A slider is left out, since Clay
 * scales its value by its step, and so are a list, an object, and a number with a fraction.
 */
function readDefault(control: PageControl): ReadDefault | null {
  const value = control.opens;

  if (value === undefined || control.type === 'slider') {
    return null;
  }

  const hex = control.type === 'color' && typeof value === 'string' ? /^(?:0x|#)?([0-9a-f]{6})$/i.exec(value) : null;
  const choice = hex ? parseInt(hex[1], 16) : readChoice(value, Number.NaN);
  const read = !Number.isNaN(choice) ? choice : Number.isSafeInteger(value) ? (value as number) : typeof value === 'string' ? value : null;

  if (read === null) {
    return null;
  }

  const numeric = typeof value !== 'string' || control.type === 'toggle' || control.type === 'color' || (CHOICE_TYPES.includes(control.type) && numbered(control.options, Number.MAX_SAFE_INTEGER));

  return { control, read, numeric };
}

/** Each key's opening values as the phone reads them, in page order, leaving out a key with an index, since each slot has its own. */
function readsByKey(controls: PageControl[]): Map<string, ReadDefault[]> {
  const reads = new Map<string, ReadDefault[]>();

  controls.forEach((control) => {
    const read = control.key === control.messageKey ? readDefault(control) : null;

    if (read) {
      reads.set(control.key, [...(reads.get(control.key) ?? []), read]);
    }
  });

  return reads;
}

/**
 * A key's default as the C the header writes, once its controls agree on it.
 *
 * A key a KNOWN_* entry keeps takes the C type of that entry's field. A face's own key is a number
 * when any of its controls is shaped as one and the phone reads the value as one, and text otherwise,
 * in the spelling the page gives it.
 */
function renderDefault(key: string, reads: ReadDefault[]): string {
  const known = KNOWN_FIELDS[key];
  const asNumber = known ? known.field === 'default_num' : reads.some((read) => read.numeric);
  const first = reads[0].read;

  if (asNumber && typeof first === 'number') {
    return cNumber(first);
  }

  const text = reads.map((read) => read.control.opens).find((value): value is string => typeof value === 'string');

  return cString(text ?? String(first));
}

/** Each key's default as the C the header writes, from the first control that gives it one, leaving out the unsettled keys. */
function defaultsOf(reads: Map<string, ReadDefault[]>): PageDefaults {
  const unsettled = unsettledKeys(reads);

  return Object.fromEntries([...reads].filter(([key]) => !unsettled.includes(key)).map(([key, found]) => [key, renderDefault(key, found)]));
}

/**
 * Each default the page opens with, by message key, as the C the header writes for it.
 *
 * It reads each control on the page that opens, after the features' page hooks, so a provider
 * picker's default is the one the face's providers list gave it. A control with no default of its
 * own gives what Clay opens it on, as opensOn works out. A key with two defaults, across its controls
 * or the platforms, takes the first, and checkPage stops the build on it before the header is written.
 *
 * @param pages The page on each platform, as the phone opens it.
 * @return Each default by message key.
 */
export function pageDefaults(pages: unknown[][]): PageDefaults {
  return defaultsOf(readsByKey(pages.flatMap((page, index) => readControls(page, String(index)))));
}

/**
 * Works out what the build writes into page/settings_page.h from the loaded pages, walking each page once.
 *
 * The face's page is loaded once for each platform it targets, and each key takes its largest count
 * across them, since one pbw holds every platform and the watch's table has to cover the largest.
 *
 * @param loaded The page as the phone would open it on each platform, empty for a face with no settings page.
 * @return The counts, the defaults, the unsettled keys, the platforms they were read on, and every keyed control, all empty for a face with no settings page.
 */
export function pageFacts(loaded: Array<{ platform: string; clay: { config: unknown[] } }>): PageFacts {
  const perPage = loaded.map((page) => readControls(page.clay.config, page.platform));
  const controls = perPage.flat();
  const reads = readsByKey(controls);

  return {
    counts: largestCounts(perPage.map(countsOf)),
    defaults: defaultsOf(reads),
    unsettled: unsettledKeys(reads),
    platforms: loaded.map((page) => page.platform),
    controls,
  };
}

/**
 * Stops the build on a customClay the phone cannot run as the face means it.
 *
 * Clay runs the custom function inside the page with the page as `this`. Something that is not a
 * function cannot run there at all, and an arrow sees the `this` around it instead, so the face's code
 * cannot reach the page. customClayShape sorts it the way the phone does as it starts, so anything
 * falsy is no customClay, and a method shorthand is refused with the arrow.
 *
 * @param face The face whose customClay it is, which a refusal names.
 * @param customClay What the face handed startPebbleApp as its customClay.
 */
export function checkCustomClay(face: string, customClay: unknown): void {
  const shape = customClayShape(customClay);

  if (shape === 'not-function') {
    throw new ToolError(`${face}'s customClay is ${Array.isArray(customClay) ? 'a list' : `a ${typeof customClay}`}, not a function. Clay runs it inside the settings page, so pass a function, or leave customClay out`);
  }

  if (shape === 'not-plain') {
    throw new ToolError(`${face}'s customClay is not written with the function keyword. Clay hands it the settings page as this, which an arrow or a method cannot take, so write it as function customClay() { ... }`);
  }
}

/** Stops on a control whose key the face never declared, which Clay would send under undefined0. */
function checkDeclared(face: string, controls: PageControl[], declared: Set<string>): void {
  const stray = controls.find((control) => !declared.has(control.key));

  if (stray) {
    throw new ToolError(`${face}'s settings page has a control on ${stray.messageKey}, which its appinfo does not declare. Clay would send it under the key undefined0, which breaks every settings save. Add ${stray.key} to messageKeys and build with --clean, or take the control off the page`);
  }
}

/** The feature that answers each request key, as a face imports it, for the line that says to pass it. */
const REQUEST_FEATURES: Readonly<Record<string, { name: string; from: string }>> = {
  WEATHER_REQUEST: { name: 'weather', from: 'ts/weather/feature' },
  STOCK_REQUEST: { name: 'stocks', from: 'ts/stock/feature' },
  CALENDAR_REQUEST: { name: 'calendar', from: 'ts/calendar/feature' },
  MUSIC_REQUEST: { name: 'music', from: 'ts/music/feature' },
  PHONE_REQUEST: { name: 'phone', from: 'ts/phone/feature' },
};

/** Stops on a request key the watch sends that no feature or provider hook answers. */
function checkAnswered(face: string, page: CheckedPage, declared: Set<string>): void {
  const answered = new Set([...page.features, ...page.start.hooks].flatMap((hooks) => {
    const requests = isObject(hooks) ? hooks.requests : undefined;

    return Array.isArray(requests) ? requests.map(String) : [];
  }));
  const key = [...declared].find((name) => /_REQUEST$/.test(name) && name !== 'SETTINGS_REQUEST' && !answered.has(name));

  if (key === undefined) {
    return;
  }

  const feature = REQUEST_FEATURES[key];
  const pass = feature ? `Pass ${feature.name} from ${feature.from} in features` : `Pass the feature that answers ${key} in features`;
  // a key of the face's own needs a feature of the face's own, which only has to say it answers the key
  const own = feature ? '' : `. A small feature of the face's own answers it by returning requests: ['${key}']`;

  // MUSIC_REQUEST and PHONE_REQUEST without PLUGIN_MUSIC or PLUGIN_PHONE never get here, since checkPluginKeys in build-manifests.ts refuses them first
  throw new ToolError(`${face} declares ${key}, but no feature it passes startPebbleApp answers it, so the watch would ask for it and wait forever. ${pass}, or take ${key} out of messageKeys${own}`);
}

/** A value as a refusal shows it, with text in quotes. */
function shown(value: unknown): string {
  return typeof value === 'string' ? `"${value}"` : String(value);
}

/** Stops on a choice control whose own default is not one of its options, compared as Clay picks an option, by its text. */
function checkDefaultsListed(face: string, controls: PageControl[]): void {
  const stray = controls.find((control) => CHOICE_TYPES.includes(control.type) && control.defaultValue !== undefined && !control.options.map(String).includes(String(control.defaultValue)));

  if (stray) {
    throw new ToolError(`${face}'s settings page defaults ${stray.messageKey} to ${shown(stray.defaultValue)}, which is not one of its options. The page cannot show a default it does not list, and the watch would start on a choice the wearer cannot pick, so make the default one of the options`);
  }
}

/**
 * Stops on a key whose controls open on two values the phone reads differently.
 *
 * A key a KNOWN_* entry keeps stops on any two, since the entry's default is one value on every
 * platform. A face's own key stops only on two on the same platform. Two on different platforms leave
 * the key out of the header, as unsettledKeys says, and a face field that names its default stops at
 * compile.
 */
function checkOneDefault(face: string, reads: Map<string, ReadDefault[]>): void {
  reads.forEach((found, key) => {
    const clashes = found.flatMap((read, index) => found.slice(0, index)
      .filter((earlier) => earlier.read !== read.read && (key in KNOWN_FIELDS || earlier.control.platform === read.control.platform))
      .map((earlier) => [earlier.read, read.read]));

    if (clashes.length) {
      throw new ToolError(`${face}'s settings page gives ${key} two defaults, ${shown(clashes[0][0])} and ${shown(clashes[0][1])}. The watch keeps one default for a key on every platform, so give each control on ${key} the same default`);
    }
  });
}

/**
 * The face's own keys whose controls open on different values on different platforms.
 *
 * The header holds one default for a key, so these get none. A face field that reads one stops at
 * compile with SETTINGS_DEFAULT_<KEY> undeclared, and a field that takes its default from elsewhere
 * builds as before.
 */
function unsettledKeys(reads: Map<string, ReadDefault[]>): string[] {
  return [...reads].filter(([key, found]) => !(key in KNOWN_FIELDS) && found.some((read) => read.read !== found[0].read)).map(([key]) => key);
}

/** Stops on a default for a KNOWN_* key that does not fit the entry's field: a number below any count of the framework's own, or text that fits its buffer with its end. */
function checkKnownFields(face: string, reads: Map<string, ReadDefault[]>): void {
  reads.forEach((found, key) => {
    const known = KNOWN_FIELDS[key];
    const value = found[0].read;

    if (!known) {
      return;
    }

    if (known.field === 'default_num') {
      if (typeof value !== 'number') {
        throw new ToolError(`${face}'s settings page defaults ${key} to ${shown(value)}, but the watch's shared entry for ${key} keeps a number. Make the default a whole number`);
      }

      // the page can list more choices than the watch holds, so its own count does not catch this
      if (known.count !== undefined && (value < 0 || value >= known.count)) {
        throw new ToolError(`${face}'s settings page defaults ${key} to ${shown(value)}, but the watch's shared entry for ${key} holds ${known.count} choices, from 0 to ${known.count - 1}. The watch puts a choice past them back to its default, so make the default one of those`);
      }

      return;
    }

    const text = found.map((read) => read.control.opens).find((opens): opens is string => typeof opens === 'string');

    if (text === undefined) {
      throw new ToolError(`${face}'s settings page defaults ${key} to ${shown(value)}, but the watch's shared entry for ${key} keeps text. Make the default text`);
    }

    const bytes = Buffer.byteLength(text, 'utf8');

    if (bytes + 1 > known.size) {
      throw new ToolError(`${face}'s settings page defaults ${key} to ${shown(text)}, which is ${bytes} bytes, but the watch keeps ${key} in ${known.size} bytes, room for ${known.size - 1} and the end of the text. Make the default ${known.size - 1} bytes or shorter`);
    }
  });
}

/**
 * Stops on a choice on a KNOWN_* key whose option is at or past the framework's own count for it.
 *
 * The watch puts a choice past its count back to the default, so a wearer who picks that option gets
 * the default with nothing to say why. The page's own count is no help here, since it is the page that
 * lists too many. An option that is not a number is left alone, since the watch never reads it as one.
 */
function checkKnownOptions(face: string, controls: PageControl[]): void {
  controls.forEach((control) => {
    const known = KNOWN_FIELDS[control.key];
    const count = known && known.field === 'default_num' ? known.count : undefined;

    if (count === undefined || !CHOICE_TYPES.includes(control.type)) {
      return;
    }

    const stray = control.options.find((option) => {
      const value = wholeNumber(option, Number.MAX_SAFE_INTEGER);

      return value !== null && value >= count;
    });

    if (stray !== undefined) {
      throw new ToolError(`${face}'s settings page offers ${shown(stray)} for ${control.key}, but the watch's shared entry for ${control.key} holds ${count} choices, from 0 to ${count - 1}. A wearer who picks it gets the default back, so take the option off the page`);
    }
  });
}

/** Stops on a default on a counted key that is not a whole number below the count. */
function checkDefaultsCounted(face: string, counts: ChoiceCounts, reads: Map<string, ReadDefault[]>): void {
  reads.forEach((found, key) => {
    const value = found[0].read;

    if (!(key in counts) || (typeof value === 'number' && value >= 0 && value < counts[key])) {
      return;
    }

    throw new ToolError(`${face}'s settings page defaults ${key} to ${shown(value)}, but its choices run from 0 to ${counts[key] - 1}. The watch puts a choice past them back to its default, so it would put this one back and save it again on every launch. Make the default one of the choices`);
  });
}

/**
 * Stops on a plugin source default the face's own picker does not offer, or that the page does not
 * open on.
 *
 * The build writes each default from the providers list alone. The face's own picker, before the
 * list narrows it, has to offer it, or the watch starts on a source the page cannot show. The page
 * that opens has to default to it too, or a watch that never got a save sends back a choice the
 * phone would not make. Both compare without regard to case, as the phone's narrowing matches a
 * provider, so a picker whose option saves `OpenMeteo` offers openmeteo.
 */
function checkPluginDefaults(face: string, pages: CheckedPage[], reads: Map<string, ReadDefault[]>, textDefines: Record<string, string>): void {
  PLUGIN_KINDS.forEach((kind) => {
    const written = kind.defaultDefine ? textDefines[kind.defaultDefine] : undefined;
    const row = PROVIDERS.find((provider) => provider.plugin === kind);

    if (written === undefined || !kind.selectKey || !row) {
      return;
    }

    const source = `The build takes it from the first custom provider in providers.${row.kind}, or ${kind.pageDefault} with no list`;

    pages.forEach((page) => {
      readControls(page.given.clayConfig, page.platform).forEach((control) => {
        if (control.messageKey !== kind.selectKey || !CHOICE_TYPES.includes(control.type)) {
          return;
        }

        if (!control.options.some((option) => String(option).toLowerCase() === written.toLowerCase())) {
          throw new ToolError(`${face}'s own ${kind.selectKey} picker does not offer ${written}, which the watch starts on as its ${row.kind} source. ${source}. Offer ${written} in the picker, or list one it offers first in providers.${row.kind}`);
        }
      });
    });

    const opened = reads.get(kind.selectKey)?.[0].read;

    if (opened !== undefined && String(opened).toLowerCase() !== written.toLowerCase()) {
      throw new ToolError(`${face}'s settings page opens with ${kind.selectKey} on ${shown(opened)}, but the watch starts on "${written}" until the first save. ${source}, so list the providers in providers.${row.kind} with ${shown(opened)} first`);
    }
  });
}

/**
 * Stops the build on a page the watch or the phone would get wrong, naming the face and the fix.
 *
 * It refuses a control on a message key the appinfo does not declare, a request key the watch sends
 * that no feature answers, a choice whose default is not one of its options, a key whose controls
 * open on two defaults, a default for a KNOWN_* key that does not fit its field, a default on a
 * counted key past its count, and a plugin source default the face's own picker does not offer or the
 * page does not open on. A face with no settings page has no page to check, so it passes.
 *
 * @param face The face whose page it is, which a refusal names.
 * @param pages The page on each platform, as the phone opens it.
 * @param facts What pageFacts read from those pages, which the checks read rather than walking the pages again.
 * @param appinfo The message keys and the text defines, as the sandbox step checked them.
 */
export function checkPage(face: string, pages: CheckedPage[], facts: PageFacts, appinfo: AppinfoFacts): void {
  const declared = keyNames(appinfo.messageKeys);

  checkDeclared(face, facts.controls, declared);
  pages.forEach((page) => checkAnswered(face, page, declared));
  checkDefaultsListed(face, facts.controls);

  const reads = readsByKey(facts.controls);

  checkOneDefault(face, reads);
  checkKnownFields(face, reads);
  checkKnownOptions(face, facts.controls);
  checkDefaultsCounted(face, facts.counts, reads);
  checkPluginDefaults(face, pages, reads, appinfo.textDefines);
}

/**
 * A sandbox's fingerprint, which the waf build checks the header against.
 *
 * It is a sha256 over the sandbox's package.json and every file under its emit/, in order of their
 * paths from the sandbox with forward slashes, each as its path, a newline, its bytes, and a newline.
 * paf_build.py's sandbox_fingerprint works it out the same way, so a header written for another build
 * of the sandbox, such as one from before a phone build run on its own, stops the waf build rather
 * than counting a page that is no longer there.
 *
 * @param sandbox The sandbox's folder.
 * @return The fingerprint, as 64 hex digits.
 */
export function sandboxFingerprint(sandbox: string): string {
  const files: string[] = [];
  const walk = (dir: string): void => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        files.push(path.relative(sandbox, full).split(path.sep).join('/'));
      }
    });
  };

  if (fs.existsSync(path.join(sandbox, 'emit'))) {
    walk(path.join(sandbox, 'emit'));
  }

  if (fs.existsSync(path.join(sandbox, 'package.json'))) {
    files.push('package.json');
  }

  const hash = crypto.createHash('sha256');

  // sorted by their UTF-8 bytes, as Python sorts them
  files.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))).forEach((file) => {
    hash.update(`${file}\n`);
    hash.update(fs.readFileSync(path.join(sandbox, ...file.split('/'))));
    hash.update('\n');
  });

  return hash.digest('hex');
}

/**
 * The text of page/settings_page.h.
 *
 * The counts and then the defaults go in by key, so the same page writes the same header. The
 * fingerprint line ties the header to the sandbox it was written for, so it changes whenever the
 * sandbox's phone code does. The platforms line names where the page was counted, which the waf build
 * checks against the platforms it builds. A face with no settings page has no counts or defaults, so
 * its header names none.
 *
 * @param face The face the header is for.
 * @param facts What the build read from the page.
 * @param fingerprint The sandbox's fingerprint, from sandboxFingerprint.
 * @return The header's text.
 */
export function settingsPageHeader(face: string, facts: PageFacts, fingerprint: string): string {
  const counts = Object.keys(facts.counts).sort().map((key) => `#define SETTINGS_COUNT_${key} ${facts.counts[key]}\n`);
  const defaults = Object.keys(facts.defaults).sort().map((key) => `#define SETTINGS_DEFAULT_${key} ${facts.defaults[key]}\n`);

  return [
    `// written by paf build from ${face}'s settings page. never edit or commit it\n`,
    `// format: ${HEADER_FORMAT}\n`,
    `// sandbox fingerprint: ${fingerprint}\n`,
    ...(facts.platforms.length ? [`// counted on: ${facts.platforms.join(' ')}\n`] : []),
    '#pragma once\n',
    ...(counts.length ? ['\n', ...counts] : []),
    ...(defaults.length ? ['\n', ...defaults] : []),
  ].join('');
}

/**
 * Loads a sandbox's settings page once for each platform, each on a fresh phone.
 *
 * Each load gets a phone with no plugin calls and nothing saved, on that platform, and the host's own
 * globals come back after it, so the next load, and the next face, start clean. message_keys is stood
 * in only while the pages load.
 *
 * @param paths The paths for the sandbox, already compiled and filled.
 * @param messageKeys The face's message keys, as messageKeysOf gives them.
 * @param platforms The platforms to load the page for.
 * @param face The face the page belongs to, whose customClay is checked as it loads.
 * @return The page on each platform, or empty for a face with no settings page.
 */
export function loadOnPlatforms(paths: FacePaths, messageKeys: Record<string, number>, platforms: string[], face: string): PlatformPage[] {
  const restoreLoad = stubModuleLoad((id) => (id === 'message_keys' ? messageKeys : undefined));
  const pages: PlatformPage[] = [];

  try {
    for (const platform of platforms) {
      const restoreHost = installHost({ platform, settings: null }, null);

      try {
        // the compiled code keeps state of its own, such as the features' subscriptions, so each load
        // reads it afresh
        forgetCompiled(paths);

        const loaded = loadSettingsPage(paths, messageKeys, true, { face, checks: true, keysWhole: true });

        if (loaded === null) {
          return [];
        }

        pages.push({ ...loaded, platform });
      } finally {
        restoreHost();
      }
    }
  } finally {
    restoreLoad();
  }

  return pages;
}

/**
 * What a face's compiled phone code starts with, read before the sandboxes are written.
 *
 * @param face The face to read.
 * @param prepared What prepareFace read of the face.
 * @return Whether the face calls startPebbleApp and the keys its features need, or nothing for a face with no index.js.
 */
export function readFaceStart(face: string, prepared: PreparedFace): FaceStartFacts {
  return startFacts(facePaths(prepared.targets[0].name, face), face, prepared.baseKeys, platformsOf(prepared.appinfo));
}

/** How many times startFacts reads the start before it stops on keys that keep coming. */
const START_READS = 4;

/**
 * What a sandbox's compiled phone code starts with, on every platform it builds for.
 *
 * The face's index.js loads with startPebbleApp swapped for a recorder, as the page loader does, on a
 * fresh phone on each platform, with its timers held. Nothing starts, so no feature runs. Every call to
 * startPebbleApp counts, and so does every platform, so a feature passed on one watch alone still
 * brings its keys, and the face is started when any load calls it.
 *
 * A face can pass a feature only when one of its keys is there, which only that feature brings. So the
 * code is read again with the keys the last read found added, until a read finds nothing new. Each read
 * only adds keys, and the framework's features carry no more than a handful, so this settles within a
 * few reads. A face whose features bring new keys on every read is refused after START_READS, since the
 * build cannot say which features it ships.
 *
 * @param paths The paths for the sandbox, already compiled and filled.
 * @param face The face the code belongs to, which a refusal names.
 * @param messageKeys The keys before the features, the face's own and its defines', as fillAppinfo gives them.
 * @param platforms The platforms the face builds for.
 * @return Whether the face calls startPebbleApp and the keys its features need, or nothing for a sandbox with no index.js.
 */
export function startFacts(paths: FacePaths, face: string, messageKeys: unknown, platforms: string[]): FaceStartFacts {
  if (!fs.existsSync(path.join(paths.emitPkjs, 'index.js'))) {
    return NO_START;
  }

  const found: string[] = [];
  let keys = messageKeys;
  let started = false;

  for (let read = 0; read < START_READS; read++) {
    const calls = platforms.flatMap((platform) => startCalls(paths, face, messageKeysOf({ messageKeys: keys }), platform, read === 0));

    started = started || calls.length > 0;
    featureKeys(calls.flatMap((call) => call.features || [])).filter((key) => !found.includes(key)).forEach((key) => found.push(key));

    const next = withAddedKeys(keys, found, face);

    if (next === keys) {
      if (!started) {
        console.warn(`warning: ${face}'s phone code has an index.js that never calls startPebbleApp as it loads, so the build reads no features from it, adds none of their keys, and gives it no settings page. The call has to run as index.js loads, not later in a callback`);
      }

      return { started, featureKeys: found };
    }

    keys = next;
  }

  throw new ToolError(`${face}'s phone code passes features that bring new message keys each time the build reads it with the keys the last read found, and still did after ${START_READS} reads. Pass the features whatever keys the face has, or list the keys its code reads in messageKeys`);
}

/** Every startPebbleApp call the face's code makes on one platform, with the given keys stood in. */
function startCalls(paths: FacePaths, face: string, messageKeys: Record<string, number>, platform: string, firstRead: boolean): StartOptions[] {
  const restoreLoad = stubModuleLoad((id) => (id === 'message_keys' ? messageKeys : undefined));

  try {
    const restoreHost = installHost({ platform, settings: null }, null);
    const restoreTimers = holdTimers();

    try {
      forgetCompiled(paths);

      const app = requireHost(appModulePath(paths)) as AppModule;

      return captureStarts(app.default, () => loadFaceCode(face, path.join(paths.emitPkjs, 'index.js'), firstRead));
    } finally {
      restoreTimers();
      restoreHost();
    }
  } finally {
    restoreLoad();
  }
}

/**
 * Loads a face's settings page from its first target's compiled phone code, once for each platform.
 *
 * Every target's emit/ is a copy of the first's, so one sandbox serves them all. The features start and
 * their page hooks run, as they do on the phone, on a phone with no plugin calls and nothing saved. So a
 * face's page has to offer the same whole number choices whatever the phone has installed or saved.
 *
 * @param face The face whose page to load.
 * @param prepared What prepareFace read of the face.
 * @param messageKeys The message keys the sandboxes' manifests carry, from writeSandboxes.
 * @return The page on each platform the face targets, or empty for a face with no settings page.
 */
export function loadFacePage(face: string, prepared: PreparedFace, messageKeys: unknown): PlatformPage[] {
  return loadOnPlatforms(facePaths(prepared.targets[0].name, face), messageKeysOf({ messageKeys }), platformsOf(prepared.appinfo), face);
}

/**
 * The platforms the face builds for, which its page is counted on.
 *
 * The build hands the appinfo's targetPlatforms to the SDK as written, and the SDK builds every platform
 * it has when the list is missing or empty. So a face with no list is counted on every one of them.
 *
 * @param appinfo The face's pebble.appinfo.json, parsed.
 * @return The platforms, in the appinfo's order or the SDK's.
 */
export function platformsOf(appinfo: { targetPlatforms?: unknown }): string[] {
  const listed = Array.isArray(appinfo.targetPlatforms) ? appinfo.targetPlatforms.map(String) : [];

  return listed.length ? listed : [...PEBBLE_PLATFORMS];
}

/**
 * Writes page/settings_page.h into each of a face's sandboxes, each with its own fingerprint.
 *
 * The fingerprint is worked out last, once the sandbox's package.json and emit/ are written.
 *
 * @param face The face the header is for.
 * @param targets The face's targets, each a sandbox.
 * @param facts What the build read from the page.
 */
export function writeSettingsPage(face: string, targets: string[], facts: PageFacts): void {
  targets.forEach((target) => {
    const sandbox = facePaths(target, face).sandbox;
    const file = path.join(sandbox, PAGE_HEADER);

    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, settingsPageHeader(face, facts, sandboxFingerprint(sandbox)));
  });
}

/**
 * The one line that says what the build read from a face's page.
 *
 * @param face The face that was read.
 * @param loaded Whether the face has a settings page.
 * @param facts What the build read from it.
 * @return The line.
 */
export function describePage(face: string, loaded: boolean, facts: PageFacts): string {
  if (!loaded) {
    return `${face} has no settings page, so ${PAGE_HEADER.split(path.sep).join('/')} holds no counts or defaults`;
  }

  const count = Object.keys(facts.counts).length;
  const defaults = Object.keys(facts.defaults).length;

  return `read ${face}'s settings page and wrote ${count} choice count${count === 1 ? '' : 's'} and ${defaults} default${defaults === 1 ? '' : 's'} into ${PAGE_HEADER.split(path.sep).join('/')}`;
}
