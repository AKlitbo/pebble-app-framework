/**
 * The plugin mode for a kind of data only a Pebble app plugin serves, such as now playing or the
 * phone's battery, which plugin-sources/index hands its feature on a face built with the kind's
 * define.
 *
 * Such a kind has no other source and no choice on the page. It subscribes only while the watch shows
 * it, which the watch says with its ask: 1 when a face starts the store live, and 0 when it starts it
 * not live, such as for a layout with no panel that reads the kind. The phone keeps the last answer,
 * so a restart of the phone code subscribes again unless the watch last said it shows no such
 * panel. A phone that has never heard an answer, as after an install or an upgrade, subscribes at
 * ready rather than waiting on an ask that may run out of tries while the phone code starts. A store
 * started not live sends its 0 at every launch, so a watch that shows no such panel ends that
 * subscription a moment later. A plugin
 * sends on every change, so a subscription nobody reads would wake the watch for each one. While
 * subscribed it sends each update through the feature's own deduped sender, and answers the watch's
 * ask with the last update, or with the empty reading before the first one. When no plugin serves
 * the kind, or the phone ends the subscription, or the wearer has not allowed the permission, it
 * sends the reading for no plugin, so the watch clears its panel and can say why. The page hook adds the notes
 * saying what is wrong, with no select to hang them on, and lists the kind in the supported plugins
 * panel.
 *
 * It lives here rather than in the features so a face built without the defines carries none of it.
 */

import { followPluginChoice } from './driver';
import { pluginSourcePage } from './page';
import type { PluginSourceTexts } from './page';
import type { StandardReadings } from './standard';
import { NO_PLUGIN } from './subscription';
import noteComponent from './note-component';
import panelComponent from './panel-component';
import kindsComponent from './kinds-component';
import type { ImageSize, ReadingControls, SourceEnvelope } from './types';
import type { FeatureContext, FeatureHooks } from '../pkjs/feature';

/**
 * The error codes that leave the watch with nothing it can trust. No plugin serves the kind, the
 * phone has ended the subscription, or the wearer has not allowed the permission. Each one sends the
 * reading for no plugin, which clears the watch's panel, and the page explains it.
 */
export const CLEARING_CODES: readonly string[] = [NO_PLUGIN, 'PLUGIN_UNAVAILABLE', 'PERMISSION_DENIED'];

/**
 * Where the phone keeps whether the watch shows a kind, so the phone code subscribes on a restart
 * only for a watch that does.
 *
 * @param category The kind's category, such as `phone`.
 * @param item The item inside it, such as `phone_state`.
 * @return The localStorage key.
 */
export function wantedKey(category: string, item: string): string {
  return `pf-wanted-${category}/${item}`;
}

/** Whether the watch shows the kind, false only when it last said it does not. Never said, or storage failing, reads as shown. */
function readWanted(key: string): boolean {
  try {
    return localStorage.getItem(key) !== '0';
  } catch {
    return true;
  }
}

/** Keeps what the watch last said. A phone that refuses the write keeps it for this session only. */
function saveWanted(key: string, wanted: boolean): void {
  try {
    localStorage.setItem(key, wanted ? '1' : '0');
  } catch {
    // the session still follows it, and the next ask from the watch says it again
  }
}

/** What a kind's mapping hands its driver. */
export interface ReadingMapping<Reading> {
  /** The category the subscription asks for, such as `music`. */
  category: string;
  /** The item inside it, such as `track`. */
  item: string;
  /** The properties the kind reads, which the phone takes as a hint. */
  properties: string[];
  /** The properties that carry images, asked for only when the face wants them at a size, such as `artwork`. */
  imageProperties?: string[];
  /** The watch's ask for the reading, such as `MUSIC_REQUEST`, by name. */
  requestKey: string;
  /**
   * Turns one update into the reading the watch takes. It gets the image size the face asked for, or
   * undefined when it asked for none.
   */
  fromUpdate(envelope: SourceEnvelope | null | undefined, imageSize?: ImageSize): Reading;
  /** The reading for nothing to show yet, which the watch clears its panel to. */
  empty: Reading;
  /**
   * The reading for no plugin serving the kind, which the watch clears its panel to as well and can
   * tell apart from `empty`. It goes for a clearing error and for a plugin list with nothing serving
   * the kind. Left out, `empty` stands in.
   */
  noPlugin?: Reading;
  /** The readings a plugin has to declare for the face to read it. */
  standard: StandardReadings;
  /** The page hook's wording. */
  texts: PluginSourceTexts;
}

/**
 * Makes the driver for a kind only a plugin serves.
 *
 * @param mapping The item, the update reader, the empty reading, the watch's ask, and the wording.
 * @return The driver plugin-sources/index hands the feature.
 */
export function createReadingDriver<Reading>(mapping: ReadingMapping<Reading>): (context: FeatureContext, controls: ReadingControls<Reading>) => FeatureHooks {
  return ({ messageKeys }, controls) => {
    const { category, item } = mapping;
    const noPlugin = mapping.noPlugin === undefined ? mapping.empty : mapping.noPlugin;
    const key = wantedKey(category, item);
    const { imageSize } = controls;
    const properties = imageSize ? [...mapping.properties, ...(mapping.imageProperties || [])] : mapping.properties;

    /** Turns an update into the reading, at the image size the face asked for. */
    function readingFrom(envelope: SourceEnvelope): Reading {
      return mapping.fromUpdate(envelope, imageSize);
    }

    let wanted = readWanted(key);

    // the kind has no other source, so the choice is whether the watch shows it, and there is no
    // fetch to shut out
    const choice = followPluginChoice({
      category,
      item,
      properties,
      iconPixelSize: imageSize,
      only: false,
      pickedIn: () => wanted,
      shutOut: () => {},
      onUpdate: (envelope) => controls.send(readingFrom(envelope)),
      onError(error) {
        if (CLEARING_CODES.includes(error.code)) {
          controls.send(noPlugin);
        }
      },
    });

    const { subscription } = choice;

    /**
     * Sends what the watch should show now. The kept update stands only while no error since it
     * has cleared the panel, so a watch that rebooted after the wearer took the permission away gets
     * the reading for no plugin rather than an old song. With nothing kept, a plugin list with nothing
     * serving the kind sends the reading for no plugin too, and anything else the empty reading, since
     * an update may still be on its way.
     */
    function sendLatest(): void {
      const latest = subscription.latest();
      const cleared = CLEARING_CODES.includes(subscription.state().lastError || '');

      if (latest && !cleared) {
        controls.send(readingFrom(latest));
      } else if (cleared || !choice.couldAnswer()) {
        controls.send(noPlugin);
      } else {
        controls.send(mapping.empty);
      }
    }

    return {
      requests: [mapping.requestKey],

      ready() {
        controls.forget();

        // a subscription lasts the JS session, so a watch that shows the kind gets it afresh on every
        // ready. starting ends the one before, so one stays running
        choice.follow({ restart: true });
      },

      message(payload) {
        const ask = payload[messageKeys[mapping.requestKey]];

        if (ask === undefined || ask === null) {
          return;
        }

        const wants = Number(ask) !== 0;

        if (wants !== wanted) {
          wanted = wants;
          saveWanted(key, wanted);
        }

        // the watch asks after a reboot or when the phone comes back, holding nothing, so it gets an
        // answer even when the sender thinks the watch already has it. a watch that no longer shows
        // the kind gets nothing, and its subscription ends
        controls.forget();
        choice.follow();

        if (wanted) {
          sendLatest();
        }
      },

      refresh(slow) {
        // a plugin sends on every change, so the slow tick only brings back a subscription the phone
        // ended, such as one waiting on plugins to be turned back on
        if (slow) {
          choice.follow({ retry: true });
        }
      },

      configOpened() {
        // a wearer opening the settings may be setting up a plugin right now, so the quick retry gets
        // its whole window again while the kind waits on one
        subscription.retrySoon();
      },

      page: (config) => pluginSourcePage(config, {
        category,
        item,
        plugins: subscription.plugins(),
        messageKeys,
        state: subscription.state(),
        standard: mapping.standard,
        texts: mapping.texts,
        panel: true,
      }),

      // the note, the supported plugins panel, and the plugin kinds row the page hook's rows are drawn with, which the app
      // registers only for a page holding them
      components: [noteComponent, panelComponent, kindsComponent],
    };
  };
}

export default { createReadingDriver, CLEARING_CODES, wantedKey };
