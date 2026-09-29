/**
 * What a feature gets from the app, and what it hands back.
 *
 * A feature is a part of the phone runtime that only some faces use, such as weather, stocks, or the
 * calendar. A face opts in by passing it to startPebbleApp. A face that does not never imports it, so
 * its code and the libraries behind it stay out of that face's bundle.
 */

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
  /** A message arrived from the watch. */
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
}

/** A feature. The app starts it once with its context, and it returns the hooks the app calls. */
export type Feature = (context: FeatureContext) => FeatureHooks;
