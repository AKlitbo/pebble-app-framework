/**
 * The calendar feature's plugin mode, which plugin-sources/index hands the feature on a face built
 * with `PLUGIN_CALENDAR`.
 *
 * The saved `CALENDAR_SOURCE` picks the mode, and `plugin` subscribes rather than running iCal rounds.
 * Each update goes out through the feature's own sender, and a watch ask resends the last one as of
 * now. The page hook adds the Calendar Source select and lists the calendar plugins in the supported
 * plugins panel, and the seeded hook brings back a plugin choice the watch kept through a reset.
 * Whenever the plugin is not picked, the feature's own iCal rounds run through the controls it hands
 * over.
 *
 * It lives here rather than in the feature so a face built without the define carries none of it.
 */

import { followPluginChoice, pluginOnly } from './driver';
import { pluginSourcePage, PLUGIN_VALUE } from './page';
import type { PluginSourceTexts } from './page';
import { CALENDAR_STANDARD } from './standard';
import noteComponent from './note-component';
import panelComponent from './panel-component';
import type { CalendarDriver, CalendarPlugins, SourceEnvelope } from './types';
import { getConfig, readValue, watchSettings } from '../pkjs/settings-store';
import type { FeatureHooks } from '../pkjs/feature';
import type { CalendarEvent } from '../calendar/ical';
import type { ClayConfigItem } from '../clay/types';

/** The setting that picks between the iCal link and a plugin. */
export const SOURCE_KEYS = ['CALENDAR_SOURCE'];

/** The setting only an iCal round reads. */
const FEED_KEYS = ['CALENDAR_ICS_URL'];

/**
 * How long after ready an iCal round with no link can hold back the empty agenda, in ms.
 *
 * A watch that takes the settings ask replies within a second or two. One that turns every ask away
 * has used up all nine in about 13 seconds, each a second apart with up to three quick tries, and the
 * app says so as the last one fails. This timeout is for the rest, an ask the watch took whose reply
 * never came, or sends that each wait out the send queue's 8 second watchdog. A reply that lands
 * after it and brings the plugin back clears the agenda for the moment before the plugin fills it
 * again. That costs one blink on the watch, where a longer hold leaves a new watch with no agenda
 * for longer, and no timeout at all can leave it with none for the whole session.
 */
export const AGENDA_HOLD_MS = 15000;

/** What the calendar mapping hands its driver. */
export interface CalendarMapping {
  /** Turns one update into the events the agenda shows, as of the moment given in epoch seconds. */
  fromUpdate(envelope: SourceEnvelope | null | undefined, nowSeconds: number): CalendarEvent[];
  /** The properties the subscription asks for. */
  properties: string[];
  /** The page hook's wording. */
  texts: PluginSourceTexts;
  /** The Calendar Source select the page hook adds. Its default is the iCal link's value. */
  select: ClayConfigItem;
}

/**
 * Makes the calendar's driver from its mapping.
 *
 * @param mapping The update reader, the properties, the wording, and the select.
 * @return The driver plugin-sources/index hands the feature.
 */
export function createCalendarDriver(mapping: CalendarMapping): CalendarPlugins['driver'] {
  return ({ messageKeys, defaults, providers }, controls): CalendarDriver => {
    const only = pluginOnly(providers ? providers.calendar : undefined, PLUGIN_VALUE);

    // the page has no Calendar Source row of its own, so nothing saved reads as the face's default, or
    // the iCal link for a face with none. the watch on the key takes the same default, or the first
    // save after the select appears would read as a switch and force an iCal round
    const sourceDefault = String(defaults.CALENDAR_SOURCE || mapping.select.defaultValue);
    const sourceSetting = watchSettings(SOURCE_KEYS, { CALENDAR_SOURCE: sourceDefault });
    const feedSetting = watchSettings(FEED_KEYS, defaults);

    // whether an iCal round sent nothing for the agenda hold, so whatever lifts the hold runs one
    let held = false;

    // whether the settings ask from the last ready can still land. only its reply can bring the plugin
    // back to a phone holding no settings, so the agenda hold lasts only while it is out
    let askOut = false;
    let holdTimer: ReturnType<typeof setTimeout> | null = null;

    /** Marks the settings ask as no longer out and stops the hold's timeout. */
    function endAsk(): void {
      askOut = false;

      if (holdTimer !== null) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    }

    /**
     * Lifts the hold once no settings reply can come, and runs the round it held back so the watch
     * gets its empty agenda now rather than at its next ask or the slow tick.
     */
    function giveUpOnSettings(): void {
      endAsk();

      if (held && !choice.picked()) {
        controls.fetch(false);
      }

      held = false;
    }

    /**
     * Starts the hold for the settings ask a ready sends. A face with no settings request key asks for
     * nothing that can land, and a phone that holds settings already gets no seed, so neither holds.
     */
    function startAsk(): void {
      endAsk();

      if (messageKeys.SETTINGS_REQUEST === undefined || Object.keys(getConfig()).length > 0) {
        return;
      }

      askOut = true;
      holdTimer = setTimeout(() => {
        holdTimer = null;
        giveUpOnSettings();
      }, AGENDA_HOLD_MS);
    }

    /** Whether some settings pick the plugin. */
    function pickedIn(config: Record<string, unknown>): boolean {
      return String(readValue(config.CALENDAR_SOURCE, sourceDefault)).toLowerCase() === PLUGIN_VALUE;
    }

    /** Turns an update into the events the agenda shows as of now, so an event that ended since is left off. */
    function eventsFrom(envelope: SourceEnvelope): CalendarEvent[] {
      return mapping.fromUpdate(envelope, Math.floor(Date.now() / 1000));
    }

    const choice = followPluginChoice({
      category: 'calendar',
      item: 'event',
      properties: mapping.properties,
      only,
      pickedIn,
      shutOut: controls.shutOut,
      // an empty list still goes, since that is how the watch hears every event was deleted
      onUpdate: (envelope) => controls.send(eventsFrom(envelope)),
      // an error sends nothing. the watch has no status line for the calendar, so it keeps its agenda
      // and the events age out by their own end times, and the settings page shows the saved error
    });

    const { subscription } = choice;

    const hooks: FeatureHooks = {
      requests: ['CALENDAR_REQUEST'],

      ready() {
        controls.forget();

        // the app sends its settings ask just before ready runs, so the hold starts before the round below
        startAsk();

        // a subscription costs nothing on the network and lasts the JS session, so it starts afresh on
        // every ready without the ask gate. starting ends the one before, so one stays running
        if (!choice.follow({ restart: true })) {
          controls.askFetch();
        }
      },

      message(payload) {
        if (!payload[messageKeys.CALENDAR_REQUEST]) {
          return;
        }

        controls.forget();

        // the plugin sends on every change, so an ask only resends the kept events as of now. before
        // the first update there is nothing to send
        if (!choice.follow()) {
          controls.askFetch();
          return;
        }

        const latest = subscription.latest();

        if (latest) {
          controls.send(eventsFrom(latest));
        }
      },

      refresh(slow) {
        if (!slow) {
          return;
        }

        // the plugin sends on every change, so the slow tick only brings back a subscription the phone
        // ended, such as one waiting on plugins to be turned back on, or starts one that never was
        if (!choice.follow({ retry: true })) {
          controls.slowFetch();
        }
      },

      settingsUnanswered() {
        giveUpOnSettings();
      },

      configOpened() {
        feedSetting.opened();
        sourceSetting.opened();

        // a wearer opening the settings may be setting up a plugin right now, so the quick retry gets
        // its whole window again while the plugin waits on one
        subscription.retrySoon();
      },

      configSaved() {
        // a save leaves the phone holding settings, so no round can hold again. a round held before
        // it runs once below, through the save's own refetch or on its own, and never again from the
        // hold's timeout
        const wasHeld = held;

        endAsk();
        held = false;

        // each watch is read so its snapshot is let go, whichever one decides. a plugin only face has
        // no source choice, so whatever a save holds for it switches nothing
        const sourceMoved = sourceSetting.changed() && !only;
        const feedMoved = feedSetting.changed();

        // a save onto the plugin starts it unless something already has, such as the seed, and starts
        // one the phone ended again. a save off it stops a started one
        const picked = choice.follow({ retry: true });

        // a save while the plugin is picked calls retrySoon, since the wearer may be
        // setting one up right now
        if (picked) {
          subscription.retrySoon();
        }

        // the link only feeds an iCal round, so a save that changed it means nothing while the plugin
        // is picked
        if (picked || (!sourceMoved && !feedMoved)) {
          // a save that changed nothing a round reads still owes the watch the agenda the hold kept back
          if (wasHeld && !picked) {
            controls.afterSave(() => {
              if (!choice.picked()) {
                controls.fetch(false);
              }
            });
          }

          return;
        }

        // a download still out for the old feed would land in the moment before the forced refetch
        // and push the old agenda to the watch, so it is shut out
        controls.shutOut();
        controls.afterSave(() => {
          if (!choice.picked()) {
            controls.fetch(true);
          }
        });
      },
    };

    /**
     * Holds back the empty agenda an iCal round with no link would send, while the phone holds no
     * saved settings at all, the settings ask is still out, and a plugin could still be the answer.
     *
     * On a fresh install of the Pebble app the face's ready runs before the watch's settings reply
     * lands, and the seed may still bring back the plugin. An empty strip then would clear the agenda
     * the plugin filled, only for the subscription to fill it again. A round held here runs again once
     * the seed leaves the plugin unpicked, once the watch turns every ask away, or after
     * `AGENDA_HOLD_MS`, whichever comes first. So a wearer on iCal with no link still gets the empty
     * agenda, and a new watch learns its agenda is empty rather than never synced. A phone whose plugin
     * list has nothing serving the events can never bring the plugin back, so it sends the empty agenda
     * at once, as a face without the define does, and so does a face with no settings request key.
     */
    function holdsEmptyAgenda(): boolean {
      const holds = askOut && Object.keys(getConfig()).length === 0 && choice.couldAnswer();

      held = held || holds;

      return holds;
    }

    // the note and the supported plugins panel the page hook's rows are drawn with, which the app
    // registers only for a page holding them
    hooks.components = [noteComponent, panelComponent];

    // a plugin only face has no select for the page hook to add, so the page gets the notes alone,
    // and keeps no choice on the watch for the seed to bring back
    if (only) {
      hooks.page = (config) => pluginSourcePage(config, {
        category: 'calendar',
        item: 'event',
        plugins: subscription.plugins(),
        messageKeys,
        state: subscription.state(),
        standard: CALENDAR_STANDARD,
        texts: mapping.texts,
        panel: true,
      });

      return { hooks, holdsEmptyAgenda };
    }

    hooks.page = (config) => pluginSourcePage(config, {
      selectKey: 'CALENDAR_SOURCE',
      category: 'calendar',
      item: 'event',
      plugins: subscription.plugins(),
      messageKeys,
      state: subscription.state(),
      standard: CALENDAR_STANDARD,
      texts: mapping.texts,
      insert: { select: mapping.select, anchorKey: 'CALENDAR_ICS_URL' },
      panel: true,
      saved: readValue(getConfig().CALENDAR_SOURCE, undefined),
    });

    /**
     * Checks a plugin choice the watch brought back after a reset.
     *
     * The page has no Calendar Source row of its own, so the seed's own copy skips the key, and only
     * this hook can put the choice back. It does so on any phone with the plugin calls, even one that
     * lists nothing, since plugins switched off read the same as a plugin removed, and the page keeps a
     * saved plugin with plugins off too. The agenda then keeps what it holds, as the page says. A
     * Pebble app from before plugins can never answer, so there the choice comes out, including one the
     * seed copied for a face that placed the select itself. The phone's own saved choice, from before
     * this seed, stands as it would on any other face. getConfig still reads the settings from before
     * the seed, since the seed saves after its hooks.
     */
    function restoreChoice(config: Record<string, unknown>, echoed: (name: string) => unknown): void {
      if (getConfig().CALENDAR_SOURCE !== undefined) {
        return;
      }

      const restored = echoed('CALENDAR_SOURCE');

      if (typeof restored !== 'string' || restored.toLowerCase() !== PLUGIN_VALUE) {
        return;
      }

      if (choice.hasPluginCalls()) {
        config.CALENDAR_SOURCE = PLUGIN_VALUE;
      } else {
        delete config.CALENDAR_SOURCE;
      }
    }

    hooks.seeded = (config, echoed) => {
      endAsk();
      restoreChoice(config, echoed);
      choice.seed(config);

      // the seed lifts the hold, but a round held before it would otherwise not run again until the
      // watch's next ask or the slow tick. it waits out the save delay, since the seed saves these
      // settings only after its hooks, and a round now would still read no settings and hold again
      if (held && !pickedIn(config)) {
        controls.afterSave(() => {
          if (!choice.picked()) {
            controls.fetch(false);
          }
        });
      }

      held = false;
    };

    return { hooks, holdsEmptyAgenda };
  };
}

export default { createCalendarDriver, SOURCE_KEYS, AGENDA_HOLD_MS };
