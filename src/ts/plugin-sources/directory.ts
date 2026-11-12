/**
 * The Pebble app plugins the framework knows of, for the supported plugins panel on the settings page.
 *
 * The table is copied by hand from the Pebble appstore, so it goes out of date as plugins are
 * published, and each release refreshes it. A face cannot install a plugin itself, so the panel
 * points the wearer at a store plugin's listing. A plugin built into the Pebble app has no listing
 * and needs no install. A kind with no store plugin lists only the built-in one, which is now playing
 * and the phone's battery as of the date below. The table has no stock plugin, so for stocks the panel
 * lists only the ones on the phone, and says so when there are none.
 *
 * Last refreshed from the store on 2026-11-06.
 */

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

// TODO: add the two stock plugins once their store listings are confirmed. Pebble's Stocks is
// 2c4b7f10-9a3d-4e6b-8f21-5d0c7e9a1b34, and Stocks + Crypto is 77e6eeb3-340a-46f8-ba39-5e2000b6fce3
/** Every plugin the panel knows, built-in ones first, then store ones. */
export const KNOWN_PLUGINS: readonly KnownPlugin[] = [
  {
    name: 'Weather',
    uuid: '00000000-0000-0000-0001-000000000002',
    storeId: null,
    serves: [{ category: 'weather', item: 'location' }],
  },
  {
    name: 'Calendar',
    uuid: '00000000-0000-0000-0001-000000000004',
    storeId: null,
    serves: [{ category: 'calendar', item: 'event' }],
  },
  {
    // the Pebble app builds its music plugin into the Android app alone, and as of the date above no
    // store plugin serves the track on iOS
    name: 'Music',
    uuid: '00000000-0000-0000-0001-000000000003',
    storeId: null,
    serves: [{ category: 'music', item: 'track' }],
    where: 'Android Only',
  },
  {
    name: 'Phone',
    uuid: '00000000-0000-0000-0001-000000000001',
    storeId: null,
    serves: [{ category: 'phone', item: 'phone_state' }],
  },
  {
    name: 'MET Norway Weather',
    uuid: '323dc117-55bd-455f-9ee4-4d0faba56ea1',
    storeId: '6972cb1f33e343d69e5b788e',
    storeSlug: 'met-norway-weather',
    serves: [{ category: 'weather', item: 'location' }],
  },
];

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
