/**
 * Narrows a face's settings page to the providers its appinfo lists, and keeps the saved settings in
 * line with them.
 *
 * A face lists the providers it offers for each kind of data, such as
 * `"providers": { "weather": ["plugin", "openmeteo"], "stocks": ["yahoo"] }`. The phone build writes
 * the lists that change something on the phone into this folder's index, which hands them to
 * faceProvidersFor here. A face that lists none never reaches this file, so everything the app does
 * only for a face with a list lives here rather than in app.ts.
 *
 * The rows are found by their message keys, `WEATHER_PROVIDER` and `WEATHER_API_KEY` for weather,
 * `STOCK_PROVIDER` and `STOCK_API_KEY` for stocks, and `CALENDAR_ICS_URL` for the calendar. The
 * features read the saved provider by those keys whatever row wrote it, so a face's own sections are
 * narrowed the same way as the config builder's, with no mark for the face to add.
 *
 * Each kind's list puts it in one of three modes. A list of custom providers, such as
 * `["openmeteo", "owm"]`, narrows the picker to them. `["plugin"]` takes the kind from a Pebble app
 * plugin alone, so the picker and every row only a custom provider needs come off the page. A list
 * holding `plugin` and custom providers narrows the picker to the custom ones, and the plugin source
 * page adds the plugin choice when the page opens. The default in both is the first custom provider
 * listed that the face's picker offers, wherever `plugin` sits.
 *
 * The narrowing runs in two passes. The first runs once at launch on the face's own page, and every
 * reader of the page, the defaults and the settings restore included, takes its result. It keeps the
 * picker even with one option left, since the defaults read their value from it and the plugin source
 * page adds its option to it. The second runs each time the page opens, after every feature's page
 * hook, and drops a picker left with fewer than two options. Either pass takes a section off with the
 * last of its rows, so no card is left holding only its heading.
 */

import { allItems, dropRow, dropRows, findRow, settleConditions } from '../clay/rows';
import { copyPage } from '../clay/copy-page';
import { getConfig, readValue } from '../pkjs/settings-store';
import { STOCK_FALLBACK } from '../pkjs/providers';
import type { ClayConfigItem } from '../clay/types';
import type { FaceStart, StartOptions } from '../pkjs/app';
import type { FeatureHooks, ProviderLists } from '../pkjs/feature';
import type { CacheStorage } from '../stock/cache';

/** The value a provider list and a picker hold for the Pebble app plugin. */
const PLUGIN = 'plugin';

/** The kinds of data whose list can reach the phone. */
export type ProviderKind = 'weather' | 'stocks' | 'calendar';

/** One kind's list as the build writes it into the phone bundle. */
export interface WrittenList {
  /** The providers the face offers, in its own order, such as `['plugin', 'openmeteo']`. */
  offered: string[];
  /** Whether any provider offered needs an API key, which keeps the key row on the page. */
  needsKey: boolean;
}

/**
 * The lists the build writes, by kind. A weather or stock list always reaches the phone. A calendar
 * list reaches it only as `['plugin']`, since a calendar offering its iCal link gets what it needs from
 * the plugin source page alone.
 */
export type WrittenProviders = Partial<Record<ProviderKind, WrittenList>>;

/**
 * The part of the stock cache the settle uses. The build hands it over only for a face with a stock
 * list, so a face without stocks never carries the cache's code.
 */
export interface StockCacheForget {
  /** Empties the stock cache unless it was saved under the provider given. */
  forget(storage: CacheStorage, provider: string): void;
}

/**
 * The pages settle works from, all from one launch. The face's own page and its defaults say what
 * the face used before its list, and the narrowed page and its defaults say what it uses now.
 */
export interface SettlePages {
  /** The face's own settings page, before the first pass. */
  own: ClayConfigItem[];
  /** The defaults the face's own page declares, by message key. */
  ownDefaults: Record<string, unknown>;
  /** The page after the first pass. */
  narrowed: ClayConfigItem[];
  /** The defaults the features get, from the narrowed page with the provider defaults filled in. */
  defaults: Record<string, unknown>;
}

/** What the app does with the face's providers. */
export interface FaceProviders {
  /** Each kind's list, as the build wrote it, for the features to read through their context. */
  lists: ProviderLists;
  /**
   * Gets the face's start ready: the page narrowed, the defaults filled, the saved settings settled
   * and saved when that changed them, and the hooks that run after every feature's.
   *
   * @param options What the face handed startPebbleApp. Its page is never changed.
   * @param collect The app's own defaults collector, collectDefaults.
   * @return What the app starts with.
   */
  start(options: StartOptions, collect: (items: ClayConfigItem[]) => Record<string, unknown>): FaceStart;
  /**
   * The first pass. It narrows each picker, sets its default, takes the key row off when no listed
   * provider needs a key, and takes off the custom rows of a plugin only kind.
   *
   * @param config The face's own settings page. It is never changed.
   * @return A new page.
   */
  narrow(config: ClayConfigItem[]): ClayConfigItem[];
  /**
   * Sets each listed kind's provider default to the first listed custom provider the picker offers,
   * unless the narrowed page already defaults to a listed one. That covers a face that lists a kind but
   * has no picker for it. A plugin only kind gets no default.
   *
   * @param defaults The defaults the narrowed page declares, by message key. Changed in place.
   * @param narrowed The page after the first pass.
   */
  defaults(defaults: Record<string, unknown>, narrowed: ClayConfigItem[]): void;
  /**
   * Brings the saved settings in line with the narrowed page. It rewrites a saved provider the page
   * cannot offer to the default, deletes the saved value of every row the first pass took off, and
   * empties the stock cache when the stock provider the face really uses moves.
   *
   * @param saved The saved settings, by name. Changed in place.
   * @param pages The face's own page and the narrowed one, with their defaults.
   * @return True when it changed the settings, so the caller knows to save them.
   */
  settle(saved: Record<string, unknown>, pages: SettlePages): boolean;
  /**
   * The second pass. It drops a provider picker left with fewer than two options, with the lead line
   * above it, and takes off the rows the first pass left to place a plugin only kind's notes. A
   * section left with nothing but headings goes with them.
   *
   * @param config The settings page so far, the hook's own copy. It is changed in place.
   * @return The page, changed.
   */
  page(config: ClayConfigItem[]): ClayConfigItem[];
}

/** Where a kind's rows sit on a page, by message key. */
interface KindRows {
  /** The provider picker, and for weather and the calendar the select a plugin choice joins. */
  picker: string;
  /** The API key row, for a kind whose providers can need a key. */
  keyRow?: string;
  /** The rows only a custom provider reads, which a plugin only kind takes off with the picker. */
  customRows: string[];
  /** The start of every key the kind's own rows use, for the section a plugin only kind's notes join. */
  prefix: string;
}

const KIND_ROWS: Record<ProviderKind, KindRows> = {
  weather: { picker: 'WEATHER_PROVIDER', keyRow: 'WEATHER_API_KEY', customRows: ['WEATHER_API_KEY'], prefix: 'WEATHER_' },
  stocks: { picker: 'STOCK_PROVIDER', keyRow: 'STOCK_API_KEY', customRows: ['STOCK_API_KEY'], prefix: 'STOCK_' },
  calendar: { picker: 'CALENDAR_SOURCE', customRows: ['CALENDAR_ICS_URL'], prefix: 'CALENDAR_' },
};

/** A value compared the way the features pick a provider, as lowercase text. */
function lower(value: unknown): string {
  return String(value).toLowerCase();
}

/** Whether a list is the Pebble app plugin alone. */
function pluginOnly(list: WrittenList): boolean {
  return list.offered.length === 1 && list.offered[0] === PLUGIN;
}

/** The custom providers in a list, in the face's order, which is every one but the plugin. */
function customOf(list: WrittenList): string[] {
  return list.offered.filter((name) => name !== PLUGIN).map(lower);
}

/**
 * The listed custom providers a page can offer, in the face's order, each as the value it saves. A
 * picker offers the ones it has an option for, matched without regard to case as the features match
 * them, and each keeps the picker's own spelling, so a face whose option saves `Yahoo` opens on that
 * option. A page whose key row has no options, or no row at all, can save any of them, and a picker
 * that offers none of them leaves them all, since the default has to be one the list names.
 */
function offeredOn(page: ClayConfigItem[], picker: string, custom: string[]): Array<string | number> {
  const row = allItems(page).find((item) => item.messageKey === picker && Array.isArray(item.options));
  const options = row ? row.options || [] : null;
  const shown = options
    ? custom.map((name) => options.find((option) => lower(option.value) === name)).filter((option) => option !== undefined).map((option) => option.value)
    : custom;

  return shown.length ? shown : custom;
}

/** Every message key on a page. */
function keysOf(page: ClayConfigItem[]): Set<string> {
  return new Set(allItems(page).map((item) => item.messageKey).filter((key): key is string => typeof key === 'string'));
}

/**
 * The row the first pass leaves where a plugin only kind's picker was, for the plugin source page to
 * put the kind's notes after. It shows nothing of its own, so the second pass takes it off once the
 * notes are in.
 */
function anchorRow(kind: ProviderKind): ClayConfigItem {
  return { type: 'text', pluginSourceRows: kind };
}

/** Whether a row is an anchor the first pass left, rather than one the face marked itself. */
function isAnchor(item: ClayConfigItem): boolean {
  return item.type === 'text' && item.pluginSourceRows !== undefined && item.defaultValue === undefined;
}

/** Narrows each picker of a kind with custom providers listed, and takes off a key row nothing needs. */
function narrowCustom(page: ClayConfigItem[], kind: ProviderKind, list: WrittenList): void {
  const rows = KIND_ROWS[kind];
  const custom = customOf(list);

  allItems(page).filter((item) => item.messageKey === rows.picker).forEach((picker) => {
    // a text input or the like has nothing to narrow, and the feature still reads whatever it saves
    if (!Array.isArray(picker.options)) {
      console.warn(`face providers: the ${rows.picker} row has no options to narrow, so it is left as the face wrote it`);
      return;
    }

    const own = picker.options;

    // the plugin option, if the face wrote one, goes too. the plugin source page adds its own when
    // the list holds the plugin and a plugin on the phone serves the kind
    picker.options = own.filter((option) => custom.includes(lower(option.value)));

    custom.filter((name) => !own.some((option) => lower(option.value) === name)).forEach((name) => {
      console.warn(`face providers: providers.${kind} lists ${name}, but the ${rows.picker} picker has no option for it, so the page cannot offer it`);
    });

    if (picker.defaultValue !== undefined && !custom.includes(lower(picker.defaultValue))) {
      console.warn(`face providers: ${rows.picker} defaults to ${picker.defaultValue}, which providers.${kind} does not list. List it first in the appinfo to keep it as the default`);
    }

    picker.defaultValue = offeredOn([picker], rows.picker, custom)[0];
  });

  if (rows.keyRow && !list.needsKey) {
    dropRows(page, (item) => item.messageKey === rows.keyRow);
  }
}

/**
 * Takes a plugin only kind's picker and custom rows off the page, and leaves an anchor for its notes.
 *
 * The anchor takes the picker's place, or failing that the first custom row's, such as the calendar's
 * iCal link. With neither on the page it goes at the end of the section holding the kind's other rows,
 * and with none of those either, the notes go at the foot of the page. A face that marks a row for the
 * kind's notes itself keeps that row as the anchor.
 *
 * Rows marked to hide while the plugin is picked, and the lead line marked for the picker, go with
 * it. A condition naming the picker is settled against the plugin, the one value the kind reads.
 */
function takePluginOnly(page: ClayConfigItem[], kind: ProviderKind): void {
  const rows = KIND_ROWS[kind];
  const key = rows.picker;
  const marked = allItems(page).some((item) => item.pluginSourceRows === kind);
  const target = findRow(page, (item) => item.messageKey === key) || findRow(page, (item) => item.messageKey !== undefined && rows.customRows.includes(item.messageKey));

  if (target && !marked) {
    target.list.splice(target.list.indexOf(target.row), 1, anchorRow(kind));
  }

  dropRows(page, (item) => {
    return item.messageKey === key
      || (item.messageKey !== undefined && rows.customRows.includes(item.messageKey))
      || item.pluginSourceHides === key
      || item.pluginSourceLead === key;
  });

  if (!target && !marked) {
    const other = findRow(page, (item) => typeof item.messageKey === 'string' && item.messageKey.startsWith(rows.prefix));

    // a row at the top of the page sits in no section, and an anchor there would land after the save button
    if (other && other.list !== page) {
      other.list.push(anchorRow(kind));
    }
  }

  settleConditions(page, key, PLUGIN);
}

/**
 * What the app does with the providers a face lists, from the lists the build writes.
 *
 * @param written Each kind's list, as the build writes it into the phone bundle.
 * @param stockCache The stock cache's forget, which the build hands over for a face with a stock list.
 * @return The lists, the start, the two passes over the page, the defaults, and the settle.
 */
export function faceProvidersFor(written: WrittenProviders, stockCache?: StockCacheForget): FaceProviders {
  // a calendar list holding the iCal link changes nothing here, so only a plugin only one counts
  const kinds = (Object.keys(KIND_ROWS) as ProviderKind[]).filter((kind) => {
    const list = written[kind];

    return list !== undefined && list.offered.length > 0 && (kind !== 'calendar' || pluginOnly(list));
  });
  const listOf = (kind: ProviderKind) => written[kind] as WrittenList;
  const customKinds = kinds.filter((kind) => !pluginOnly(listOf(kind)));
  const lists: ProviderLists = {};

  kinds.forEach((kind) => {
    lists[kind] = listOf(kind).offered.slice();
  });

  function narrow(config: ClayConfigItem[]): ClayConfigItem[] {
    const narrowed = copyPage(config);

    kinds.forEach((kind) => {
      if (pluginOnly(listOf(kind))) {
        takePluginOnly(narrowed, kind);
      } else {
        narrowCustom(narrowed, kind, listOf(kind));
      }
    });

    return narrowed;
  }

  function fillDefaults(defaults: Record<string, unknown>, narrowed: ClayConfigItem[]): void {
    customKinds.forEach((kind) => {
      const key = KIND_ROWS[kind].picker;
      const custom = customOf(listOf(kind));

      if (defaults[key] === undefined || !custom.includes(lower(defaults[key]))) {
        defaults[key] = offeredOn(narrowed, key, custom)[0];
      }
    });
  }

  function settle(saved: Record<string, unknown>, pages: SettlePages): boolean {
    let changed = false;
    const kept = keysOf(pages.narrowed);

    // the first save from the page drops the value of a row that is not there, and a feature would
    // read that as a changed setting and fetch again for nothing. that covers a plugin only kind's
    // picker, key, location, and link rows, and a key row no listed provider needs
    keysOf(pages.own).forEach((key) => {
      if (!kept.has(key) && saved[key] !== undefined) {
        delete saved[key];
        changed = true;
      }
    });

    customKinds.forEach((kind) => {
      const key = KIND_ROWS[kind].picker;
      const list = listOf(kind);
      const offered = offeredOn(pages.narrowed, key, customOf(list));
      const value = readValue(saved[key], undefined);

      // a provider the list leaves out, or one the face's picker cannot show, would show a blank
      // select and fetch from a site the manifest may not list
      if (value !== undefined && !(lower(value) === PLUGIN ? list.offered.includes(PLUGIN) : offered.map(lower).includes(lower(value)))) {
        saved[key] = offered[0];
        changed = true;
      }

      if (kind === 'stocks' && stockCache) {
        // the provider the face really fetched from before this launch, the saved one or else the
        // default its own page declared or the feature's own, against the one it fetches from now
        const before = lower(value !== undefined ? value : pages.ownDefaults[key] !== undefined ? pages.ownDefaults[key] : STOCK_FALLBACK);
        const now = readValue(saved[key], undefined);
        const after = lower(now !== undefined ? now : pages.defaults[key]);

        // a cache that records no provider reads as whichever loads it, so a move nothing saw would
        // hand the old provider's quotes and stamps to the new one. forget keeps a cache the new
        // provider saved itself, so a later launch that sees the same move empties nothing
        if (before !== after) {
          stockCache.forget(localStorage, after);
        }
      }
    });

    return changed;
  }

  function page(config: ClayConfigItem[]): ClayConfigItem[] {
    customKinds.forEach((kind) => {
      const key = KIND_ROWS[kind].picker;
      const dropped = allItems(config).filter((item) => item.messageKey === key && Array.isArray(item.options) && item.options.length < 2);

      dropped.forEach((picker) => {
        const left = (picker.options || [])[0];

        // a section left holding only its heading goes with them, such as a Weather card that held
        // nothing but the picker and its lead line
        dropRow(config, picker);
        dropRows(config, (item) => item.pluginSourceLead === key);
        allItems(config).forEach((item) => {
          if (item.pluginSourceHides === key) {
            delete item.pluginSourceHides;
          }
        });

        // the picker saves the one value it had left, and the default stands in when none was left
        settleConditions(config, key, left ? left.value : picker.defaultValue);
      });
    });

    // an anchor with no notes after it, as with plugins off, can be the last row under a heading
    dropRows(config, isAnchor);

    return config;
  }

  function start(options: StartOptions, collect: (items: ClayConfigItem[]) => Record<string, unknown>): FaceStart {
    const own = options.clayConfig;
    const narrowed = narrow(own);
    const defaults = collect(narrowed);

    fillDefaults(defaults, narrowed);

    const pages: SettlePages = { own, ownDefaults: collect(own), narrowed, defaults };
    const saved = getConfig();

    // only a change is written. a phone with no saved settings has nothing to change, so clay-settings
    // stays unset. that matters, since the app reads an empty phone as one to fill from the watch, and
    // a write here would make it look like a phone with settings of its own and skip that restore.
    // the watch still holds what it was sent before the change, so it has to hear it too
    let launchSettled = settle(saved, pages);

    if (launchSettled) {
      localStorage.setItem('clay-settings', JSON.stringify(saved));
    }

    // whether the last settings restore from the watch brought back something the settle changed
    let seedSettled = false;

    const hooks: FeatureHooks = {
      page,
      // the watch echoes whatever it was last sent, which can be a provider the face no longer
      // offers. the seed saves after its hooks, so this change rides its write
      seeded: (config) => {
        if (settle(config, pages)) {
          seedSettled = true;
        }
      },
    };

    return {
      options: { ...options, clayConfig: narrowed },
      defaults,
      providers: lists,
      hooks: [hooks],
      seedSettled() {
        const settled = seedSettled;

        seedSettled = false;
        return settled;
      },
      launchSettled() {
        const settled = launchSettled;

        launchSettled = false;
        return settled;
      },
      // a page whose features' rows could not be added still drops a picker left with one provider,
      // and carries no empty anchor rows
      fallbackPage: (config) => page(copyPage(config as ClayConfigItem[])),
    };
  }

  return { lists, start, narrow, defaults: fillDefaults, settle, page };
}

export default { faceProvidersFor };
