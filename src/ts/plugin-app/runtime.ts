/**
 * The Pebble app's plugin runtime, as a plugin app's script sees it.
 *
 * A plugin app's script runs in the Pebble app's plugin runtime rather than PebbleKit JS, so its
 * `Pebble` has another set of calls. A face's `Pebble` is declared as a global for the phone code, and
 * a second global of the same name would clash with it wherever both are checked together. So these
 * are types, reached through `pluginPebble()`, rather than a global declaration. The settings page has
 * a bridge of its own, which page.ts declares itself, since it runs on the page as text.
 *
 * Only the calls the framework's plugin app helpers use, and the ones a plugin's source handler needs
 * for them, are described here. Core's plugin guide has the rest. `failureReason` gives the words for
 * why a read failed, the same from every helper that reads a source.
 */

import type { SourceEnvelope, SourceInstance } from '../plugin-sources/types';
import type { PluginNotification, TimelinePin } from './timeline';

/** What a source handler is asked for, and what a plugin passes to read another plugin's source. */
export interface SourceRequest {
  category: string;
  item: string;
  /** Another plugin's uuid, to read that plugin rather than the wearer's preferred one. */
  plugin?: string;
  properties?: string[];
  iconPixelSize?: { w: number; h: number };
  /** The most instances the caller wants back, from 1 to `SOURCE_LIMIT_MAX` in ts/plugin-app/source-limit.ts. A source that caps its own count lets this raise it. */
  limit?: number;
  /** What made the Pebble app run the handler again, when a source it reads changed. */
  trigger?: unknown;
}

/** How a source handler answers. */
export interface SourceResponder {
  data(envelope: { validUntilMs?: number; instances: SourceInstance[] }): void;
  error(code: string, message?: string): void;
}

/** What an action handler is asked: the action's name and its arguments. */
export interface ActionRequest {
  action: string;
  args: Record<string, unknown>;
}

/**
 * What an action answers when it worked. The Pebble app turns down an answer with a field of the
 * wrong type as `UNKNOWN`, "malformed plugin response".
 */
export interface ActionResult {
  /** The words the watch shows, or the caller reads. Left out, the watch shows `Done`. */
  text?: string;
  /** A short result for an app that invoked the action, as text. */
  semanticResult?: string;
  /** The sources the action changed, such as `calendar/event`, which the Pebble app reads again straight away. */
  refreshed?: string[];
}

/**
 * How an action handler answers. The Pebble app takes the first answer and ignores any after it,
 * waits 20 seconds for one, and ends the plugin's run as soon as it has one. A handler that throws or
 * rejects before answering is answered `UNKNOWN` with the error as text.
 */
export interface ActionResponder {
  ok(result?: ActionResult): void;
  /** An error code, such as `INVALID_REQUEST`, `INVALID_ARGS`, `AUTH_REQUIRED`, or `UNKNOWN`. */
  error(code: string, message?: string): void;
}

/** The plugin's own encrypted storage, which only the plugin can read and which goes when the app is removed. */
export interface SecureStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** A plugin app script's `Pebble`. */
export interface PluginPebble {
  registerSourceHandler(handler: (request: SourceRequest, respond: SourceResponder) => void | Promise<void>): void;
  registerConfigHandler(handler: (message: unknown, respond: (reply: unknown) => void) => void | Promise<void>): void;
  subscribeSource(request: SourceRequest): void;
  readSource(request: SourceRequest): Promise<SourceEnvelope>;
  refreshSources(sources: string[]): void;
  registerActionHandler(handler: (request: ActionRequest, respond: ActionResponder) => void | Promise<void>): void;
  /**
   * Hands a pin to the Pebble app, to put on the timeline or to change the one with its id. It answers
   * nothing and never rejects. A pin the plugin has no `Timeline` grant for, or one that does not parse,
   * is dropped without a word, so a pin handed over is not a pin on the watch. It throws only when the
   * pin cannot be turned into JSON. Left out on a Pebble app from before 1.18.0. `insertPin` in
   * ts/plugin-app/timeline.ts calls it safely.
   */
  insertTimelinePin?(pin: TimelinePin): unknown;
  /** Hands the Pebble app a pin id to take off the timeline. An unknown id is dropped without a word. Left out as `insertTimelinePin` is. */
  deleteTimelinePin?(id: string): unknown;
  /**
   * Shows a notification on the watch, with a pin's layout and actions. Needs `ShowNotifications`, and
   * answers nothing. Left out as `insertTimelinePin` is.
   */
  showNotification?(notification: PluginNotification): unknown;
  secureStorage: SecureStorage;
  /**
   * Asks whether one of the plugin's own permissions works right now, taking it as the appinfo declares
   * it, such as `Timeline` or `Internet/finnhub.io`. It answers `granted` when using it will work,
   * `prompt` when the wearer has to allow it first in the Pebble app, and `denied` when the wearer
   * turned it off. It does not count as using the permission, and the answer can change without the
   * wearer doing anything. Left out on a Pebble app too old to have it.
   */
  permissions?: { query(permission: string): Promise<string> };
}

/**
 * The plugin runtime's `Pebble`, typed for a plugin app's script.
 *
 * @return The runtime's `Pebble`.
 */
export function pluginPebble(): PluginPebble {
  return (globalThis as unknown as { Pebble: PluginPebble }).Pebble;
}

/** The reason a failed read gives when the runtime named none. */
export const NO_REASON = 'NO_REASON';

/**
 * A code that names something, as the runtime gives one: a string with words in it, trimmed, or a
 * number other than 0 that is finite, as its digits. Anything else names nothing.
 *
 * @param value The code, which may be anything.
 * @return The code as text, or undefined when it names nothing.
 */
export function namedCode(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value) && value !== 0) {
    return String(value);
  }

  return undefined;
}

/**
 * The words for why a read of a source failed, as the plugin runtime gave them, such as
 * `PERMISSION_DENIED`. It is the text the framework's own reads give, for a plugin app that reads
 * sources of its own and wants a refusal to read the same.
 *
 * The code wins, then the message. A blank one names nothing, and so does a numeric code of 0 or one
 * that is not a finite number, so the message after it wins. A failure that names neither reads as
 * `NO_REASON` rather than as the text of an object.
 *
 * @param error What the read threw or rejected with, which may be anything.
 * @return The reason, never empty.
 */
export function failureReason(error: unknown): string {
  const failure = error && typeof error === 'object' ? (error as { code?: unknown; message?: unknown }) : null;
  const candidates = failure ? [failure.code, failure.message] : [error];

  // the code wins, then the message, each only when it says something, so a blank code never hides a
  // real message. a code given as a number reads as itself, unless it is 0 or not a real number
  for (const candidate of candidates) {
    const named = namedCode(candidate);

    if (named !== undefined) {
      return named;
    }
  }

  return NO_REASON;
}
