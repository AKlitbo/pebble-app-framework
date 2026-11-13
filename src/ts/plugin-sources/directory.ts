/**
 * The Pebble app plugins the framework knows of, for the supported plugins panel on the settings page.
 *
 * The list lives in src/known-plugins.json, which the Supported Plugins table in the docs is built
 * from too. It is copied by hand from the Pebble appstore, so it goes out of date as plugins are
 * published, and each entry records the version it was last checked against and when. A face cannot
 * install a plugin itself, so the panel points the wearer at a store plugin's listing. A plugin built
 * into the Pebble app has no listing and needs no install. A kind with no store plugin lists only the
 * built-in one, which is now playing and the phone's battery. The panel lists only the kinds in
 * `PANEL_KINDS`, so a kind an entry serves that the panel has no heading for, such as `finance/crypto`,
 * is left off the panel.
 */

import knownPlugins from '../../known-plugins.json';

/** One item a plugin serves, such as `weather/location`. */
export interface ServedItem {
  category: string;
  item: string;
}

/** One plugin the panel can list. */
export interface KnownPlugin {
  /** The name the Pebble app and the store show it under. */
  name: string;
  /** The uuid `enumeratePlugins()` lists it under, which the panel marks it installed by. */
  uuid: string;
  /** The id at the end of its store listing's address, or null for one built into the Pebble app. */
  storeId: string | null;
  /** The words before the id in its store listing's address, such as `met-norway-weather`. */
  storeSlug?: string;
  /** The items it serves. */
  serves: ServedItem[];
  /** A few words on where it runs, for one built in on only some phones, such as `Android Only`. */
  where?: string;
  /** Who makes it, such as Pebble for one built into the Pebble app. */
  maker: string;
  /** The version it was last checked against, `Built In` for one built into the Pebble app, or null when it has not been re-checked. */
  verifiedVersion: string | null;
  /** When it was last checked, as YYYY-MM-DD, or null with `verifiedVersion`. */
  verifiedOn: string | null;
  /**
   * Whether the plugin sends fixed units whatever the wearer picked, so the units the wearer picked in
   * the Pebble app are used in their place. The Pebble app's built-in weather is one, always sending °C
   * and mph.
   */
  fixedUnits?: boolean;
}

/** One entry as src/known-plugins.json keeps it, with each item it serves as `category/item`. */
export interface KnownPluginEntry {
  name: string;
  uuid: string;
  storeId: string | null;
  storeSlug: string | null;
  serves: string[];
  maker: string;
  where?: string;
  verifiedVersion: string | null;
  verifiedOn: string | null;
  fixedUnits?: boolean;
  /** What it serves for a kind, beyond the standard fields, for the docs' Supported Plugins table. */
  gives?: Record<string, string>;
}

/** One kind of data the panel can list plugins for, and its heading in plain words. */
export interface PanelKind extends ServedItem {
  /** The heading over the kind's plugins, such as `Weather`. */
  label: string;
  /**
   * The line under the heading while the panel has no plugin to list for the kind, for a kind the
   * Pebble app has no plugin of its own for. Left out, a kind with nothing to list shows its heading alone.
   */
  none?: string;
}

/** The start of every store listing's address. */
export const STORE_ADDRESS = 'https://apps.repebble.com/';

/** The kinds the panel lists, in the order it lists them. */
export const PANEL_KINDS: readonly PanelKind[] = [
  { category: 'weather', item: 'location', label: 'Weather' },
  { category: 'calendar', item: 'event', label: 'Calendar' },
  { category: 'finance', item: 'stock', label: 'Stocks', none: 'The Pebble app lists no stock plugin on this phone. Get one from the Pebble app store.' },
  { category: 'music', item: 'track', label: 'Now Playing' },
  { category: 'phone', item: 'phone_state', label: 'Phone Battery' },
];

/**
 * The kinds a known plugin serves that the panel has no heading for yet, which it leaves off. A kind
 * neither here nor in `PANEL_KINDS` is a typo in the data file.
 */
export const UNPANELLED_KINDS: readonly string[] = ['finance/crypto'];

/**
 * One entry from the data file as the panel reads it, with each item it serves split into its
 * category and item.
 *
 * @param entry The entry as the file keeps it.
 * @return The plugin.
 */
export function knownPlugin(entry: KnownPluginEntry): KnownPlugin {
  const plugin: KnownPlugin = {
    name: entry.name,
    uuid: entry.uuid,
    storeId: entry.storeId,
    serves: entry.serves.map((kind) => ({ category: kind.slice(0, kind.indexOf('/')), item: kind.slice(kind.indexOf('/') + 1) })),
    maker: entry.maker,
    verifiedVersion: entry.verifiedVersion,
    verifiedOn: entry.verifiedOn,
  };

  if (entry.storeSlug) {
    plugin.storeSlug = entry.storeSlug;
  }

  if (entry.where) {
    plugin.where = entry.where;
  }

  if (entry.fixedUnits) {
    plugin.fixedUnits = true;
  }

  return plugin;
}

// TODO: add Pebble's Stocks, 2c4b7f10-9a3d-4e6b-8f21-5d0c7e9a1b34, once its store listing is confirmed
/** Every plugin the panel knows, built-in ones first, then store ones, from src/known-plugins.json. */
export const KNOWN_PLUGINS: readonly KnownPlugin[] = (knownPlugins as KnownPluginEntry[]).map(knownPlugin);

/**
 * The address of a plugin's store listing.
 *
 * @param plugin The plugin from the table.
 * @return The listing's address, or null for a plugin built into the Pebble app.
 */
export function storeListing(plugin: KnownPlugin): string | null {
  if (!plugin.storeId) {
    return null;
  }

  return `${STORE_ADDRESS}${plugin.storeSlug ? `${plugin.storeSlug}_` : ''}${plugin.storeId}`;
}

/**
 * The known plugins that serve one item, in table order.
 *
 * @param category The category, such as `weather`.
 * @param item The item inside it, such as `location`.
 * @return The plugins serving it, which may be none.
 */
export function knownServing(category: string, item: string): KnownPlugin[] {
  return KNOWN_PLUGINS.filter((plugin) => plugin.serves.some((served) => served.category === category && served.item === item));
}

export default { KNOWN_PLUGINS, PANEL_KINDS, STORE_ADDRESS, knownServing, storeListing };
