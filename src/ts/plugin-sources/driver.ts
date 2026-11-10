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
import type { SourceEnvelope, SourceError, SourceSubscription } from './types';
import { getConfig } from '../pkjs/settings-store';

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

  // the settings a seed is about to save, while its hook runs. the subscription can report before the
  // seed has saved, and its check of the choice has to read the one the seed brings back
  let seeding: Record<string, unknown> | null = null;

  /** Whether the plugin is picked, which it always is on a plugin only face. */
  function picked(): boolean {
    return options.only || options.pickedIn(seeding || getConfig());
  }

  const subscription = createSourceSubscription({
    category,
    item,
    properties: options.properties,
    onUpdate(envelope) {
      // a choice that moved off the plugin with no save after it can leave the subscription running,
      // and its reading must not cover the one the fetch sends
      if (!picked()) {
        stop();
        return;
      }

      options.onUpdate(envelope);
    },
    onError(error) {
      console.log(`Plugin ${category}: ${error.code} ${error.message}`);

      if (!picked()) {
        stop();
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

  function follow(how: FollowOptions = {}): boolean {
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

    hasPluginCalls() {
      return typeof Pebble !== 'undefined' && typeof Pebble.enumeratePlugins === 'function';
    },
  };
}

export default { followPluginChoice, pluginOnly };
