/**
 * Shared PebbleKit JS bootstrap for the watchfaces.
 *
 * Builds the Clay settings page, restores settings between the phone and the watch, keeps each
 * timezone field current, and runs the features a face opts into, such as weather, stocks, and the
 * calendar.
 */

// the `any`s that remain in this file sit at two genuinely-dynamic boundaries: the Clay-settings
// readers (isString/isEnum/asBool) that read whatever the user saved to localStorage, and the
// face-generated message_keys map plus the AppMessage dict it keys
/* eslint-disable @typescript-eslint/no-explicit-any */
import locationComponent from '../clay/location-component';
import timezone from './timezone';
import { createSendQueue } from './send-queue';
import { getConfig, readValue } from './settings-store';
import { WIRE_CAPS } from './wire';
import type { Feature, FeatureHooks } from './feature';
import type { ClayConfigItem } from '../clay/types';

/** The options a face hands startPebbleApp. */
export interface StartOptions {
  clayConfig: ClayConfigItem[];
  components?: unknown[];
  customClay?: unknown;
  // the parts of the runtime only some faces use, such as weather, stocks, and the calendar
  features?: Feature[];
}

// how long after the config page closes a changed setting waits to refetch
export const SETTINGS_REFETCH_DELAY_MS = 250;

/**
 * Walks the Clay config items and builds a map from each item's message key to its
 * declared default value, so the same defaults apply whether or not the user has
 * opened the settings page yet.
 *
 * @param items The Clay config items to walk, including any nested items.
 * @return A map from message key to default value.
 */
export function collectDefaults(items: ClayConfigItem[]): Record<string, any> {
  return items.reduce((defaults: Record<string, any>, item) => {
    if (item.messageKey && item.defaultValue !== undefined) {
      defaults[item.messageKey] = item.defaultValue;
    }
    if (item.items) {
      Object.assign(defaults, collectDefaults(item.items));
    }
    return defaults;
  }, {});
}

// the watch payload is already sanitized C-side but guard each copy anyway so
// a malformed round-trip can't seed junk into the Clay store
const isString = (value: any) => typeof value === 'string';
const isEnum = (value: any) => typeof value === 'string' || typeof value === 'number';
const asBool = (value: any) => value === 1;

/**
 * The face's timezone settings, by the name to read them under and the key they ride on.
 *
 * A timezone setting is a `locationsearch` item marked `timeZone: true` on the settings page. The
 * Clay store keys on the name and an AppMessage dict keys on the number, so anything handling a
 * timezone field needs both halves. A picker whose key the face does not declare is left out.
 *
 * @param items The face's settings page, sections included.
 * @param messageKeys The face's message_keys map.
 * @return Every timezone field on the page that the face declares.
 */
function timezoneFieldsIn(items: ClayConfigItem[], messageKeys: any): Array<{ name: string; key: number }> {
  const fields: Array<{ name: string; key: number }> = [];

  const walk = (list: ClayConfigItem[]) => {
    list.forEach((item) => {
      // an array key such as CLOCK_TZ[1] is looked up through its base name, the same as the restore
      const key = item.type === 'locationsearch' && item.timeZone && item.messageKey ? keyIdFor(messageKeys, item.messageKey) : undefined;
      if (key !== undefined) {
        fields.push({ name: item.messageKey as string, key });
      }
      if (item.items) {
        walk(item.items);
      }
    });
  };
  walk(items);

  return fields;
}

/**
 * Rewrites every timezone field in a settings dict into the "offset,label" the watch reads.
 *
 * Clay hands back the place the config page saved. The offset in it is the one that zone kept on
 * the day the place was picked, so it is read off the zone again here.
 *
 * Only a string is rewritten, since anything else is not a saved place and blanking it would leave
 * the setting stuck.
 *
 * A field with nothing saved in it goes out empty, which is how the watch learns the wearer cleared
 * the picker. The watch reads an empty zone as none picked and shows no clock for it.
 *
 * @param dict The settings dict Clay built from a save.
 * @param messageKeys The face's message_keys map.
 * @param clayConfig The face's settings page, which marks the timezone fields.
 * @param nowMs The time to read each zone's offset at.
 * @return The same dict, with each timezone field rewritten.
 */
export function retimeSettings(dict: AppMessageDict, messageKeys: any, clayConfig: ClayConfigItem[], nowMs: number): AppMessageDict {
  timezoneFieldsIn(clayConfig, messageKeys).forEach((field) => {
    if (typeof dict[field.key] !== 'string') {
      return;
    }

    dict[field.key] = timezone.toWire(dict[field.key], nowMs);
  });

  return dict;
}

/**
 * Walks the settings page and records the type of every item that has a message key.
 *
 * @param items The Clay config items, sections included.
 * @param into The map to fill, from message key name to item type.
 * @return The same map.
 */
function itemTypes(items: ClayConfigItem[], into: Record<string, string> = {}): Record<string, string> {
  items.forEach((item) => {
    if (item.messageKey) {
      into[item.messageKey] = item.type;
    }
    if (item.items) {
      itemTypes(item.items, into);
    }
  });
  return into;
}

/**
 * How many decimal places each slider's step carries, keyed by message key name. Clay scales a
 * slider's value up by that many places on the way to the watch, so 1.5 on a step of 0.1 goes as 15.
 */
function sliderPrecisions(items: ClayConfigItem[], into: Record<string, number> = {}): Record<string, number> {
  items.forEach((item) => {
    if (item.type === 'slider' && item.messageKey && typeof item.step === 'number') {
      const decimals = String(item.step).split('.')[1];
      into[item.messageKey] = decimals ? decimals.length : 0;
    }
    if (item.items) {
      sliderPrecisions(item.items, into);
    }
  });
  return into;
}

/**
 * Puts the saved settings back in the shape the settings page hands Clay on a save, so a restore
 * sends the same dict a save does.
 *
 * Clay stores each setting as a bare value, and `getSettings` reads the page's `{ value }` wrapper
 * off anything that is an object. So every value goes back in a wrapper, which keeps an array such
 * as a checkboxgroup's whole, and a slider's wrapper carries the precision Clay scales it up by.
 *
 * Only the settings the face still has a message key for are kept. A name the face has since
 * renamed or dropped has no key, and Clay would send it under one called `undefined0`.
 *
 * @param config The settings as Clay stored them.
 * @param clayConfig The face's settings page, which holds each slider's step.
 * @param messageKeys The face's message_keys map.
 * @return The settings wrapped the way the settings page returns them.
 */
export function wrapStoredConfig(config: Record<string, any>, clayConfig: ClayConfigItem[], messageKeys: any): Record<string, any> {
  const precisions = sliderPrecisions(clayConfig);
  const wrapped: Record<string, any> = {};

  Object.keys(config).forEach((name) => {
    if (keyIdFor(messageKeys, name) === undefined) {
      return;
    }
    wrapped[name] = name in precisions ? { value: config[name], precision: precisions[name] } : { value: config[name] };
  });
  return wrapped;
}

/**
 * The message key id for a setting's name, or undefined when the face has no key for it.
 *
 * An array key such as SLOT[4] sits in message_keys under its base name alone, and each slot is
 * the base id plus its index, so SLOT[1] is looked up as SLOT plus one.
 *
 * @param messageKeys The face's message_keys map.
 * @param name The setting's name, such as CLOCK_DATE_FORMAT or SLOT[1].
 * @return The key id, or undefined.
 */
export function keyIdFor(messageKeys: any, name: string): number | undefined {
  if (messageKeys[name] !== undefined) {
    return messageKeys[name];
  }

  const slot = /^(.+)\[(\d+)\]$/.exec(name);
  if (!slot || typeof messageKeys[slot[1]] !== 'number') {
    return undefined;
  }

  return messageKeys[slot[1]] + Number(slot[2]);
}

/**
 * Turns one value off the watch into the form its settings page item stores, or undefined when it
 * should not seed.
 *
 * The watch sends a toggle as 0 or 1 and a colour as a number, and Clay wants a real boolean and a
 * number back. A slider holds a number too. Everything else a page offers, a select, an input, or a
 * face's own builder, is stored as a string, and a select's value arrives as its number.
 *
 * @param type The settings page item's type.
 * @param value The value the watch sent.
 * @return The value to store, or undefined to leave the setting alone.
 */
export function seedValue(type: string, value: any): any {
  switch (type) {
    case 'toggle':
      return typeof value === 'number' ? asBool(value) : undefined;
    case 'color':
      return typeof value === 'number' ? value : undefined;
    case 'slider':
      return isEnum(value) && value !== '' && !isNaN(Number(value)) ? Number(value) : undefined;
    case 'locationsearch':
      // a time zone field seeds on its own below, and any other place needs coordinates the
      // watch never keeps
      return undefined;
    default:
      return isEnum(value) ? String(value) : undefined;
  }
}

/**
 * Seeds the Clay store from the watch's current settings so the config opens
 * with the real values instead of defaults. The watch persist is the source of
 * truth, since the phone's clay-settings can be empty or stale after an update.
 *
 * Every setting the watch sends that the settings page has an item for is seeded, in the form that
 * item stores. A key with no item, such as the reply's own marker, is left out.
 *
 * A timezone field is the one exception. It only seeds when the phone has nothing
 * saved for it, since the watch's copy has lost the zone the phone's still holds.
 *
 * @param messageKeys The face's message_keys map.
 * @param payload The watch's AppMessage payload to seed from.
 * @param clayConfig The face's settings page, which says what each key holds.
 */
export function seedConfigFromWatch(messageKeys: any, payload: any, clayConfig: ClayConfigItem[]): void {
  const config = getConfig();
  const types = itemTypes(clayConfig);
  const precisions = sliderPrecisions(clayConfig);

  Object.keys(types).forEach((name) => {
    const messageKey = keyIdFor(messageKeys, name);
    if (messageKey === undefined || !(messageKey in payload)) {
      return;
    }

    let value = seedValue(types[name], payload[messageKey]);

    // the watch holds a slider scaled up by its step's decimal places, so 1.5 on a step of 0.1
    // arrives as 15. the page keeps the value itself, so it is scaled back down
    if (typeof value === 'number' && precisions[name]) {
      value = value / Math.pow(10, precisions[name]);
    }

    if (value !== undefined) {
      config[name] = value;
    }
  });

  // the watch keeps a timezone as the "offset,label" string it was sent, so seeding it back puts
  // the place name in front of the user. the zone itself does not survive that trip, so the picker
  // shows its prompt to choose the city again, which is the only way the zone comes back.
  // a place the phone already saved is kept, since it still has its zone. a face without
  // SETTINGS_FRESH seeds on every launch, so writing over it would lose the zone each time
  timezoneFieldsIn(clayConfig, messageKeys).forEach((field) => {
    if (config[field.name]) {
      return;
    }

    if (field.key in payload && isString(payload[field.key])) {
      config[field.name] = payload[field.key];
    }
  });

  localStorage.setItem('clay-settings', JSON.stringify(config));
}

/**
 * Starts the app: builds the Clay settings page, wires the lifecycle listeners,
 * and starts the features the face opts into.
 *
 * @param options The face's Clay config, its features, and any extra components
 *   or seed keys it needs.
 */
function startPebbleApp(options: StartOptions): void {
  const clayConfig = options.clayConfig;

  // required here (not at module load) so the unit specs can use the shared
  // helpers without loading Clay or the per-face message_keys alias
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Clay = require('@rebble/clay/src/js/index') as ClayConstructor;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const messageKeys = require('message_keys');
  // auto-handling off so we own the send path: Clay's own webviewclosed handler sends the settings
  // through Pebble.sendAppMessage directly, which bypasses queueSend and collides with any other
  // in-flight send (the losing message drops with no retry). we open the config and send the saved
  // settings ourselves below so every send goes through the one queue
  const clay = new Clay(clayConfig, options.customClay, { autoHandleEvents: false });

  // register the location autocomplete (referenced as type "locationsearch" in
  // config.ts) before the settings page is built
  clay.registerComponent(locationComponent);

  // any face-specific custom components (e.g. a layout builder)
  (options.components || []).forEach((component) => clay.registerComponent(component));

  // the defaults declared in config.ts
  const DEFAULTS = collectDefaults(clayConfig);

  // the face's timezone fields, empty for a face that declares none
  const timezoneFields = timezoneFieldsIn(clayConfig, messageKeys);

  // the last string pushed for each timezone field, so a refresh only sends one whose offset moved
  let lastTimezoneValues: Record<string, string> = {};

  /**
   * Sends any timezone field whose zone has moved its clock since the last push.
   *
   * This is how a daylight saving switch reaches the watch. Nothing about the saved settings
   * changes, only what the zone reads, so no save is involved and nothing goes out until the
   * offset is genuinely different.
   *
   * A field is only recorded once the watch acks it, so a send that is dropped after its retries
   * is picked up again on the next tick rather than counted as delivered.
   */
  function pushTimezones() {
    if (!timezoneFields.length) {
      return;
    }

    const config = getConfig();
    const dict: AppMessageDict = {};
    const sent: Record<string, string> = {};
    let moved = false;

    timezoneFields.forEach((field) => {
      const saved = readValue(config[field.name], '');
      if (typeof saved !== 'string') {
        return;
      }

      const value = timezone.toWire(saved, Date.now());
      if (!value || lastTimezoneValues[field.name] === value) {
        return;
      }

      sent[field.name] = value;
      dict[field.key] = value;
      moved = true;
    });

    if (moved) {
      queueSend(dict, () => {
        Object.keys(sent).forEach((name) => { lastTimezoneValues[name] = sent[name]; });
      });
    }
  }

  /**
   * Builds the dict for a save or a restore from the settings page.
   *
   * A face with SETTINGS_FRESH sends the key along with it. That is how the watch tells the page's
   * message apart from anything else carrying a setting, such as the time zone push on every ready.
   * Only the page's message ends a fresh watch, so a push landing first cannot stop the restore.
   * The value is 1 for a restore and 0 for a save, since a restore brings the unit the reading on the
   * watch was fetched in and a save can be the wearer switching it.
   */
  function pageSettings(json: string, restore: boolean): AppMessageDict {
    const dict = retimeSettings(clay.getSettings(json), messageKeys, clayConfig, Date.now());
    if (messageKeys.SETTINGS_FRESH !== undefined) {
      dict[messageKeys.SETTINGS_FRESH] = restore ? 1 : 0;
    }

    return dict;
  }

  /**
   * Sends a save or a restore from the settings page, and once the watch has it, records each
   * timezone field it carried. The next background push then leaves a zone the watch already holds
   * alone rather than sending it again.
   */
  function sendPageSettings(json: string, restore: boolean): void {
    const dict = pageSettings(json, restore);
    queueSend(dict, () => {
      timezoneFields.forEach((field) => {
        const value = dict[field.key];
        if (typeof value === 'string') {
          lastTimezoneValues[field.name] = value;
        }
      });
    });
  }

  // one AppMessage may be in flight at a time, so every send is serialized through this queue
  const queueSend = createSendQueue((dict, onOk, onFail) => Pebble.sendAppMessage(dict, onOk, onFail));

  // the features this face opted into, each started once with what the app shares. a face that
  // lists none never imports their code, so it stays out of that face's bundle
  const features: FeatureHooks[] = (options.features || []).map((feature) => feature({
    messageKeys,
    defaults: DEFAULTS,
    queueSend,
    refetchDelayMs: SETTINGS_REFETCH_DELAY_MS,
  }));

  /**
   * Runs one hook on every feature, each on its own. A throw from one is logged and the rest still
   * run, so a feature that breaks on this phone cannot take the refresh timer, the other features,
   * or a settings restore down with it.
   */
  function eachFeature(run: (feature: FeatureHooks) => void): void {
    features.forEach((feature) => {
      try {
        run(feature);
      } catch (error) {
        console.log('a feature hook threw: ' + error);
      }
    });
  }

  // the watch requests some listed feature answers. a request nothing answers means the face declares
  // a feature's keys without opting into it, which would otherwise go quiet with no clue in the log
  const answered = features.reduce((names: string[], feature) => names.concat(feature.requests || []), []);
  const unanswered = Object.keys(messageKeys).filter((name) => /_REQUEST$/.test(name) && name !== 'SETTINGS_REQUEST' && answered.indexOf(name) === -1);
  const warnedRequests: string[] = [];

  // while the JS is alive the phone drives its own refresh since a suspended JS never answers the
  // watch's poll. every sixth tick is a slow one, and each feature picks which ticks it wants
  const REFRESH_MS = 5 * 60 * 1000;
  const SLOW_REFRESH_EVERY = 6; // every ~30 min
  // whether the settings page is open, which each feature's snapshot of its settings belongs to
  let pageOpen = false;

  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let refreshTick = 0;

  /** Runs on the refresh timer. Pushes any timezone that moved, and lets each feature refresh. */
  function backgroundRefresh() {
    refreshTick++;
    const slow = refreshTick % SLOW_REFRESH_EVERY === 0;
    pushTimezones();
    eachFeature((feature) => feature.refresh?.(slow));
  }

  // app lifecycle listeners
  Pebble.addEventListener('ready', () => {
    console.log('PebbleKit JS Ready!');

    // a face with the fresh flag and settings already on the phone only needs to know whether the
    // watch booted empty, so it asks for that one field. anything else seeds from the whole snapshot
    const freshOnly = messageKeys.SETTINGS_FRESH !== undefined && Object.keys(getConfig()).length > 0;
    queueSend({ [messageKeys.SETTINGS_REQUEST]: freshOnly ? WIRE_CAPS.SETTINGS_REQUEST_FRESH : WIRE_CAPS.SETTINGS_REQUEST_FULL });

    // a watch that just rebooted holds no timezones, so every one goes out again
    lastTimezoneValues = {};

    pushTimezones();
    eachFeature((feature) => feature.ready?.());

    // the timer dies when the JS is suspended so re-arm it fresh on every ready
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }
    refreshTick = 0;
    refreshTimer = setInterval(backgroundRefresh, REFRESH_MS);
  });

  Pebble.addEventListener('appmessage', (event) => {
    const payload: Record<string, number | string> = event.payload || {};

    eachFeature((feature) => feature.message?.(payload));

    unanswered.forEach((name) => {
      if (messageKeys[name] in payload && warnedRequests.indexOf(name) === -1) {
        warnedRequests.push(name);
        console.warn(`The watch asked for ${name}, but no feature this face lists answers it. Add the feature to startPebbleApp's features`);
      }
    });

    // both restore paths seed the same way, so it is written once here
    const seedFromWatch = (from: any) => {
      seedConfigFromWatch(messageKeys, from, clayConfig);
    };

    // the watch's reply to our SETTINGS_REQUEST carries the request key back as its marker, so a
    // face is recognized whichever settings it declares
    if (messageKeys.SETTINGS_REQUEST in payload) {
      // faces that declare SETTINGS_FRESH get the two-way restore: the watch flags when it booted
      // with no saved settings (wiped by an install or update) so we push our own config back
      // instead of letting its defaults seed over ours. faces without the key always seed from the watch
      if (messageKeys.SETTINGS_FRESH !== undefined) {
        const config = getConfig();
        const phoneHasConfig = Object.keys(config).length > 0;
        const watchFresh = payload[messageKeys.SETTINGS_FRESH] === 1;

        if (watchFresh && phoneHasConfig) {
          // restore the watch from our saved config using the same dict a Save would send
          sendPageSettings(JSON.stringify(wrapStoredConfig(config, clayConfig, messageKeys)), true);
        } else if (!phoneHasConfig) {
          // nothing saved on the phone yet so recover it from the watch instead. the features
          // fetched on ready with the defaults, so each one whose settings the seed moved refetches,
          // the same as after a save. a watch on Fahrenheit got a Celsius reading otherwise, and
          // showed 22F for a 72F day until the next poll. with the page open the hooks are left
          // to it, since they would throw away the snapshot it opened on, and its close still
          // compares against the empty settings the seed moved
          if (pageOpen) {
            seedFromWatch(payload);
          } else {
            eachFeature((feature) => feature.configOpened?.());
            seedFromWatch(payload);
            eachFeature((feature) => feature.configSaved?.());
          }
        }
        // both sides have settings: the phone is the source of truth and already correct
      } else if (Object.keys(getConfig()).length === 0 && !pageOpen) {
        // a first seed on a face without SETTINGS_FRESH gets the same refetch. it seeds on every
        // launch, so only the first, into an empty phone, runs the hooks. a later one can write a
        // value back in another form, and a stock refetch forced on every launch would spend quota
        eachFeature((feature) => feature.configOpened?.());
        seedFromWatch(payload);
        eachFeature((feature) => feature.configSaved?.());
      } else {
        seedFromWatch(payload);
      }
    }
  });

  // the page's settings are saved once it closes, so each feature captures the values it cares
  // about here while the old ones are still in place
  Pebble.addEventListener('showConfiguration', () => {
    pageOpen = true;
    eachFeature((feature) => feature.configOpened?.());

    // Clay's auto-handling is off, so open the config page ourselves
    Pebble.openURL(clay.generateUrl());
  });

  Pebble.addEventListener('webviewclosed', (event) => {
    pageOpen = false;
    if (!event || !event.response) {
      return;
    }

    // send the saved settings to the watch through the queue. Clay's auto-handling would send this
    // directly and let it collide with an in-flight send (dropping the whole save with no retry).
    // Clay's auto-handling is off, so it has no webviewclosed handler of its own, and the save to
    // localStorage happens inside clay.getSettings, which pageSettings calls. some phones close the
    // page with a response that is not the settings at all, such as CANCELLED, and getSettings
    // throws on it. nothing was saved then, so there is nothing for a feature to refetch either
    try {
      sendPageSettings(event.response, false);
    } catch (error) {
      console.error('settings: page closed without settings', error);
      return;
    }

    // each feature refetches when one of its own settings changed. this has to run after
    // pageSettings, since that is what saves the new values each feature compares against
    eachFeature((feature) => feature.configSaved?.());
  });
}

export default {
  startPebbleApp,
};
