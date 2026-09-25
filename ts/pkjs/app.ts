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
import { request } from './request';
import { getConfig, readBool, readValue } from './settings-store';
import type { Feature, FeatureHooks } from './feature';
import type { ClayConfigItem } from '../clay/types';

/** The options a face hands startPebbleApp. */
export interface StartOptions {
  clayConfig: ClayConfigItem[];
  components?: unknown[];
  seedKeys?: string[];
  seedColorKeys?: string[];
  seedBoolKeys?: string[];
  customClay?: unknown;
  // the parts of the runtime only some faces use, such as weather, stocks, and the calendar
  features?: Feature[];
}

// how long after the config page closes a changed setting waits to refetch
const SETTINGS_REFETCH_DELAY_MS = 250;

/**
 * Walks the Clay config items and builds a map from each item's message key to its
 * declared default value, so the same defaults apply whether or not the user has
 * opened the settings page yet.
 *
 * @param items The Clay config items to walk, including any nested items.
 * @return A map from message key to default value.
 */
function collectDefaults(items: ClayConfigItem[]): Record<string, any> {
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
 * The Clay store keys on the name and an AppMessage dict keys on the number, so anything handling
 * a timezone field needs both halves. A face with no timezone key gets an empty list.
 *
 * @param messageKeys The face's message_keys map.
 * @return Every timezone field the face declares.
 */
function timezoneFieldsIn(messageKeys: any): Array<{ name: string; key: number }> {
  return Object.keys(messageKeys)
    .filter((name) => /TIME_?ZONE/i.test(name))
    .map((name) => ({ name: name, key: messageKeys[name] as number }));
}

/**
 * Rewrites every timezone field in a settings dict into the "offset,label" the watch reads.
 *
 * Clay hands back the place the config page saved. The offset in it is the one that zone kept on
 * the day the place was picked, so it is read off the zone again here.
 *
 * A face is free to name a key TIMEZONE without it holding a saved place, so only a string is
 * rewritten. A number is a toggle or a colour, and blanking one would leave that setting stuck.
 *
 * A field with nothing saved in it is dropped rather than sent. The watch reads an empty value as
 * zero minutes under no name, so sending one turns a working panel into UTC labelled TZ.
 *
 * @param dict The settings dict Clay built from a save.
 * @param messageKeys The face's message_keys map.
 * @param nowMs The time to read each zone's offset at.
 * @return The same dict, with each timezone field rewritten or dropped.
 */
function retimeSettings(dict: AppMessageDict, messageKeys: any, nowMs: number): AppMessageDict {
  timezoneFieldsIn(messageKeys).forEach((field) => {
    if (typeof dict[field.key] !== 'string') {
      return;
    }

    const wired = timezone.toWire(dict[field.key], nowMs);
    if (wired) {
      dict[field.key] = wired;
    } else {
      delete dict[field.key];
    }
  });

  return dict;
}

// settings we copy from the watch payload into the Clay store
// accept is an optional type guard and coerce an optional transform (default is copy as-is)
const SEED_FIELDS: Array<{ key: string; accept?: (value: any) => boolean; coerce?: (value: any) => any }> = [
  // temperature unit is a select so it seeds through seedKeys as a "0"/"1" string not here
  { key: 'CLOCK_DATE_FORMAT', accept: isString },
  { key: 'APPEARANCE_THEME', accept: isEnum, coerce: String },
  { key: 'HEALTH_STEPS_MODE', accept: isEnum, coerce: String },
  { key: 'CLOCK_TIME_FORMAT', accept: isEnum, coerce: String },
  { key: 'CONNECTION_BLUETOOTH_ICON', coerce: asBool },
  { key: 'CONNECTION_VIBE_CONNECT', accept: isEnum, coerce: String },
  { key: 'CONNECTION_VIBE_DISCONNECT', accept: isEnum, coerce: String },
];

/**
 * Seeds the Clay store from the watch's current settings so the config opens
 * with the real values instead of defaults. The watch persist is the source of
 * truth, since the phone's clay-settings can be empty or stale after an update.
 * A timezone field is the one exception. It only seeds when the phone has nothing
 * saved for it, since the watch's copy has lost the zone the phone's still holds.
 *
 * @param messageKeys The face's message_keys map.
 * @param payload The watch's AppMessage payload to seed from.
 * @param seedKeys Extra select-type face keys to seed as their string form.
 * @param seedColorKeys Extra colour-type face keys to seed as numbers.
 * @param seedBoolKeys Extra toggle-type face keys to seed as booleans.
 */
function seedConfigFromWatch(messageKeys: any, payload: any, seedKeys?: string[], seedColorKeys?: string[], seedBoolKeys?: string[]): void {
  const config = getConfig();

  SEED_FIELDS.forEach((field) => {
    const messageKey = messageKeys[field.key];
    if (!(messageKey in payload)) {
      return;
    }

    const value = payload[messageKey];
    if (field.accept && !field.accept(value)) {
      return;
    }

    config[field.key] = field.coerce ? field.coerce(value) : value;
  });

  // extra face keys (like layout rows and goals) are all selects so they
  // seed as the string form Clay expects
  (seedKeys || []).forEach((key) => {
    const messageKey = messageKeys[key];
    if (messageKey in payload && isEnum(payload[messageKey])) {
      config[key] = String(payload[messageKey]);
    }
  });

  // the other two wire shapes a face key can take. a colour has to stay a number because Clay's
  // picker reads a string as hex, and a toggle rides as 0/1 but sets from a real boolean
  (seedColorKeys || []).forEach((key) => {
    const messageKey = messageKeys[key];
    if (messageKey in payload && typeof payload[messageKey] === 'number') {
      config[key] = payload[messageKey];
    }
  });

  (seedBoolKeys || []).forEach((key) => {
    const messageKey = messageKeys[key];
    if (messageKey in payload) {
      config[key] = asBool(payload[messageKey]);
    }
  });

  // the watch keeps a timezone as the "offset,label" string it was sent, so seeding it back puts
  // the place name in front of the user. the zone itself does not survive that trip, so the picker
  // shows its prompt to choose the city again, which is the only way the zone comes back.
  // a place the phone already saved is kept, since it still has its zone. a face without
  // SETTINGS_FRESH seeds on every launch, so writing over it would lose the zone each time
  timezoneFieldsIn(messageKeys).forEach((field) => {
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
  const timezoneFields = timezoneFieldsIn(messageKeys);

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
   */
  function pageSettings(json: string): AppMessageDict {
    const dict = retimeSettings(clay.getSettings(json), messageKeys, Date.now());
    if (messageKeys.SETTINGS_FRESH !== undefined) {
      dict[messageKeys.SETTINGS_FRESH] = 0;
    }

    return dict;
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

  // the watch requests some listed feature answers. a request nothing answers means the face declares
  // a feature's keys without opting into it, which would otherwise go quiet with no clue in the log
  // plain arrays rather than Set or flatMap, since PebbleKit JS runs on older phone JS engines
  const answered = features.reduce((names: string[], feature) => names.concat(feature.requests || []), []);
  const unanswered = Object.keys(messageKeys).filter((name) => /_REQUEST$/.test(name) && name !== 'SETTINGS_REQUEST' && answered.indexOf(name) === -1);
  const warnedRequests: string[] = [];

  // while the JS is alive the phone drives its own refresh since a suspended JS never answers the
  // watch's poll. every sixth tick is a slow one, and each feature picks which ticks it wants
  const REFRESH_MS = 5 * 60 * 1000;
  const SLOW_REFRESH_EVERY = 6; // every ~30 min
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let refreshTick = 0;

  /** Runs on the refresh timer. Pushes any timezone that moved, and lets each feature refresh. */
  function backgroundRefresh() {
    refreshTick++;
    const slow = refreshTick % SLOW_REFRESH_EVERY === 0;
    pushTimezones();
    features.forEach((feature) => feature.refresh?.(slow));
  }

  // app lifecycle listeners
  Pebble.addEventListener('ready', () => {
    console.log('PebbleKit JS Ready!');
    queueSend({ [messageKeys.SETTINGS_REQUEST]: 1 });

    // a watch that just rebooted holds no timezones, so every one goes out again
    lastTimezoneValues = {};

    pushTimezones();
    features.forEach((feature) => feature.ready?.());

    // the timer dies when the JS is suspended so re-arm it fresh on every ready
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }
    refreshTick = 0;
    refreshTimer = setInterval(backgroundRefresh, REFRESH_MS);
  });

  Pebble.addEventListener('appmessage', (event) => {
    const payload: Record<string, number | string> = event.payload || {};

    features.forEach((feature) => feature.message?.(payload));

    unanswered.forEach((name) => {
      if (messageKeys[name] in payload && warnedRequests.indexOf(name) === -1) {
        warnedRequests.push(name);
        console.warn(`The watch asked for ${name}, but no feature this face lists answers it. Add the feature to startPebbleApp's features`);
      }
    });

    // both restore paths seed the same way, so the face's key lists are named once here rather
    // than repeated at each call
    const seedFromWatch = (from: any) => {
      seedConfigFromWatch(messageKeys, from, options.seedKeys, options.seedColorKeys, options.seedBoolKeys);
    };

    // the watch's reply to our SETTINGS_REQUEST carries its current settings
    if (messageKeys.CLOCK_DATE_FORMAT in payload || messageKeys.APPEARANCE_THEME in payload) {
      // faces that declare SETTINGS_FRESH get the two-way restore: the watch flags when it booted
      // with no saved settings (wiped by an install or update) so we push our own config back
      // instead of letting its defaults seed over ours. faces without the key keep the old seed
      if (messageKeys.SETTINGS_FRESH !== undefined) {
        const config = getConfig();
        const phoneHasConfig = Object.keys(config).length > 0;
        const watchFresh = payload[messageKeys.SETTINGS_FRESH] === 1;

        if (watchFresh && phoneHasConfig) {
          // restore the watch from our saved config using the same dict a Save would send
          queueSend(pageSettings(JSON.stringify(config)));
        } else if (!phoneHasConfig) {
          // nothing saved on the phone yet so recover it from the watch instead
          seedFromWatch(payload);
        }
        // both sides have settings: the phone is the source of truth and already correct
      } else {
        seedFromWatch(payload);
      }
    }
  });

  // Clay saves the new settings in its own webviewclosed handler which runs
  // before ours, so each feature captures the values it cares about while the page is still open
  Pebble.addEventListener('showConfiguration', () => {
    features.forEach((feature) => feature.configOpened?.());

    // Clay's auto-handling is off, so open the config page ourselves
    Pebble.openURL(clay.generateUrl());
  });

  Pebble.addEventListener('webviewclosed', (event) => {
    if (!event || !event.response) {
      return;
    }

    // send the saved settings to the watch through the queue. Clay's auto-handling would send this
    // directly and let it collide with an in-flight send (dropping the whole save with no retry)
    queueSend(pageSettings(event.response));

    // each feature refetches when one of its own settings changed
    features.forEach((feature) => feature.configSaved?.());
  });
}

export default {
  startPebbleApp,
  collectDefaults,
  request,
  getConfig,
  readValue,
  readBool,
  seedConfigFromWatch,
  retimeSettings,
  SETTINGS_REFETCH_DELAY_MS,
};
