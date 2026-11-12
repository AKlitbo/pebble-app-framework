/**
 * The API key the phone keeps for each weather and stock provider, so switching the Data Source on
 * the settings page never hands one provider's key to another.
 *
 * The page has one key row per kind, and that row's message key, such as `STOCK_API_KEY`, carries the
 * picked provider's key to the phone code and the watch exactly as before. The keys for every
 * provider are kept on the phone under `PROVIDER_KEYS_STORE` in localStorage, beside Clay's own
 * settings rather than inside them, so a face declares no message key for them. Clay rewrites its
 * settings blob whole on every save and a settings restore from the watch writes it too, and either
 * would lose anything extra parked there.
 *
 * Each time the page opens, the phone writes each row's keys onto it as `providerKeys`, and the page
 * code in provider-keys-fn.ts swaps the row as the select changes. The page also gets a hidden store
 * on `PAGE_KEYS_FIELD`, which the page code keeps every provider's key in, so the save brings them
 * back. The face never declares that key, so the phone takes it out before Clay reads the save, since
 * Clay would send it to the watch under a key it cannot map.
 *
 * Beside the keys, the store records which provider the saved key row belongs to, its owner. A face
 * update can move the saved provider with no page save, when its list drops the one picked, and the
 * row then still holds the old provider's key. The owner says whose it is, so it is filed there and
 * never handed to the new provider.
 *
 * A key row is never filed under a provider the row hides for, such as Yahoo, Open-Meteo, or the
 * plugin, nor under no provider at all. A key left on the row there is kept apart as the spare, and
 * the page hands it to the first provider the wearer picks that needs a key and has none. A saved key
 * with no entry of its own is filed under the provider saved beside it, or kept as the spare when
 * that provider needs no key, so an update never loses a working key.
 */

import { readText, readValue } from './settings-store';
import { flatOptions } from '../clay/rows';
import type { ClayConfigItem } from '../clay/types';

/** Each select a provider key row belongs to, and the key row under it. */
export const KEYED_SELECTS: ReadonlyArray<{ select: string; key: string }> = [
  { select: 'WEATHER_PROVIDER', key: 'WEATHER_API_KEY' },
  { select: 'STOCK_PROVIDER', key: 'STOCK_API_KEY' },
];

/** Where the phone keeps every provider's key, in localStorage. */
export const PROVIDER_KEYS_STORE = 'pf-provider-keys';

/**
 * The message key of the hidden store the page's save carries every provider's key in. The page code
 * writes the same name, and the build leaves it out of the controls it counts.
 */
export const PAGE_KEYS_FIELD = 'PF_PROVIDER_KEYS';

/** The value the plugin choice saves, which never takes a key. */
const PLUGIN = 'plugin';

/** What the phone keeps for one select. */
export interface SelectKeys {
  /** The key held for each provider, by its lowercase name. */
  keys: Record<string, string>;
  /** A key kept apart for the first provider picked that needs a key and has none, or empty. */
  spare: string;
  /** The provider the saved key row belongs to, as its select holds it, empty for none, or left out before any save. */
  owner?: string;
}

/** What the phone keeps for each select, by the select's message key. */
export type ProviderKeys = Record<string, SelectKeys>;

/** The slice of localStorage this needs, passed in so the specs can hand it a fake. */
export interface KeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** A select's keys, keeping only providers named by text, never an empty name, with a key held as text. */
function readKeys(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const keys: Record<string, string> = {};

  Object.keys(value).forEach((provider) => {
    const key = (value as Record<string, unknown>)[provider];

    if (provider !== '' && typeof key === 'string') {
      keys[provider.toLowerCase()] = key;
    }
  });

  return keys;
}

/** One select's entry out of anything, as a fresh copy. */
function readSelect(value: unknown): SelectKeys {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const entry: SelectKeys = { keys: readKeys(source.keys), spare: typeof source.spare === 'string' ? source.spare : '' };

  if (typeof source.owner === 'string') {
    entry.owner = source.owner;
  }

  return entry;
}

/** Every select's entry out of anything, keeping only the selects this keeps keys for. */
function readAll(value: unknown): ProviderKeys {
  const all: ProviderKeys = {};
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

  KEYED_SELECTS.forEach(({ select }) => {
    all[select] = readSelect(source[select]);
  });

  return all;
}

/** The selects a page sent back, read as readAll reads them, leaving out every select it did not send. */
function readSent(value: unknown): ProviderKeys {
  const sent: ProviderKeys = {};
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

  KEYED_SELECTS.forEach(({ select }) => {
    if (source[select] !== undefined) {
      sent[select] = readSelect(source[select]);
    }
  });

  return sent;
}

/**
 * Reads the keys the phone keeps. Anything that does not read, or a store that throws, reads as none.
 *
 * @param storage Where to read from, normally localStorage.
 * @return Every select's entry, empty for a select with none.
 */
export function loadProviderKeys(storage: KeyStorage): ProviderKeys {
  try {
    return readAll(JSON.parse(storage.getItem(PROVIDER_KEYS_STORE) as string));
  } catch (error) {
    return readAll(null);
  }
}

/**
 * Keeps the keys on the phone. A store that throws costs only the keys of the providers not picked.
 *
 * @param storage Where to write to, normally localStorage.
 * @param keys Every select's entry.
 */
export function saveProviderKeys(storage: KeyStorage, keys: ProviderKeys): void {
  try {
    storage.setItem(PROVIDER_KEYS_STORE, JSON.stringify(keys));
  } catch (error) {
    console.log('settings: could not keep the API key for each provider');
  }
}

/** Every row on a page, sections opened up. */
function rowsOf(page: ClayConfigItem[]): ClayConfigItem[] {
  return page.flatMap((item) => [item, ...rowsOf(item.items || [])]);
}

/**
 * Whether a key row hides for a value of its select, read off its own visibleWhen conditions on the
 * select, such as `notIn: ['yahoo']`, exactly as the page's show and hide in dependent-visibility.ts
 * reads them. The value is compared as text and with its case, and a condition holding both `in` and
 * `notIn` goes by its `notIn`. Conditions on other controls are left out, since they say nothing
 * about the provider.
 *
 * @param page The page the row is on.
 * @param select The select's message key.
 * @param key The key row's message key.
 * @return A test of one value of the select, as the select holds it.
 */
export function rowHidesFor(page: ClayConfigItem[], select: string, key: string): (value: string) => boolean {
  const row = rowsOf(page).find((item) => item.messageKey === key);
  const rule = row ? row.visibleWhen : undefined;
  const conditions = (Array.isArray(rule) ? rule : rule ? [rule] : []).filter((condition) => condition.key === select) as Array<{ in?: unknown[]; notIn?: unknown[] }>;

  return (value) => {
    const named = (list: unknown[]) => list.some((wanted) => String(wanted) === String(value));

    return conditions.some((condition) => !(condition.notIn ? !named(condition.notIn) : named(condition.in || [])));
  };
}

/**
 * Whether a key row takes a key for a value of its select. It takes none while the row hides, for the
 * plugin choice, or for a blank select, which is no provider at all.
 */
function takesKeyFor(page: ClayConfigItem[], select: string, key: string): (value: string) => boolean {
  const hides = rowHidesFor(page, select, key);

  return (value) => value !== '' && value.toLowerCase() !== PLUGIN && !hides(value);
}

/**
 * Whether a key row takes a key for one value of its select, as the filing reads it.
 *
 * @param page The page the row is on.
 * @param select The select's message key.
 * @param key The key row's message key.
 * @param value The value, as the select holds it.
 * @return False while the row hides, for the plugin choice, and for a blank select.
 */
export function rowTakesKey(page: ClayConfigItem[], select: string, key: string, value: string): boolean {
  return takesKeyFor(page, select, key)(value);
}

/** The provider some settings pick for a select, as the select holds it. The default stands in only for a select never saved. */
function pickedIn(settings: Record<string, unknown>, select: string, defaults: Record<string, unknown>): string {
  const saved = settings[select];

  return String(saved === undefined ? defaults[select] ?? '' : readValue(saved, ''));
}

/**
 * The value the page's select opens on. Clay matches a saved value against the options with its case,
 * so one it does not offer, such as `Finnhub` against `finnhub`, opens blank.
 */
function shownIn(page: ClayConfigItem[], select: string, value: string): string {
  const row = rowsOf(page).find((item) => item.messageKey === select && Array.isArray(item.options));

  return !row || flatOptions(row.options).some((option) => String(option.value) === value) ? value : '';
}

/**
 * Files a key row's value under a provider, or keeps a non-blank one as the spare when the row takes
 * no key there. With `clears`, a row saved on a blank select is the spare itself, so a blank one
 * clears it, as a wearer who empties that row means.
 */
function fileRow(entry: SelectKeys, value: string, key: string, takesKey: (value: string) => boolean, clears = false): void {
  if (takesKey(value)) {
    entry.keys[value.toLowerCase()] = key;
  } else if (key.trim() !== '' || (clears && value === '')) {
    entry.spare = key;
  }
}

/**
 * Files each select's saved key row, as `owned` says whose it is, and records the picked provider as
 * its owner. A select whose key row is not on the page is left as it was, owner and all.
 */
function fileRows(held: ProviderKeys, settings: Record<string, unknown>, page: ClayConfigItem[], picked: (select: string) => string, owned: (entry: SelectKeys, provider: string, row: string) => string, clears: boolean): ProviderKeys {
  const filed = readAll(held);
  const onPage = new Set(rowsOf(page).map((item) => item.messageKey));

  KEYED_SELECTS.filter((pair) => onPage.has(pair.key)).forEach(({ select, key }) => {
    const entry = filed[select];
    const provider = picked(select);
    const takesKey = takesKeyFor(page, select, key);

    const row = readText(settings[key], '');
    const owner = owned(entry, provider, row);

    if (settings[key] !== undefined) {
      fileRow(entry, owner, row, takesKey, clears);
    }

    // a blank select keeps the owner on record, since the row it shows is still that provider's key
    entry.owner = takesKey(provider) ? provider : provider === '' && takesKey(owner) ? owner : '';
  });

  return filed;
}

/**
 * The keys with each saved key row filed under the provider picked, for a save from the page or a
 * settings restore from the watch, where the row and the provider arrive together.
 *
 * The key row's value is the picked provider's key, so it wins over what the store held for that
 * provider, and a blank one files a blank key, so a key the wearer cleared stays cleared. A row saved
 * on a blank select is its owner's on record, and with none it is the spare itself, so a blank one
 * clears the spare. A row saved under a provider it hides for is kept as the spare when it holds a key.
 *
 * @param held Every select's entry so far.
 * @param settings The saved settings, as Clay keeps them.
 * @param defaults The page's defaults, for a select the settings leave out.
 * @param page The face's page, read for the key rows on it and the providers each hides for.
 * @return A copy of the entries with each row filed and its owner recorded.
 */
export function fileSavedRows(held: ProviderKeys, settings: Record<string, unknown>, defaults: Record<string, unknown>, page: ClayConfigItem[]): ProviderKeys {
  return fileRows(held, settings, page, (select) => pickedIn(settings, select, defaults), savedOwner, true);
}

/**
 * The keys as the page opens on them, with each saved key row filed under the provider it belongs to.
 *
 * The owner the last save recorded says whose the row is. When the provider saved since is another,
 * as after a face update that dropped the one picked, the row is filed under its owner and the page
 * shows the new provider's own key, or none. A row with no owner recorded is the provider's saved
 * beside it. A saved provider the select does not offer opens the select blank. Its row still goes
 * to the owner on record, which the page shows on the blank select and never hands to another
 * provider. Only a row with no owner is kept as the spare, which the page shows on a blank select and
 * hands to the first provider picked. A blank owner, left by a save where the row took no key, lets
 * a row holding a key go to the provider saved, as after a page with no select saved it.
 *
 * @param held Every select's entry so far.
 * @param settings The saved settings, as Clay keeps them.
 * @param defaults The page's defaults, for a select the settings leave out.
 * @param page The page about to open, read for its key rows, the select's options, and the providers each row hides for.
 * @return A copy of the entries with each row filed.
 */
export function keysForOpen(held: ProviderKeys, settings: Record<string, unknown>, defaults: Record<string, unknown>, page: ClayConfigItem[]): ProviderKeys {
  const picked = (select: string) => shownIn(page, select, pickedIn(settings, select, defaults));

  return fileRows(held, settings, page, picked, rowOwner, false);
}

/**
 * Whose a saved key row is on a save. It is the picked provider's, and on a blank select it is still
 * the owner's on record, since the page showed that provider's key there.
 */
function savedOwner(entry: SelectKeys, provider: string): string {
  return provider === '' && entry.owner ? entry.owner : provider;
}

/** Whose a saved key row is as the page opens, from the owner on record, as keysForOpen describes. */
function rowOwner(entry: SelectKeys, provider: string, row: string): string {
  if (entry.owner === undefined) {
    return provider;
  }

  if (entry.owner !== '') {
    return entry.owner;
  }

  return row.trim() !== '' ? provider : '';
}

/**
 * Records whose each saved key row is, for a row holding a key with no owner on record. The row is
 * the provider's saved beside it, or the default's when the select was never saved. The phone runs
 * this at every launch, so a later launch that finds the default moved can move the row from its owner.
 *
 * A row saved on a page with one provider and no select has only the default to go by, and the phone
 * cannot know an older default. When the launch that records it also brings a list with a new first
 * provider, the row is filed under that one, and the feature sends it that key, as one key row for
 * every provider would. Nothing is lost, since the key stays held and the wearer moves it with one
 * switch, which costs less than keeping a record of every default a face has had.
 *
 * @param held Every select's entry so far.
 * @param settings The saved settings, as Clay keeps them.
 * @param defaults The page's defaults, for a select the settings leave out.
 * @param page The face's page, read for its key rows and the providers each hides for.
 * @return A copy of the entries with each owner recorded, or null when none was missing.
 */
export function recordOwners(held: ProviderKeys, settings: Record<string, unknown>, defaults: Record<string, unknown>, page: ClayConfigItem[]): ProviderKeys | null {
  const filed = readAll(held);
  const onPage = new Set(rowsOf(page).map((item) => item.messageKey));
  let recorded = false;

  KEYED_SELECTS.filter((pair) => onPage.has(pair.key)).forEach(({ select, key }) => {
    const entry = filed[select];

    if (entry.owner !== undefined || readText(settings[key], '').trim() === '') {
      return;
    }

    const provider = pickedIn(settings, select, defaults);

    entry.owner = takesKeyFor(page, select, key)(provider) ? provider : '';
    recorded = true;
  });

  return recorded ? filed : null;
}

/**
 * Moves a saved key row to another provider, for the settle that moves a face to a provider its list
 * offers, whether it rewrites a saved provider or the face's default moves under a select never saved.
 *
 * The row is filed under the provider it belonged to, and takes the new provider's own key, or comes
 * out of the settings when the new provider has none, so the feature never fetches with another
 * provider's key.
 *
 * @param held Every select's entry so far.
 * @param saved The saved settings, changed in place.
 * @param select The select's message key.
 * @param from The provider the row was saved under, when the store records no owner.
 * @param to The provider the face moves to.
 * @param page The page the settle narrowed to, read for the providers the key row hides for.
 * @return A copy of the entries with the row filed and the new provider recorded as its owner.
 */
export function moveKeyRow(held: ProviderKeys, saved: Record<string, unknown>, select: string, from: string, to: string, page: ClayConfigItem[]): ProviderKeys {
  const filed = readAll(held);
  const pair = KEYED_SELECTS.find((known) => known.select === select);
  const entry = filed[select];

  if (!pair || !entry) {
    return filed;
  }

  const takesKey = takesKeyFor(page, select, pair.key);
  const owner = entry.owner === undefined ? from : entry.owner;

  if (saved[pair.key] !== undefined) {
    fileRow(entry, owner, readText(saved[pair.key], ''), takesKey);
  }

  if (takesKey(to) && Object.prototype.hasOwnProperty.call(entry.keys, to.toLowerCase())) {
    saved[pair.key] = entry.keys[to.toLowerCase()];
  } else {
    delete saved[pair.key];
  }

  entry.owner = takesKey(to) ? to : '';

  return filed;
}

/**
 * Forgets whose each saved key row was, for a settings restore from the watch. The watch sends the
 * key row and its provider together, so the provider it sends is the row's owner, whatever the phone
 * recorded before.
 *
 * @param held Every select's entry so far.
 * @return A copy of the entries with no owner recorded.
 */
export function forgetOwners(held: ProviderKeys): ProviderKeys {
  const filed = readAll(held);

  KEYED_SELECTS.forEach(({ select }) => {
    delete filed[select].owner;
  });

  return filed;
}

/**
 * Lets go of the keys for a select whose key row the face no longer offers.
 *
 * @param held Every select's entry so far.
 * @param select The select's message key.
 * @return A copy of the entries with that select's emptied, or the same entries when it held nothing.
 */
export function dropSelectKeys(held: ProviderKeys, select: string): ProviderKeys {
  const filed = readAll(held);
  const entry = filed[select];

  if (entry && (Object.keys(entry.keys).length || entry.spare || entry.owner !== undefined)) {
    filed[select] = { keys: {}, spare: '' };
  }

  return filed;
}

/**
 * Whether a page has a provider key row with its select, so the page needs the keys and the page code.
 *
 * @param page The page about to open.
 * @return True when any key row sits on the page with the select it belongs to.
 */
export function hasKeyRows(page: ClayConfigItem[]): boolean {
  const keys = new Set(rowsOf(page).map((item) => item.messageKey).filter((key): key is string => typeof key === 'string'));

  return KEYED_SELECTS.some(({ select, key }) => keys.has(select) && keys.has(key));
}

/**
 * The page with each key row given the keys held for its select's providers, the spare, and the
 * owner on record, for the page code to swap as the select changes, and the hidden store the save
 * brings them back in. A row whose select is not on the page gets nothing, since there is nothing to
 * switch.
 *
 * @param page The page about to open, the phone's own copy. It is changed in place.
 * @param keys Every select's entry, from keysForOpen.
 * @return Whether any row got its keys, so the page needs the page code.
 */
export function addProviderKeys(page: ClayConfigItem[], keys: ProviderKeys): boolean {
  const rows = rowsOf(page);
  let added = false;

  KEYED_SELECTS.forEach(({ select, key }) => {
    if (!rows.some((row) => row.messageKey === select)) {
      return;
    }

    const entry = keys[select] || { keys: {}, spare: '' };

    rows.filter((row) => row.messageKey === key).forEach((row) => {
      row.providerKeys = { select, keys: encodeURIComponent(JSON.stringify({ keys: entry.keys, spare: entry.spare, owner: entry.owner || '' })) };
      added = true;
    });
  });

  // at the top level rather than in a section, since a card counts a row it holds as showing
  if (added) {
    page.push({ type: 'hiddenStore', messageKey: PAGE_KEYS_FIELD, storeClass: 'pf-provider-keys', defaultValue: '' });
  }

  return added;
}

/**
 * Takes the keys the page sent back out of its save.
 *
 * The save comes as JSON, URI encoded or not, as Clay's getSettings reads it. A save that does not
 * read as JSON goes on as it came, so getSettings turns it away as it always has.
 *
 * @param response What the page closed with.
 * @return The save without the keys, and the keys it carried for each select it had, or null when it carried none.
 */
export function takePageKeys(response: string): { response: string; keys: ProviderKeys | null } {
  let save: unknown;

  try {
    save = JSON.parse(/^\{/.test(response) ? response : decodeURIComponent(response));
  } catch (error) {
    return { response, keys: null };
  }

  if (!save || typeof save !== 'object' || Array.isArray(save) || !(PAGE_KEYS_FIELD in save)) {
    return { response, keys: null };
  }

  const settings = save as Record<string, unknown>;
  const field = readValue(settings[PAGE_KEYS_FIELD], '');
  let keys: ProviderKeys | null;

  try {
    keys = readSent(JSON.parse(decodeURIComponent(String(field))));
  } catch (error) {
    keys = null;
  }

  delete settings[PAGE_KEYS_FIELD];

  return { response: JSON.stringify(settings), keys };
}

/**
 * Lays the keys the page sent back over the ones the phone held, select by select and provider by
 * provider, so a provider the page never touched keeps its key. The page's spare stands, since the
 * page hands the spare out and clears it.
 *
 * @param held The entries the phone held.
 * @param sent The entries the page sent back, or null for a save that carried none.
 * @return The merged entries.
 */
export function mergeProviderKeys(held: ProviderKeys, sent: ProviderKeys | null): ProviderKeys {
  const merged = readAll(held);

  if (sent) {
    KEYED_SELECTS.forEach(({ select }) => {
      if (sent[select] === undefined) {
        return;
      }

      const page = readSelect(sent[select]);

      Object.assign(merged[select].keys, page.keys);
      merged[select].spare = page.spare;
    });
  }

  return merged;
}

export default { loadProviderKeys, saveProviderKeys, rowHidesFor, rowTakesKey, fileSavedRows, keysForOpen, recordOwners, moveKeyRow, forgetOwners, dropSelectKeys, hasKeyRows, addProviderKeys, takePageKeys, mergeProviderKeys, KEYED_SELECTS, PROVIDER_KEYS_STORE, PAGE_KEYS_FIELD };
