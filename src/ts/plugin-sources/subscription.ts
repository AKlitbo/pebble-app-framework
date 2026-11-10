/**
 * One live Pebble app plugin subscription for a feature, and what it saves for the settings page.
 *
 * A subscription lasts as long as the phone's JS session, so each `ready` starts it afresh. It
 * subscribes without naming a plugin, so the phone routes it to the one the wearer prefers in the
 * Pebble app. Every update and error is saved in localStorage, so the settings page can tell which
 * plugin answered last and what went wrong.
 *
 * The phone side is someone else's code, so nothing it does is allowed to throw past this unit. A
 * plugin list it cannot read says nothing about what is installed, so the unit subscribes anyway and
 * leaves the phone to route the request. Only a real list with nothing serving the item, a missing
 * subscribe call, or a subscribe that throws or hands back no handle reads as no plugin. That way a
 * phone that misbehaves cannot take the refresh timer or another feature down with it.
 */

import { servesItem } from './standard';
import type { PluginSummary, SourceEnvelope, SourceError, SourceState, SourceSubscription, SubscriptionOptions } from './types';

/** The code a subscription reports itself when no installed plugin serves its item. */
export const NO_PLUGIN = 'noPlugin';

/**
 * The error codes after which the phone has ended the subscription itself, so nothing more arrives
 * until it is started again. The phone sends `PLUGIN_UNAVAILABLE` at subscribe time when nothing
 * serves the item, and returns before starting. An error raised while one runs, such as
 * `PERMISSION_DENIED` before the wearer allows Location, leaves it running and data follows once
 * the wearer allows it.
 *
 * `PERMISSION_DENIED` also ends the job in two rare cases, an app the phone thinks is not installed
 * and a legacy caller. It is treated as live anyway, since the common case keeps running, and a later
 * `ready` starts afresh. `INVALID_REQUEST` ends it too but is left off, since a retry sends the same
 * request and fails the same way.
 */
export const ENDING_CODES: readonly string[] = ['PLUGIN_UNAVAILABLE'];

/**
 * How often an idle unit in plugin mode tries again on its own, in milliseconds. A plugin the wearer
 * has just installed or turned on then shows up within minutes rather than at the slow tick. Reading
 * the phone's plugin list is a local call, so a retry costs nothing on the network.
 */
export const QUICK_RETRY_MS = 2 * 60 * 1000;

/**
 * How long the quick retry runs, in milliseconds, before it stops and leaves the slow tick to carry
 * on. The quick retry is there to catch a plugin the wearer is setting up right now. With plugins
 * left off, or a Pebble app from before plugins, it would otherwise wake PebbleKit JS every two
 * minutes for the whole session. A start, a save while the plugin is picked, and opening the
 * settings page each give it the full time again. Its own retries do not.
 *
 * The window is counted in retries, 15 of them, and a retry is only spent while the unit sits idle.
 * So a subscription that goes live and ends hours later, such as when the wearer turns plugins off,
 * still has its 30 minutes of quick retries left then. That costs at most 15 more reads of the
 * phone's plugin list, all local. It is worth it because it catches the wearer turning plugins back
 * on within minutes rather than at the next slow tick.
 */
export const QUICK_RETRY_WINDOW_MS = 30 * 60 * 1000;

// what the settings page reads before anything has been saved
const EMPTY_STATE: SourceState = { pluginUuid: null, lastError: null, lastEmpty: false };

// the idle subscriptions waiting on the quick retry, each by the retry it runs on a tick. they share
// one timer, so a face with several plugin kinds wakes PebbleKit JS once every two minutes rather
// than once for each kind at its own moment
const waitingOnTick = new Set<() => void>();
let sharedTick: ReturnType<typeof setInterval> | null = null;

/** Runs each waiting subscription's retry once. A copy is walked, since a retry can leave the set. */
function runTick(): void {
  [...waitingOnTick].forEach((retry) => {
    // one subscription's throw must not cost the others their retry
    try {
      retry();
    } catch (error) {
      console.error('plugin source: a quick retry threw', error);
    }
  });
}

/** Adds a subscription's retry to the shared tick, starting the timer for the first one. */
function joinTick(retry: () => void): void {
  waitingOnTick.add(retry);

  if (sharedTick === null) {
    sharedTick = setInterval(runTick, QUICK_RETRY_MS);
  }
}

/** Takes a subscription's retry off the shared tick, stopping the timer once none is left. */
function leaveTick(retry: () => void): void {
  waitingOnTick.delete(retry);

  if (waitingOnTick.size === 0 && sharedTick !== null) {
    clearInterval(sharedTick);
    sharedTick = null;
  }
}

/**
 * Stops the shared quick retry tick and forgets every subscription waiting on it.
 *
 * Nothing on the phone calls it, since a JS session ends with its timers. The specs call it between
 * runs, so a subscription one spec left idle cannot retry against the next spec's phone, or hold a
 * timer made on a fake clock that no longer runs.
 */
export function resetQuickRetryTick(): void {
  waitingOnTick.clear();

  if (sharedTick !== null) {
    clearInterval(sharedTick);
    sharedTick = null;
  }
}

/** The global bridge, or undefined where there is none, such as a spec with no fake. */
function bridge(): PebbleBridge | undefined {
  return typeof Pebble === 'undefined' ? undefined : Pebble;
}

/** Runs a feature's callback, logging a throw so it never escapes into the bridge or the refresh tick. */
function callFeature(label: string, callback: () => void): void {
  try {
    callback();
  } catch (error) {
    console.error(`plugin source: ${label} threw`, error);
  }
}

/** Whether the phone handed back something that can be ended, which is what a started subscription gives. */
function isHandle(handle: unknown): boolean {
  return Boolean(handle) && typeof handle === 'object' && typeof (handle as { unsubscribe?: unknown }).unsubscribe === 'function';
}

/** Ends one handle the phone gave back, logging a throw rather than passing it on. */
function unsubscribe(handle: unknown): void {
  if (!isHandle(handle)) {
    return;
  }

  try {
    (handle as { unsubscribe(): void }).unsubscribe();
  } catch (error) {
    console.error('plugin source: unsubscribe threw', error);
  }
}

/** Puts an error from the phone in one shape, whatever it sent. */
function readError(raw: unknown): SourceError {
  const fields = raw && typeof raw === 'object' ? (raw as { code?: unknown; message?: unknown }) : {};

  return {
    code: typeof fields.code === 'string' && fields.code ? fields.code : 'UNKNOWN',
    message: typeof fields.message === 'string' ? fields.message : '',
  };
}

/** Reads the state out of the store, or the empty one when there is none or the store throws. */
function readStored(storageKey: string): SourceState {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) as string);

    if (!saved || typeof saved !== 'object') {
      return { ...EMPTY_STATE };
    }

    return {
      pluginUuid: typeof saved.pluginUuid === 'string' ? saved.pluginUuid : null,
      lastError: typeof saved.lastError === 'string' ? saved.lastError : null,
      lastEmpty: saved.lastEmpty === true,
    };
  } catch (error) {
    return { ...EMPTY_STATE };
  }
}

/**
 * Makes the one subscription a feature holds for a category and item.
 *
 * Nothing subscribes until `start()`. From then the unit is in plugin mode until `stop()`, and the
 * slow tick's `retryIfIdle()` starts it again whenever the phone has ended it or never started it.
 * While it sits idle in plugin mode it also tries again every `QUICK_RETRY_MS` on its own, until a
 * subscription is live or `stop()` is called. It has `QUICK_RETRY_WINDOW_MS` of such retries from
 * a start or a `retrySoon()`, spent only while it sits idle, so a subscription that ends long after
 * it went live still gets its quick retries then. With `quickRetry: false` it never retries on its
 * own, and tries again only when the slow tick or a `retrySoon()` asks.
 *
 * Every idle subscription shares one quick retry timer, which runs while any of them has retries
 * left and stops when none has. Each keeps its own window.
 *
 * @param options The category and item, the properties the feature reads, where updates and errors
 *   go, and whether the quick retry runs.
 * @return The subscription, idle until started.
 */
export function createSourceSubscription(options: SubscriptionOptions): SourceSubscription {
  const { category, item, properties, onUpdate, onError } = options;

  // a unit with the quick retry off only retries when asked, by the slow tick or a retrySoon
  const quickRetryOn = options.quickRetry !== false;
  const storageKey = `pluginSource:${category}/${item}`;

  // in plugin mode, from start() until stop()
  let wanted = false;
  let running = false;
  let handle: unknown = null;
  let latestUpdate: SourceEnvelope | null = null;

  // moves on with every subscribe and every end, so a callback from a subscription that has since
  // been replaced or ended is dropped even when the phone delivers it anyway
  let generation = 0;

  // the feature has heard no plugin since the last start, so a slow tick that finds the same again
  // stays quiet rather than handing the feature one error per tick. an explicit start always
  // reports, since a later ready is how a feature hears to resend its status to a rebooted watch
  let reportedNoPlugin = false;

  // the state as last saved, read from the store once and kept here after
  let savedState: SourceState | null = null;

  // how many quick retries are left in the window. a start, a save onto the plugin, and a page open
  // fill it again
  let quickRetriesLeft = 0;

  // the ending code the feature has heard since the last start or update, so a retry that the phone
  // ends with the same code again stays quiet rather than handing the feature one error per retry
  let reportedEnding: string | null = null;

  /** The state as last saved, read from the store the first time it is asked for. */
  function loadState(): SourceState {
    if (!savedState) {
      savedState = readStored(storageKey);
    }

    return savedState;
  }

  /**
   * Saves a change to the state. A change that moves nothing writes nothing. A store that throws
   * costs only the state, and the kept copy stays on what was last saved, so the next change tries
   * the write again.
   */
  function saveState(change: Partial<SourceState>): void {
    const before = loadState();
    const after = { ...before, ...change };

    if (after.pluginUuid === before.pluginUuid && after.lastError === before.lastError && after.lastEmpty === before.lastEmpty) {
      return;
    }

    try {
      localStorage.setItem(storageKey, JSON.stringify(after));
      savedState = after;
    } catch (error) {
      console.log('plugin source: could not save the state');
    }
  }

  /**
   * Saves an error and hands it to the feature. An ending code the feature has already heard since
   * the last start or update is saved and not handed on again.
   */
  function report(error: SourceError): void {
    const ending = ENDING_CODES.includes(error.code);

    saveState({ lastError: error.code });

    if (ending && error.code === reportedEnding) {
      return;
    }

    reportedEnding = ending ? error.code : null;
    callFeature('onError', () => onError(error));
  }

  /**
   * Goes idle with nothing serving the item. The kept update goes, so a unit change cannot put a
   * gone plugin's reading back on the watch, and the saved plugin and empty flag go with it. The
   * feature hears it on every start, and once across the slow tick's retries after it.
   */
  function noPlugin(message: string): void {
    latestUpdate = null;
    saveState({ pluginUuid: null, lastError: NO_PLUGIN, lastEmpty: false });

    if (reportedNoPlugin) {
      return;
    }

    reportedNoPlugin = true;
    reportedEnding = null;
    callFeature('onError', () => onError({ code: NO_PLUGIN, message }));
  }

  /** Ends the live subscription, if there is one, and leaves plugin mode as it is. */
  function end(): void {
    generation++;
    running = false;

    const ending = handle;

    handle = null;
    unsubscribe(ending);
  }

  /**
   * One quick retry, run by the shared tick. It spends a retry from the window and tries again.
   *
   * It passes quiet, the same as the slow tick's retry, so a no plugin or an ending code already
   * heard is not reported again every two minutes.
   */
  function quickRetry(): void {
    quickRetriesLeft--;

    if (wanted && !running) {
      begin(true);
    }

    followQuickRetry();
  }

  /**
   * Keeps the unit on the shared tick while it is in plugin mode with nothing live and retries left in
   * the window, and takes it off otherwise. It is the one place the unit joins or leaves the tick, and
   * joining twice leaves it on once, so a start or a retry that finds the unit idle again changes
   * nothing.
   *
   * A unit that joins a tick already running gets its first retry at that tick's next beat, which can
   * come sooner than two minutes after it went idle. That costs at most one read of the phone's plugin
   * list a little early, which is local, and it keeps a face with several plugin kinds on one timer.
   */
  function followQuickRetry(): void {
    if (!wanted || running || quickRetriesLeft <= 0) {
      leaveTick(quickRetry);
      return;
    }

    joinTick(quickRetry);
  }

  /**
   * Gives the quick retry its whole window again, and starts it if the unit sits idle in plugin mode.
   * With the quick retry off the window stays empty, so no timer ever starts.
   */
  function openRetryWindow(): void {
    quickRetriesLeft = quickRetryOn ? Math.round(QUICK_RETRY_WINDOW_MS / QUICK_RETRY_MS) : 0;
    followQuickRetry();
  }

  /** Starts again only while in plugin mode with nothing live. */
  function retryIdle(): void {
    if (wanted && !running) {
      begin(true);
      followQuickRetry();
    }
  }

  /** Keeps an update, saves what the page reads off it, and hands it to the feature. */
  function received(raw: unknown): void {
    if (!raw || typeof raw !== 'object') {
      console.log('plugin source: dropped an update that was not an object');
      return;
    }

    const envelope = raw as SourceEnvelope;
    const instances = Array.isArray(envelope.instances) ? envelope.instances : [];
    const change: Partial<SourceState> = { lastError: null, lastEmpty: instances.length === 0 };

    // an update with no uuid says nothing about who answered, so the saved one stays
    if (typeof envelope.pluginUuid === 'string') {
      change.pluginUuid = envelope.pluginUuid;
    }

    latestUpdate = envelope;
    reportedEnding = null;
    // an update means whatever went wrong before has cleared, so the page stops warning about it
    saveState(change);
    callFeature('onUpdate', () => onUpdate(envelope));
  }

  /** Saves an error and hands it on, going idle when the phone has ended the subscription. */
  function failed(raw: unknown): void {
    const error = readError(raw);

    // the plugin may come back, so its uuid stays saved, but its last reading is not kept
    if (ENDING_CODES.includes(error.code)) {
      end();
      latestUpdate = null;
      followQuickRetry();
    }

    report(error);
  }

  /** Reads the plugin list, or null for a missing call, a throw, or a reply that is not a list. */
  function readList(): PluginSummary[] | null {
    const host = bridge();

    if (!host || typeof host.enumeratePlugins !== 'function') {
      return null;
    }

    try {
      const list = host.enumeratePlugins();

      return Array.isArray(list) ? list.filter((entry) => entry && typeof entry === 'object') : null;
    } catch (error) {
      console.log('plugin source: could not list the plugins');
      return null;
    }
  }

  /**
   * Ends any live subscription, then subscribes again. A list saying nothing serves the item stops it
   * there. A list the phone will not give leaves the phone to route the request. A retry passes
   * quiet, so a no plugin the feature already heard since the last start is not reported again.
   */
  function begin(quiet: boolean): void {
    if (!quiet) {
      reportedNoPlugin = false;
      reportedEnding = null;
    }

    end();
    wanted = true;

    const host = bridge();
    const list = readList();

    if (list && !servesItem(list, category, item)) {
      noPlugin(`no plugin serves ${category}/${item}`);
      return;
    }

    if (!host || typeof host.subscribeToSource !== 'function') {
      noPlugin('the phone has no subscribe call');
      return;
    }

    const mine = ++generation;
    let returned: unknown;

    // live from before the call, so an ending error the phone hands back during it still ends it
    running = true;

    try {
      returned = host.subscribeToSource({
        category,
        item,
        properties,
        onData: (envelope: unknown) => {
          if (mine === generation) {
            received(envelope);
          }
        },
        onError: (error: unknown) => {
          if (mine === generation) {
            failed(error);
          }
        },
      });
    } catch (error) {
      generation++;
      running = false;
      noPlugin('the subscribe call threw');
      return;
    }

    // ended while the call ran, so the handle it gave back is ended too
    if (mine !== generation) {
      unsubscribe(returned);
      return;
    }

    // no handle means the phone never started one, and reading it as live would leave the slow
    // tick with nothing to retry
    if (!isHandle(returned)) {
      generation++;
      running = false;
      noPlugin('the subscribe call gave back no handle');
      return;
    }

    handle = returned;
    reportedNoPlugin = false;
  }

  return {
    start(): void {
      begin(false);
      openRetryWindow();
    },

    stop(): void {
      end();
      wanted = false;
      latestUpdate = null;
      reportedNoPlugin = false;
      reportedEnding = null;
      followQuickRetry();
    },

    retrySoon(): void {
      if (quickRetryOn) {
        openRetryWindow();
      } else {
        retryIdle();
      }
    },

    retryIfIdle(): void {
      retryIdle();
    },

    latest(): SourceEnvelope | null {
      return latestUpdate;
    },

    live(): boolean {
      return running;
    },

    /**
     * The plugin list, or null when the phone has the list call but its answer cannot be read. A
     * phone without the call at all has no plugins to list, so it reads as an empty list.
     */
    plugins(): PluginSummary[] | null {
      const host = bridge();

      if (!host || typeof host.enumeratePlugins !== 'function') {
        return [];
      }

      return readList();
    },

    state(): SourceState {
      return { ...loadState() };
    },
  };
}

export default { createSourceSubscription, ENDING_CODES, NO_PLUGIN, QUICK_RETRY_MS, QUICK_RETRY_WINDOW_MS };
