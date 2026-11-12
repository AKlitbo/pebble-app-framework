/**
 * Specs for the supported plugins panel.
 *
 * The panel is where a wearer finds out which plugins the face reads and where to get them, so the
 * parts worth pinning are the ones that send them the wrong way: a listing address that points
 * nowhere, an installed mark on a plugin that is not there, a second panel for a face with two kinds,
 * and the line to turn plugins on missing while the phone lists none. Every word a plugin names
 * itself with reaches the page escaped, since Clay writes the row into a script block.
 */

import { describe, test, expect } from 'vitest';
import { addPluginsPanel, BUILT_IN_TAG, INSTALLED_TAG, OFF_TAG, PANEL_OFF_TEXT, UNNAMED_PLUGIN } from './panel';
import { escapeHtml } from './escape';
import type { PluginSummary } from './types';
import type { ClayConfigItem, PluginPanelContent } from '../clay/types';

// the built-in plugins as the phone lists them, and a store plugin the directory knows
const BUILT_IN_WEATHER: PluginSummary = { uuid: '00000000-0000-0000-0001-000000000002', name: 'Weather', sources: [{ category: 'weather', items: ['location'] }] };
const BUILT_IN_CALENDAR: PluginSummary = { uuid: '00000000-0000-0000-0001-000000000004', name: 'Calendar', sources: [{ category: 'calendar', items: ['event'] }] };
const MET_NORWAY: PluginSummary = { uuid: '323dc117-55bd-455f-9ee4-4d0faba56ea1', name: 'MET Norway Weather', sources: [{ category: 'weather', items: ['location'] }] };

// where MET Norway Weather's, Weather+'s, Weather Enhanced's, and Stocks + Crypto's listings are on the store
const MET_NORWAY_LISTING = 'https://apps.repebble.com/met-norway-weather_6972cb1f33e343d69e5b788e';
const WEATHER_PLUS_LISTING = 'https://apps.repebble.com/weather_48e0d519c06b49e284612dc5';
const WEATHER_ENHANCED_LISTING = 'https://apps.repebble.com/weather-enhanced_f62c8e74dd3c4157abf09a49';
const STOCKS_CRYPTO_LISTING = 'https://apps.repebble.com/stocks-crypto_aabbca2fe4f441deb2b5ace7';

/** A page with a section and the save button at its foot, as the config builder lays one out. */
function page(): ClayConfigItem[] {
  return [
    { type: 'heading', defaultValue: 'A Face' },
    { type: 'section', items: [{ type: 'select', messageKey: 'WEATHER_PROVIDER', options: [{ label: 'Open-Meteo', value: 'openmeteo' }] }] },
    { type: 'submit', defaultValue: 'Save' },
  ];
}

/** Every panel on the page, wherever it sits. */
function panelsOn(items: ClayConfigItem[]): PluginPanelContent[] {
  return items.flatMap((item) => [...(item.panel ? [item.panel] : []), ...panelsOn(item.items || [])]);
}

/** The one panel on the page after adding the given kinds. */
function panelFor(plugins: PluginSummary[] | null, kinds: Array<[string, string]> = [['weather', 'location']]): PluginPanelContent {
  const items = page();

  kinds.forEach(([category, item]) => addPluginsPanel(items, category, item, plugins));

  return panelsOn(items)[0];
}

describe('where the panel goes', () => {
  /** A panel under the save button would sit where the wearer has already left the page. */
  test('puts the panel in its own section just above the save button', () => {
    const items = page();

    addPluginsPanel(items, 'weather', 'location', [BUILT_IN_WEATHER]);

    const result = items.map((item) => (item.type === 'section' ? item.items?.map((row) => row.type).join(',') : item.type));

    expect(result).toEqual(['heading', 'select', 'pluginPanel', 'submit']);
  });

  /** A face with weather and the calendar would otherwise show the wearer two panels saying much the same. */
  test('lists a second kind in the same panel', () => {
    const items = page();

    addPluginsPanel(items, 'weather', 'location', [BUILT_IN_WEATHER, BUILT_IN_CALENDAR]);
    addPluginsPanel(items, 'calendar', 'event', [BUILT_IN_WEATHER, BUILT_IN_CALENDAR]);

    const result = panelsOn(items).map((panel) => panel.kinds.map((kind) => kind.label));

    expect(result).toEqual([['Weather', 'Calendar']]);
  });

  /** The feature order a face lists decides which hook runs first, and the panel should read the same either way. */
  test('keeps the directory order whichever kind is added first', () => {
    const result = panelFor([], [['calendar', 'event'], ['weather', 'location']]).kinds.map((kind) => kind.label);

    expect(result).toEqual(['Weather', 'Calendar']);
  });

  /** Two hooks for the same kind must not list its plugins twice. */
  test('lists a kind once when it is added twice', () => {
    const result = panelFor([], [['weather', 'location'], ['weather', 'location']]).kinds;

    expect(result).toHaveLength(1);
  });

  /** A kind with no heading would draw a nameless list, so it is left off until the directory has one. */
  test('leaves the page alone for a kind the directory has no heading for', () => {
    const items = page();

    addPluginsPanel(items, 'tide', 'station', []);

    const result = items;

    expect(result).toEqual(page());
  });

  /** The earlier hook's page is what the fold falls back to, so adding a kind must not change it under it. */
  test('leaves the panel on an earlier page as it was', () => {
    const earlier = page();

    addPluginsPanel(earlier, 'weather', 'location', []);

    const later = earlier.map((item) => (item.items ? { ...item, items: item.items.map((row) => ({ ...row })) } : { ...item }));

    addPluginsPanel(later, 'calendar', 'event', []);

    const result = panelsOn(earlier)[0].kinds.map((kind) => kind.label);

    expect(result).toEqual(['Weather']);
  });
});

describe('what the panel lists', () => {
  /** The built-in plugin needs no install, so the wearer has to see it is already there rather than look for it in the store. */
  test('lists the built-in plugin first, marked as built in, with no listing', () => {
    const result = panelFor([BUILT_IN_WEATHER]).kinds[0].entries[0];

    expect(result).toEqual({ name: 'Weather', tag: BUILT_IN_TAG, listing: '' });
  });

  /** A wrong id or slug sends the wearer to a store page that does not exist. */
  test('links Weather+ to its store listing', () => {
    const result = panelFor([BUILT_IN_WEATHER]).kinds[0].entries.find((entry) => entry.name === 'Weather+');

    expect(result).toEqual({ name: 'Weather+', tag: '', listing: WEATHER_PLUS_LISTING });
  });

  /** A wrong id or slug sends the wearer to a store page that does not exist. */
  test('links Weather Enhanced to its store listing', () => {
    const result = panelFor([BUILT_IN_WEATHER]).kinds[0].entries.find((entry) => entry.name === 'Weather Enhanced');

    expect(result).toEqual({ name: 'Weather Enhanced', tag: '', listing: WEATHER_ENHANCED_LISTING });
  });

  /** A wrong id or slug sends the wearer to a store page that does not exist. */
  test('links MET Norway Weather to its store listing', () => {
    const result = panelFor([BUILT_IN_WEATHER]).kinds[0].entries.find((entry) => entry.name === 'MET Norway Weather');

    expect(result).toEqual({ name: 'MET Norway Weather', tag: '', listing: MET_NORWAY_LISTING });
  });

  /** A wearer who already has the plugin would otherwise go looking to install it again. */
  test('marks a store plugin the phone lists as installed, whatever case its uuid is in', () => {
    const listed = { ...MET_NORWAY, uuid: MET_NORWAY.uuid?.toUpperCase() };

    const result = panelFor([BUILT_IN_WEATHER, listed]).kinds[0].entries.find((entry) => entry.name === 'MET Norway Weather');

    expect(result?.tag).toBe(INSTALLED_TAG);
  });

  /** A built-in plugin the phone does not list is not running, and a wearer told it was built in would expect it to answer. */
  test('marks a built-in plugin off when a readable list leaves it out', () => {
    const result = panelFor([MET_NORWAY]).kinds[0].entries[0].tag;

    expect(result).toBe(`${BUILT_IN_TAG}, ${OFF_TAG}`);
  });

  /** With plugins off the list is empty, and every built-in plugin is out of reach until they come on. */
  test('marks a built-in plugin off when the phone lists no plugins', () => {
    const result = panelFor([]).kinds[0].entries[0].tag;

    expect(result).toBe(`${BUILT_IN_TAG}, ${OFF_TAG}`);
  });

  /** A list the phone will not give says nothing about what is installed, so nothing is marked. */
  test('marks nothing installed or off when the plugin list cannot be read', () => {
    const result = panelFor(null).kinds[0].entries.map((entry) => entry.tag);

    expect(result).toEqual([BUILT_IN_TAG, '', '', '']);
  });

  /** A plugin published after the directory was last refreshed still serves the face, and the wearer has it. */
  test('lists a plugin on the phone the directory does not know, by its own name', () => {
    const own: PluginSummary = { uuid: 'a1', name: 'Pirate Weather', sources: [{ category: 'weather', items: ['location'] }] };

    const result = panelFor([BUILT_IN_WEATHER, own]).kinds[0].entries.slice(-1)[0];

    expect(result).toEqual({ name: 'Pirate Weather', tag: INSTALLED_TAG, listing: '' });
  });

  /** A plugin with no name would otherwise show as its uuid, or as undefined, which means nothing to the wearer. */
  test('lists a plugin the directory does not know with no name under a plain label', () => {
    const nameless: PluginSummary = { uuid: 'a4', sources: [{ category: 'weather', items: ['location'] }] };

    const result = panelFor([nameless]).kinds[0].entries.slice(-1)[0].name;

    expect(result).toBe(UNNAMED_PLUGIN);
  });

  /** An entry with no uuid cannot be told from another, and would show as undefined. */
  test('leaves out a plugin the directory does not know that has no uuid', () => {
    const noUuid = { name: 'Ghost', sources: [{ category: 'weather', items: ['location'] }] } as PluginSummary;

    const result = panelFor([noUuid]).kinds[0].entries.map((entry) => entry.name);

    expect(result).toEqual(['Weather', 'MET Norway Weather', 'Weather+', 'Weather Enhanced']);
  });

  /** A phone that lists one plugin twice would otherwise have the wearer read it twice. */
  test('lists a plugin the phone lists twice once', () => {
    const own: PluginSummary = { uuid: 'a5', name: 'Pirate Weather', sources: [{ category: 'weather', items: ['location'] }] };

    const result = panelFor([own, { ...own, uuid: 'A5' }]).kinds[0].entries.map((entry) => entry.name);

    expect(result).toEqual(['Weather', 'MET Norway Weather', 'Weather+', 'Weather Enhanced', 'Pirate Weather']);
  });

  /** A calendar plugin listed under weather would send the wearer to pick it for something it cannot answer. */
  test('leaves out a plugin the directory does not know that serves another kind', () => {
    const result = panelFor([BUILT_IN_WEATHER, BUILT_IN_CALENDAR, { uuid: 'a2', name: 'Agenda', sources: [{ category: 'calendar', items: ['event'] }] }]).kinds[0].entries.map((entry) => entry.name);

    expect(result).toEqual(['Weather', 'MET Norway Weather', 'Weather+', 'Weather Enhanced']);
  });

  /** A plugin names itself, and a closing script tag in its name would end the block Clay writes the row into. */
  test('escapes a plugin\'s own name and cuts a long one', () => {
    const own: PluginSummary = { uuid: 'a3', name: '</script><img src=x onerror=alert(1)> and then a great deal more', sources: [{ category: 'weather', items: ['location'] }] };

    const result = panelFor([own]).kinds[0].entries.slice(-1)[0]?.name;

    expect(result).toBe(escapeHtml('</script><img src=x onerror=alert(1)> a…'));
  });
});

describe('the kinds only a plugin serves', () => {
  // the built-in music and phone plugins as an Android phone lists them
  const BUILT_IN_MUSIC: PluginSummary = { uuid: '00000000-0000-0000-0001-000000000003', name: 'Music', sources: [{ category: 'music', items: ['track'] }] };
  const BUILT_IN_PHONE: PluginSummary = { uuid: '00000000-0000-0000-0001-000000000001', name: 'Phone', sources: [{ category: 'phone', items: ['phone_state'] }] };

  /** An iPhone wearer looking for the music plugin would hunt for one that is not there, so the entry says where it runs. */
  test('marks the built-in music plugin as Android only', () => {
    const result = panelFor([BUILT_IN_MUSIC], [['music', 'track']]).kinds[0];

    expect(result).toEqual({ category: 'music', item: 'track', label: 'Now Playing', entries: [{ name: 'Music', tag: escapeHtml(`${BUILT_IN_TAG}, Android Only`), listing: '' }] });
  });

  /** On an iPhone the list leaves the music plugin out, which reads as off after where it runs. */
  test('marks the built-in music plugin off when a readable list leaves it out', () => {
    const result = panelFor([BUILT_IN_PHONE], [['music', 'track']]).kinds[0].entries[0].tag;

    expect(result).toBe(escapeHtml(`${BUILT_IN_TAG}, Android Only, ${OFF_TAG}`));
  });

  /** A stock plugin on the phone the directory does not know still serves the face, so it is listed after the store one. */
  test('lists a stock plugin on the phone under Stocks after Stocks + Crypto', () => {
    const plugin = { uuid: 'stock-uuid', name: 'My Stocks', sources: [{ category: 'finance', items: ['stock'] }] };

    const result = panelFor([plugin], [['finance', 'stock']]).kinds[0];

    expect(result).toEqual({
      category: 'finance',
      item: 'stock',
      label: 'Stocks',
      entries: [
        { name: 'Stocks + Crypto', tag: '', listing: STOCKS_CRYPTO_LISTING },
        { name: 'My Stocks', tag: INSTALLED_TAG, listing: '' },
      ],
    });
  });

  /**
   * The Pebble app has no stock plugin of its own, so a wearer with none installed is pointed at the
   * store's. While the directory knows one, the Stocks heading always has it, and the line saying the
   * phone lists none stays off.
   */
  test('points a phone with no stock plugin at Stocks + Crypto', () => {
    const result = panelFor([BUILT_IN_PHONE], [['finance', 'stock']]).kinds[0];

    expect(result).toEqual({ category: 'finance', item: 'stock', label: 'Stocks', entries: [{ name: 'Stocks + Crypto', tag: '', listing: STOCKS_CRYPTO_LISTING }] });
  });

  /** With plugins off, or a list the phone will not give, the stock plugin may be installed, so saying none is would send the wearer to the store for one they have. */
  test.each([
    ['plugins off', []],
    ['an unreadable list', null],
  ])('leaves the Stocks line out with %s', (_label, plugins) => {
    const result = panelFor(plugins, [['finance', 'stock']]).kinds[0].none;

    expect(result).toBeUndefined();
  });

  /** The kinds keep the directory's order whichever hook ran first, so every face lists them the same way. */
  test('lists every kind under its own heading in the directory order', () => {
    const kinds: Array<[string, string]> = [['phone', 'phone_state'], ['music', 'track'], ['calendar', 'event'], ['weather', 'location']];

    const result = panelFor([BUILT_IN_MUSIC, BUILT_IN_PHONE], kinds).kinds.map((kind) => kind.label);

    expect(result).toEqual(['Weather', 'Calendar', 'Now Playing', 'Phone Battery']);
  });
});

describe('the line to turn plugins on', () => {
  /** With nothing listed, the panel's plugins are all out of reach until the wearer turns plugins on. */
  test('opens the panel on it while the phone lists no plugins', () => {
    const result = panelFor([]).off;

    expect(result).toBe(escapeHtml(PANEL_OFF_TEXT));
  });

  /** A phone listing plugins has them on, and telling the wearer to turn them on would be wrong. */
  test('leaves it out while the phone lists any plugin', () => {
    const result = panelFor([BUILT_IN_WEATHER]).off;

    expect(result).toBe('');
  });

  /** A list the phone will not give may still hide plugins that answer, so it is not read as plugins off. */
  test('leaves it out when the plugin list cannot be read', () => {
    const result = panelFor(null).off;

    expect(result).toBe('');
  });
});
