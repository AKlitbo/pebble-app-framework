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
import themePreviewComponent from '../clay/theme-preview-component';
import hiddenStoreComponent from '../clay/hidden-store-component';
import pageStyleComponent from '../clay/page-style-component';
import dependentVisibility from '../clay/dependent-visibility';
import providerKeysFn from '../clay/provider-keys-fn';
import { combineCustomFns, customClayShape } from '../clay/custom-fn';
import { copyPage } from '../clay/copy-page';
import { settleIntro } from '../clay/rows';
import timezone from './timezone';
import { createSendQueue } from './send-queue';
import { createSettingsAsk } from './settings-ask';
import { getConfig, readValue } from './settings-store';
import { addProviderKeys, fileSavedRows, forgetOwners, hasKeyRows, keysForOpen, loadProviderKeys, mergeProviderKeys, recordOwners, saveProviderKeys, takePageKeys } from './provider-keys';
import { WIRE_CAPS } from './wire';
import { faceProviders } from '../face-providers';
import type { Feature, FeatureHooks, ProviderLists } from './feature';
import type { FaceProviders } from '../face-providers/narrow';
import type { ClayConfigItem } from '../clay/types';

/** The options a face hands startPebbleApp. */
export interface StartOptions {
  clayConfig: ClayConfigItem[];
  components?: unknown[];
  /**
   * The face's own code for its settings page, which runs after the framework's. Write it as a
   * `function`, not an arrow, since Clay hands it the page as `this` and an arrow cannot take one.
   */
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

/**
 * Whether any item on the page, sections and their nested items included, is of one component type.
 *
 * @param items The Clay config items to walk.
 * @param type The component type name to look for, such as 'themePreview'.
 * @return True when any item carries that type.
 */
export function usesComponent(items: ClayConfigItem[], type: string): boolean {
  return items.some((item) => item.type === type || (item.items ? usesComponent(item.items, type) : false));
}

/**
 * Whether any item on the page, sections and their nested items included, declares a `visibleWhen`.
 *
 * @param items The Clay config items to walk.
 * @return True when any item depends on another's value for whether it shows.
 */
export function hasVisibleWhen(items: ClayConfigItem[]): boolean {
  return items.some((item) => item.visibleWhen !== undefined || (item.items ? hasVisibleWhen(item.items) : false));
}

/** Whether any row on a page carries the keys for its provider select. */
function hasProviderKeys(items: ClayConfigItem[]): boolean {
  return items.some((item) => item.providerKeys !== undefined || (item.items ? hasProviderKeys(item.items) : false));
}

/**
 * The custom function Clay gets for one page. The framework's show and hide comes first when the
 * page has any visibleWhen row, then the key for each provider when a key row carries them, and the
 * face's customClay runs last, so the face's code can still change a row the framework showed or
 * hid. A page with none of them gets no custom function.
 */
function pageCustomFn(page: ClayConfigItem[], customClay: unknown): unknown {
  return combineCustomFns([
    { code: hasVisibleWhen(page) ? dependentVisibility : undefined, label: 'the framework\'s show and hide' },
    { code: hasProviderKeys(page) ? providerKeysFn : undefined, label: 'the framework\'s key for each provider' },
    { code: customClay, label: 'the face\'s customClay' },
  ]);
}

/**
 * Runs one hook on every feature, each on its own. A throw from one is logged and the rest still run,
 * so a feature that breaks on this phone cannot take the refresh timer, the other features, or a
 * settings restore down with it. The log line names the hook, such as seeded or refresh.
 */
function runFeatureHooks(features: FeatureHooks[], hook: string, run: (feature: FeatureHooks) => void): void {
  features.forEach((feature) => {
    try {
      run(feature);
    } catch (error) {
      console.log(`a feature ${hook} hook threw: ` + error);
    }
  });
}

/**
 * Passes the settings page through each feature's page hook in turn, so a feature can add a choice
 * only this phone can offer.
 *
 * Each hook runs on its own. One that throws, or hands back something that is not a page, is skipped
 * and logged, and the page the hooks before it made goes on to the next. The page passed in is the
 * face's own on every open, so nothing one open adds is still there for the next.
 *
 * Each hook gets its own copy of the page so far, which it can change and hand back. The defaults,
 * the settings restore, and every later open read the face's page, so a hook that changed the page
 * itself would change all of them. A hook that throws partway through its changes leaves only its
 * own copy half done, and the page the hooks before it made goes on whole.
 *
 * @param config The face's own settings page. It is never changed.
 * @param features The started features, in the order the face lists them.
 * @return The page to open. With no page hooks, it is the page passed in.
 */
export function foldFeatures(config: ClayConfigItem[], features: FeatureHooks[]): ClayConfigItem[] {
  return features.reduce((page, feature) => {
    if (!feature.page) {
      return page;
    }

    try {
      const next = feature.page(copyPage(page));

      if (Array.isArray(next)) {
        return next;
      }

      console.log('a feature page hook handed back no page, so it is skipped');
    } catch (error) {
      console.log('a feature page hook threw: ' + error);
    }

    return page;
  }, config);
}

/** The page and the custom function an open goes back to when a fold cannot open. */
export interface BuiltPage {
  /** The face's page as faceStart's fallbackPage gives it, with its intro settled. */
  config: unknown[];
  /** The custom function Clay was built with. */
  customFn: unknown;
}

/**
 * Gets the Clay page ready to open, the way the phone does each time the wearer opens the settings.
 *
 * Each feature's configOpened runs first, while the old settings are still the saved ones. Then,
 * when any feature has a page hook or the page has an API key row, the page goes through
 * foldFeatures, each key row gets the key held for every provider of its select, and Clay gets the
 * result. Clay writes the page from clay.config and clay.customFn on every generateUrl, so both are
 * set here rather than building Clay again. The folds always start from the face's own page, which
 * the defaults and the settings restore also read. With neither the page is left as Clay built it.
 *
 * A feature can hand over the Clay components its page hook's rows need, as the plugin sources do
 * for their notes. Each one is registered for a page that uses it, and taken off again on an open
 * whose page does not, so a page without those rows never carries their code. The hidden store is
 * registered for a folded page that gains a hiddenStore row, and the builder's intro drops its
 * mention of weather when the fold leaves no Weather section. The custom function
 * is put together again on every open from that open's page, the framework's show and hide when it
 * has a visibleWhen row, the key for each provider when it has a key row, and then the face's
 * customClay, so no open keeps the one an earlier open needed. A fold that throws, or that needs a
 * component nothing registers, opens the page Clay was built with, since a settings page that will
 * not build is worse than one without the features' rows.
 *
 * startPebbleApp calls this on every showConfiguration, and the dev plugin's clay-preview calls it
 * too, so the preview opens the page the phone would.
 *
 * @param clay The Clay page createClay built.
 * @param options What the face handed startPebbleApp.
 * @param features The started features, in the order the face lists them.
 * @param built The page and the custom function Clay was built with.
 */
export function prepareSettingsPage(clay: InstanceType<ClayConstructor>, options: StartOptions, features: FeatureHooks[], built: BuiltPage): void {
  runFeatureHooks(features, 'configOpened', (feature) => feature.configOpened?.());

  const clayConfig = options.clayConfig;

  // a face whose features bring no page hook, and whose page has no API key row to keep a key per
  // provider in, opens the page Clay was built with, untouched
  if (!features.some((feature) => typeof feature.page === 'function') && !hasKeyRows(clayConfig)) {
    return;
  }

  const brought = features.reduce((all: unknown[], feature) => all.concat(Array.isArray(feature.components) ? feature.components : []), []);

  try {
    const folded = settledPage(foldFeatures(clayConfig, features));

    // each key row opens with the key the phone holds for every provider of its select. the saved
    // row is filed under the provider it belongs to first, and a saved key with no entry of its own
    // is filed under the provider saved beside it
    addProviderKeys(folded, keysForOpen(loadProviderKeys(localStorage), getConfig(), collectDefaults(clayConfig), folded));

    fitComponents(clay, brought, folded);

    // a hook can add a hidden store row the page Clay was built with did not have
    fitHiddenStore(clay, folded);

    // a look taken for a framework row on an earlier open comes off once nothing draws with it
    dropFoldLooks(clay, folded);

    // Clay registers its own components only for the types on the page it was built with, so a
    // fold that adds a text row to a page without one needs it registered. a framework row a fold
    // adds to a page without the Clay row it takes its look from needs that one too. one spare Clay
    // built from the folded page, with a row of each look it lacks, registers each of its own the
    // page uses, and the real one takes what it lacks
    const looks = looksNeeded(clay, folded);

    if (typesWithoutComponent(folded, clay.components || {}).length || looks.length) {
      const spare = spareClay([...folded, ...looks.map((type) => ({ type }))]);

      Object.keys(spare.components || {}).forEach((name) => {
        if (!(name in (clay.components || {}))) {
          clay.registerComponent(spare.components[name]);
        }
      });

      // a look the page also has a row of its own for stays like any other type the fold adds
      looks.filter((type) => !usesComponent(folded, type) && type in (clay.components || {})).forEach((type) => {
        takeLook(clay, type, true);
      });
    }

    const missing = typesWithoutComponent(folded, clay.components || {});

    if (missing.length) {
      console.warn(`startPebbleApp: the settings page has ${missing.join(', ')} rows that no component draws, so the page opens without the features' rows`);
      clay.config = built.config;
      clay.customFn = built.customFn;
      fitComponents(clay, brought, built.config as ClayConfigItem[]);
      fitLooks(clay, built.config as ClayConfigItem[]);
      return;
    }

    clay.config = folded;

    // a face with its own customClay always has page code, its function alone or behind the show
    // and hide, so its open never reaches the fallback. without one, a page with no visibleWhen row
    // has no page code and goes back to the function Clay was built with. for a face page with no
    // visibleWhen row that is Clay's own do-nothing one, so the page's text stays exactly as Clay
    // writes it. a hook that took away every visibleWhen row of a face page that had them leaves
    // dependentVisibility in place, which finds no row to hide and does nothing
    clay.customFn = pageCustomFn(folded, options.customClay) || built.customFn;
  } catch (error) {
    console.log('the features\' settings page threw, so the page opens without their rows: ' + error);
    clay.config = built.config;
    clay.customFn = built.customFn;
    fitComponents(clay, brought, built.config as ClayConfigItem[]);
    fitLooks(clay, built.config as ClayConfigItem[]);
  }
}

/**
 * Registers each component a feature brought that the page uses, and takes off each one it brought
 * that the page does not use, so the page Clay writes carries only the code it draws with.
 *
 * Only the very component a feature handed over is taken off. A face's own component of the same
 * name, registered by the face, stays as it is. A feature's own text box or select takes the place of
 * one the framework took from Clay for a framework row's look, the way a face's own does. Clay keeps its components in a plain object and
 * writes all of them into the page on every generateUrl, so removing one leaves nothing behind.
 */
function fitComponents(clay: InstanceType<ClayConstructor>, brought: unknown[], page: ClayConfigItem[]): void {
  const registry = clay.components || {};

  brought.forEach((component) => {
    const name = component && typeof component === 'object' ? (component as { name?: unknown }).name : undefined;

    if (typeof name !== 'string') {
      return;
    }

    if (usesComponent(page, name)) {
      if (!(name in registry) || holdsTakenLook(clay, name)) {
        clay.registerComponent(component);
      }
    } else if (registry[name] === component) {
      delete registry[name];
    }
  });
}

/** Every item type on the page, sections and the rows inside them. */
function typesOn(items: ClayConfigItem[], into: string[] = []): string[] {
  items.forEach((item) => {
    if (into.indexOf(item.type) === -1) {
      into.push(item.type);
    }

    if (item.items) {
      typesOn(item.items, into);
    }
  });
  return into;
}

/**
 * The item types on a page that no registered component draws. A row of such a type stops the page
 * with "is not registered" in the webview.
 */
function typesWithoutComponent(page: ClayConfigItem[], components: Record<string, unknown>): string[] {
  // Clay lays out a section itself, so it has no component
  return typesOn(page).filter((type) => type !== 'section' && !(type in components));
}

// the watch payload is already sanitized C-side but guard each copy anyway so
// a malformed round-trip can't seed junk into the Clay store
const isString = (value: any) => typeof value === 'string';
const isEnum = (value: any) => typeof value === 'string' || typeof value === 'number';
const asBool = (value: any) => value === 1;

/**
 * Every timezone field on the face's settings page, sections included, by the name it saves under
 * and the key it rides on the wire.
 *
 * A timezone setting is a `locationsearch` item marked `timeZone: true` on the settings page. The
 * Clay store keys on the name and an AppMessage dict keys on the number, so anything handling a
 * timezone field needs both halves. A picker whose key the face does not declare is left out.
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
 * Walks the settings page, sections included, and records the type of every item that has a
 * message key into the map passed in, keyed by message key name.
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
 * Copies a message from the watch so each key the face declares can be read by its number.
 *
 * Everything here reads a message by number, as in `payload[messageKeys.SETTINGS_REQUEST]`. The
 * Pebble phone app hands PebbleKit JS a message keyed by name alone, such as `SETTINGS_REQUEST`. So
 * a name the face declares gets its number beside it. A name in the array form, such as SLOT[1], is
 * looked up through keyIdFor the same as a setting. The names stay, and a number already in the
 * message is left as it came.
 *
 * @param messageKeys The face's message_keys map.
 * @param payload The message as PebbleKit JS handed it over.
 * @return A copy of the message with each declared key under its number as well as its name.
 */
export function payloadByKeyId(messageKeys: any, payload: Record<string, any>): Record<string, any> {
  const keyed: Record<string, any> = Object.assign({}, payload);

  Object.keys(payload).forEach((name) => {
    const key = keyIdFor(messageKeys, name);

    if (key !== undefined && !(key in keyed)) {
      keyed[key] = payload[name];
    }
  });

  return keyed;
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
 * Each feature's seeded hook then runs on the settings before they are saved, so what it sets is
 * saved with the rest. One that throws is skipped and logged, and the settings are still saved.
 *
 * @param messageKeys The face's message_keys map.
 * @param payload The watch's AppMessage payload to seed from.
 * @param clayConfig The face's settings page, which says what each key holds.
 * @param features The started features, whose seeded hooks run before the save. Left out, none run.
 */
export function seedConfigFromWatch(messageKeys: any, payload: any, clayConfig: ClayConfigItem[], features: FeatureHooks[] = []): void {
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
  // a place the phone already saved is kept, since it still has its zone and writing over it would
  // lose the zone
  timezoneFieldsIn(clayConfig, messageKeys).forEach((field) => {
    if (config[field.name]) {
      return;
    }

    if (field.key in payload && isString(payload[field.key])) {
      config[field.name] = payload[field.key];
    }
  });

  const echoed = (name: string): unknown => {
    const messageKey = keyIdFor(messageKeys, name);

    return messageKey !== undefined && messageKey in payload ? payload[messageKey] : undefined;
  };

  runFeatureHooks(features, 'seeded', (feature) => feature.seeded?.(config, echoed));

  localStorage.setItem('clay-settings', JSON.stringify(config));
}

/**
 * Checks the face's customClay once, as the app starts, so every page after can take it as a function.
 *
 * Something that is not a function stops the start with Clay's own message for a custom function
 * that is not one, so the error is the same whatever the page holds. An arrow is only
 * warned about. It runs, but Clay hands the custom function the page as `this`, and an arrow sees
 * whatever `this` was around it instead, so the face's code cannot reach the page.
 *
 * customClayShape in custom-fn.ts sorts it, the same check paf build stops on, so a method shorthand
 * gets the arrow's warning too.
 */
function checkCustomClay(customClay: unknown): void {
  const shape = customClayShape(customClay);

  if (shape === 'not-function') {
    throw new Error('customFn must be a function or "null"');
  }

  if (shape === 'not-plain') {
    console.warn('startPebbleApp: write customClay as a function, not an arrow, since Clay hands it the settings page as this');
  }
}

/**
 * Registers the hidden store for a page with a hiddenStore row, since Clay stops building the page at
 * the first row it has no component for. A component already registered under the name stays, so a
 * face that still lists the store keeps its page as it was, and a face's own hiddenStore keeps that one.
 */
function fitHiddenStore(clay: InstanceType<ClayConstructor>, page: ClayConfigItem[]): void {
  if (usesComponent(page, hiddenStoreComponent.name) && !(hiddenStoreComponent.name in (clay.components || {}))) {
    clay.registerComponent(hiddenStoreComponent);
  }
}

/**
 * Builds a Clay only to take the components it registers for a page, without the listener its
 * constructor adds.
 *
 * Clay keeps its own components to itself and registers one only for a row on the page it is built
 * from, so a spare Clay is the way to reach one the real page lacks. Its constructor also adds a
 * ready listener that reads the watch info and the account and watch tokens into the spare, which
 * nothing reads. So the spare is built with Pebble.addEventListener swapped for a function that does
 * nothing, and the real one goes back straight after, even when the build throws. A bridge that will
 * not take the swap keeps its own and is left alone after, and the spare's listener then only fills
 * in fields nobody reads.
 */
function spareClay(page: ClayConfigItem[]): InstanceType<ClayConstructor> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Clay = require('@rebble/clay/src/js/index') as ClayConstructor;
  const bridge = typeof Pebble === 'undefined' ? null : Pebble;
  const listen = bridge ? bridge.addEventListener : null;
  const quiet = function () {} as PebbleBridge['addEventListener'];
  let swapped = false;

  // a bridge that refuses the swap keeps its listener, which still builds the spare. one whose
  // listener is a getter with no setter throws here, since this file is strict, and putting the
  // listener back after would throw the same way out of the settings page
  try {
    if (bridge) {
      bridge.addEventListener = quiet;
      swapped = bridge.addEventListener === quiet;
    }
  } catch {
    swapped = false;
  }

  try {
    return new Clay(page, null, { autoHandleEvents: false });
  } finally {
    if (bridge && listen && swapped) {
      bridge.addEventListener = listen;
    }
  }
}

/**
 * The framework's rows that draw a Clay component's markup and take their look from its style, by the
 * row's type, with the type of the Clay component each one borrows.
 *
 * The location search draws Clay's text box, the dark rounded field with the label above it, and the
 * theme picker draws Clay's select, the chosen name with an arrow beside it over an unseen dropdown.
 * Clay adds a component's style only to a page that registers the component, and registers its own
 * only for the types on the page it was built with. Without it the search shows as a plain white
 * field beside its label on a page with no other text box, and the picker shows the bare dropdown on
 * a page with no other select.
 */
const BORROWED_LOOKS: Record<string, string> = {
  [locationComponent.name]: 'input',
  [themePreviewComponent.name]: 'select',
};

/**
 * The Clay components a page's framework rows borrow their look from that nothing has registered. A
 * component already registered, Clay's own or a face's, is the one those rows use.
 */
function looksNeeded(clay: InstanceType<ClayConstructor>, page: ClayConfigItem[]): string[] {
  const registry = clay.components || {};

  return Object.keys(BORROWED_LOOKS)
    .filter((row) => usesComponent(page, row))
    .map((row) => BORROWED_LOOKS[row])
    .filter((type, index, all) => all.indexOf(type) === index && !(type in registry));
}

/** A Clay component the framework took for a framework row's look, and whether a fold took it. */
interface TakenLook {
  component: unknown;
  fold: boolean;
}

/** The Clay components each Clay took only for a framework row's look, by type, by the Clay they went to. */
const takenLooks = new WeakMap<object, Record<string, TakenLook>>();

/** Marks the component a Clay now holds under a type as one taken only for a framework row's look. */
function takeLook(clay: InstanceType<ClayConstructor>, type: string, fold: boolean): void {
  const taken = takenLooks.get(clay) || {};

  taken[type] = { component: (clay.components || {})[type], fold };
  takenLooks.set(clay, taken);
}

/**
 * Whether a Clay still holds, under a name, the component the framework took for a framework row's
 * look, rather than one the face, a feature, or the page brought.
 */
function holdsTakenLook(clay: InstanceType<ClayConstructor>, name: string): boolean {
  const look = (takenLooks.get(clay) || {})[name];

  return Boolean(look) && (clay.components || {})[name] === look.component;
}

/**
 * Registers each Clay component a page's framework rows take their look from that nothing has
 * registered, from one spare Clay, and marks them as a fold's so a later open can take them off.
 */
function fitLooks(clay: InstanceType<ClayConstructor>, page: ClayConfigItem[]): void {
  const looks = looksNeeded(clay, page);

  if (!looks.length) {
    return;
  }

  const spare = spareClay(looks.map((type) => ({ type })));

  looks.filter((type) => type in (spare.components || {})).forEach((type) => {
    clay.registerComponent(spare.components[type]);
    takeLook(clay, type, true);
  });
}

/**
 * Takes off each component an earlier open took for a framework row's look once the page has no row
 * that borrows it and no row of its own of that type, the way fitComponents takes off what a feature
 * brought. Clay writes every component it holds into the page, so one left on would carry its code
 * and style on every later open. Only a look a fold took comes off. A component the face, a feature,
 * or the page itself brought is never one taken here, so it stays.
 */
function dropFoldLooks(clay: InstanceType<ClayConstructor>, page: ClayConfigItem[]): void {
  const taken = takenLooks.get(clay) || {};
  const registry = clay.components || {};

  Object.keys(taken).filter((type) => taken[type].fold).forEach((type) => {
    const borrowed = Object.keys(BORROWED_LOOKS).some((row) => BORROWED_LOOKS[row] === type && usesComponent(page, row));

    if (borrowed || usesComponent(page, type)) {
      return;
    }

    if (holdsTakenLook(clay, type)) {
      delete registry[type];
    }

    delete taken[type];
  });
}

/**
 * Builds the face's Clay settings page with every component it needs registered.
 *
 * That is the framework's rules for the whole page, the location autocomplete, which config.ts
 * names as type "locationsearch", and Clay's own text box and select for the search and the theme
 * picker to take their look from. Then the theme picker and the hidden store for a page that holds
 * one, and the components the face passes. A face that still passes the hidden store keeps the one
 * it passed. startPebbleApp builds the phone's page here, and the dev plugin's clay-preview builds its
 * copy here too, so the two always register the same components.
 *
 * Clay's custom function is put together the way prepareSettingsPage puts it together on each open,
 * the framework's show and hide for a page with a visibleWhen row and then the face's customClay.
 * A customClay that is not a function stops the build with Clay's own error, and an arrow gets a
 * warning, since it cannot take the page as `this`.
 *
 * @param options The face's Clay config, its customClay, and its own components.
 * @return The Clay page, ready to open or to turn into a URL.
 */
export function createClay(options: StartOptions): InstanceType<ClayConstructor> {
  // required here (not at module load) so the unit specs can use the shared
  // helpers without loading Clay
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Clay = require('@rebble/clay/src/js/index') as ClayConstructor;

  // auto-handling off so we own the send path: Clay's own webviewclosed handler sends the settings
  // through Pebble.sendAppMessage directly, which bypasses queueSend and collides with any other
  // in-flight send (the losing message drops with no retry). startPebbleApp opens the config and
  // sends the saved settings itself so every send goes through the one queue
  checkCustomClay(options.customClay);

  const page = settledPage(options.clayConfig);
  const clay = new Clay(page, pageCustomFn(page, options.customClay), { autoHandleEvents: false });

  // the framework's rules for the whole page go ahead of the face's components, so a face's component
  // can still set a row's padding with a rule of the same weight. a fold registers what it borrows
  // from a second Clay, and what the features bring, after the face's. that leaves the face's still
  // behind these rules, and Clay's own row rules weigh less than these, so their place does not matter
  clay.registerComponent(pageStyleComponent);

  // the Clay components the framework's rows take their look from go ahead of those rows, as they sit
  // on a page Clay drew one on. a face passing its own keeps the place it registers it in, and no
  // spare is built for it
  const facesOwn = (options.components || []).map((component) => (component as { name?: unknown } | null)?.name);
  const looks = looksNeeded(clay, page).filter((type) => !facesOwn.includes(type));

  if (looks.length) {
    const spare = spareClay(looks.map((type) => ({ type })));

    looks.filter((type) => type in (spare.components || {})).forEach((type) => {
      clay.registerComponent(spare.components[type]);
      takeLook(clay, type, false);
    });
  }

  // the location autocomplete goes next, before the settings page is built
  clay.registerComponent(locationComponent);

  // the theme picker with pictures is registered only when the page holds one, so a face without
  // previews carries none of its code in its page and needs no components entry of its own
  if (usesComponent(page, 'themePreview')) {
    clay.registerComponent(themePreviewComponent);
  }

  // any face-specific custom components (e.g. a layout builder)
  (options.components || []).forEach((component) => clay.registerComponent(component));

  // after the face's own, so a face that still lists the hidden store keeps the place it gave it
  fitHiddenStore(clay, page);

  return clay;
}

/**
 * A copy of the page with the builder's intro settled for the rows it holds, as settleIntro does it.
 *
 * Every page the phone opens comes through here, the one Clay is built with, each fold, and the
 * fallback, so none of them mentions a Weather section it lost and Clay never sees the mark. The copy
 * leaves the face's own page as it was, mark and all, for the next open to settle again.
 */
function settledPage(page: unknown[]): ClayConfigItem[] {
  const copy = copyPage(page) as ClayConfigItem[];

  settleIntro(copy);
  return copy;
}

/** What a face's providers list makes of what the face hands startPebbleApp. */
export interface FaceStart {
  /** The face's options, with its settings page narrowed to the providers it lists. */
  options: StartOptions;
  /** The defaults that page declares, with each listed kind's provider default filled in. */
  defaults: Record<string, any>;
  /** The lists every feature reads from its context, or null for a face that lists none. */
  providers: ProviderLists | null;
  /** The providers' own hooks, which run after every feature's. Empty for a face that lists none. */
  hooks: FeatureHooks[];
  /**
   * Whether the last settings restore from the watch brought back something the providers' settle
   * changed, which the watch then has to hear. Asking clears it. Always false for a face that lists none.
   */
  seedSettled(): boolean;
  /**
   * Whether the settle at launch changed the settings the phone had saved, which a watch that kept its
   * own settings still has to hear. Asking clears it. Always false for a face that lists none.
   */
  launchSettled(): boolean;
  /**
   * The page an open falls back to when the features' rows cannot be added, from the face's page as
   * the start narrowed it. A face that lists none gets that page back with only its intro settled.
   */
  fallbackPage(config: unknown[]): unknown[];
}

/**
 * Gets a face's start ready the way its providers list says, before anything reads its page.
 *
 * A face that lists providers hands this to the face providers code the build wrote in, which narrows
 * the page, fills the provider defaults, settles the saved settings, and brings the hooks that run
 * after every feature's. A face that lists none gets its own options back, the defaults its page
 * declares, and no hooks, so its page and its start are what they would be with no providers code.
 * Everything only a face with a list runs stays behind the build's swap, so it never reaches the
 * bundle of a face without one.
 *
 * startPebbleApp calls this before it builds Clay, and the dev plugin's clay-preview calls it too, so
 * the preview opens the page the phone would.
 *
 * @param options What the face handed startPebbleApp.
 * @param providers The face's providers, as the build wrote them. Left out, the face's own.
 * @return The options to start with, the defaults, the lists for the features, and the providers' hooks.
 */
export function faceStart(options: StartOptions, providers: FaceProviders | null = faceProviders): FaceStart {
  const start: FaceStart = providers
    ? providers.start(options, collectDefaults)
    : { options, defaults: collectDefaults(options.clayConfig), providers: null, hooks: [], seedSettled: () => false, launchSettled: () => false, fallbackPage: (config) => config };
  const fallback = start.fallbackPage;

  // the fallback is a page the phone opens too, so its intro is settled once its rows are final
  return { ...start, fallbackPage: (config) => settledPage(fallback(config)) };
}

/**
 * Starts the app: builds the Clay settings page, wires the lifecycle listeners,
 * and starts the features the face opts into.
 *
 * @param faceOptions The face's Clay config, its features, and any extra components
 *   or seed keys it needs.
 */
function startPebbleApp(faceOptions: StartOptions): void {
  // required here (not at module load) so the unit specs can use the shared
  // helpers without loading the per-face message_keys alias
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const messageKeys = require('message_keys');

  // a face with no settings of its own declares neither settings key, so the phone never asks for the
  // watch's settings and sends no fresh flag. the build refuses one key without the other
  const hasSettingsKeys = messageKeys.SETTINGS_REQUEST !== undefined && messageKeys.SETTINGS_FRESH !== undefined;

  // the face's page narrowed to the providers it lists, which every reader of the page takes. a face
  // that lists none gets its own options back
  const start = faceStart(faceOptions);
  const options = start.options;
  const clayConfig = options.clayConfig;
  const clay = createClay(options);

  // the page and the custom function Clay was built with, for a fold that cannot open. the face's
  // page goes in rather than Clay's copy, since Clay's has lost the intro's mark. a face that lists
  // providers falls back to that page with the providers' open pass run on it
  const built: BuiltPage = { config: start.fallbackPage(clayConfig), customFn: clay.customFn };

  // the defaults declared in config.ts, with the provider defaults the face's list sets
  const DEFAULTS = start.defaults;

  // whether the page has an API key row beside its provider select, so the phone keeps a key for each provider
  const keyRows = hasKeyRows(clayConfig);

  // a key row saved with no owner on record is the provider's saved beside it, or the default's. it is
  // recorded now, so a later launch whose list moves the default moves the row from it
  const owners = keyRows ? recordOwners(loadProviderKeys(localStorage), getConfig(), DEFAULTS, clayConfig) : null;

  if (owners) {
    saveProviderKeys(localStorage, owners);
  }

  // the face's timezone fields, empty for a face that declares none
  const timezoneFields = timezoneFieldsIn(clayConfig, messageKeys);

  // the last string pushed for each timezone field, so a refresh only sends one whose offset moved
  let lastTimezoneValues: Record<string, string> = {};

  // whether a zones push is still in the queue, so the push on the settings reply does not queue the
  // same zones behind one from ready that has not settled yet
  // a second ready in one session skips its push too while the first one's waits, and that push
  // records the zones it carried once acked. a zone that moved while the code was suspended then
  // waits for the 5 minute tick. a second ready with a push still queued is rare, and the doubled
  // push the flag saves would go on every launch
  let timezonePushPending = false;

  /**
   * Sends any timezone field whose zone has moved its clock since the last push.
   *
   * This is how a daylight saving switch reaches the watch. Nothing about the saved settings
   * changes, only what the zone reads, so no save is involved and nothing goes out until the
   * offset is genuinely different.
   *
   * A field is only recorded once the watch acks it, so a send that is dropped after its retries
   * goes again when the watch's settings reply lands or on the next tick rather than counting as
   * delivered. Nothing new is queued while a push is still waiting.
   */
  function pushTimezones() {
    if (!timezoneFields.length || timezonePushPending) {
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
      timezonePushPending = true;
      queueSend(dict, () => {
        timezonePushPending = false;
        Object.keys(sent).forEach((name) => { lastTimezoneValues[name] = sent[name]; });
      }, () => {
        timezonePushPending = false;
      });
    }
  }

  /**
   * Builds the dict for a save or a restore from the settings page.
   *
   * SETTINGS_FRESH goes along with it on a face that declares the settings keys. That is how the
   * watch tells the page's message apart from anything else carrying a setting, such as the time
   * zone push on every ready. Only the page's message ends a fresh watch, so a push landing first
   * cannot stop the restore. The value is 1 for a restore and 0 for a save, since a restore brings
   * the unit the reading on the watch was fetched in and a save can be the wearer switching it.
   */
  function pageSettings(json: string, restore: boolean): AppMessageDict {
    const dict = retimeSettings(clay.getSettings(json), messageKeys, clayConfig, Date.now());

    if (hasSettingsKeys) {
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

  // the launch ask for the watch's settings, which goes again only while the watch turns it away.
  // once the last ask is turned away too, each feature hears that no settings reply is coming
  const settingsAsk = createSettingsAsk(queueSend, () => {
    eachFeature('settingsUnanswered', (feature) => feature.settingsUnanswered?.());
  });

  // the features this face opted into, each started once with what the app shares. a face that
  // lists none never imports their code, so it stays out of that face's bundle. the providers' own
  // hooks go last, so their page pass sees the page every feature made and their settle sees the
  // settings every seeded hook left
  const features: FeatureHooks[] = (options.features || []).map((feature) => feature({
    messageKeys,
    defaults: DEFAULTS,
    queueSend,
    refetchDelayMs: SETTINGS_REFETCH_DELAY_MS,
    providers: start.providers,
  })).concat(start.hooks);

  /** Runs one hook on every started feature, each on its own, naming the hook in any log line. */
  function eachFeature(hook: string, run: (feature: FeatureHooks) => void): void {
    runFeatureHooks(features, hook, run);
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
    eachFeature('refresh', (feature) => feature.refresh?.(slow));
  }

  // app lifecycle listeners
  Pebble.addEventListener('ready', () => {
    console.log('PebbleKit JS Ready!');

    // a phone with settings already saved only needs to know whether the watch booted empty, so it
    // asks for that one field. an empty phone seeds from the whole snapshot
    if (hasSettingsKeys) {
      const freshOnly = Object.keys(getConfig()).length > 0;

      settingsAsk.start({ [messageKeys.SETTINGS_REQUEST]: freshOnly ? WIRE_CAPS.SETTINGS_REQUEST_FRESH : WIRE_CAPS.SETTINGS_REQUEST_FULL });
    }

    // every start sends each zone again, whatever went out before. the phone can suspend this code
    // for a while, and sending them all on each ready is how the watch catches up after that
    lastTimezoneValues = {};

    pushTimezones();
    eachFeature('ready', (feature) => feature.ready?.());

    // the timer dies when the JS is suspended so re-arm it fresh on every ready
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }

    refreshTick = 0;
    refreshTimer = setInterval(backgroundRefresh, REFRESH_MS);
  });

  Pebble.addEventListener('appmessage', (event) => {
    // the phone app keys the message by name, so it gets its numbers before anything reads it
    const payload: Record<string, number | string> = payloadByKeyId(messageKeys, event.payload || {});

    eachFeature('message', (feature) => feature.message?.(payload));

    unanswered.forEach((name) => {
      if (messageKeys[name] in payload && warnedRequests.indexOf(name) === -1) {
        warnedRequests.push(name);
        console.warn(`The watch asked for ${name}, but no feature this face lists answers it. Add the feature to startPebbleApp's features`);
      }
    });

    // the seed runs once, into a phone with nothing saved, and the same way whether the page is open
    // or closed, so it is written once here
    const seedFromWatch = (from: any) => {
      // the watch sends a key row and its provider together, so the provider it sends owns the row,
      // whatever the phone recorded. the owner goes before the seed, since the settle in it moves
      // the row from its owner when the watch brings back a provider the face no longer offers
      if (keyRows) {
        saveProviderKeys(localStorage, forgetOwners(loadProviderKeys(localStorage)));
      }

      seedConfigFromWatch(messageKeys, from, clayConfig, features);

      if (keyRows) {
        saveProviderKeys(localStorage, fileSavedRows(loadProviderKeys(localStorage), getConfig(), DEFAULTS, clayConfig));
      }

      // the watch sent back a value the face's providers list no longer allows, such as a provider
      // it dropped, and the settle changed it on the phone. the watch keeps what it was last sent, so
      // it hears the settled settings the way a restore sends them, or the two would disagree until
      // the next save
      if (start.seedSettled()) {
        sendPageSettings(JSON.stringify(wrapStoredConfig(getConfig(), clayConfig, messageKeys)), true);
      }
    };

    // the watch's reply to our SETTINGS_REQUEST carries the request key back as its marker, so a
    // face is recognized whichever settings it declares
    if (hasSettingsKeys && messageKeys.SETTINGS_REQUEST in payload) {
      // a repeat of the reply is dropped. with an empty phone, the first reply seeds the phone from the
      // watch, and a second would find the phone has settings and restore them to the watch
      // that restore sends the watch its own values and writes flash for nothing
      if (!settingsAsk.answered()) {
        return;
      }

      // the watch flags when it booted with no saved settings (wiped by an install or update), so
      // the phone pushes its own config back rather than letting the watch's defaults seed over it
      const config = getConfig();
      const phoneHasConfig = Object.keys(config).length > 0;
      const watchFresh = payload[messageKeys.SETTINGS_FRESH] === 1;

      if (watchFresh && phoneHasConfig) {
        // restore the watch from our saved config using the same dict a Save would send. it carries
        // whatever the settle at launch changed, so that has nothing left to send
        start.launchSettled();
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
          eachFeature('configOpened', (feature) => feature.configOpened?.());
          seedFromWatch(payload);
          eachFeature('configSaved', (feature) => feature.configSaved?.());
        }
      } else {
        // both sides have settings, and the phone is the source of truth. the settle at launch can
        // have changed the phone's copy, such as a provider the face no longer lists, and the watch
        // still holds what it was last sent. it hears the settled settings the way a restore sends
        // them, or it would keep the dropped provider until the next save
        // the reply proves the face is listening, so a zones push the watch turned away on ready
        // goes again. the settled restore carries every zone already, so it goes alone then
        if (start.launchSettled()) {
          sendPageSettings(JSON.stringify(wrapStoredConfig(config, clayConfig, messageKeys)), true);
        } else {
          pushTimezones();
        }
      }
    }
  });

  // the page's settings are saved once it closes, so each feature captures the values it cares
  // about here while the old ones are still in place, and then the features change the page
  Pebble.addEventListener('showConfiguration', () => {
    pageOpen = true;
    prepareSettingsPage(clay, options, features, built);

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
    // the keys for every provider come back beside the settings, and Clay would send them to the
    // watch under a key the face never declared, so they come out first
    const taken = takePageKeys(event.response);

    try {
      sendPageSettings(taken.response, false);
    } catch (error) {
      console.error('settings: page closed without settings', error);
      return;
    }

    // the keys the page sent go over the ones held, and the saved key row files the picked provider's.
    // a face with no key row keeps nothing, so its saves write nothing here
    if (keyRows) {
      saveProviderKeys(localStorage, fileSavedRows(mergeProviderKeys(loadProviderKeys(localStorage), taken.keys), getConfig(), DEFAULTS, clayConfig));
    }

    // the save carries every setting, the ones the settle at launch changed included, so the settings
    // reply has nothing left to send
    start.launchSettled();

    // each feature refetches when one of its own settings changed. this has to run after
    // pageSettings, since that is what saves the new values each feature compares against
    eachFeature('configSaved', (feature) => feature.configSaved?.());
  });
}

export default {
  startPebbleApp,
};
