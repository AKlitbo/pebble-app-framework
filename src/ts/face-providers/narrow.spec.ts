// @vitest-environment jsdom
/**
 * Specs for narrowing a settings page to the providers a face lists.
 *
 * The manifest asks the phone only for the sites the listed providers call, so a picker still
 * offering another provider sends a wearer to a fetch the phone blocks. The rows are found by their
 * keys, so a face's own sections have to narrow the same way as the builder's. The saved settings
 * have to follow the page too, or a wearer who picked a provider the face dropped sees a blank select
 * and fetches from a site the manifest no longer lists. The passes, the defaults, and the settle are
 * what these pin down.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { faceProvidersFor } from './narrow';
import { calendarSection, locationSection, stocksSection, weatherSection } from '../pkjs/config-builder';
import { heading, select } from '../pkjs/config-rows';
import { collectDefaults } from '../pkjs/app';
import { settingsSnapshot } from '../pkjs/settings-store';
import { WEATHER_KEYS } from '../weather/feature';
import type { ClayConfigItem } from '../clay/types';
import type { SettlePages, WrittenProviders } from './narrow';
import stockCache from '../stock/cache';

// the builder's weather lead line, which sits right above the Data Source select
const LEAD_LINE = 'Choose where your watch pulls its weather data. Open-Meteo works right out of the box with no setup required.';

/** A page built the way a face with the builder's weather, location, stock, and calendar sections builds it. */
function builderPage(): ClayConfigItem[] {
  return [
    heading('Face'),
    locationSection({ location: {} }) as ClayConfigItem,
    weatherSection({ weather: {}, temperature: {} }) as ClayConfigItem,
    stocksSection({ stocks: {} }) as ClayConfigItem,
    calendarSection({ calendar: {} }) as ClayConfigItem,
    { type: 'submit', defaultValue: 'Save' },
  ];
}

/** The builder's page for a face with weather and no temperature unit, so the picker and its lead line are all the Weather card holds. */
function noUnitPage(): ClayConfigItem[] {
  return [
    heading('Face'),
    locationSection({ location: {} }) as ClayConfigItem,
    weatherSection({ weather: {} }) as ClayConfigItem,
    { type: 'submit', defaultValue: 'Save' },
  ];
}

/** The headings of the sections on a page, which is the cards Clay draws. */
function cardsOf(page: ClayConfigItem[]): string[] {
  return rowsOf(page).filter((item) => item.type === 'section').map((item) => String((item.items || []).find((row) => row.type === 'heading')?.defaultValue));
}

/** A stock section laid out the way a face builds its own, with a key row shown only for the keyed providers. */
function ownStockPage(): ClayConfigItem[] {
  return [
    {
      type: 'section',
      items: [
        heading('Stocks'),
        select('STOCK_PROVIDER', 'Data Source', [
          { label: 'Finnhub', value: 'finnhub' },
          { label: 'Yahoo', value: 'yahoo' },
          { label: 'Alpha Vantage', value: 'alphavantage' },
        ], 'finnhub'),
        {
          type: 'input',
          messageKey: 'STOCK_API_KEY',
          label: 'API Key',
          visibleWhen: { key: 'STOCK_PROVIDER', in: ['finnhub', 'alphavantage'] },
        },
        { type: 'input', messageKey: 'STOCK_SYMBOLS', label: 'Tickers' },
      ],
    },
  ];
}

/** Every row on a page, sections and the rows inside them. */
function rowsOf(page: ClayConfigItem[]): ClayConfigItem[] {
  return page.flatMap((item) => [item, ...(item.items ? rowsOf(item.items) : [])]);
}

/** The row with a message key, or undefined. */
function rowWithKey(page: ClayConfigItem[], key: string): ClayConfigItem | undefined {
  return rowsOf(page).find((item) => item.messageKey === key);
}

/** The option values of the row with a message key. */
function optionsOf(page: ClayConfigItem[], key: string): Array<string | number> | undefined {
  return rowWithKey(page, key)?.options?.map((option) => option.value);
}

/** The text rows on a page, by their words. */
function textsOf(page: ClayConfigItem[]): string[] {
  return rowsOf(page).filter((item) => item.type === 'text' || item.type === 'heading').map((item) => String(item.defaultValue));
}

/** The lists a face writes, with needsKey worked out the way the build does. */
function written(lists: Record<string, string[]>): WrittenProviders {
  const keyed = ['owm', 'weatherapi', 'finnhub', 'twelvedata', 'alphavantage'];
  const out: WrittenProviders = {};

  Object.keys(lists).forEach((kind) => {
    out[kind as keyof WrittenProviders] = { offered: lists[kind], needsKey: lists[kind].some((name) => keyed.includes(name)) };
  });

  return out;
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe('narrow with custom providers', () => {
  /** A picker still offering a provider the manifest dropped sends the wearer to a fetch the phone blocks. */
  test('keeps only the listed options, in the picker\'s own order and with its own labels', () => {
    const providers = faceProvidersFor(written({ weather: ['weatherapi', 'openmeteo'] }));

    const result = rowWithKey(providers.narrow(builderPage()), 'WEATHER_PROVIDER')?.options;

    expect(result).toEqual([
      { label: 'Open-Meteo (Free, No Key Required)', value: 'openmeteo' },
      { label: 'WeatherAPI.com', value: 'weatherapi' },
    ]);
  });

  /** A face that picks a radio group for its providers would offer every provider if only a select were narrowed. */
  test('narrows a radio group the same as a select', () => {
    const page: ClayConfigItem[] = [{ type: 'radiogroup', messageKey: 'STOCK_PROVIDER', defaultValue: 'finnhub', options: [{ label: 'Finnhub', value: 'finnhub' }, { label: 'Yahoo', value: 'yahoo' }] }];
    const providers = faceProvidersFor(written({ stocks: ['yahoo'] }));

    const result = optionsOf(providers.narrow(page), 'STOCK_PROVIDER');

    expect(result).toEqual(['yahoo']);
  });

  /** The plugin source page adds the plugin option at page open, so adding one here would show it twice. */
  test('adds no option for the plugin in a mixed list', () => {
    const providers = faceProvidersFor(written({ weather: ['plugin', 'openmeteo'] }));

    const result = optionsOf(providers.narrow(builderPage()), 'WEATHER_PROVIDER');

    expect(result).toEqual(['openmeteo']);
  });

  /** A row with the key but no options has nothing to narrow, and changing it would lose the face's own setting. */
  test('leaves a row with the key and no options alone, and says so', () => {
    const page: ClayConfigItem[] = [{ type: 'input', messageKey: 'WEATHER_PROVIDER', defaultValue: 'owm' }];
    const providers = faceProvidersFor(written({ weather: ['openmeteo'] }));

    const result = providers.narrow(page);

    expect(result).toEqual(page);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('WEATHER_PROVIDER row has no options'));
  });

  /** The order of the custom providers sets the default, so the plugin first in a list must not become it. */
  test.each([
    [['plugin', 'owm', 'openmeteo'], 'owm'],
    [['openmeteo', 'plugin'], 'openmeteo'],
    [['weatherapi'], 'weatherapi'],
  ])('defaults %j to %s', (list, expected) => {
    const providers = faceProvidersFor(written({ weather: list }));

    const result = rowWithKey(providers.narrow(builderPage()), 'WEATHER_PROVIDER')?.defaultValue;

    expect(result).toBe(expected);
  });

  /** A face whose default the list leaves out quietly moves to another, so the face developer has to hear how to keep it. */
  test('warns with the fix when the face\'s own default is not listed', () => {
    const providers = faceProvidersFor(written({ weather: ['owm', 'openmeteo'] }));

    providers.narrow([select('WEATHER_PROVIDER', 'Data Source', [{ label: 'OWM', value: 'owm' }, { label: 'WeatherAPI', value: 'weatherapi' }, { label: 'Open-Meteo', value: 'openmeteo' }], 'weatherapi')]);

    expect(warn).toHaveBeenCalledWith('face providers: WEATHER_PROVIDER defaults to weatherapi, which providers.weather does not list. List it first in the appinfo to keep it as the default');
  });

  /** A listed provider the face's own picker never offered cannot be picked, and only a warning says why. */
  test('warns about a listed provider the picker has no option for', () => {
    const providers = faceProvidersFor(written({ weather: ['openmeteo', 'weatherapi'] }));

    providers.narrow([select('WEATHER_PROVIDER', 'Data Source', [{ label: 'Open-Meteo', value: 'openmeteo' }], 'openmeteo')]);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('providers.weather lists weatherapi, but the WEATHER_PROVIDER picker has no option for it'));
  });

  /** A key row with no keyed provider behind it asks the wearer for something nothing reads. */
  test.each([
    ['weather', ['openmeteo'], 'WEATHER_API_KEY', false],
    ['weather', ['openmeteo', 'owm'], 'WEATHER_API_KEY', true],
    ['stocks', ['yahoo'], 'STOCK_API_KEY', false],
    ['stocks', ['yahoo', 'finnhub'], 'STOCK_API_KEY', true],
  ])('with %s %j keeps the key row: %s %s', (kind, list, key, expected) => {
    const providers = faceProvidersFor(written({ [kind]: list }));

    const result = rowWithKey(providers.narrow(builderPage()), key) !== undefined;

    expect(result).toBe(expected);
  });

  /** A face's own stock section, found by its key with no mark, has to narrow the way the builder's does. */
  test('narrows a face\'s own stock section with a key row of its own', () => {
    const providers = faceProvidersFor(written({ stocks: ['yahoo'] }));

    const result = providers.narrow(ownStockPage());

    expect(optionsOf(result, 'STOCK_PROVIDER')).toEqual(['yahoo']);
    expect(rowWithKey(result, 'STOCK_PROVIDER')?.defaultValue).toBe('yahoo');
    expect(rowWithKey(result, 'STOCK_API_KEY')).toBeUndefined();
    expect(rowWithKey(result, 'STOCK_SYMBOLS')).toBeDefined();
  });
});

describe('narrow with the plugin alone', () => {
  /** The weather comes from the plugin whatever is saved, so a picker or a location row left on the page offers a choice that does nothing. */
  test('takes the weather picker and every row only a custom provider reads off the page', () => {
    const providers = faceProvidersFor(written({ weather: ['plugin'] }));

    const result = providers.narrow(builderPage());

    expect(['WEATHER_PROVIDER', 'WEATHER_API_KEY', 'LOCATION_USE_GPS', 'LOCATION_GPS_FALLBACK', 'LOCATION_NAME'].filter((key) => rowWithKey(result, key))).toEqual([]);
    expect(textsOf(result)).not.toContain(LEAD_LINE);
    expect(textsOf(result)).not.toContain('Location Settings');
    expect(rowWithKey(result, 'WEATHER_TEMPERATURE_UNIT')).toBeDefined();
  });

  /** The plugin source page puts the kind's notes after the anchor, so one left anywhere else puts them far from the weather rows. */
  test('leaves the anchor where the weather picker was', () => {
    const providers = faceProvidersFor(written({ weather: ['plugin'] }));

    const result = providers.narrow(builderPage());

    const weather = result.find((item) => item.items?.some((row) => row.messageKey === 'WEATHER_TEMPERATURE_UNIT'));

    expect(weather?.items).toEqual([heading('Weather'), expect.objectContaining({ messageKey: 'WEATHER_TEMPERATURE_UNIT' }), { type: 'text', pluginSourceRows: 'weather' }]);
  });

  /** A location section left holding only its heading would stand over nothing. */
  test('takes off a section left with only headings', () => {
    const providers = faceProvidersFor(written({ weather: ['plugin'] }));

    const result = providers.narrow(builderPage()).filter((item) => item.type === 'section').length;

    expect(result).toBe(builderPage().filter((item) => item.type === 'section').length - 1);
  });

  /** A row the face did not mark, such as a second clock in the same section, has nothing to do with the weather source. */
  test('keeps an unmarked row in a section it empties of marked ones', () => {
    const page = builderPage();
    const location = page[1] as ClayConfigItem;

    (location.items as ClayConfigItem[]).push({ type: 'locationsearch', messageKey: 'CLOCK_TIMEZONE_1', timeZone: true });

    const result = faceProvidersFor(written({ weather: ['plugin'] })).narrow(page);

    expect(rowWithKey(result, 'CLOCK_TIMEZONE_1')).toBeDefined();
    expect(rowWithKey(result, 'LOCATION_NAME')).toBeUndefined();
  });

  /** A plugin only face declares no WEATHER_PROVIDER, so its page most often has no picker, and the notes still belong with the weather rows. */
  test('puts the anchor in the key row\'s place on a page with no picker', () => {
    const page: ClayConfigItem[] = [{ type: 'section', items: [heading('Weather'), { type: 'input', messageKey: 'WEATHER_API_KEY' }, { type: 'toggle', messageKey: 'WEATHER_TEMPERATURE_UNIT' }] }];

    const result = faceProvidersFor(written({ weather: ['plugin'] })).narrow(page);

    expect(result[0].items).toEqual([heading('Weather'), { type: 'text', pluginSourceRows: 'weather' }, { type: 'toggle', messageKey: 'WEATHER_TEMPERATURE_UNIT' }]);
  });

  /** With no picker and no key row, the notes still go with the weather rows rather than at the foot of the page. */
  test('puts the anchor at the end of the section holding the kind\'s other rows', () => {
    const page: ClayConfigItem[] = [{ type: 'section', items: [heading('Weather'), { type: 'toggle', messageKey: 'WEATHER_TEMPERATURE_UNIT' }] }, { type: 'submit', defaultValue: 'Save' }];

    const result = faceProvidersFor(written({ weather: ['plugin'] })).narrow(page);

    expect(result[0].items?.[2]).toEqual({ type: 'text', pluginSourceRows: 'weather' });
  });

  /** A face that marks its own row for the notes chose where they go, and a second anchor would split them. */
  test('keeps a face\'s own marked row as the only anchor', () => {
    const page = builderPage();

    page.splice(1, 0, { type: 'text', defaultValue: 'Weather comes from the Pebble app.', pluginSourceRows: 'weather' });

    const result = rowsOf(faceProvidersFor(written({ weather: ['plugin'] })).narrow(page)).filter((item) => item.pluginSourceRows === 'weather');

    expect(result).toEqual([{ type: 'text', defaultValue: 'Weather comes from the Pebble app.', pluginSourceRows: 'weather' }]);
  });

  /** The calendar comes from the plugin alone, so an iCal link left on the page asks for something nothing fetches. */
  test('puts the anchor in the iCal link\'s place and takes its lead line off', () => {
    const providers = faceProvidersFor(written({ calendar: ['plugin'] }));

    const result = providers.narrow(builderPage()).find((item) => item.items?.some((row) => row.pluginSourceRows === 'calendar'));

    expect(result?.items).toEqual([heading('Calendar Preferences'), { type: 'text', pluginSourceRows: 'calendar' }]);
  });

  /** A face's own condition on the weather picker would hide its row for good once the picker is gone. */
  test('settles a condition on the picker against the plugin', () => {
    const page: ClayConfigItem[] = [
      select('WEATHER_PROVIDER', 'Data Source', [{ label: 'Open-Meteo', value: 'openmeteo' }], 'openmeteo'),
      { type: 'text', defaultValue: 'From the plugin.', visibleWhen: { key: 'WEATHER_PROVIDER', in: ['plugin'] } },
      { type: 'text', defaultValue: 'From Open-Meteo.', visibleWhen: { key: 'WEATHER_PROVIDER', in: ['openmeteo'] } },
    ];

    const result = faceProvidersFor(written({ weather: ['plugin'] })).narrow(page);

    expect(result.slice(1)).toEqual([
      { type: 'text', defaultValue: 'From the plugin.' },
      { type: 'text', defaultValue: 'From Open-Meteo.', visibleWhen: { key: 'WEATHER_PROVIDER', in: ['openmeteo'] } },
    ]);
  });
});

describe('narrow on the face\'s own page', () => {
  /** A kind the face leaves out keeps every provider it has. */
  test('leaves a kind the face does not list exactly as it was', () => {
    const providers = faceProvidersFor(written({ stocks: ['yahoo'] }));

    const result = providers.narrow(builderPage()).slice(0, 3);

    expect(result).toEqual(builderPage().slice(0, 3));
  });

  /** A calendar offering its iCal link gets what it needs from the plugin source page, so a list holding the link changes nothing here. */
  test('leaves the calendar alone for a list holding the iCal link', () => {
    const providers = faceProvidersFor(written({ calendar: ['plugin', 'ical'] }));

    const result = providers.narrow(builderPage());

    expect(result).toEqual(builderPage());
    expect(providers.lists).toEqual({});
  });

  /** The defaults and the settings restore read the face's page, so a pass that changed it would change them too. */
  test('never changes the face\'s own page, and gives the same page twice', () => {
    const page = builderPage();
    const providers = faceProvidersFor(written({ weather: ['plugin'], stocks: ['yahoo'], calendar: ['plugin'] }));

    const first = providers.narrow(page);
    const second = providers.narrow(page);

    expect(page).toEqual(builderPage());
    expect(second).toEqual(first);
  });
});

describe('defaults', () => {
  /** A face with no picker would otherwise fall back to the feature's own default, which may not be listed. */
  test('fills the first listed custom provider for a page with no picker', () => {
    const defaults: Record<string, unknown> = {};

    faceProvidersFor(written({ weather: ['plugin', 'weatherapi'], stocks: ['yahoo'] })).defaults(defaults, []);

    expect(defaults).toEqual({ WEATHER_PROVIDER: 'weatherapi', STOCK_PROVIDER: 'yahoo' });
  });

  /** A plugin only kind reads no saved provider, so a default for it would only reach a select that is not there. */
  test('fills nothing for a plugin only kind', () => {
    const defaults: Record<string, unknown> = {};

    faceProvidersFor(written({ weather: ['plugin'], calendar: ['plugin'] })).defaults(defaults, []);

    expect(defaults).toEqual({});
  });

  /** A row with no options keeps its own default, and one the list leaves out would fetch from a site the manifest dropped. */
  test('replaces a default the list leaves out on a row with no options', () => {
    const page: ClayConfigItem[] = [{ type: 'input', messageKey: 'STOCK_PROVIDER', defaultValue: 'finnhub' }];
    const defaults: Record<string, unknown> = { STOCK_PROVIDER: 'finnhub' };

    faceProvidersFor(written({ stocks: ['yahoo'] })).defaults(defaults, page);

    expect(defaults).toEqual({ STOCK_PROVIDER: 'yahoo' });
  });
});

describe('settle', () => {
  /** The pages the app hands settle at launch, worked out the way start works them out. */
  function pagesFor(providers: ReturnType<typeof faceProvidersFor>, own: ClayConfigItem[]): SettlePages {
    const narrowed = providers.narrow(own);
    const defaults = collectDefaults(narrowed);

    providers.defaults(defaults, narrowed);
    return { own, ownDefaults: collectDefaults(own), narrowed, defaults };
  }

  /** The stock cache as the phone holds it now. */
  function storedCache(): Record<string, unknown> | null {
    return JSON.parse(localStorage.getItem('stock-cache') as string);
  }

  // a cache written before the provider was recorded, holding one strip
  const UNTAGGED = { lastAsOf: '2026-07-01', lastFetchMs: 1, strip: [1] };

  /** A saved provider the page no longer offers shows a blank select and fetches from a site the manifest dropped. */
  test.each(['owm', 'OWM'])('rewrites a saved %s to the default on a face offering only openmeteo', (saved) => {
    const providers = faceProvidersFor(written({ weather: ['openmeteo'] }));
    const settings: Record<string, unknown> = { WEATHER_PROVIDER: saved };

    const result = providers.settle(settings, pagesFor(providers, builderPage()));

    expect(result).toBe(true);
    expect(settings.WEATHER_PROVIDER).toBe('openmeteo');
  });

  /** A face that dropped the plugin choice cannot run a saved plugin, and the select would show it blank. */
  test('rewrites a saved plugin on a list without it, and keeps it on one with it', () => {
    const customOnly = faceProvidersFor(written({ weather: ['openmeteo'] }));
    const mixed = faceProvidersFor(written({ weather: ['plugin', 'openmeteo'] }));
    const onCustom: Record<string, unknown> = { WEATHER_PROVIDER: 'plugin' };
    const onMixed: Record<string, unknown> = { WEATHER_PROVIDER: 'plugin' };

    customOnly.settle(onCustom, pagesFor(customOnly, builderPage()));
    const result = mixed.settle(onMixed, pagesFor(mixed, builderPage()));

    expect(onCustom.WEATHER_PROVIDER).toBe('openmeteo');
    expect(result).toBe(false);
    expect(onMixed.WEATHER_PROVIDER).toBe('plugin');
  });

  /**
   * A face whose options save capitalized values, such as `Yahoo`, would open on no option at all if
   * the settle wrote the list's lowercase spelling, since Clay matches a saved value to an option exactly.
   */
  test('settles to the picker\'s own spelling of the provider', () => {
    const providers = faceProvidersFor(written({ stocks: ['yahoo'] }));
    const own = [select('STOCK_PROVIDER', 'Data Source', [{ label: 'Finnhub', value: 'Finnhub' }, { label: 'Yahoo', value: 'Yahoo' }], 'Finnhub')];
    const settings: Record<string, unknown> = { STOCK_PROVIDER: 'Finnhub' };
    const pages = pagesFor(providers, own);

    providers.settle(settings, pages);

    expect(settings.STOCK_PROVIDER).toBe('Yahoo');
    expect(rowsOf(pages.narrowed)[0].defaultValue).toBe('Yahoo');
    expect(pages.defaults.STOCK_PROVIDER).toBe('Yahoo');
  });

  /**
   * A listed provider the face's own picker has no option for shows as a blank select, so a wearer who
   * saved it saw nothing picked and saved an empty value on the next save.
   */
  test('rewrites a listed provider the picker cannot show to the first one it can', () => {
    const providers = faceProvidersFor(written({ weather: ['owm', 'openmeteo'] }));
    const own = [select('WEATHER_PROVIDER', 'Data Source', [{ label: 'Open-Meteo', value: 'openmeteo' }, { label: 'WeatherAPI', value: 'weatherapi' }], 'openmeteo')];
    const settings: Record<string, unknown> = { WEATHER_PROVIDER: 'owm' };

    const result = providers.settle(settings, pagesFor(providers, own));

    expect(result).toBe(true);
    expect(settings.WEATHER_PROVIDER).toBe('openmeteo');
  });

  /**
   * The first save from a page with no key row drops the saved key, and the weather feature read that
   * as a changed setting and fetched again for nothing.
   */
  test('deletes a removed key row\'s value, so the first save changes no weather setting', () => {
    const providers = faceProvidersFor(written({ weather: ['openmeteo'] }));
    const pages = pagesFor(providers, builderPage());
    const settings: Record<string, unknown> = { WEATHER_PROVIDER: 'openmeteo', WEATHER_API_KEY: 'abc', LOCATION_USE_GPS: false };

    providers.settle(settings, pages);
    localStorage.setItem('clay-settings', JSON.stringify(settings));

    const before = settingsSnapshot(WEATHER_KEYS, pages.defaults);

    // the page saves only the rows it holds, which no longer include the key row
    localStorage.setItem('clay-settings', JSON.stringify({ WEATHER_PROVIDER: 'openmeteo', LOCATION_USE_GPS: false }));

    const result = settingsSnapshot(WEATHER_KEYS, pages.defaults);

    expect(result).toEqual(before);
  });

  /**
   * A face that moved its weather and calendar to the plugin alone kept the old provider, key,
   * location, and link saved. The first save from the page dropped them all, which read as changed
   * settings and forced a refetch.
   */
  test('deletes the saved values of a plugin only kind\'s custom rows, so the first save changes no setting', () => {
    const providers = faceProvidersFor(written({ weather: ['plugin'], calendar: ['plugin'] }));
    const pages = pagesFor(providers, builderPage());
    const settings: Record<string, unknown> = { WEATHER_PROVIDER: 'owm', WEATHER_API_KEY: 'abc', WEATHER_TEMPERATURE_UNIT: 1, LOCATION_USE_GPS: true, LOCATION_NAME: 'Paris', CALENDAR_ICS_URL: 'https://example.com/a.ics' };
    const onPage = new Set(rowsOf(pages.narrowed).map((item) => item.messageKey));

    const changed = providers.settle(settings, pages);
    const saved = Object.fromEntries(Object.entries(settings).filter(([key]) => onPage.has(key)));

    expect(changed).toBe(true);
    expect(settings).toEqual({ WEATHER_TEMPERATURE_UNIT: 1 });
    expect(saved).toEqual(settings);
  });

  /** A phone whose settings are already fine must not be written, or every launch costs a write. */
  test('leaves a listed value and a missing value alone', () => {
    const providers = faceProvidersFor(written({ weather: ['openmeteo'], stocks: ['yahoo', 'finnhub'] }));
    const settings: Record<string, unknown> = { STOCK_PROVIDER: 'Finnhub', STOCK_API_KEY: 'k' };

    const result = providers.settle(settings, pagesFor(providers, builderPage()));

    expect(result).toBe(false);
    expect(settings).toEqual({ STOCK_PROVIDER: 'Finnhub', STOCK_API_KEY: 'k' });
  });

  /** A cache the face's own provider wrote holds its quota stamps, and emptying it would spend a call on every launch. */
  test.each([
    ['a saved provider', builderPage(), { STOCK_PROVIDER: 'yahoo' }, ['yahoo', 'finnhub']],
    ['a picker default', builderPage(), {}, ['finnhub', 'yahoo']],
    ['a text row', [{ type: 'input', messageKey: 'STOCK_PROVIDER', defaultValue: 'yahoo' }], {}, ['yahoo']],
    ['a row with no options saved', [{ type: 'input', messageKey: 'STOCK_PROVIDER', defaultValue: 'yahoo' }], { STOCK_PROVIDER: 'yahoo' }, ['yahoo']],
  ] as Array<[string, ClayConfigItem[], Record<string, unknown>, string[]]>)('keeps the stock cache of a face whose provider stays, from %s', (_name, own, saved, list) => {
    localStorage.setItem('stock-cache', JSON.stringify(UNTAGGED));
    const providers = faceProvidersFor(written({ stocks: list }), stockCache);

    providers.settle({ ...saved }, pagesFor(providers, own));

    expect(storedCache()).toEqual(UNTAGGED);
  });

  /**
   * A wearer who never opened settings was on the picker's own default. Moving that face to Alpha
   * Vantage kept Finnhub's strip until tomorrow, since nothing saved said the provider had moved. A
   * second launch must keep what Alpha Vantage has fetched since.
   */
  test('empties the stock cache once when the list moves the default', () => {
    localStorage.setItem('stock-cache', JSON.stringify(UNTAGGED));
    const providers = faceProvidersFor(written({ stocks: ['alphavantage'] }), stockCache);
    const pages = pagesFor(providers, builderPage());

    providers.settle({}, pages);
    const first = storedCache();

    localStorage.setItem('stock-cache', JSON.stringify({ ...UNTAGGED, provider: 'alphavantage' }));
    providers.settle({}, pages);

    const result = storedCache();

    expect(first).toEqual({ lastAsOf: '', lastFetchMs: 0, strip: null, provider: 'alphavantage' });
    expect(result).toEqual({ ...UNTAGGED, provider: 'alphavantage' });
  });

  /** A rewritten stock provider must not inherit the old one's stamps, or its gate holds on the old close until tomorrow. */
  test('empties the stock cache when it rewrites the saved provider', () => {
    localStorage.setItem('stock-cache', JSON.stringify(UNTAGGED));
    const providers = faceProvidersFor(written({ stocks: ['yahoo'] }), stockCache);

    providers.settle({ STOCK_PROVIDER: 'Finnhub' }, pagesFor(providers, builderPage()));

    expect(storedCache()).toEqual({ lastAsOf: '', lastFetchMs: 0, strip: null, provider: 'yahoo' });
  });
});

describe('page', () => {
  /** A dropdown with one provider is no choice at all. */
  test('drops a picker with one option and its lead line, and keeps one with two', () => {
    const one = faceProvidersFor(written({ weather: ['openmeteo'] }));
    const two = faceProvidersFor(written({ weather: ['openmeteo', 'owm'] }));

    const dropped = one.page(one.narrow(builderPage()));
    const kept = two.page(two.narrow(builderPage()));

    expect(rowWithKey(dropped, 'WEATHER_PROVIDER')).toBeUndefined();
    expect(textsOf(dropped)).not.toContain(LEAD_LINE);
    expect(optionsOf(kept, 'WEATHER_PROVIDER')).toEqual(['openmeteo', 'owm']);
    expect(textsOf(kept)).toContain(LEAD_LINE);
  });

  /**
   * A face's key row shown for the keyed providers named a picker that is gone, and a condition on a
   * missing control hides its row for good, so a face on Finnhub alone lost its key row.
   */
  test('settles a condition on the dropped picker against the one value left', () => {
    const providers = faceProvidersFor(written({ stocks: ['finnhub'] }));
    const page = ownStockPage();

    (page[0].items as ClayConfigItem[]).push({ type: 'text', defaultValue: 'Yahoo needs no key.', visibleWhen: { key: 'STOCK_PROVIDER', in: ['yahoo'] } });

    const result = providers.page(providers.narrow(page));

    expect(rowWithKey(result, 'STOCK_API_KEY')?.visibleWhen).toBeUndefined();
    expect(rowsOf(result).find((item) => item.defaultValue === 'Yahoo needs no key.')?.visibleWhen).toEqual({ key: 'STOCK_PROVIDER', in: ['yahoo'] });
  });

  /** The builder's key rows show only for a keyed provider, so a face listing one keyed provider alone would lose the key box it has to fill in. */
  test('shows the builder\'s key rows for a face listing one keyed provider alone', () => {
    const providers = faceProvidersFor(written({ weather: ['owm'], stocks: ['finnhub'] }));

    const result = providers.page(providers.narrow(builderPage()));

    expect(rowWithKey(result, 'WEATHER_API_KEY')).toBeDefined();
    expect(rowWithKey(result, 'WEATHER_API_KEY')?.visibleWhen).toBeUndefined();
    expect(rowWithKey(result, 'STOCK_API_KEY')).toBeDefined();
    expect(rowWithKey(result, 'STOCK_API_KEY')?.visibleWhen).toBeUndefined();
  });

  /** A Weather card whose one other row was the picker would stand empty under its heading once the picker goes. */
  test('takes off the Weather card when the dropped picker and its lead line were all it held', () => {
    const providers = faceProvidersFor(written({ weather: ['openmeteo'] }));

    const result = cardsOf(providers.page(providers.narrow(noUnitPage())));

    expect(result).toEqual(['Location Settings']);
  });

  /** A plugin only kind with plugins off gets no note after its anchor, so taking the anchor off empties the Weather card. */
  test('takes off a card the anchor was left alone in', () => {
    const providers = faceProvidersFor(written({ weather: ['plugin'] }));

    const result = cardsOf(providers.page(providers.narrow(noUnitPage())));

    expect(result).toEqual([]);
  });

  /** The anchor shows as an empty row once the plugin source page has put its notes after it. */
  test('takes off the anchors the first pass left, and keeps a face\'s own marked row', () => {
    const providers = faceProvidersFor(written({ weather: ['plugin'], calendar: ['plugin'] }));
    const page = providers.narrow(builderPage());

    page.push({ type: 'text', defaultValue: 'Now playing comes from the Pebble app.', pluginSourceRows: 'music' });

    const result = rowsOf(providers.page(page)).filter((item) => item.pluginSourceRows !== undefined);

    expect(result).toEqual([{ type: 'text', defaultValue: 'Now playing comes from the Pebble app.', pluginSourceRows: 'music' }]);
  });
});
