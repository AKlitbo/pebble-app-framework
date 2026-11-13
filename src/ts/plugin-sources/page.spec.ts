/**
 * Specs for the plugin source settings page.
 *
 * The page is the only place a wearer picks the Pebble app plugin, and the only place they learn why
 * it shows nothing. What is worth pinning is where the calendar select lands, that a select with no
 * real choice is dropped, that dropping one never leaves its rows hidden for good, that the marked
 * rows hide only while a plugin is picked, and that two opens give the same page. The app's fold
 * hands the page hook a fresh copy of the face's own page on every open, and its specs pin that the
 * face's page never changes.
 *
 * Two rules reach past the builder's own page. A face's select with no mark, such as one a family
 * core builds, is found by its key. A face's own condition on a select dropped with one option left
 * is settled against that option rather than dropped, so a row the face hides for that value stays
 * hidden.
 *
 * A kind with no source choice gets its notes with no select to hang them on. Those have to show
 * whatever is saved, sit where the face marked or else at the foot, and say plugins are off from the
 * plugin list alone, since a page opened before the feature ran has no saved error to go by.
 */

import { describe, test, expect, vi } from 'vitest';
import { pluginKindState, pluginSourcePage, PLUGIN_KINDS_TYPE, PLUGIN_LABEL, PLUGINS_OFF_LABEL, PLUGINS_OFF_TEXT, PLUGIN_VALUE } from './page';
import type { PluginSourceInputs } from './page';
import { CALENDAR_STANDARD, WEATHER_STANDARD } from './standard';
import { escapeHtml } from './escape';
import type { PluginSummary, SourceState } from './types';
import buildConfig, { locationSection } from '../pkjs/config-builder';
import { faceProvidersFor } from '../face-providers/narrow';
import { select } from '../pkjs/config-rows';
import type { ClayConfigItem } from '../clay/types';

// the built-in weather plugin, trimmed to the readings the standard check reads
const WEATHER_PLUGIN: PluginSummary = {
  uuid: 'weather-uuid',
  name: 'Weather',
  sources: [{ category: 'weather', items: ['location'], properties: { temperature: ['numericValue'], condition_code: ['longText'] } }],
};

// a second weather plugin, such as MET Norway, serving the same readings
const SECOND_WEATHER_PLUGIN: PluginSummary = { ...WEATHER_PLUGIN, uuid: 'met-uuid', name: 'MET Norway' };

// a weather plugin with its own name for the temperature
const ODD_WEATHER_PLUGIN: PluginSummary = {
  uuid: 'odd-uuid',
  name: 'Odd Weather',
  sources: [{ category: 'weather', items: ['location'], properties: { temp: ['numericValue'], condition_code: ['longText'] } }],
};

// the built-in calendar plugin, trimmed to the readings the standard check reads
const CALENDAR_PLUGIN: PluginSummary = {
  uuid: 'calendar-uuid',
  name: 'Calendar',
  sources: [{ category: 'calendar', items: ['event'], properties: { name: ['shortText', 'longText'], starts_at: ['timestamp'], ends_at: ['timestamp'] } }],
};

const KEYS = { WEATHER_PROVIDER: 10, CALENDAR_SOURCE: 11, CALENDAR_ICS_URL: 12 };

const NOTHING_SAVED: SourceState = { pluginUuid: null, lastError: null, lastEmpty: false };

// the calendar select the calendar feature adds, with iCal as its one choice
const CALENDAR_SELECT: ClayConfigItem = {
  type: 'select',
  messageKey: 'CALENDAR_SOURCE',
  label: 'Calendar Source',
  defaultValue: 'ical',
  options: [{ label: 'iCal Link', value: 'ical' }],
  pluginSource: { category: 'calendar', item: 'event' },
};

/** What the weather page hook would hand the page, with a plugin on the phone and nothing saved yet. */
function weatherInputs(overrides: Partial<PluginSourceInputs> = {}): PluginSourceInputs {
  return {
    selectKey: 'WEATHER_PROVIDER',
    category: 'weather',
    item: 'location',
    plugins: [WEATHER_PLUGIN],
    messageKeys: KEYS,
    state: NOTHING_SAVED,
    standard: WEATHER_STANDARD,
    texts: {
      notStandard: (name) => `${name} sends weather this face cannot read.`,
      permissionDenied: 'Allow Location for this face in the Pebble app.',
    },
    ...overrides,
  };
}

/** What the calendar page hook would hand the page, with a plugin on the phone and nothing saved yet. */
function calendarInputs(overrides: Partial<PluginSourceInputs> = {}): PluginSourceInputs {
  return {
    selectKey: 'CALENDAR_SOURCE',
    category: 'calendar',
    item: 'event',
    plugins: [CALENDAR_PLUGIN],
    messageKeys: KEYS,
    state: NOTHING_SAVED,
    standard: CALENDAR_STANDARD,
    texts: {
      notStandard: (name) => `${name} sends events this face cannot read.`,
      permissionDenied: 'Allow the calendar for this face in the Pebble app.',
      empty: 'If events are missing, the Pebble app may need to read your calendars.',
    },
    insert: { select: CALENDAR_SELECT, anchorKey: 'CALENDAR_ICS_URL' },
    ...overrides,
  };
}

/** Every row on the page, sections and their rows included. */
function allRows(page: ClayConfigItem[]): ClayConfigItem[] {
  return page.flatMap((item) => [item, ...allRows(item.items || [])]);
}

/** The page without the plugin kinds store every kind's page hook puts first, so a spec reads the face's own rows. */
function faceRows(page: ClayConfigItem[]): ClayConfigItem[] {
  return page.filter((item) => item.type !== PLUGIN_KINDS_TYPE);
}

/** The row saving under a message key, at any depth. */
function rowByKey(page: ClayConfigItem[], messageKey: string): ClayConfigItem | undefined {
  return allRows(page).find((item) => item.messageKey === messageKey);
}

/** The rows of the section holding a message key. */
function sectionItems(page: ClayConfigItem[], messageKey: string): ClayConfigItem[] {
  return page.find((item) => (item.items || []).some((row) => row.messageKey === messageKey))?.items || [];
}

/** The page with a face's own visibleWhen on one row, as a face laying out its own section would write it. */
function withVisibleWhen(page: ClayConfigItem[], messageKey: string, visibleWhen: ClayConfigItem['visibleWhen']): ClayConfigItem[] {
  (rowByKey(page, messageKey) as ClayConfigItem).visibleWhen = visibleWhen;

  return page;
}

/** The rows of the section holding a message key, each named by its key or else its type. */
function sectionOf(page: ClayConfigItem[], messageKey: string): string[] {
  const section = page.find((item) => (item.items || []).some((row) => row.messageKey === messageKey));

  return (section?.items || []).map((row) => row.messageKey ?? row.type);
}

/** The rows shown only while a plugin is picked, which is every warning row and nothing else. */
function warningsOn(page: ClayConfigItem[]): ClayConfigItem[] {
  return allRows(page).filter((row) => row.type === 'pluginNote' && !Array.isArray(row.visibleWhen) && row.visibleWhen !== undefined && 'in' in row.visibleWhen && row.visibleWhen.in.includes(PLUGIN_VALUE));
}

// a weather face's page, with the provider select and the location rows the builder marks
const weatherPage = () => buildConfig({ location: {}, weather: {}, temperature: {} });

// a calendar face's page, with the builder's calendar section
const calendarPage = () => buildConfig({ calendar: {} });

// the builder's weather lead line, which stays above the select while a plugin is picked
const LEAD_LINE = 'Choose where your watch pulls its weather data. Open-Meteo works right out of the box with no setup required.';

// the providers the builder's select offers
const ALL_PROVIDERS = [
  { label: 'Open-Meteo (Free, No Key Required)', value: 'openmeteo' },
  { label: 'OpenWeatherMap', value: 'owm' },
  { label: 'WeatherAPI.com', value: 'weatherapi' },
];

// the key row a face writes for its keyed providers, shown only while one of them is picked
const KEY_ROW: ClayConfigItem = { type: 'input', messageKey: 'WEATHER_API_KEY', label: 'API Key', visibleWhen: { key: 'WEATHER_PROVIDER', in: ['owm', 'weatherapi'] } };

/**
 * A page laid out the way a family core builds its weather section, with the select made by
 * config-rows and no mark on it, beside the builder's location rows.
 */
function corePage(options = ALL_PROVIDERS, keyRow: ClayConfigItem = KEY_ROW): ClayConfigItem[] {
  return [
    locationSection({ location: {} }) as ClayConfigItem,
    {
      type: 'section',
      items: [
        { type: 'heading', defaultValue: 'Weather Preferences' },
        select('WEATHER_PROVIDER', 'Data Source', options, String(options[0].value)),
        { ...keyRow },
      ],
    },
  ];
}

describe('pluginSourcePage inserting the calendar select', () => {
  /** The lead line hides with the link, so a select below it would sit under a row that vanished. */
  test('puts the select under the heading of the builder\'s calendar section, above the marked lead line', () => {
    const result = pluginSourcePage(calendarPage(), calendarInputs());

    expect(sectionOf(result, 'CALENDAR_ICS_URL')).toEqual(['heading', 'CALENDAR_SOURCE', 'text', 'CALENDAR_ICS_URL']);
  });

  /** A face's own section keeps its unmarked lead line on top, since that line still applies to a plugin. */
  test('puts the select below a face\'s own unmarked lead line', () => {
    const page: ClayConfigItem[] = [{
      type: 'section',
      items: [
        { type: 'heading', defaultValue: 'Calendar' },
        { type: 'text', defaultValue: 'Add a Calendar panel to your layout.' },
        { type: 'text', defaultValue: 'Paste your private iCal link below.', pluginSourceHides: 'CALENDAR_SOURCE' },
        { type: 'input', messageKey: 'CALENDAR_ICS_URL', pluginSourceHides: 'CALENDAR_SOURCE' },
        { type: 'select', messageKey: 'CALENDAR_REFRESH', pluginSourceHides: 'CALENDAR_SOURCE', options: [{ label: '15 min', value: 15 }] },
      ],
    }];

    const result = pluginSourcePage(page, calendarInputs());

    expect(sectionOf(result, 'CALENDAR_ICS_URL')).toEqual(['heading', 'text', 'CALENDAR_SOURCE', 'text', 'CALENDAR_ICS_URL', 'CALENDAR_REFRESH']);
  });

  /** A face that placed the select itself would otherwise show two, and Clay would save one over the other. */
  test('adds no second select when the page already has one', () => {
    const page = [{ ...CALENDAR_SELECT }, ...pluginSourcePage(calendarPage(), calendarInputs({ plugins: [] }))];

    const result = pluginSourcePage(page, calendarInputs());

    expect(allRows(result).filter((row) => row.messageKey === 'CALENDAR_SOURCE')).toHaveLength(1);
  });
});

describe('pluginSourcePage the plugin choice', () => {
  /** The phone routes to the wearer's preferred plugin, so a second plugin must not add a second entry. */
  test('adds the Preferred Source option once however many plugins serve the item', () => {
    const result = pluginSourcePage(weatherPage(), weatherInputs({ plugins: [WEATHER_PLUGIN, SECOND_WEATHER_PLUGIN] }));

    expect(rowByKey(result, 'WEATHER_PROVIDER')?.options).toEqual([
      { label: 'Open-Meteo (Free, No Key Required)', value: 'openmeteo' },
      { label: 'OpenWeatherMap', value: 'owm' },
      { label: 'WeatherAPI.com', value: 'weatherapi' },
      { label: PLUGIN_LABEL, value: PLUGIN_VALUE },
    ]);
  });

  /** A plugin serving another weather item would answer nothing the face subscribes to. */
  test('adds nothing when the only plugin serves another item in the same category', () => {
    const forecastOnly: PluginSummary = { uuid: 'forecast-uuid', name: 'Forecast', sources: [{ category: 'weather', items: ['forecast'] }] };

    const result = pluginSourcePage(weatherPage(), weatherInputs({ plugins: [forecastOnly] }));

    expect(rowByKey(result, 'WEATHER_PROVIDER')?.options?.map((option) => option.value)).toEqual(['openmeteo', 'owm', 'weatherapi']);
  });

  /** Clay looks each saved name up in the face's keys, and one it cannot map puts the whole save to the watch at risk. */
  test('drops a select whose key the face does not declare, warns, and leaves its rows showing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = pluginSourcePage(calendarPage(), calendarInputs({ messageKeys: { CALENDAR_ICS_URL: 12 } }));

    expect(rowByKey(result, 'CALENDAR_SOURCE')).toBeUndefined();
    expect(rowByKey(result, 'CALENDAR_ICS_URL')?.visibleWhen).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('CALENDAR_SOURCE'));
    warn.mockRestore();
  });

  /**
   * With plugins off the calendar select would hold "iCal Link" alone. Dropping it without its
   * conditions would hide the link for good, since a condition on a missing control reads as false.
   */
  test('drops a select left with one option and keeps the rows marked for it showing', () => {
    const result = pluginSourcePage(calendarPage(), calendarInputs({ plugins: [] }));

    expect(rowByKey(result, 'CALENDAR_SOURCE')).toBeUndefined();
    expect(allRows(result).filter((row) => row.visibleWhen !== undefined || row.pluginSourceHides !== undefined)).toEqual([]);
  });

  /**
   * A wearer who saved the plugin before plugins went off would find the location rows hidden under
   * a blank select. Only the key row keeps a condition, the builder's own, which hides it for a
   * keyless provider.
   */
  test('leaves the weather rows showing when no plugin serves the item', () => {
    const result = pluginSourcePage(weatherPage(), weatherInputs({ plugins: [] }));

    const marked = allRows(result).filter((row) => row.visibleWhen !== undefined || row.pluginSourceHides !== undefined);

    expect(rowByKey(result, 'WEATHER_PROVIDER')?.options).toHaveLength(3);
    expect(marked.map((row) => [row.messageKey, row.visibleWhen, row.pluginSourceHides])).toEqual([['WEATHER_API_KEY', { key: 'WEATHER_PROVIDER', notIn: ['openmeteo'] }, undefined]]);
  });

  /** The select is still there to read, so a face's own condition on it, such as a key row for keyed providers only, has to keep working. */
  test('keeps a face\'s own condition on the select when no plugin serves the item', () => {
    const page = withVisibleWhen(weatherPage(), 'WEATHER_API_KEY', { key: 'WEATHER_PROVIDER', in: ['owm', 'weatherapi'] });

    const result = pluginSourcePage(page, weatherInputs({ plugins: [] }));

    expect(rowByKey(result, 'WEATHER_API_KEY')?.visibleWhen).toEqual({ key: 'WEATHER_PROVIDER', in: ['owm', 'weatherapi'] });
    expect(rowByKey(result, 'WEATHER_API_KEY')?.pluginSourceHides).toBeUndefined();
  });
});

describe('pluginSourcePage the marked rows', () => {
  /** The heading needs it as well as its rows, or plugin mode leaves "Location Settings" standing over nothing. */
  test('hides every marked weather row while the plugin is picked', () => {
    const result = pluginSourcePage(weatherPage(), weatherInputs());

    const hidden = allRows(result).filter((row) => row.visibleWhen !== undefined);

    const pluginOff = { key: 'WEATHER_PROVIDER', in: ['openmeteo', 'owm', 'weatherapi'] };

    expect(hidden.map((row) => row.messageKey ?? row.defaultValue)).toEqual(['Location Settings', 'LOCATION_USE_GPS', 'LOCATION_GPS_FALLBACK', 'LOCATION_NAME', 'WEATHER_API_KEY']);
    // the key row keeps the builder's own condition for the keyed providers, and both have to hold
    expect(hidden.map((row) => row.visibleWhen)).toEqual([...Array(4).fill([pluginOff]), [{ key: 'WEATHER_PROVIDER', notIn: ['openmeteo'] }, pluginOff]]);
  });

  /** Clay cannot hide a section, so with every row in it hidden the Location Settings card would sit empty. */
  test('marks a section whose rows all hide to hide when empty, and no other', () => {
    const result = pluginSourcePage(weatherPage(), weatherInputs());

    const marked = result.filter((item) => item.hideWhenEmpty);

    expect(marked.map((section) => section.items?.[0]?.defaultValue)).toEqual(['Location Settings']);
  });

  /** With no plugin on offer nothing hides, so a marked card would make the page differ from a face's without plugin sources. */
  test('marks no section when no plugin serves the item', () => {
    const result = pluginSourcePage(weatherPage(), weatherInputs({ plugins: [] }));

    expect(result.filter((item) => item.hideWhenEmpty)).toEqual([]);
  });

  /** locationSection marks its rows without knowing, so a face with no provider select would lose its location rows. */
  test('leaves location rows marked for a provider select the page does not have showing', () => {
    const result = pluginSourcePage(buildConfig({ location: {} }), weatherInputs());

    expect(allRows(result).filter((row) => row.visibleWhen !== undefined || row.pluginSourceHides !== undefined)).toEqual([]);
  });

  /** Every condition in the list has to hold, so replacing a row's own would show it when the face hides it. */
  test('keeps a marked row\'s own visibleWhen and adds the plugin condition to it', () => {
    const page = withVisibleWhen(weatherPage(), 'WEATHER_API_KEY', { key: 'WEATHER_ADVANCED', in: [true] });

    const result = pluginSourcePage(page, weatherInputs());

    expect(rowByKey(result, 'WEATHER_API_KEY')?.visibleWhen).toEqual([
      { key: 'WEATHER_ADVANCED', in: [true] },
      { key: 'WEATHER_PROVIDER', in: ['openmeteo', 'owm', 'weatherapi'] },
    ]);
  });

  /** A face's own condition on a missing select would read as false and hide its row for good. */
  test('takes a condition on a missing select off a row and keeps its others', () => {
    const page = withVisibleWhen(calendarPage(), 'CALENDAR_ICS_URL', [{ key: 'CALENDAR_SOURCE', in: ['ical'] }, { key: 'CALENDAR_ON', in: [true] }]);

    const result = pluginSourcePage(page, calendarInputs({ plugins: [] }));

    expect(rowByKey(result, 'CALENDAR_ICS_URL')?.visibleWhen).toEqual([{ key: 'CALENDAR_ON', in: [true] }]);
  });

  /** The weather page runs before the calendar select is on the page, and must not strip the calendar's marks first. */
  test('leaves another select\'s marks for that select\'s own page', () => {
    const page = buildConfig({ weather: {}, calendar: {} });

    const result = pluginSourcePage(pluginSourcePage(page, weatherInputs()), calendarInputs());

    expect(rowByKey(result, 'CALENDAR_ICS_URL')?.visibleWhen).toEqual([{ key: 'CALENDAR_SOURCE', in: ['ical'] }]);
  });
});

describe('pluginSourcePage finding the select by its key', () => {
  /** A face whose weather section comes from a family core would never be offered the Pebble app. */
  test('gives an unmarked select with the key the Preferred Source option and hides the marked rows under it', () => {
    const result = pluginSourcePage(corePage(), weatherInputs());

    expect(rowByKey(result, 'WEATHER_PROVIDER')?.options?.map((option) => option.value)).toEqual(['openmeteo', 'owm', 'weatherapi', PLUGIN_VALUE]);
    expect(rowByKey(result, 'LOCATION_NAME')?.visibleWhen).toEqual([{ key: 'WEATHER_PROVIDER', in: ['openmeteo', 'owm', 'weatherapi'] }]);
  });

  /** A face that marks its own select chose that one, and the plugin choice joining another row would save under the wrong control. */
  test('takes a marked select over an unmarked one with the same key', () => {
    const marked = { ...select('WEATHER_PROVIDER', 'Data Source', [{ label: 'Open-Meteo', value: 'openmeteo' }], 'openmeteo'), pluginSource: { category: 'weather', item: 'location' } };
    const page: ClayConfigItem[] = [
      { type: 'section', items: [select('WEATHER_PROVIDER', 'Old Source', [{ label: 'OpenWeatherMap', value: 'owm' }, { label: 'WeatherAPI.com', value: 'weatherapi' }], 'owm')] },
      { type: 'section', items: [marked] },
    ];

    const result = faceRows(pluginSourcePage(page, weatherInputs()));

    expect(result.map((section) => section.items?.[0]?.options?.map((option) => option.value))).toEqual([['owm', 'weatherapi'], ['openmeteo', PLUGIN_VALUE]]);
  });

  /** A text box saving under the key has no choices to add to, and a plugin option on it would never draw. */
  test('leaves a row with the key and no options alone', () => {
    const page: ClayConfigItem[] = [{ type: 'section', items: [{ type: 'input', messageKey: 'WEATHER_PROVIDER', label: 'Source' }] }];

    const result = pluginSourcePage(page, weatherInputs());

    expect(rowByKey(result, 'WEATHER_PROVIDER')).toEqual({ type: 'input', messageKey: 'WEATHER_PROVIDER', label: 'Source' });
  });
});

describe('pluginSourcePage settling conditions on a dropped select', () => {
  /** The one value left is what every save carries, so a key row shown for it has to keep showing once its select is gone. */
  test('takes off a face\'s condition that holds for the one option left', () => {
    const page = corePage([{ label: 'OpenWeatherMap', value: 'owm' }]);

    const result = pluginSourcePage(page, weatherInputs({ plugins: [] }));

    expect(rowByKey(result, 'WEATHER_PROVIDER')).toBeUndefined();
    expect(rowByKey(result, 'WEATHER_API_KEY')?.visibleWhen).toBeUndefined();
  });

  /** A keyless provider needs no key row, and showing it once the select is gone would ask for a key nothing reads. */
  test('keeps a face\'s condition that fails for the one option left, so its row stays hidden', () => {
    const page = corePage([{ label: 'Open-Meteo (Free, No Key Required)', value: 'openmeteo' }]);

    const result = pluginSourcePage(page, weatherInputs({ plugins: [] }));

    expect(rowByKey(result, 'WEATHER_API_KEY')?.visibleWhen).toEqual({ key: 'WEATHER_PROVIDER', in: ['owm', 'weatherapi'] });
  });

  /** A select the face declares no key for saves nothing, so no value is left to settle against and every condition on it has to come off. */
  test('takes off every condition on a select dropped for want of its key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = pluginSourcePage(corePage(), weatherInputs({ messageKeys: { CALENDAR_SOURCE: 11 } }));

    expect(rowByKey(result, 'WEATHER_API_KEY')?.visibleWhen).toBeUndefined();
    warn.mockRestore();
  });

  /**
   * The feature fetches with the saved provider ahead of the one option left, so a wearer with
   * Open-Meteo saved must not be shown a key row for OpenWeatherMap.
   */
  test('settles against the saved value rather than the one option left', () => {
    const page = corePage([{ label: 'OpenWeatherMap', value: 'owm' }]);

    const result = pluginSourcePage(page, weatherInputs({ plugins: [], saved: 'openmeteo' }));

    expect(rowByKey(result, 'WEATHER_PROVIDER')).toBeUndefined();
    expect(rowByKey(result, 'WEATHER_API_KEY')?.visibleWhen).toEqual({ key: 'WEATHER_PROVIDER', in: ['owm', 'weatherapi'] });
  });

  /** A select the face declares no key for is gone, and its lead line would ask for a choice of source over nothing. */
  test('takes the lead line off with a select dropped for want of its key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = pluginSourcePage(weatherPage(), weatherInputs({ messageKeys: { CALENDAR_SOURCE: 11 } }));

    expect(allRows(result).some((row) => row.defaultValue === LEAD_LINE)).toBe(false);
    warn.mockRestore();
  });

  /** A select dropped to its one option leaves no choice, so a line asking the wearer to choose has nothing under it. */
  test('takes the lead line off with a select dropped to its one option', () => {
    const page: ClayConfigItem[] = [{
      type: 'section',
      items: [
        { type: 'heading', defaultValue: 'Weather' },
        { type: 'text', defaultValue: LEAD_LINE, pluginSourceLead: 'WEATHER_PROVIDER' },
        select('WEATHER_PROVIDER', 'Data Source', [{ label: 'OpenWeatherMap', value: 'owm' }], 'owm'),
        select('WEATHER_TEMPERATURE_UNIT', 'Temperature Unit', [{ label: 'Celsius', value: 0 }, { label: 'Fahrenheit', value: 1 }], 0),
      ],
    }];

    const result = faceRows(pluginSourcePage(page, weatherInputs({ plugins: [] })));

    expect(result[0].items?.map((row) => row.messageKey ?? row.defaultValue)).toEqual(['Weather', 'WEATHER_TEMPERATURE_UNIT']);
  });

  /**
   * A face listing the plugin and Open-Meteo, with no temperature unit, on a phone where nothing
   * serves the weather. The select drops to Open-Meteo alone and takes its lead line with it, so a
   * Weather card left standing would hold its heading and nothing else.
   */
  test('takes off a section the dropped select and its lead line leave holding only its heading', () => {
    const providers = faceProvidersFor({ weather: { offered: ['plugin', 'openmeteo'], needsKey: false } });
    const page = providers.narrow(buildConfig({ location: {}, weather: {} }));

    const result = pluginSourcePage(page, weatherInputs({ plugins: [] }));

    expect(result.filter((item) => item.type === 'section' && (item.items || []).every((row) => row.type === 'heading'))).toEqual([]);
    expect(allRows(result).some((row) => row.type === 'heading' && row.defaultValue === 'Weather')).toBe(false);
  });

  /** A condition on another control has nothing to do with the dropped select and has to keep hiding its row. */
  test('keeps a face\'s condition on another control beside one it settles', () => {
    const keyRow = { ...KEY_ROW, visibleWhen: [{ key: 'WEATHER_PROVIDER', in: ['owm'] }, { key: 'WEATHER_ADVANCED', in: [true] }] };

    const result = pluginSourcePage(corePage([{ label: 'OpenWeatherMap', value: 'owm' }], keyRow), weatherInputs({ plugins: [] }));

    expect(rowByKey(result, 'WEATHER_API_KEY')?.visibleWhen).toEqual([{ key: 'WEATHER_ADVANCED', in: [true] }]);
  });
});

describe('pluginSourcePage a saved plugin choice with plugins off', () => {
  /** A save from a page with no option carrying plugin stores it empty, and the face drops to a fetch the wearer never chose. */
  test('keeps the option, labelled as plugins off, so a save keeps the plugin', () => {
    const result = pluginSourcePage(weatherPage(), weatherInputs({ plugins: [], saved: PLUGIN_VALUE }));

    expect(rowByKey(result, 'WEATHER_PROVIDER')?.options?.slice(-1)).toEqual([{ label: PLUGINS_OFF_LABEL, value: PLUGIN_VALUE }]);
  });

  /** The wearer saved the plugin, so the location and key rows mean as little now as they did when it was picked. */
  test('hides the marked rows while the plugin is picked, as it does with plugins on', () => {
    const result = pluginSourcePage(weatherPage(), weatherInputs({ plugins: [], saved: PLUGIN_VALUE }));

    expect(rowByKey(result, 'LOCATION_NAME')?.visibleWhen).toEqual([{ key: 'WEATHER_PROVIDER', in: ['openmeteo', 'owm', 'weatherapi'] }]);
  });

  /** The watch only shows No Plugin, so this row is the one place the wearer learns plugins have to be on. */
  test('puts the turn plugins on row under the select in place of the other warnings', () => {
    const state = { ...NOTHING_SAVED, lastError: 'PERMISSION_DENIED' };

    const result = pluginSourcePage(weatherPage(), weatherInputs({ plugins: [], saved: PLUGIN_VALUE, state }));

    expect(warningsOn(result)).toEqual([{ type: 'pluginNote', tone: 'warning', defaultValue: PLUGINS_OFF_TEXT, visibleWhen: { key: 'WEATHER_PROVIDER', in: [PLUGIN_VALUE] } }]);
    expect(sectionOf(result, 'WEATHER_PROVIDER')).toEqual(['heading', 'text', 'WEATHER_PROVIDER', 'pluginNote', 'WEATHER_API_KEY', 'WEATHER_TEMPERATURE_UNIT']);
  });

  /** A calendar select dropped to its one iCal option would save iCal, and the next round with no link would clear the agenda. */
  test('keeps the calendar select that would otherwise drop to its one option', () => {
    const result = pluginSourcePage(calendarPage(), calendarInputs({ plugins: [], saved: PLUGIN_VALUE }));

    expect(rowByKey(result, 'CALENDAR_SOURCE')?.options?.map((option) => option.value)).toEqual(['ical', PLUGIN_VALUE]);
  });

  /** The plugins off label would tell a wearer whose plugin can answer something untrue. */
  test('labels the option plainly when a plugin serves the item', () => {
    const result = pluginSourcePage(weatherPage(), weatherInputs({ saved: PLUGIN_VALUE }));

    expect(rowByKey(result, 'WEATHER_PROVIDER')?.options?.slice(-1)).toEqual([{ label: PLUGIN_LABEL, value: PLUGIN_VALUE }]);
  });

  /** Any other saved source with plugins off gets the page a face without plugin sources shows, and an option nobody can use would only confuse it. */
  test('adds nothing for another saved source with plugins off', () => {
    const result = pluginSourcePage(weatherPage(), weatherInputs({ plugins: [], saved: 'owm' }));

    expect(rowByKey(result, 'WEATHER_PROVIDER')?.options?.map((option) => option.value)).toEqual(['openmeteo', 'owm', 'weatherapi']);
  });
});

describe('pluginSourcePage moving the rows the select hides', () => {
  // the note the weather page hook puts under its select
  const SOURCE_NOTE = 'The weather comes from the first place in the Pebble app.';

  /** Where on the page the section holding a key sits, counting the page's own top rows. */
  function placeOf(page: ClayConfigItem[], messageKey: string): number {
    return page.findIndex((item) => allRows([item]).some((row) => row.messageKey === messageKey));
  }

  /** Rows hiding above the select make the page jump under the wearer's finger as they pick the plugin. */
  test('moves the location section to sit straight after the weather section while a plugin is on offer', () => {
    const before = weatherPage();

    const result = pluginSourcePage(weatherPage(), weatherInputs({ movesBelow: 'LOCATION_USE_GPS' }));

    expect(placeOf(before, 'LOCATION_USE_GPS')).toBeLessThan(placeOf(before, 'WEATHER_PROVIDER'));
    expect(placeOf(result, 'LOCATION_USE_GPS')).toBe(placeOf(result, 'WEATHER_PROVIDER') + 1);
  });

  /** A saved plugin kept with plugins off hides the same rows when it is picked, so it needs the same order. */
  test('moves it for a plugin choice kept with plugins off', () => {
    const result = pluginSourcePage(weatherPage(), weatherInputs({ plugins: [], saved: PLUGIN_VALUE, movesBelow: 'LOCATION_USE_GPS' }));

    expect(placeOf(result, 'LOCATION_USE_GPS')).toBe(placeOf(result, 'WEATHER_PROVIDER') + 1);
  });

  /** With no plugin choice nothing hides, so a page that moved anyway would differ from a face's without plugin sources for no reason. */
  test('leaves the order alone when no plugin choice is on offer', () => {
    const result = faceRows(pluginSourcePage(weatherPage(), weatherInputs({ plugins: [], movesBelow: 'LOCATION_USE_GPS' })));

    expect(result.map((item) => item.type)).toEqual(weatherPage().map((item) => item.type));
    expect(placeOf(result, 'LOCATION_USE_GPS')).toBeLessThan(placeOf(result, 'WEATHER_PROVIDER'));
  });

  /** A face's alternate time zone in the same section has nothing to do with weather, and moving it would carry it away from where the face put it. */
  test('leaves a section holding a row with no mark where it is', () => {
    const page = weatherPage();
    const location = page.find((item) => allRows([item]).some((row) => row.messageKey === 'LOCATION_USE_GPS')) as ClayConfigItem;

    location.items = [...(location.items || []), { type: 'locationsearch', messageKey: 'CLOCK_TIMEZONE_1', label: 'Second Clock', timeZone: true }];

    const result = pluginSourcePage(page, weatherInputs({ movesBelow: 'LOCATION_USE_GPS' }));

    expect(placeOf(result, 'LOCATION_USE_GPS')).toBeLessThan(placeOf(result, 'WEATHER_PROVIDER'));
  });

  /** The location rows vanish while the plugin is picked, so this row is what tells the wearer where the place now comes from, in the calmer look a fact takes. */
  test('puts the note on where the data comes from under the select, ahead of the warnings', () => {
    const state = { ...NOTHING_SAVED, lastError: 'PERMISSION_DENIED' };
    const texts = { ...weatherInputs().texts, source: SOURCE_NOTE };

    const result = pluginSourcePage(weatherPage(), weatherInputs({ state, texts }));

    expect(warningsOn(result).map((row) => [row.tone, row.defaultValue])).toEqual([['info', SOURCE_NOTE], ['warning', 'Allow Location for this face in the Pebble app.']]);
    expect(sectionOf(result, 'WEATHER_PROVIDER')).toEqual(['heading', 'text', 'WEATHER_PROVIDER', 'pluginNote', 'pluginNote', 'WEATHER_API_KEY', 'WEATHER_TEMPERATURE_UNIT']);
  });

  /** With no plugin choice the location rows never hide, so a note about the Pebble app's places would be untrue. */
  test('adds no note when no plugin choice is on offer', () => {
    const texts = { ...weatherInputs().texts, source: SOURCE_NOTE };

    const result = pluginSourcePage(weatherPage(), weatherInputs({ plugins: [], texts }));

    expect(allRows(result).some((row) => row.defaultValue === SOURCE_NOTE)).toBe(false);
  });
});

describe('pluginSourcePage the select first in its section', () => {
  /** The control that shows and hides rows has to come before them, or picking it makes rows vanish above it and the page jumps. */
  test('puts the select after its heading and lead line, with the rows it hides under it and the other rows after those', () => {
    const result = pluginSourcePage(weatherPage(), weatherInputs());

    expect(sectionOf(result, 'WEATHER_PROVIDER')).toEqual(['heading', 'text', 'WEATHER_PROVIDER', 'WEATHER_API_KEY', 'WEATHER_TEMPERATURE_UNIT']);
    expect(rowByKey(result, 'WEATHER_PROVIDER') === sectionItems(result, 'WEATHER_PROVIDER')[2]).toBe(true);
    expect(sectionItems(result, 'WEATHER_PROVIDER')[1].defaultValue).toBe(LEAD_LINE);
  });

  /** The lead line sits right above the select, and hiding it would move the select under the wearer's finger. */
  test('keeps the lead line showing while the plugin is picked', () => {
    const result = pluginSourcePage(weatherPage(), weatherInputs());

    const lead = allRows(result).find((row) => row.defaultValue === LEAD_LINE);

    expect(lead?.visibleWhen).toBeUndefined();
  });

  /** With no plugin choice nothing hides, so a section in a new order would make the page differ from a face's without plugin sources. */
  test('leaves the section as the face laid it out when no plugin choice is on offer', () => {
    const result = pluginSourcePage(weatherPage(), weatherInputs({ plugins: [] }));

    expect(sectionOf(result, 'WEATHER_PROVIDER')).toEqual(['heading', 'WEATHER_TEMPERATURE_UNIT', 'text', 'WEATHER_PROVIDER', 'WEATHER_API_KEY']);
  });

  /**
   * A family core puts its unit selects above the Data Source and its key row, with no mark, under
   * it. The key row is for the select, so it has to stay next to it rather than drop below the units.
   */
  test('keeps an unmarked row that sat under the select next to it, ahead of the rows from above', () => {
    const page: ClayConfigItem[] = [{
      type: 'section',
      items: [
        { type: 'heading', defaultValue: 'Weather Preferences' },
        select('WEATHER_TEMPERATURE_UNIT', 'Temperature Unit', [{ label: 'Celsius', value: 0 }], 0),
        select('WEATHER_PROVIDER', 'Data Source', ALL_PROVIDERS, 'openmeteo'),
        { type: 'input', messageKey: 'WEATHER_API_KEY', label: 'API Key' },
      ],
    }];

    const result = pluginSourcePage(page, weatherInputs());

    expect(sectionOf(result, 'WEATHER_PROVIDER')).toEqual(['heading', 'WEATHER_PROVIDER', 'WEATHER_API_KEY', 'WEATHER_TEMPERATURE_UNIT']);
  });

  /** A row the face shows only for some of the select's values is about the select, wherever the face put it. */
  test('brings a row whose visibleWhen names the select up under it', () => {
    const page: ClayConfigItem[] = [{
      type: 'section',
      items: [
        { type: 'heading', defaultValue: 'Weather Preferences' },
        { ...KEY_ROW },
        select('WEATHER_TEMPERATURE_UNIT', 'Temperature Unit', [{ label: 'Celsius', value: 0 }], 0),
        select('WEATHER_PROVIDER', 'Data Source', ALL_PROVIDERS, 'openmeteo'),
      ],
    }];

    const result = pluginSourcePage(page, weatherInputs());

    expect(sectionOf(result, 'WEATHER_PROVIDER')).toEqual(['heading', 'WEATHER_PROVIDER', 'WEATHER_API_KEY', 'WEATHER_TEMPERATURE_UNIT']);
  });

  /** A family core's select carries its lead line as its description, so only the heading stays above it. */
  test('puts an unmarked core select straight under its heading', () => {
    const result = pluginSourcePage(corePage(), weatherInputs());

    expect(sectionOf(result, 'WEATHER_PROVIDER')).toEqual(['heading', 'WEATHER_PROVIDER', 'WEATHER_API_KEY']);
  });
});

describe('pluginSourcePage a plugin list the phone will not give', () => {
  /** An unreadable list says nothing about what is installed, and labelling a working plugin as switched off would send the wearer to fix nothing. */
  test('offers the plugin as usual, with no plugins off note, for a saved plugin', () => {
    const result = pluginSourcePage(weatherPage(), weatherInputs({ plugins: null, saved: PLUGIN_VALUE }));

    expect(rowByKey(result, 'WEATHER_PROVIDER')?.options?.slice(-1)).toEqual([{ label: PLUGIN_LABEL, value: PLUGIN_VALUE }]);
    expect(warningsOn(result).map((row) => row.defaultValue)).not.toContain(PLUGINS_OFF_TEXT);
  });

  /** The phone may still route to a plugin it would not list, so the choice has to be there to pick. */
  test('offers the plugin with nothing saved', () => {
    const result = pluginSourcePage(weatherPage(), weatherInputs({ plugins: null }));

    expect(rowByKey(result, 'WEATHER_PROVIDER')?.options?.map((option) => option.value)).toEqual(['openmeteo', 'owm', 'weatherapi', PLUGIN_VALUE]);
  });
});

describe('pluginSourcePage the warning rows', () => {
  /** The phone only holds a plugin to its own manifest, so this row is the wearer's one clue the face sits on dashes. */
  test('warns about a last-answering plugin that does not declare the standard readings', () => {
    const state = { ...NOTHING_SAVED, pluginUuid: 'odd-uuid' };

    const result = pluginSourcePage(weatherPage(), weatherInputs({ plugins: [WEATHER_PLUGIN, ODD_WEATHER_PLUGIN], state }));

    expect(sectionOf(result, 'WEATHER_PROVIDER')).toEqual(['heading', 'text', 'WEATHER_PROVIDER', 'pluginNote', 'WEATHER_API_KEY', 'WEATHER_TEMPERATURE_UNIT']);
    expect(allRows(result).find((row) => row.defaultValue === 'Odd Weather sends weather this face cannot read.')?.visibleWhen).toEqual({ key: 'WEATHER_PROVIDER', in: [PLUGIN_VALUE] });
  });

  /** The phone's update and its plugin list can write one uuid in different cases, and the warning must not drop then. */
  test('warns about the plugin that answered whatever case its uuid is in', () => {
    const state = { ...NOTHING_SAVED, pluginUuid: 'ODD-UUID' };

    const result = pluginSourcePage(weatherPage(), weatherInputs({ plugins: [WEATHER_PLUGIN, ODD_WEATHER_PLUGIN], state }));

    expect(warningsOn(result).map((row) => row.defaultValue)).toEqual(['Odd Weather sends weather this face cannot read.']);
  });

  /** Clay draws a text row as HTML and the name comes from whoever wrote the plugin, so an unescaped one runs its script in the settings page. */
  test('escapes the plugin\'s name before it reaches the row', () => {
    const hostile: PluginSummary = { ...ODD_WEATHER_PLUGIN, name: '<img src=x onerror=alert(1)>' };
    const state = { ...NOTHING_SAVED, pluginUuid: 'odd-uuid' };

    const result = pluginSourcePage(weatherPage(), weatherInputs({ plugins: [hostile], state }));

    expect(warningsOn(result).map((row) => row.defaultValue)).toEqual(['&lt;img src=x onerror=alert(1)&gt; sends weather this face cannot read.']);
  });

  /** The note shows its words as text, so an ampersand escaped twice would reach the wearer as &amp;amp;. */
  test('escapes the whole note once, the name and the words around it alike', () => {
    const named: PluginSummary = { ...ODD_WEATHER_PLUGIN, name: 'Sun & "Rain"' };
    const state = { ...NOTHING_SAVED, pluginUuid: 'odd-uuid' };
    const texts = { notStandard: (name: string) => `${name} can't be read.` };

    const result = pluginSourcePage(weatherPage(), weatherInputs({ plugins: [named], state, texts }));

    expect(warningsOn(result).map((row) => row.defaultValue)).toEqual(['Sun &amp; &quot;Rain&quot; can&#39;t be read.']);
  });

  /**
   * Clay puts the page in with a plain string replace, which reads `$'` or `$$` as a pattern, so a
   * name holding one breaks the page script and the settings never open.
   */
  test('escapes every dollar sign in the plugin\'s name', () => {
    const named: PluginSummary = { ...ODD_WEATHER_PLUGIN, name: 'Rain$\'Check $$SETTINGS$$' };
    const state = { ...NOTHING_SAVED, pluginUuid: 'odd-uuid' };
    const texts = { notStandard: (name: string) => `${name} can't be read.` };

    const result = pluginSourcePage(weatherPage(), weatherInputs({ plugins: [named], state, texts }));

    expect(warningsOn(result).map((row) => row.defaultValue)).toEqual(['Rain&#36;&#39;Check &#36;&#36;SETTINGS&#36;&#36; can&#39;t be read.']);
  });

  /** A plugin can name itself at any length, and a long one would push the warning's own words off the row. */
  test('cuts a long plugin name to 40 characters with an ellipsis', () => {
    const wordy: PluginSummary = { ...ODD_WEATHER_PLUGIN, name: 'W'.repeat(60) };
    const state = { ...NOTHING_SAVED, pluginUuid: 'odd-uuid' };

    const result = pluginSourcePage(weatherPage(), weatherInputs({ plugins: [wordy], state }));

    expect(warningsOn(result).map((row) => row.defaultValue)).toEqual([`${'W'.repeat(39)}… sends weather this face cannot read.`]);
  });

  /** An emoji is two UTF-16 units, so a cut through it would leave half a character that draws as a broken box. */
  test('keeps an emoji at the cut whole', () => {
    const sunny: PluginSummary = { ...ODD_WEATHER_PLUGIN, name: `${'W'.repeat(38)}🌤${'W'.repeat(10)}` };
    const state = { ...NOTHING_SAVED, pluginUuid: 'odd-uuid' };

    const result = pluginSourcePage(weatherPage(), weatherInputs({ plugins: [sunny], state }));

    expect(warningsOn(result).map((row) => row.defaultValue)).toEqual([`${'W'.repeat(38)}🌤… sends weather this face cannot read.`]);
  });

  /** The built-in plugins must not get a warning they do not deserve, and nothing has answered before the first update. */
  test.each([
    ['the built-in plugin answered last', 'weather-uuid'],
    ['no plugin has answered yet', null],
    ['the plugin that answered is no longer installed', 'gone-uuid'],
  ])('adds no warning when %s', (_label, pluginUuid) => {
    const state = { ...NOTHING_SAVED, pluginUuid };

    const result = pluginSourcePage(weatherPage(), weatherInputs({ state }));

    expect(warningsOn(result)).toEqual([]);
  });

  /** The calendar has no status line on the watch, so the page is the only place a denied permission shows, and an empty week drawn as a warning would read as broken. */
  test('adds the permission row after a PERMISSION_DENIED and the softer row after an empty update', () => {
    const state = { ...NOTHING_SAVED, lastError: 'PERMISSION_DENIED', lastEmpty: true };

    const result = pluginSourcePage(calendarPage(), calendarInputs({ state }));

    const warnings = warningsOn(result);

    expect(warnings).toEqual([
      { type: 'pluginNote', tone: 'warning', defaultValue: 'Allow the calendar for this face in the Pebble app.', visibleWhen: { key: 'CALENDAR_SOURCE', in: [PLUGIN_VALUE] } },
      { type: 'pluginNote', tone: 'info', defaultValue: 'If events are missing, the Pebble app may need to read your calendars.', visibleWhen: { key: 'CALENDAR_SOURCE', in: [PLUGIN_VALUE] } },
    ]);
    expect(sectionOf(result, 'CALENDAR_SOURCE').slice(0, 4)).toEqual(['heading', 'CALENDAR_SOURCE', 'pluginNote', 'pluginNote']);
  });

  /** Weather brings no empty text, so an empty update must not borrow a row meant for the calendar. */
  test('adds no row for a state the feature brings no text for', () => {
    const state = { ...NOTHING_SAVED, lastEmpty: true };

    const result = pluginSourcePage(weatherPage(), weatherInputs({ state }));

    expect(warningsOn(result)).toEqual([]);
  });
});

describe('pluginSourcePage the face\'s own page', () => {
  /** Every open folds from a fresh copy of the face's page, so two opens on the same phone have to give the same page. */
  test('gives the same page from two runs on copies of one page', () => {
    const page = buildConfig({ location: {}, weather: {}, calendar: {} });
    const copy = (): ClayConfigItem[] => JSON.parse(JSON.stringify(page));
    const state = { pluginUuid: 'odd-uuid', lastError: 'PERMISSION_DENIED', lastEmpty: true };
    const plugins = [ODD_WEATHER_PLUGIN, CALENDAR_PLUGIN];

    const first = pluginSourcePage(pluginSourcePage(copy(), weatherInputs({ plugins, state })), calendarInputs({ plugins, state }));
    const result = pluginSourcePage(pluginSourcePage(copy(), weatherInputs({ plugins, state })), calendarInputs({ plugins, state }));

    expect(result).toEqual(first);
  });
});

describe('pluginSourcePage the supported plugins panel', () => {
  /** The labels of every panel on the page, one list per panel. */
  function panelsOn(page: ClayConfigItem[]): string[][] {
    return allRows(page).filter((row) => row.type === 'pluginPanel').map((row) => (row.panel?.kinds || []).map((kind) => kind.label));
  }

  /** A face offering the plugin choice is the face whose wearer needs to know which plugins answer it. */
  test('adds the panel when the face offers the plugin choice', () => {
    const result = pluginSourcePage(weatherPage(), weatherInputs({ panel: true }));

    expect(panelsOn(result)).toEqual([['Weather']]);
  });

  /**
   * With plugins off the calendar select drops to its one option, which is when the wearer most
   * needs to hear that turning plugins on brings the choice.
   */
  test('keeps the panel when plugins are off and the select is dropped', () => {
    const result = pluginSourcePage(calendarPage(), calendarInputs({ plugins: [], panel: true }));

    expect(rowByKey(result, 'CALENDAR_SOURCE')).toBeUndefined();
    expect(panelsOn(result)).toEqual([['Calendar']]);
  });

  /** A face whose page has no source choice never reads a plugin, so a panel would point the wearer at plugins that do nothing. */
  test('adds no panel when the page has no select for the choice', () => {
    const page: ClayConfigItem[] = [locationSection({ location: {} }) as ClayConfigItem];

    const result = pluginSourcePage(page, weatherInputs({ panel: true }));

    expect(panelsOn(result)).toEqual([]);
  });

  /** A select dropped for want of its key can never save a plugin choice, so the panel would mislead. */
  test('adds no panel when the face declares no key for the select', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = pluginSourcePage(weatherPage(), weatherInputs({ messageKeys: {}, panel: true }));

    expect(panelsOn(result)).toEqual([]);
  });

  /** A face with weather and the calendar folds both hooks into one page, and two panels would say much the same twice. */
  test('lists both kinds in one panel when both hooks run', () => {
    const page = buildConfig({ location: {}, weather: {}, calendar: {} });
    const plugins = [WEATHER_PLUGIN, CALENDAR_PLUGIN];

    const result = pluginSourcePage(pluginSourcePage(page, weatherInputs({ plugins, panel: true })), calendarInputs({ plugins, panel: true }));

    expect(panelsOn(result)).toEqual([['Weather', 'Calendar']]);
  });
});

// a music plugin serving the track, as the Pebble app's own does on Android
const MUSIC_PLUGIN: PluginSummary = {
  uuid: 'music-uuid',
  name: 'Music',
  sources: [{ category: 'music', items: ['track'], properties: { title: ['shortText', 'longText'], playing: ['boolean', 'shortText'] } }],
};

// the words the now playing notes use here, each standing for the feature's own
const NO_MUSIC_PLUGIN = 'Now playing needs a music plugin. Turn on plugins in the Pebble app under Settings, Plugins, or update the Pebble app.';
const ALLOW_MUSIC = 'Allow Music for this face in the Pebble app.';

/** What the now playing page hook would hand the page, with no select and a plugin on the phone. */
function musicInputs(overrides: Partial<PluginSourceInputs> = {}): PluginSourceInputs {
  return {
    category: 'music',
    item: 'track',
    plugins: [MUSIC_PLUGIN],
    messageKeys: {},
    state: NOTHING_SAVED,
    standard: { title: ['shortText', 'longText'], playing: ['boolean'] },
    texts: {
      notStandard: (name) => `${name} sends music this face cannot read.`,
      permissionDenied: ALLOW_MUSIC,
      noPlugin: NO_MUSIC_PLUGIN,
    },
    panel: true,
    ...overrides,
  };
}

/** A face's own now playing section, with its line marked for the music notes. */
function musicPage(): ClayConfigItem[] {
  return [
    {
      type: 'section',
      items: [
        { type: 'heading', defaultValue: 'Now Playing' },
        { type: 'text', defaultValue: 'Shows what your phone is playing.', pluginSourceRows: 'music' },
        { type: 'toggle', messageKey: 'MUSIC_ARTIST_SHOWN' },
      ],
    },
    { type: 'submit', defaultValue: 'Save' },
  ];
}

/** The notes among some rows, by their words. */
function noteTexts(rows: ClayConfigItem[]): unknown[] {
  return rows.filter((row) => row.type === 'pluginNote').map((row) => row.defaultValue);
}

describe('pluginSourcePage with no select', () => {
  /** A note hidden behind a select's value would never show on a page that has no select to read. */
  test('puts its notes straight after the row marked for the kind, with no visibleWhen', () => {
    const result = faceRows(pluginSourcePage(musicPage(), musicInputs({ plugins: [WEATHER_PLUGIN] })));

    expect(result[0].items?.[2]).toEqual({ type: 'pluginNote', tone: 'warning', defaultValue: NO_MUSIC_PLUGIN });
  });

  /**
   * A page opened before the feature has run, or after plugins were turned off since the last
   * subscription, has no saved error to go by, so the note has to come from the plugin list.
   */
  test('shows the no plugin note from an empty plugin list with nothing saved', () => {
    const result = pluginSourcePage(musicPage(), musicInputs({ plugins: [], state: NOTHING_SAVED, panel: false }));

    expect(noteTexts(allRows(result))).toEqual([NO_MUSIC_PLUGIN]);
  });

  /** The note the weather and the calendar use names both ways out, plugins switched off and a Pebble app from before plugins. */
  test('names both fixes in the shared no plugin note', () => {
    const result = [PLUGINS_OFF_TEXT.includes('Turn on plugins in the Pebble app under Settings, Plugins'), PLUGINS_OFF_TEXT.includes('update the Pebble app')];

    expect(result).toEqual([true, true]);
  });

  /** A plugin serving the kind needs nothing from the wearer, and a stale note would send them looking. */
  test('adds no note while a plugin serves the kind, whatever error was saved', () => {
    const result = pluginSourcePage(musicPage(), musicInputs({ state: { pluginUuid: null, lastError: 'noPlugin', lastEmpty: false } }));

    expect(noteTexts(allRows(result))).toEqual([]);
  });

  /** A wearer who said no to the permission only learns why the panel is empty from this note. */
  test('shows the permission note after a PERMISSION_DENIED', () => {
    const result = pluginSourcePage(musicPage(), musicInputs({ state: { pluginUuid: null, lastError: 'PERMISSION_DENIED', lastEmpty: false } }));

    expect(noteTexts(allRows(result))).toEqual([ALLOW_MUSIC]);
  });

  /** A plugin that answers with readings the face cannot use leaves the panel empty with nothing to say why. */
  test('shows the not standard note for the plugin that answered last', () => {
    const odd: PluginSummary = { uuid: 'ODD-MUSIC', name: 'Odd Music', sources: [{ category: 'music', items: ['track'], properties: { song: ['shortText'] } }] };

    const result = pluginSourcePage(musicPage(), musicInputs({ plugins: [odd], state: { pluginUuid: 'odd-music', lastError: null, lastEmpty: false } }));

    expect(noteTexts(allRows(result))).toEqual(['Odd Music sends music this face cannot read.']);
  });

  /** A list the phone will not give says nothing about what is installed, so it is not read as plugins off. */
  test('adds no no plugin note for a plugin list the phone will not give', () => {
    const result = pluginSourcePage(musicPage(), musicInputs({ plugins: null }));

    expect(noteTexts(allRows(result))).toEqual([]);
  });

  /** A face that marks no row still has to tell the wearer, so the notes sit at the foot just above the panel. */
  test('puts its notes in the panel card above the panel when no row is marked', () => {
    const page: ClayConfigItem[] = [{ type: 'heading', defaultValue: 'A Face' }, { type: 'submit', defaultValue: 'Save' }];
    const inputs = weatherInputs({ selectKey: undefined, plugins: [CALENDAR_PLUGIN], texts: { noPlugin: PLUGINS_OFF_TEXT }, panel: true });

    const result = faceRows(pluginSourcePage(page, inputs));

    expect(result[1].items?.map((row) => row.type)).toEqual(['pluginNote', 'pluginPanel']);
    expect(result[2].type).toBe('submit');
  });

  /** Two kinds at the foot share one card, each kind's notes in turn, so the panel stays last. */
  test('stacks a second kind\'s notes after the first kind\'s, above the panel', () => {
    const page: ClayConfigItem[] = [{ type: 'submit', defaultValue: 'Save' }];
    const weather = pluginSourcePage(page, weatherInputs({ selectKey: undefined, plugins: [CALENDAR_PLUGIN], texts: { noPlugin: 'No weather plugin.' }, panel: true }));
    const calendar = calendarInputs({ selectKey: undefined, insert: undefined, plugins: [WEATHER_PLUGIN], texts: { noPlugin: 'No calendar plugin.' }, panel: true });

    const result = faceRows(pluginSourcePage(weather, calendar));

    expect(result[0].items?.map((row) => (row.type === 'pluginNote' ? row.defaultValue : row.type))).toEqual(['No weather plugin.', 'No calendar plugin.', 'pluginPanel']);
  });

  /** A feature that brings no panel still gets its notes onto the page, in a card of their own above the save button. */
  test('puts its notes in a card of their own at the foot with no panel', () => {
    const page: ClayConfigItem[] = [{ type: 'submit', defaultValue: 'Save' }];

    const result = faceRows(pluginSourcePage(page, musicInputs({ plugins: [], panel: false })));

    expect(result).toEqual([{ type: 'section', items: [{ type: 'pluginNote', tone: 'warning', defaultValue: NO_MUSIC_PLUGIN }] }, { type: 'submit', defaultValue: 'Save' }]);
  });

  /**
   * A plugin only weather face has no select to explain plugins off, and the watch's No Plugin does
   * not say they have to be turned on, so the note goes under the line where the select was.
   */
  test('puts plugin only weather\'s note under its marked line', () => {
    const line: ClayConfigItem = { type: 'text', defaultValue: 'Weather comes from the Pebble app.', pluginSourceRows: 'weather' };
    const inputs = weatherInputs({ selectKey: undefined, plugins: [], texts: { noPlugin: PLUGINS_OFF_TEXT } });

    const result = faceRows(pluginSourcePage([{ type: 'section', items: [line] }], inputs));

    expect(result[0].items).toEqual([line, { type: 'pluginNote', tone: 'warning', defaultValue: PLUGINS_OFF_TEXT }]);
  });

  /** The same for a plugin only calendar, whose line takes the iCal link's place. */
  test('puts plugin only calendar\'s note under its marked line', () => {
    const line: ClayConfigItem = { type: 'text', defaultValue: 'Events come from the Pebble app.', pluginSourceRows: 'calendar' };
    const inputs = calendarInputs({ selectKey: undefined, insert: undefined, plugins: [], texts: { noPlugin: PLUGINS_OFF_TEXT } });

    const result = faceRows(pluginSourcePage([{ type: 'section', items: [line] }], inputs));

    expect(result[0].items).toEqual([line, { type: 'pluginNote', tone: 'warning', defaultValue: PLUGINS_OFF_TEXT }]);
  });

  /** A row marked for another kind is not this kind's place, or one kind's note would sit under another kind's line. */
  test('passes over a row marked for another kind', () => {
    const page = musicPage();
    const line = (page[0].items as ClayConfigItem[])[1];

    line.pluginSourceRows = 'phone';

    const result = faceRows(pluginSourcePage(page, musicInputs({ plugins: [WEATHER_PLUGIN] })));

    expect(noteTexts(result[0].items as ClayConfigItem[])).toEqual([]);
    expect(noteTexts(allRows(result))).toEqual([NO_MUSIC_PLUGIN]);
  });

  /** With no select key there is no choice to make, so a face's own select is left exactly as it is. */
  test('leaves a select on the page alone', () => {
    const page = buildConfig({ weather: {}, location: {} });
    const before = JSON.stringify(rowByKey(page, 'WEATHER_PROVIDER'));

    const result = pluginSourcePage(page, weatherInputs({ selectKey: undefined, texts: { noPlugin: PLUGINS_OFF_TEXT } }));

    expect(JSON.stringify(rowByKey(result, 'WEATHER_PROVIDER'))).toBe(before);
  });
});

describe('pluginSourcePage the notes with no select', () => {
  const SOURCE = 'Your watch shows the weather from the Pebble app.';

  /** A plugin only page has no select to say where the weather comes from, so the source note has to. */
  test('leads with the note saying where the data comes from', () => {
    const inputs = weatherInputs({ selectKey: undefined, plugins: [WEATHER_PLUGIN], texts: { source: SOURCE, noPlugin: PLUGINS_OFF_TEXT } });

    const result = faceRows(pluginSourcePage([{ type: 'submit', defaultValue: 'Save' }], inputs));

    expect(result[0].items?.[0]).toEqual({ type: 'pluginNote', tone: 'info', defaultValue: escapeHtml(SOURCE) });
  });

  /** With nothing serving the kind the watch shows nothing, so a note saying where its data comes from would mislead. */
  test('leaves out the source note while nothing serves the kind', () => {
    const inputs = weatherInputs({ selectKey: undefined, plugins: [CALENDAR_PLUGIN], texts: { source: SOURCE, noPlugin: PLUGINS_OFF_TEXT } });

    const result = pluginSourcePage([{ type: 'submit', defaultValue: 'Save' }], inputs);

    expect(noteTexts(allRows(result))).toEqual([PLUGINS_OFF_TEXT]);
  });

  /** The source note leads the warnings, so the wearer reads where the data comes from before what is wrong with it. */
  test('puts the source note before the warnings', () => {
    const state: SourceState = { pluginUuid: null, lastError: 'PERMISSION_DENIED', lastEmpty: false };
    const inputs = weatherInputs({ selectKey: undefined, plugins: [WEATHER_PLUGIN], state, texts: { source: SOURCE, permissionDenied: 'Allow it.' } });

    const result = pluginSourcePage([{ type: 'submit', defaultValue: 'Save' }], inputs);

    expect(noteTexts(allRows(result))).toEqual([escapeHtml(SOURCE), 'Allow it.']);
  });

  /** With plugins off the panel opens on the same instruction, and saying it twice reads as two problems. */
  test('leaves the no plugin note to a panel that says plugins are off', () => {
    const result = pluginSourcePage(musicPage(), musicInputs({ plugins: [] }));

    expect(noteTexts(allRows(result))).toEqual([]);
  });

  /** A panel listing other plugins says nothing about this kind, so the kind's own note still has to. */
  test('keeps the no plugin note when the panel has no line about plugins being off', () => {
    const result = pluginSourcePage(musicPage(), musicInputs({ plugins: [WEATHER_PLUGIN] }));

    expect(noteTexts(allRows(result))).toEqual([NO_MUSIC_PLUGIN]);
  });

  /** With no panel on the page the note is the only place the wearer reads the instruction. */
  test('keeps the no plugin note with plugins off and no panel', () => {
    const result = pluginSourcePage(musicPage(), musicInputs({ plugins: [], panel: false }));

    expect(noteTexts(allRows(result))).toEqual([NO_MUSIC_PLUGIN]);
  });

  /** A page with no select has no other data source to point at, so the note has to point at the Pebble app alone. */
  test('uses the not standard wording for a page with no select', () => {
    const texts = { notStandard: (name: string) => `${name} or a source here.`, notStandardNoSelect: (name: string) => `${name} in the Pebble app.` };
    const inputs = weatherInputs({ selectKey: undefined, plugins: [ODD_WEATHER_PLUGIN], state: { pluginUuid: 'odd-uuid', lastError: null, lastEmpty: false }, texts });

    const result = pluginSourcePage([{ type: 'submit', defaultValue: 'Save' }], inputs);

    expect(noteTexts(allRows(result))).toEqual(['Odd Weather in the Pebble app.']);
  });

  /** A kind with one wording uses it on either page, so music and the phone need nothing more. */
  test('falls back to the one not standard wording', () => {
    const texts = { notStandard: (name: string) => `${name} in the Pebble app.` };
    const inputs = weatherInputs({ selectKey: undefined, plugins: [ODD_WEATHER_PLUGIN], state: { pluginUuid: 'odd-uuid', lastError: null, lastEmpty: false }, texts });

    const result = pluginSourcePage([{ type: 'submit', defaultValue: 'Save' }], inputs);

    expect(noteTexts(allRows(result))).toEqual(['Odd Weather in the Pebble app.']);
  });
});

describe('pluginKindState', () => {
  /** A face's layout builder warns from this, so plugins off read as missing would send a wearer to the store for a switch. */
  test.each([
    ['an empty list as off', [], 'off'],
    ['a list with nothing serving the kind as missing', [CALENDAR_PLUGIN], 'missing'],
    ['a list serving the kind as served', [WEATHER_PLUGIN], 'served'],
    ['a list the phone will not give as served', null, 'served'],
  ])('reads %s', (_label, plugins, expected) => {
    const result = pluginKindState(plugins, 'weather', 'location');

    expect(result).toBe(expected);
  });
});

describe('pluginSourcePage the plugin kinds store', () => {
  /** A face's components read where each kind stands from here, so a page without it gives them nothing to warn from. */
  test('puts the store first on the page holding the kind\'s state', () => {
    const result = pluginSourcePage(weatherPage(), weatherInputs({ plugins: [] }));

    expect(result[0]).toEqual({ type: PLUGIN_KINDS_TYPE, defaultValue: JSON.stringify({ weather: 'off' }) });
  });

  /**
   * Clay builds rows in the order they are declared, so a store anywhere but first is not there yet
   * for a component above it. Every kind's hook adds to the one store rather than a second one.
   */
  test('gathers every kind into the one store at the top of the page', () => {
    const weather = pluginSourcePage(weatherPage(), weatherInputs());
    const music = musicInputs({ plugins: [WEATHER_PLUGIN] });

    const result = pluginSourcePage(weather, music);

    expect(result.filter((item) => item.type === PLUGIN_KINDS_TYPE)).toHaveLength(1);
    expect(JSON.parse(String(result[0].defaultValue))).toEqual({ weather: 'served', music: 'missing' });
  });

  /** Clay saves every row with a message key, and the watch has no key to map this one to. */
  test('gives the store no message key, so the save leaves it out', () => {
    const result = pluginSourcePage(weatherPage(), weatherInputs());

    expect(result[0].messageKey).toBeUndefined();
  });

  /** A face's builder matches its panels against the kind's name in the providers list, not the category the phone subscribes to. */
  test('names the kind as the providers list does', () => {
    const inputs = weatherInputs({ selectKey: undefined, category: 'finance', item: 'stock', rowKind: 'stocks', plugins: [] });

    const result = pluginSourcePage([{ type: 'submit', defaultValue: 'Save' }], inputs);

    expect(JSON.parse(String(result[0].defaultValue))).toEqual({ stocks: 'off' });
  });
});
