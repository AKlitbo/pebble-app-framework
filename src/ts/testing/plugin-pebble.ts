/**
 * A stand-in for a plugin app's `Pebble`, the plugin runtime's, for specs of pins and actions.
 *
 * It keeps the timeline the plugin built, by id, and every pin call handed to it in order, so a spec
 * can check both what is on the watch and what was sent. The Pebble app answers a pin call with
 * nothing and drops a pin it refuses, such as one with no `Timeline` grant, without a word. `dropped`
 * plays that, and is the failure to spec against. `throw`, `reject`, and `missing` are for checking a
 * plugin holds up when a call does something the Pebble app does not do today, or is not there, as
 * on a Pebble app from before 1.18.0.
 *
 * `invoke` runs the registered action handler the way the watch does when the wearer picks a
 * `pluginAction`, and resolves to its first answer, however late it comes. Later answers are ignored,
 * as the Pebble app ignores them, and a handler that throws or rejects before answering is answered
 * `UNKNOWN` with the error as text. A handler that never answers is left to the spec's own timeout.
 *
 * The source and settings calls are here so the fake stands in for the whole `Pebble`. A read of a
 * source rejects with `PLUGIN_UNAVAILABLE`, and `secureStorage` keeps what it is given.
 */

import type { ActionRequest, ActionResponder, ActionResult, PluginPebble } from '../plugin-app/runtime';
import type { PluginNotification, TimelinePin } from '../plugin-app/timeline';

/**
 * How the pin calls behave. `kept` puts each pin on the timeline. `dropped` takes the call and keeps
 * nothing, as the Pebble app does with a pin it refuses. `throw`, `reject`, and `missing` fail the
 * call outright, or leave the calls out.
 */
export type PinCallMode = 'kept' | 'dropped' | 'throw' | 'reject' | 'missing';

/** What a spec can start the fake with. */
export interface FakePluginPebbleOptions {
  /** How the pin calls behave. `kept` unless a spec says otherwise. */
  pins?: PinCallMode;
  /** What `throw` and `reject` fail with. The error a pin that cannot be turned into JSON throws, unless a spec says otherwise. */
  pinError?: unknown;
}

/** The one answer an action gave. */
export type ActionAnswer = { ok: ActionResult } | { error: { code: string; message?: string } };

/** The fake, with what it kept for the spec to check. */
export interface FakePluginPebble {
  /** The `Pebble` to hand the plugin. */
  pebble: PluginPebble;
  /** The pins on the timeline now, by id. */
  timeline: Map<string, TimelinePin>;
  /** Every pin call the Pebble app took, kept or dropped, in order. */
  calls: Array<{ call: 'insert'; pin: TimelinePin } | { call: 'delete'; id: string }>;
  /** Every notification shown. */
  notifications: PluginNotification[];
  /** The sources the plugin asked to be read again. */
  refreshed: string[][];
  /**
   * Runs the action handler with an action and its arguments, as picking a `pluginAction` does, and
   * resolves to its first answer. Rejects when no handler is registered.
   */
  invoke(action: string, args?: Record<string, unknown>): Promise<ActionAnswer>;
}

/**
 * Makes the fake.
 *
 * @param options How the pin calls behave.
 * @return The fake and what it keeps.
 */
export function fakePluginPebble(options: FakePluginPebbleOptions = {}): FakePluginPebble {
  const mode = options.pins || 'kept';
  const pinError = options.pinError === undefined ? new TypeError('Converting circular structure to JSON') : options.pinError;
  const timeline = new Map<string, TimelinePin>();
  const calls: FakePluginPebble['calls'] = [];
  const notifications: PluginNotification[] = [];
  const refreshed: string[][] = [];
  const secrets = new Map<string, string>();
  let actionHandler: ((request: ActionRequest, respond: ActionResponder) => void | Promise<void>) | null = null;

  /** Runs one pin call the way the mode says. The record comes first, and the timeline changes only when kept. */
  function pinCall(record: () => void, keep: () => void): unknown {
    if (mode === 'throw') {
      throw pinError;
    }

    if (mode === 'reject') {
      return Promise.reject(pinError);
    }

    record();

    if (mode === 'kept') {
      keep();
    }

    return undefined;
  }

  const pebble: PluginPebble = {
    registerSourceHandler() {},
    registerConfigHandler() {},
    registerActionHandler(handler) {
      actionHandler = handler;
    },
    subscribeSource() {},
    readSource: () => Promise.reject(Object.assign(new Error('no plugin serves it'), { code: 'PLUGIN_UNAVAILABLE' })),
    refreshSources(sources) {
      refreshed.push([...sources]);
    },
    secureStorage: {
      getItem: async (key) => (secrets.has(key) ? (secrets.get(key) as string) : null),
      setItem: async (key, value) => void secrets.set(key, value),
      removeItem: async (key) => void secrets.delete(key),
    },
  };

  if (mode !== 'missing') {
    pebble.insertTimelinePin = (pin) => pinCall(() => calls.push({ call: 'insert', pin }), () => timeline.set(pin.id, pin));
    pebble.deleteTimelinePin = (id) => pinCall(() => calls.push({ call: 'delete', id }), () => timeline.delete(id));

    pebble.showNotification = (notification) => {
      notifications.push(notification);
    };
  }

  function invoke(action: string, args: Record<string, unknown> = {}): Promise<ActionAnswer> {
    const handler = actionHandler;

    if (!handler) {
      return Promise.reject(new Error('the plugin registered no action handler'));
    }

    return new Promise((resolve) => {
      let answered = false;

      function answer(given: ActionAnswer) {
        if (!answered) {
          answered = true;
          resolve(given);
        }
      }

      function failed(error: unknown) {
        answer({ error: { code: 'UNKNOWN', message: String(error) } });
      }

      const respond: ActionResponder = {
        ok: (result) => answer({ ok: result || {} }),
        error: (code, message) => answer({ error: message === undefined ? { code } : { code, message } }),
      };

      try {
        const running = handler({ action, args }, respond);

        if (running && typeof running.then === 'function') {
          running.then(undefined, failed);
        }
      } catch (error) {
        failed(error);
      }
    });
  }

  return { pebble, timeline, calls, notifications, refreshed, invoke };
}
