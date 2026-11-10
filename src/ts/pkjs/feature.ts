/**
 * What a feature gets from the app, and what it hands back.
 *
 * A feature is a part of the phone runtime that only some faces use, such as weather, stocks, or the
 * calendar. A face opts in by passing it to startPebbleApp. A face that does not never imports it, so
 * its code and the libraries behind it stay out of that face's bundle.
 */

import type { ClayConfigItem } from '../clay/types';

/**
 * The providers a face offers for each kind of data, by kind, such as `{ weather: ['plugin'] }`. A
 * kind left out offers every provider the framework has for it.
 */
export type ProviderLists = Partial<Record<string, readonly string[]>>;

/** What the app shares with every feature it starts. */
export interface FeatureContext {
  /** The face's message keys, by name. A key the face does not declare reads as undefined. */
  messageKeys: Record<string, number>;
  /** The defaults declared in the face's Clay config, by message key. */
  defaults: Record<string, unknown>;
  /** Sends a dict to the watch through the one queue every send shares. */
  queueSend: (dict: AppMessageDict, onOk?: () => void, onFail?: () => void) => void;
  /** How long after the settings page closes a changed setting waits before it refetches. */
  refetchDelayMs: number;
  /**
   * The providers the face lists, or null for a face that lists none. It holds the lists that change
   * something on the phone: weather and stocks, and the calendar when its list is `['plugin']`. A
   * weather list of `['plugin']` runs the weather from a Pebble app plugin alone.
   */
  providers: ProviderLists | null;
}

/** The moments in the app's life a feature can act on. Every hook is optional. */
export interface FeatureHooks {
  /**
   * The watch's request keys this feature answers, by name, such as WEATHER_REQUEST. The app logs
   * one warning for a request no listed feature answers, which is how a face that declares a
   * feature's keys but never opted into it finds out.
   */
  requests?: string[];
  /** PebbleKit JS is ready, and the settings request has gone out. */
  ready?(): void;
  /** The watch turned away every settings request since the last ready, so no settings reply comes until the next ready asks again. */
  settingsUnanswered?(): void;
  /**
   * A message arrived from the watch. Each key the face declares can be read by its number, whichever
   * way the phone keyed it.
   */
  message?(payload: Record<string, number | string>): void;
  /**
   * The background refresh ticked. slow is true on the less frequent ticks, the ones meant for data
   * that changes slowly, such as weather.
   */
  refresh?(slow: boolean): void;
  /** The settings page is about to open, while the old settings are still the saved ones. */
  configOpened?(): void;
  /** The settings page closed and its new settings are saved. */
  configSaved?(): void;
  /**
   * Changes the settings page just before it opens, such as adding a choice only this phone can offer.
   *
   * It runs every time the page opens, after configOpened. It gets its own copy of the face's page,
   * or of the page the features before it handed back, and returns the page to open. It can change
   * the copy it is given and hand that back. It keeps nothing from one open to the next, since each
   * open starts again from the face's own page, which the defaults and the settings restore also
   * read. A throw skips this hook alone, and the page opens with what the hooks before it made.
   *
   * @param config The settings page so far.
   * @return The settings page to open.
   */
  page?(config: ClayConfigItem[]): ClayConfigItem[];
  /**
   * The Clay components the page hook's rows are drawn with, such as the plugin sources' note. The app
   * registers each one before the page opens when the page holds a row of its type, and takes it off
   * again on an open whose page holds none. A feature that brings them keeps them out of the bundle
   * of any face that never uses the feature.
   */
  components?: unknown[];
  /**
   * Fixes up the settings the phone just took back from the watch, before they are saved.
   *
   * It runs when the phone fills its saved settings from what the watch sends back, such as after the
   * Pebble app is reinstalled. The seed copies each setting the face's own page has a row for. This
   * hook can set one the page has no row for, or put back a value that no longer makes sense on this
   * phone. It changes the settings it is given, and everything it sets is saved. A throw skips this
   * hook alone, and the settings are still saved.
   *
   * @param config The settings about to be saved, by name. Change them in place.
   * @param echoed Reads one setting, by name, as the raw value the watch sent back, or undefined when
   *   it sent none. Nothing is converted, so a select comes back as the number or the text it was sent
   *   as, and a toggle as 0 or 1. The plugin source fields are text, so a hook compares them as text.
   */
  seeded?(config: Record<string, unknown>, echoed: (name: string) => unknown): void;
}

/** A feature. The app starts it once with its context, and it returns the hooks the app calls. */
export type Feature = {
  (context: FeatureContext): FeatureHooks;
  /**
   * The message keys the feature cannot run without, such as the four weather keys. paf build reads
   * them from the compiled phone code and adds each one the face does not list to its messageKeys,
   * after the face's own, so a face that passes the feature never lists them. Left out, it needs none.
   */
  messageKeys?: readonly string[];
};
