/**
 * The weather feature's plugin mode, which plugin-sources/index hands the feature on a face built
 * with `PLUGIN_WEATHER`.
 *
 * The saved `WEATHER_PROVIDER` picks the mode, and `plugin` subscribes rather than fetching. Each
 * update goes out through the feature's own sender, and a watch ask resends the last one as of now.
 * The page hook adds the plugin to the Data Source select and lists the weather plugins in the
 * supported plugins panel, and the seeded hook checks a choice the watch brings back after a reset.
 * Whenever the plugin is not picked, the feature's own fetch runs through the controls it hands
 * over.
 *
 * The weather comes in the face's own temperature unit. A face that declares no
 * `WEATHER_TEMPERATURE_UNIT`, such as one with no settings page, gets the unit the wearer picked in
 * the Pebble app instead, read from the Pebble app's `preferences/units`, from the plugin and from a
 * fetch alike. Its watch has no unit to convert to, and shows the number as sent.
 *
 * It lives here rather than in the feature so a face built without the define carries none of it.
 * The feature keeps only a small hook through which a fetch takes the Pebble app's unit, and on a
 * face without the define nothing ever sets it.
 */

import { followPluginChoice, freshPlugin, pluginOnly, readSourceChoice } from './driver';
import { createSourceSubscription } from './subscription';
import type { FollowOptions } from './driver';
import { pluginSourcePage, PLUGIN_VALUE } from './page';
import type { PluginSourceTexts } from './page';
import { WEATHER_STANDARD } from './standard';
import noteComponent from './note-component';
import panelComponent from './panel-component';
import kindsComponent from './kinds-component';
import type { SourceEnvelope, WeatherPlugins } from './types';
import type { WeatherMappingOptions } from './weather';
import { getConfig, readFahrenheit, readText, readValue, watchSettings } from '../pkjs/settings-store';
import { WEATHER_FALLBACK } from '../pkjs/providers';
import type { FeatureHooks } from '../pkjs/feature';
import weatherUtil from '../weather/util';
import type { WeatherResult } from '../weather/util';

// the weather feature's settings split three ways, so a save can be told apart
/** The setting that picks between a plugin and a fetch. */
export const PROVIDER_KEYS = ['WEATHER_PROVIDER'];

/** The setting a plugin's update is converted again for, with no fetch. */
export const UNIT_KEYS = ['WEATHER_TEMPERATURE_UNIT'];

/**
 * The settings only a fetch reads, which change nothing while the weather comes from a plugin. That
 * is every weather setting but the provider and the unit, so a new fetch setting refetches in plugin
 * mode too.
 *
 * @param settingKeys Every weather setting a save can refetch for, the feature's `WEATHER_KEYS`.
 * @return The settings left once the provider and the unit are taken out.
 */
export function fetchKeys(settingKeys: string[]): string[] {
  return settingKeys.filter((key) => !PROVIDER_KEYS.includes(key) && !UNIT_KEYS.includes(key));
}

/**
 * The weather providers that fetch nothing without an API key, which is every one but Open-Meteo. The
 * build's provider table says the same in its `needsKey` column, and a spec beside the table checks
 * the two agree. The list lives here rather than beside `WEATHER_FALLBACK`, since that file ships with
 * every weather face and only a face built with `PLUGIN_WEATHER` reads this.
 */
export const KEYED_WEATHER_PROVIDERS: readonly string[] = ['owm', 'weatherapi'];

/**
 * Where the phone keeps the last temperature unit the Pebble app gave, for a face with no unit
 * setting of its own. A new JS session sends its first reading in that unit, since the units update
 * can land after the weather's. A change made while the face's phone code was not running shows on
 * that first reading, and the units update corrects it straight after.
 */
export const APP_UNIT_STORE = 'pluginWeather:appFahrenheit';

/** The last unit the Pebble app gave, true for °F, or Celsius when it never gave one or the store throws. */
function loadAppUnit(): boolean {
  try {
    return localStorage.getItem(APP_UNIT_STORE) === 'true';
  } catch (error) {
    return false;
  }
}

/** Keeps the unit the Pebble app gave. A store that throws costs only the next session's first reading. */
function saveAppUnit(fahrenheit: boolean): void {
  try {
    localStorage.setItem(APP_UNIT_STORE, String(fahrenheit));
  } catch (error) {
    console.log('Weather: could not save the Pebble app\'s unit');
  }
}

/** What the weather mapping hands its driver. */
export interface WeatherMapping {
  /** Turns one update into the reading the watch takes. */
  fromUpdate(envelope: SourceEnvelope | null | undefined, options: WeatherMappingOptions): WeatherResult;
  /** Whether a `preferences/units` update says °F, or undefined when it says neither. */
  appFahrenheit(envelope: SourceEnvelope | null | undefined): boolean | undefined;
  /** The properties the subscription asks for, from the fields the face shows. */
  properties(fields: string[], wantForecast: boolean): string[];
  /** The status the watch shows for a subscription error code, or undefined for a code with none. */
  errorStatus(code: string | null | undefined): string | undefined;
  /** The page hook's wording. */
  texts: PluginSourceTexts;
  /** The line the source note gains on a face that shows coordinates, which only some plugins serve. */
  coordsText?: string;
}

/**
 * Makes the weather's driver from its mapping.
 *
 * @param mapping The update reader, the properties, the error statuses, and the wording.
 * @return The driver plugin-sources/index hands the feature.
 */
export function createWeatherDriver(mapping: WeatherMapping): WeatherPlugins['driver'] {
  return ({ messageKeys, defaults, providers }, controls): FeatureHooks | null => {
    const listed = providers ? providers.weather : undefined;
    const only = pluginOnly(listed, PLUGIN_VALUE);

    // a face that declares the unit key has a unit of its own, the one rule the watch goes by too. a
    // face without it, such as one with no settings page, takes the unit the Pebble app last gave, and
    // Celsius until it has given one. that holds for a fetch as well as the plugin, since its watch
    // writes the number bare and the one number has to mean one unit
    const ownUnit = messageKeys.WEATHER_TEMPERATURE_UNIT !== undefined;
    let appUnit = ownUnit ? false : loadAppUnit();

    const { fields, wantForecast } = controls;

    // a face that shows coordinates asks for the place's too, and its source note says only some
    // plugins serve them. with one that serves none its coordinate readouts show no fix
    const properties = [...mapping.properties(fields, wantForecast), ...(controls.withCoords ? ['latitude', 'longitude'] : [])];
    const texts = controls.withCoords && mapping.coordsText ? { ...mapping.texts, source: [mapping.texts.source, mapping.coordsText].filter(Boolean).join(' ') } : mapping.texts;

    // a save is told apart by which of these moved. the provider switches between the plugin and a
    // fetch, the unit converts the kept update again, and the rest only mean something to a fetch
    const providerSettings = watchSettings(PROVIDER_KEYS, defaults);
    const unitSettings = watchSettings(UNIT_KEYS, defaults);
    const fetchSettings = watchSettings(fetchKeys(controls.settingKeys), defaults);

    /** Turns an update into the reading the watch takes, in the face's unit and as of now. */
    function readingFrom(envelope: SourceEnvelope): WeatherResult {
      return mapping.fromUpdate(envelope, {
        fahrenheit: ownUnit ? readFahrenheit(getConfig(), defaults) : appUnit,
        nowSeconds: Math.floor(Date.now() / 1000),
        fields,
        wantForecast,
      });
    }

    /** Sends the status an error code calls for, when it calls for one. */
    function sendStatusFor(code: string | null | undefined): void {
      const status = mapping.errorStatus(code);

      if (status !== undefined) {
        controls.send(weatherUtil.status(status));
      }
    }

    /** Whether some settings pick the plugin, a choice never saved included while a plugin serves the weather. */
    function pickedIn(config: Record<string, unknown>): boolean {
      return readSourceChoice(config, 'WEATHER_PROVIDER', String(defaults.WEATHER_PROVIDER || WEATHER_FALLBACK), () => choice.serves()) === PLUGIN_VALUE;
    }

    const choice = followPluginChoice({
      category: 'weather',
      item: 'location',
      properties,
      only,
      pickedIn,
      shutOut: controls.shutOut,
      // a choice never saved that loses its plugin fetches from the face's default straight away
      onLeft: () => controls.fetch(false),
      onUpdate: (envelope) => controls.send(readingFrom(envelope)),
      onError(error) {
        // the unit keeps the last update while its reading still stands, and lets it go when the phone
        // ends the subscription or no plugin serves the item. with nothing kept, the reading on the
        // watch is out of date, so the status goes out even after an earlier reading
        if (choice.subscription.latest() === null) {
          sendStatusFor(error.code);
        }
      },
    });

    const { subscription } = choice;

    /**
     * Sends the weather again in the Pebble app's new unit. With the plugin picked the kept update
     * goes again, and with nothing kept the watch shows the plugin's status, which has no unit, so
     * nothing goes. Otherwise one forced fetch runs, which replaces a round still out in the old unit.
     * A save's refetch still waiting reads the unit when it runs, so it takes the new one and the
     * change folds into it rather than spending a second provider call.
     */
    function appUnitMoved(): void {
      if (!choice.picked()) {
        if (!controls.savePending()) {
          controls.fetch(true);
        }

        return;
      }

      const latest = subscription.latest();

      if (latest) {
        controls.send(readingFrom(latest));
      }
    }

    // the Pebble app's units, read in either mode and only on a face with no unit of its own. the
    // Preferences plugin asks for no permission. nothing on the watch waits on the units, so they run
    // no quick retry and send the watch no status, and retry only with the weather and the slow tick
    const units = ownUnit ? null : createSourceSubscription({
      category: 'preferences',
      item: 'units',
      properties: ['temperature'],
      quickRetry: false,
      onUpdate(envelope) {
        const fahrenheit = mapping.appFahrenheit(envelope);

        if (fahrenheit === undefined || fahrenheit === appUnit) {
          return;
        }

        appUnit = fahrenheit;
        saveAppUnit(fahrenheit);
        appUnitMoved();
      },
      onError(error) {
        console.log(`Weather: the Pebble app's units sent ${error.code} ${error.message}`);
      },
    });

    // whether the units were started, since a retry only brings back one that was
    let unitsStarted = false;

    if (!ownUnit) {
      controls.useUnit(() => appUnit);
    }

    /**
     * Brings the weather subscription in line with the choice. The units start the first time and
     * again on every restart, and try again whenever the weather would.
     */
    function follow(how: FollowOptions = {}): boolean {
      const picked = choice.follow(how);

      if (units && (!unitsStarted || how.restart)) {
        unitsStarted = true;
        units.start();
      } else if (units && how.retry) {
        units.retryIfIdle();
      }

      return picked;
    }

    const hooks: FeatureHooks = {
      requests: ['WEATHER_REQUEST'],

      ready() {
        controls.forget();

        // a subscription costs no quota and lasts the JS session, so it starts afresh on every ready
        // without the ask gate. starting ends the one before, so one stays running
        if (!follow({ restart: true })) {
          controls.askFetch();
        }
      },

      message(payload) {
        if (!payload[messageKeys.WEATHER_REQUEST]) {
          return;
        }

        controls.forget();

        if (!follow()) {
          controls.askFetch();
          return;
        }

        // the plugin keeps its own reading fresh, so an ask only resends it as of now. with no update
        // kept, after the phone ended the subscription or before the first update, it sends the status
        // the saved error calls for, so a rebooted watch shows why it has no reading
        const latest = subscription.latest();

        if (latest) {
          controls.send(readingFrom(latest));
        } else {
          sendStatusFor(subscription.state().lastError);
        }
      },

      refresh(slow) {
        if (!slow) {
          return;
        }

        // a plugin refreshes itself, so the slow tick only brings back a subscription the phone ended,
        // such as one waiting on plugins to be turned back on, or starts one that never was
        if (!follow({ retry: true })) {
          controls.slowFetch();
        }
      },

      configOpened() {
        providerSettings.opened();
        unitSettings.opened();
        fetchSettings.opened();
        choice.opened();

        // a wearer opening the settings may be setting up a plugin right now, so the quick retry gets
        // its whole window again while the plugin waits on one, and the units get one try
        subscription.retrySoon();
        units?.retrySoon();
      },

      configSaved() {
        // a save onto the plugin starts it unless something already has, such as the seed, and starts
        // one the phone ended again. a save off it stops a started one
        const picked = follow({ retry: true });

        // each watch is read so its snapshot is let go, whichever one decides. a plugin only face has
        // no provider choice, so whatever a save holds for it switches nothing. a choice never saved can
        // move off the plugin with the saved provider still reading as the default, so that move counts
        const pickMoved = choice.pickMoved(picked);
        const providerMoved = (providerSettings.changed() || pickMoved) && !only;
        const unitMoved = unitSettings.changed();
        const fetchMoved = fetchSettings.changed();

        if (picked) {
          // a save while the plugin is picked calls retrySoon, since the wearer may be
          // setting one up right now
          subscription.retrySoon();

          // the watch converts what it holds when the unit changes, so the kept update goes again in
          // the new unit. the location and the key only feed a fetch, so they change nothing here. a
          // first save of the plugin a fresh install already reads from keeps the same subscription,
          // so it is no move
          const latest = subscription.latest();

          if (unitMoved && !pickMoved && latest) {
            controls.send(readingFrom(latest));
          }

          return;
        }

        if (providerMoved || unitMoved || fetchMoved) {
          // a round still out for the old settings would land after the switch, so it is shut out
          controls.shutOut();
          controls.afterSave(() => {
            if (!choice.picked()) {
              controls.fetch(true);
            }
          });
        }
      },
    };

    // the note, the supported plugins panel, and the plugin kinds row the page hook's rows are drawn with, which the app
    // registers only for a page holding them
    hooks.components = [noteComponent, panelComponent, kindsComponent];

    // a plugin only face has no select for the page hook to add the plugin to, so the page gets the
    // notes alone, and keeps no choice on the watch for the seed to check
    if (only) {
      hooks.page = (config) => pluginSourcePage(config, {
        category: 'weather',
        item: 'location',
        plugins: subscription.plugins(),
        messageKeys,
        state: subscription.state(),
        standard: WEATHER_STANDARD,
        texts,
        panel: true,
      });

      return hooks;
    }

    hooks.page = (config) => pluginSourcePage(config, {
      selectKey: 'WEATHER_PROVIDER',
      category: 'weather',
      item: 'location',
      plugins: subscription.plugins(),
      messageKeys,
      state: subscription.state(),
      standard: WEATHER_STANDARD,
      texts,
      panel: true,
      saved: readValue(getConfig().WEATHER_PROVIDER, undefined),
      pluginByDefault: freshPlugin(getConfig(), 'WEATHER_PROVIDER', () => choice.serves()),
      movesBelow: 'LOCATION_USE_GPS',
    });

    /**
     * Checks a provider the watch brought back after a reset.
     *
     * The phone's own saved choice, from before this seed, stands as it would on any other face. Only a
     * choice the watch brought back to a phone holding none is checked. getConfig still reads the
     * settings from before the seed, since the seed saves after its hooks.
     */
    function fixRestoredChoice(config: Record<string, unknown>): void {
      if (getConfig().WEATHER_PROVIDER !== undefined) {
        return;
      }

      const restored = String(readValue(config.WEATHER_PROVIDER, '')).toLowerCase();

      // the watch keeps the face's default for a choice nobody ever made, so a restored default reads
      // as never saved and a plugin on the phone takes it, as on a fresh install. a wearer who saved the
      // default on purpose while a plugin was on offer moves onto the plugin after a reset, which costs
      // less than every wearer who never chose being pinned to the default by every reset
      if (restored === String(defaults.WEATHER_PROVIDER || WEATHER_FALLBACK).toLowerCase()) {
        delete config.WEATHER_PROVIDER;
        return;
      }

      // a phone with the plugin calls keeps a restored plugin even when it lists nothing, since plugins
      // switched off read the same as one removed, and the page keeps a saved plugin with plugins off
      // too. the face then shows No Plugin, as the page says. a Pebble app from before plugins can
      // never answer, and a keyed provider with no key on the phone would show No API Key where the
      // face would otherwise show Open-Meteo weather, so either comes out and the choice reads as
      // never saved
      if (restored === PLUGIN_VALUE && !choice.hasPluginCalls()) {
        delete config.WEATHER_PROVIDER;
      } else if (KEYED_WEATHER_PROVIDERS.includes(restored) && readText(config.WEATHER_API_KEY, '').trim() === '') {
        delete config.WEATHER_PROVIDER;
      }
    }

    hooks.seeded = (config) => {
      fixRestoredChoice(config);
      choice.seed(config);
    };

    return hooks;
  };
}

export default { createWeatherDriver, fetchKeys, PROVIDER_KEYS, UNIT_KEYS };
