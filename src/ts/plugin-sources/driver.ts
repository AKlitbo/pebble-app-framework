/**
 * The part of a feature's plugin mode every kind shares: its one subscription, kept in line with the
 * wearer's saved choice.
 *
 * A kind's driver, such as weather-driver.ts, builds on this. The choice can reach the saved settings
 * with no ready or save after it, such as a seed while the page is open. So every hook that acts on
 * the choice goes through `follow`, which starts a subscription for a picked plugin nothing has
 * started and stops one left running once the choice has moved off the plugin.
 */

import { createSourceSubscription } from './subscription';
import { servesItem } from './standard';
import { PLUGIN_VALUE } from './page';
import type { SourceEnvelope, SourceError, SourceSubscription } from './types';
import { getConfig, readValue } from '../pkjs/settings-store';

/**
 * Whether a kind's providers list is the Pebble app plugin alone. That kind runs from the plugin
 * whatever is saved, with no source choice on the page.
 *
 * @param listed The kind's list, or undefined for a kind the face leaves out.
 * @param pluginValue The value the plugin choice saves.
 * @return True only for a list holding the plugin and nothing else.
 */
export function pluginOnly(listed: readonly string[] | undefined, pluginValue: string): boolean {
  return Array.isArray(listed) && listed.length === 1 && listed[0] === pluginValue;
}

/**
 * Whether a source choice the wearer has never saved starts on the plugin. It does while a plugin on
 * the phone serves the kind, so a fresh install reads from a plugin the phone already has. Once the
 * settings page is saved the stored value always stands. A choice never saved goes back to the face's
 * default by itself once nothing serves the kind, such as after plugins go off.
 *
 * Every read of a kind's choice goes through here, the driver's and the settings page's alike, so
 * the page opens on the source the watch is really getting.
 *
 * @param config The settings to read, saved or about to be saved by a seed.
 * @param key The choice's message key, such as `WEATHER_PROVIDER`.
 * @param serving Whether a plugin on the phone serves the kind now. It is read only for a choice never saved.
 * @return True only for a choice absent from the settings while a plugin serves the kind.
 */
export function freshPlugin(config: Record<string, unknown>, key: string, serving: () => boolean): boolean {
  return config[key] === undefined && serving();
}

/**
 * The source a kind's choice reads as, in lower case, following `freshPlugin` for a choice never saved.
 *
 * @param config The settings to read, saved or about to be saved by a seed.
 * @param key The choice's message key, such as `WEATHER_PROVIDER`.
 * @param fallback The face's default for the choice.
 * @param serving Whether a plugin on the phone serves the kind now.
 * @return The saved choice, or for one never saved, the plugin while one serves the kind and else the default.
 */
export function readSourceChoice(config: Record<string, unknown>, key: string, fallback: string, serving: () => boolean): string {
  if (freshPlugin(config, key, serving)) {
    return PLUGIN_VALUE;
  }

  return String(readValue(config[key], fallback)).toLowerCase();
}

/** What a kind's driver hands the shared part. */
export interface ChoiceOptions {
  /** The category the subscription asks for, such as `calendar`. */
  category: string;
  /** The item inside it, such as `event`. */
  item: string;
  /** The properties the kind reads, which the phone takes as a hint. */
  properties: string[];
  /** Whether the plugin is the face's only source, so it is picked whatever is saved. */
  only: boolean;
  /** Whether some settings pick the plugin. */
  pickedIn(config: Record<string, unknown>): boolean;
  /** Drops the feature's fetch round still out, so its answer cannot land over the plugin's. */
  shutOut(): void;
  /** Gets each update that arrives while the plugin is picked. */
  onUpdate(envelope: SourceEnvelope): void;
  /** Gets each error that arrives while the plugin is picked, after it is logged. */
  onError?(error: SourceError): void;
  /**
   * Hands the kind to its other source at once, when an update or an error finds the choice off the
   * plugin while its subscription still runs. That is a choice moved off the plugin with no save
   * after it, or a choice never saved once the phone stops serving the item, such as with plugins
   * turned off. Left out, the slow tick or the watch's next ask does it.
   */
  onLeft?(): void;
}

/** How `follow` treats a subscription already started for a picked plugin. */
export interface FollowOptions {
  /** Starts it afresh anyway, as a ready does. */
  restart?: boolean;
  /** Starts it again if the phone has ended it, as the slow tick and a save do. */
  retry?: boolean;
}

/** One kind's subscription and the saved choice it follows. */
export interface PluginChoice {
  /** The subscription, for its kept update, its saved state, and the plugin list. */
  subscription: SourceSubscription;
  /** Whether the plugin is picked, read from the settings a seed is about to save while it runs. */
  picked(): boolean;
  /**
   * Brings the subscription in line with the choice.
   *
   * @param how What to do with a subscription already started for a picked plugin. Left out, nothing.
   * @return Whether the plugin is picked.
   */
  follow(how?: FollowOptions): boolean;
  /**
   * Follows the choice in the settings a seed is about to save, which the saved settings do not hold
   * yet. The seed saves straight after its hooks and nothing else may follow it, so a plugin it brings
   * back starts here.
   *
   * @param config The settings the seed is about to save.
   */
  seed(config: Record<string, unknown>): void;
  /**
   * Whether a plugin on the phone could answer now. That is a list serving the item, or a list the
   * phone will not give, since the phone may still route a subscription to a plugin it does not list.
   *
   * @return False only for a list read as having nothing that serves the item.
   */
  couldAnswer(): boolean;
  /**
   * Whether a plugin on the phone served the item when the list was last read, which is when the
   * choice was last followed, the page opened, or an error arrived. A list the phone will not give
   * does not count, since nothing says a plugin is there, and leaves the last answer standing.
   *
   * @return True only for the last list read as serving the item.
   */
  serves(): boolean;
  /** Notes whether the plugin is picked as the settings page opens, for `pickMoved` once it saves. */
  opened(): void;
  /**
   * Whether a save moved the choice onto or off the plugin since the page opened. A choice never saved
   * can move with no saved value changing, such as a fresh install on the plugin saving the face's
   * default, so the saved values alone cannot say. With no open noted it reads as moved, the way a
   * settings watch reads a save with no snapshot. It forgets the note.
   *
   * @param picked Whether the plugin is picked after the save.
   * @return True when the choice moved, or when no open was noted.
   */
  pickMoved(picked: boolean): boolean;
  /**
   * Whether the phone has the plugin calls at all. A phone with plugins switched off still has them
   * and lists nothing, which reads the same as a plugin removed since the pick. Only a Pebble app
   * from before plugins has no list call.
   *
   * @return False only for a phone with no plugin list call.
   */
  hasPluginCalls(): boolean;
}

/**
 * Makes a kind's subscription and the choice it follows. Nothing subscribes until a hook follows a
 * picked choice.
 *
 * @param options The item, the choice, the feature's shut-out, and where updates and errors go.
 * @return The subscription and the calls that keep it in line with the choice.
 */
export function followPluginChoice(options: ChoiceOptions): PluginChoice {
  const { category, item } = options;

  // whether this subscription was started and not stopped since. retryIfIdle only brings back one
  // that was started, so a picked plugin nothing started is started here
  let started = false;

  // whether the plugin was picked as the settings page opened, or null with no open noted since the
  // last save
  let pickedAtOpen: boolean | null = null;

  // whether a plugin on the phone served the item when the list was last read, or null before the
  // first read. the list is read when the choice is followed, when the page opens, and on an error,
  // rather than on every update, since a plugin can send many and each read is a call into the
  // phone. a list the phone will not give keeps the last answer, so one failed read cannot end a
  // subscription a choice never saved is following
  let servedAtRead: boolean | null = null;

  // the settings a seed is about to save, while its hook runs. the subscription can report before the
  // seed has saved, and its check of the choice has to read the one the seed brings back
  let seeding: Record<string, unknown> | null = null;

  /** Whether the plugin is picked, which it always is on a plugin only face. */
  function picked(): boolean {
    return options.only || options.pickedIn(seeding || getConfig());
  }

  /** Reads the plugin list again, and says whether a plugin serves the item, keeping the last answer for a list it cannot read. */
  function readServes(): boolean {
    const listed = subscription.plugins();

    if (listed !== null) {
      servedAtRead = servesItem(listed, category, item);
    }

    return servedAtRead === true;
  }

  const subscription = createSourceSubscription({
    category,
    item,
    properties: options.properties,
    onUpdate(envelope) {
      // a choice that moved off the plugin with no save after it can leave the subscription running,
      // and its reading must not cover the one the fetch sends
      if (!picked()) {
        leave();
        return;
      }

      options.onUpdate(envelope);
    },
    onError(error) {
      console.log(`Plugin ${category}: ${error.code} ${error.message}`);

      // an error is when the phone may have stopped serving the item, so the list is read again
      readServes();

      if (!picked()) {
        leave();
        return;
      }

      options.onError?.(error);
    },
  });

  /** Starts the subscription afresh, ending any live one first, and shuts out the fetch round still out. */
  function start(): void {
    options.shutOut();
    started = true;
    subscription.start();
  }

  /** Ends the subscription and leaves plugin mode, so the slow tick no longer brings it back. */
  function stop(): void {
    started = false;
    subscription.stop();
  }

  /** Ends a subscription the choice has moved off, and hands the kind to its other source. */
  function leave(): void {
    stop();
    options.onLeft?.();
  }

  function follow(how: FollowOptions = {}): boolean {
    readServes();

    const isPicked = picked();

    if (isPicked && (!started || how.restart)) {
      start();
    } else if (isPicked && how.retry) {
      subscription.retryIfIdle();
    } else if (!isPicked && started) {
      stop();
    }

    return isPicked;
  }

  return {
    subscription,
    picked,
    follow,

    seed(config) {
      seeding = config;

      try {
        follow();
      } finally {
        seeding = null;
      }
    },

    couldAnswer() {
      const listed = subscription.plugins();

      return listed === null || servesItem(listed, category, item);
    },

    serves() {
      return servedAtRead === null ? readServes() : servedAtRead;
    },

    opened() {
      readServes();
      pickedAtOpen = picked();
    },

    pickMoved(isPicked) {
      const before = pickedAtOpen;

      pickedAtOpen = null;

      return before === null || before !== isPicked;
    },

    hasPluginCalls() {
      return typeof Pebble !== 'undefined' && typeof Pebble.enumeratePlugins === 'function';
    },
  };
}

export default { followPluginChoice, freshPlugin, pluginOnly, readSourceChoice };
