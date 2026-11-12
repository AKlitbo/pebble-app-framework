/**
 * Specs for the provider table and the providers list a face's appinfo carries.
 *
 * The list narrows the sites a face asks for, so a list the build misreads costs a wearer either a
 * fetch the phone blocks or a site the face never needed on its install prompt. Worth pinning are
 * each refusal, since a typo that slipped through would leave the face on its full list with no word
 * about why, and the table itself against the providers the phone code really has and the hosts each
 * one really calls, since nothing else ties the two together. The same goes for the default the watch
 * keeps for a plugin source choice, which has to be the page's own and fit the buffer the watch keeps
 * it in, since the C and the phone code each have their own copy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { PROVIDERS, checkProviderKeys, pluginSourceDefaults, providerMode, providerWarnings, readProviders } from './providers';
import { PLUGIN_KINDS } from './plugin-kinds';
import { STOCK_DOMAINS, WEATHER_DOMAINS } from './permissions';
import { WEATHER_PROVIDERS } from '../../ts/weather/weather';
import { KEYED_WEATHER_PROVIDERS } from '../../ts/plugin-sources/weather-driver';
import { STOCK_PROVIDERS } from '../../ts/stock/stock';
import buildConfig, { stocksSection, weatherSection } from '../../ts/pkjs/config-builder';
import { CALENDAR_SOURCE_SELECT, CALENDAR_TEXTS } from '../../ts/plugin-sources/calendar';
import { pluginSourcePage } from '../../ts/plugin-sources/page';
import { CALENDAR_STANDARD } from '../../ts/plugin-sources/standard';
import { faceProvidersFor } from '../../ts/face-providers/narrow';
import { allItems } from '../../ts/clay/rows';
import type { ClayConfigItem } from '../../ts/clay/types';

const TS = path.join(import.meta.dirname, '..', '..', 'ts');

// the header holding the buffers the watch keeps each source choice in
const PLUGIN_SOURCE_H = path.join(import.meta.dirname, '..', '..', 'c', 'pebble', 'system', 'settings', 'plugin_source.h');

// every key a face with weather, stocks, the calendar, and both select keys declares
const ALL_KEYS = ['WEATHER_REQUEST', 'WEATHER_TEMPERATURE', 'WEATHER_CONDITIONS', 'WEATHER_OK', 'WEATHER_PROVIDER', 'STOCK_STRIP', 'CALENDAR_STRIP', 'CALENDAR_SOURCE'];

/** An appinfo with every feature key and the given providers. */
function appinfo(providers: unknown, messageKeys: string[] = ALL_KEYS): { providers: unknown; messageKeys: string[] } {
  return { providers, messageKeys };
}

/** The keys a face with no select keys declares, for the plugin only lists. */
function withoutSelects(): string[] {
  return ALL_KEYS.filter((key) => key !== 'WEATHER_PROVIDER' && key !== 'CALENDAR_SOURCE');
}

/** The table's sites for one kind, each once. */
function tableSites(kind: string): string[] {
  return [...new Set(PROVIDERS.filter((provider) => provider.kind === kind).flatMap((provider) => provider.sites))];
}

/** Every host a provider's file calls, and the files it takes values from in its own providers/ folder. */
function hostsReachedBy(folder: string, name: string, seen = new Set<string>()): string[] {
  if (seen.has(name)) {
    return [];
  }

  seen.add(name);

  const source = fs.readFileSync(path.join(TS, folder, 'providers', `${name}.ts`), 'utf8');
  const hosts = [...source.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((match) => match[1].toLowerCase());
  const imported = [...source.matchAll(/^import (?!type )[^;]*from '\.\/([\w-]+)';/gm)].map((match) => match[1]);

  return [...new Set([...hosts, ...imported.flatMap((file) => hostsReachedBy(folder, file, seen))])];
}

/** True when a site lets the phone reach the host, the way the Pebble app matches them. */
function covers(site: string, host: string): boolean {
  return host === site || host.endsWith('.' + site);
}

/** A buffer size the watch's plugin_source.h defines, such as PLUGIN_SOURCE_WEATHER_LEN. */
function watchBuffer(name: string): number {
  const match = fs.readFileSync(PLUGIN_SOURCE_H, 'utf8').match(new RegExp(`^#define ${name} ([0-9]+)`, 'm'));

  if (!match) {
    throw new Error(`plugin_source.h defines no ${name}`);
  }

  return Number(match[1]);
}

/** The default the framework's weather section gives its Data Source, once a list has narrowed it. */
function narrowedWeatherDefault(list: string[]): unknown {
  const page = [weatherSection({ weather: {} }) as ClayConfigItem];
  const narrowed = faceProvidersFor({ weather: { offered: list, needsKey: true } }).narrow(page);

  return allItems(narrowed).find((item) => item.messageKey === 'WEATHER_PROVIDER')?.defaultValue;
}

/**
 * The default the calendar's Calendar Source select shows once the page has opened, on a phone with a
 * calendar plugin. The page hook puts the select in, so it is read off the page the hook gives back.
 */
function openedCalendarDefault(list: string[] | undefined): unknown {
  const page = list ? faceProvidersFor({ calendar: { offered: list, needsKey: false } }).narrow(buildConfig({ calendar: {} })) : buildConfig({ calendar: {} });
  const opened = pluginSourcePage(page, {
    selectKey: 'CALENDAR_SOURCE',
    category: 'calendar',
    item: 'event',
    plugins: [{ uuid: 'calendar-uuid', name: 'Calendar', sources: [{ category: 'calendar', items: ['event'], properties: { name: ['shortText'], starts_at: ['timestamp'] } }] }],
    messageKeys: { CALENDAR_SOURCE: 1, CALENDAR_ICS_URL: 2 },
    state: { pluginUuid: null, lastError: null, lastEmpty: false },
    standard: CALENDAR_STANDARD,
    texts: CALENDAR_TEXTS,
    insert: { select: CALENDAR_SOURCE_SELECT, anchorKey: 'CALENDAR_ICS_URL' },
  });

  return allItems(opened).find((item) => item.messageKey === 'CALENDAR_SOURCE')?.defaultValue;
}

/** The options a select in a section offers, by its message key. */
function optionsOf(section: ClayConfigItem | null, key: string): { label: string; value: string }[] {
  const select = section?.items?.find((item) => item.messageKey === key);

  return (select?.options ?? []) as { label: string; value: string }[];
}

describe('readProviders', () => {
  /** A face that lists nothing has to build exactly as before, which starts with reading as no lists at all. */
  test('reads an appinfo without providers as no lists', () => {
    const config = { messageKeys: ALL_KEYS };

    const result = readProviders(config, 'my-face', {});

    expect(result).toEqual({});
  });

  /** A face's lists come back as written, so the permissions narrow to exactly what it named. */
  test('gives back the lists a face writes', () => {
    const config = appinfo({ weather: ['plugin', 'openmeteo'], stocks: ['yahoo'], calendar: ['ical'], calendarHosts: ['google.com'] });

    const result = readProviders(config, 'my-face', { PLUGIN_WEATHER: 1 });

    expect(result).toEqual({ weather: ['plugin', 'openmeteo'], stocks: ['yahoo'], calendar: ['ical'], calendarHosts: ['google.com'] });
  });

  /** A list written without its map around it would be read key by key into nonsense. */
  test.each([[['openmeteo']], ['openmeteo'], [null]])('refuses a providers that is not a map, such as %j', (providers) => {
    const call = () => readProviders(appinfo(providers), 'my-face', {});

    expect(call).toThrow("my-face's appinfo providers has to be a map of kind to a list of providers");
  });

  /** A typo such as stock would leave the face on every stock provider with no word about why. */
  test('refuses a kind it does not know, such as stock', () => {
    const call = () => readProviders(appinfo({ stock: ['yahoo'] }), 'my-face', {});

    expect(call).toThrow("my-face's appinfo providers names stock, which is not a kind it knows. The kinds are weather, stocks, calendar, music, phone, and calendarHosts");
  });

  /** A list that does not read as names leaves the build guessing what the face meant to offer. */
  test.each([
    ['a bare name', 'openmeteo', 'has to be a list of names as text'],
    ['a number in it', ['openmeteo', 3], 'has to be a list of names as text'],
    ['nothing in it', [], 'is empty. List at least one provider, or leave weather out'],
    ['a name twice', ['openmeteo', 'openmeteo'], 'names openmeteo twice. Take the second one out'],
  ])('refuses a weather list with %s', (_name, list, message) => {
    const call = () => readProviders(appinfo({ weather: list }), 'my-face', {});

    expect(call).toThrow(`my-face's appinfo providers.weather ${message}`);
  });

  /** A typo such as openweather would ship a face that offers a provider the phone has no code for. */
  test('refuses a name the table does not have, naming the ones it does', () => {
    const call = () => readProviders(appinfo({ weather: ['openweather'] }), 'my-face', {});

    expect(call).toThrow("my-face's appinfo providers.weather names openweather, which is not a weather provider. The weather providers are openmeteo, owm, weatherapi, and plugin");
  });

  /** Without PLUGIN_STOCKS the phone code carries no stock plugin reader, so the choice it offered would never fill. */
  test('refuses plugin for stocks without PLUGIN_STOCKS', () => {
    const call = () => readProviders(appinfo({ stocks: ['plugin', 'yahoo'] }), 'my-face', {});

    expect(call).toThrow("my-face's appinfo lists plugin in providers.stocks without PLUGIN_STOCKS turned on");
  });

  /** A face that takes its quotes from a plugin alone has to build, or the define has no plugin only use. */
  test('takes a plugin only stock list with PLUGIN_STOCKS', () => {
    const result = readProviders(appinfo({ stocks: ['plugin'] }, withoutSelects()), 'my-face', { PLUGIN_STOCKS: 1 });

    expect(result).toEqual({ stocks: ['plugin'] });
  });

  /** Now playing and phone battery come only from a plugin, so any other name is one the phone has no code for. */
  test.each([
    ['music', 'now playing'],
    ['phone', 'phone battery'],
  ])('refuses anything but plugin for %s', (kind, words) => {
    const call = () => readProviders(appinfo({ [kind]: ['plugin', 'spotify'] }), 'my-face', { PLUGIN_MUSIC: 1, PLUGIN_PHONE: 1 });

    expect(call).toThrow(`my-face's appinfo providers.${kind} names spotify, but ${words} comes only from a plugin, so its list can only be ["plugin"]`);
  });

  /**
   * The phone build reads the list before the build knows the keys the features bring, so a stocks list
   * on a face that leaves STOCK_STRIP to the stocks feature has to pass here.
   */
  test('reads a list without looking at the message keys', () => {
    const result = readProviders(appinfo({ stocks: ['yahoo'] }, []), 'my-face', {});

    expect(result).toEqual({ stocks: ['yahoo'] });
  });

  /** A face whose page offers the plugin while its bundle has no plugin code is the bug this catches. */
  test.each([
    ['without the define', {}],
    ['with the define at 0', { PLUGIN_WEATHER: 0 }],
  ])('refuses plugin in a list %s', (_name, defines) => {
    const call = () => readProviders(appinfo({ weather: ['plugin', 'openmeteo'] }), 'my-face', defines);

    expect(call).toThrow("my-face's appinfo lists plugin in providers.weather without PLUGIN_WEATHER turned on");
  });

  /** A define whose list never offers the plugin ships the plugin code with nothing on the page to pick it. */
  test('refuses a define on with a list lacking plugin', () => {
    const call = () => readProviders(appinfo({ calendar: ['ical'] }), 'my-face', { PLUGIN_CALENDAR: 1 });

    expect(call).toThrow("my-face's appinfo defines PLUGIN_CALENDAR, but providers.calendar does not list plugin");
  });


  /** A plugin only face without its select keys is the shape the refusal asks for, so it has to build. */
  test('takes plugin only weather and calendar without their select keys', () => {
    const config = appinfo({ weather: ['plugin'], calendar: ['plugin'] }, withoutSelects());

    const result = readProviders(config, 'my-face', { PLUGIN_WEATHER: 1, PLUGIN_CALENDAR: 1 });

    expect(result).toEqual({ weather: ['plugin'], calendar: ['plugin'] });
  });

  /** Hosts only say where an iCal link reaches, so beside a calendar that offers no link they mean nothing. */
  test('refuses calendarHosts beside a calendar list without ical', () => {
    const config = appinfo({ calendar: ['plugin'], calendarHosts: ['google.com'] }, withoutSelects());

    const call = () => readProviders(config, 'my-face', { PLUGIN_CALENDAR: 1 });

    expect(call).toThrow("my-face's appinfo lists providers.calendarHosts, but providers.calendar does not offer ical");
  });

  /** With no calendar list the face offers its iCal link, so the hosts are what narrow it. */
  test('takes calendarHosts beside no calendar list', () => {
    const config = appinfo({ calendarHosts: ['google.com', 'icloud.com'] });

    const result = readProviders(config, 'my-face', {});

    expect(result).toEqual({ calendarHosts: ['google.com', 'icloud.com'] });
  });

  /** A face meaning any site that wrote [] would ship a calendar that could reach nothing. */
  test.each([
    ['beside a list holding ical', { calendar: ['plugin', 'ical'], calendarHosts: [] }, { PLUGIN_CALENDAR: 1 }],
    ['beside no calendar list', { calendarHosts: [] }, {}],
  ])('refuses an empty calendarHosts %s', (_name, providers, defines) => {
    const call = () => readProviders(appinfo(providers), 'my-face', defines);

    expect(call).toThrow("my-face's appinfo providers.calendarHosts is empty, which would let an iCal link reach no site at all. List the hosts its feeds come from, such as google.com, or leave calendarHosts out to let a link reach any site");
  });

  /** The phone matches a bare host name, so anything else lists a host no feed ever matches. */
  test.each([['https://calendar.google.com'], ['calendar.google.com/'], ['*.google.com'], ['localhost'], ['calendar.google.com:443']])('refuses %s as a calendar host', (host) => {
    const call = () => readProviders(appinfo({ calendarHosts: [host] }), 'my-face', {});

    expect(call).toThrow(`my-face's appinfo providers.calendarHosts holds ${host}, which is not a bare host name`);
  });

  /** The phone matches hosts by name, so a feed on an address could never be let through. */
  test.each([['192.168.1.10'], ['2001:db8::1'], ['[2001:db8::1]'], ['Example.123']])('refuses the IP address %s as a calendar host', (host) => {
    const call = () => readProviders(appinfo({ calendarHosts: [host] }), 'my-face', {});

    expect(call).toThrow(`my-face's appinfo providers.calendarHosts holds ${host}, which is an IP address. The phone matches host names only`);
  });

  /** A host written with capitals would be refused as not a host name, which leaves the face developer hunting for what is wrong with it. */
  test('tells an uppercase host to be written in lowercase', () => {
    const call = () => readProviders(appinfo({ calendarHosts: ['Google.com'] }), 'my-face', {});

    expect(call).toThrow("my-face's appinfo providers.calendarHosts holds Google.com. Write it in lowercase, as google.com");
  });
});

describe('checkProviderKeys', () => {
  /**
   * A list for a kind the face does not have narrows nothing, and says the face offers something it
   * never shows. The feature brings the key, so the refusal says to pass it.
   */
  test.each([
    ['weather', { weather: ['openmeteo'] }, 'WEATHER_REQUEST', 'weather from ts/weather/feature'],
    ['stocks', { stocks: ['yahoo'] }, 'STOCK_STRIP', 'stocks from ts/stock/feature'],
    ['calendar', { calendar: ['ical'] }, 'CALENDAR_STRIP', 'calendar from ts/calendar/feature'],
    ['calendarHosts', { calendarHosts: ['google.com'] }, 'CALENDAR_STRIP', 'calendar from ts/calendar/feature'],
  ])('refuses %s without its feature key', (kind, providers, key, feature) => {
    const keys = ALL_KEYS.filter((declared) => declared !== key);
    const lists = readProviders(appinfo(providers, keys), 'my-face', {});

    const call = () => checkProviderKeys(lists, keys, 'my-face');

    expect(call).toThrow(`my-face's appinfo lists providers.${kind} without the ${key} message key`);
    expect(call).toThrow(`Pass ${feature} in startPebbleApp's features, which brings the key`);
  });

  /** A plugin only face that keeps its select key logs the reset-field error at every launch. */
  test.each([
    ['weather', 'PLUGIN_WEATHER', 'WEATHER_PROVIDER'],
    ['calendar', 'PLUGIN_CALENDAR', 'CALENDAR_SOURCE'],
  ])('refuses a plugin only %s list beside its select key', (kind, define, key) => {
    const lists = readProviders(appinfo({ [kind]: ['plugin'] }), 'my-face', { [define]: 1 });

    const call = () => checkProviderKeys(lists, ALL_KEYS, 'my-face');

    expect(call).toThrow(`my-face's appinfo lists providers.${kind} as ["plugin"] and still declares ${key}. A plugin only kind keeps no choice on the watch, so take ${key} out of messageKeys`);
  });

  /** A face whose keys back every list it gives builds. */
  test('passes every kind with its keys', () => {
    const lists = readProviders(appinfo({ weather: ['plugin', 'openmeteo'], stocks: ['yahoo'], calendar: ['plugin', 'ical'], calendarHosts: ['google.com'] }), 'my-face', { PLUGIN_WEATHER: 1, PLUGIN_CALENDAR: 1 });

    const call = () => checkProviderKeys(lists, ALL_KEYS, 'my-face');

    expect(call).not.toThrow();
  });
});

describe('providerMode', () => {
  /** The mode decides the permissions and the keys a define needs, so a list read in the wrong mode asks for the wrong things. */
  test.each([
    [undefined, 'unlisted'],
    [['openmeteo', 'owm'], 'custom'],
    [['plugin'], 'plugin'],
    [['openmeteo', 'plugin'], 'mixed'],
  ])('reads %j as %s', (list, mode) => {
    const result = providerMode(list);

    expect(result).toBe(mode);
  });
});

describe('providerWarnings', () => {
  /** A fresh install of a face defaulting to a keyed provider shows No API Key, and the face developer should hear of it at build time. */
  test('warns when the first custom provider needs a key', () => {
    const result = providerWarnings({ weather: ['plugin', 'owm'] }, 'my-face');

    expect(result).toEqual(["my-face's appinfo providers.weather lists owm as its first custom provider, which is the default and needs an API key, so a fresh install shows No API Key until the wearer pastes one. List one that needs no key first, such as openmeteo, to start a fresh install on working weather"]);
  });

  /** The plugin is never the default, so a keyless provider after it starts a fresh install on working weather. */
  test('says nothing when the first custom provider needs no key', () => {
    const result = providerWarnings({ weather: ['plugin', 'openmeteo'], stocks: ['yahoo', 'finnhub'] }, 'my-face');

    expect(result).toEqual([]);
  });
});

describe('PROVIDERS', () => {
  /** A face listing every provider has to get today's bytes, which holds only while the table's sites are exactly the framework's lists. */
  test.each([
    ['weather', WEATHER_DOMAINS],
    ['stocks', STOCK_DOMAINS],
  ])('lists exactly the %s sites the permissions know', (kind, domains) => {
    const result = tableSites(kind).sort();

    expect(result).toEqual([...domains].sort());
  });

  /** A provider added to the phone code and not here could never be listed, and one here and not there fetches nothing. */
  test.each([
    ['weather', WEATHER_PROVIDERS],
    ['stocks', STOCK_PROVIDERS],
  ])('names the %s providers the phone code has', (kind, names) => {
    const result = PROVIDERS.filter((provider) => provider.kind === kind && !provider.plugin).map((provider) => provider.name).sort();

    expect(result).toEqual([...names].sort());
  });

  /** A plugin kind with no plugin row could never be listed, so its define would always be refused beside a list. */
  test('has one plugin row for every plugin kind', () => {
    const result = PROVIDERS.filter((provider) => provider.plugin).map((provider) => provider.plugin.define);

    expect(result).toEqual(PLUGIN_KINDS.map((kind) => kind.define));
  });

  /**
   * A narrowed face is held to its providers' own sites. OWM takes its UV, dew point, and forecast
   * from Open-Meteo, so an OWM row without open-meteo.com loses those readings with plugins on.
   */
  test.each(PROVIDERS.filter((provider) => !provider.plugin && !provider.anySite).map((provider) => [provider.kind, provider.name, provider.sites]))('covers every host %s provider %s calls', (kind, name, sites) => {
    const folder = kind === 'stocks' ? 'stock' : kind;

    const result = hostsReachedBy(folder, name).filter((host) => !sites.some((site) => covers(site, host)));

    expect(result).toEqual([]);
  });

  /** A site its provider never calls shows on the install prompt of every face that lists it. */
  test.each(PROVIDERS.filter((provider) => !provider.plugin && !provider.anySite).map((provider) => [provider.kind, provider.name, provider.sites]))('names only sites %s provider %s calls', (kind, name, sites) => {
    const hosts = hostsReachedBy(kind === 'stocks' ? 'stock' : kind, name);

    const result = sites.filter((site) => !hosts.some((host) => covers(site, host)));

    expect(result).toEqual([]);
  });

  /**
   * The phone keeps its own list of the keyed weather providers, since its bundle cannot read this
   * table. A provider missing from it lets a reset watch bring back a keyed provider with no key, and
   * the face shows No API Key where it would have shown Open-Meteo weather.
   */
  test('names the same keyed weather providers as the phone plugin code', () => {
    const result = PROVIDERS.filter((provider) => provider.kind === 'weather' && provider.needsKey).map((provider) => provider.name).sort();

    expect(result).toEqual([...KEYED_WEATHER_PROVIDERS].sort());
  });

  /** A wrong key flag would drop the API key row from a face whose provider needs it, once the page narrows. */
  test.each([
    ['weather', optionsOf(weatherSection({ weather: {} }), 'WEATHER_PROVIDER')],
    ['stocks', optionsOf(stocksSection({ stocks: {} }), 'STOCK_PROVIDER')],
  ])('marks a %s provider keyless only when the builder says No Key', (kind, options) => {
    const result = options.map((option) => [option.value, PROVIDERS.find((provider) => provider.kind === kind && provider.name === option.value)?.needsKey]);

    expect(result).toEqual(options.map((option) => [option.value, !option.label.includes('No Key')]));
  });

  /**
   * The builder writes its own list of the providers that need no key, and hides the key row only for
   * them. A keyed provider in it hides the key box the wearer has to fill in, and a keyless one
   * missing from it asks for a key nothing reads.
   */
  test.each([
    ['weather', weatherSection({ weather: {} }), 'WEATHER_API_KEY'],
    ['stocks', stocksSection({ stocks: {} }), 'STOCK_API_KEY'],
  ])('hides the builder\'s %s key row for the providers the table says need no key', (kind, section, key) => {
    const row = section?.items?.find((item) => item.messageKey === key);

    const result = [...(row?.visibleWhen as { notIn: string[] }).notIn].sort();

    // the plugin choice is left out, since its own mark hides the key row while it is picked
    expect(result).toEqual(PROVIDERS.filter((provider) => provider.kind === kind && !provider.needsKey && !provider.plugin).map((provider) => provider.name).sort());
  });
});

describe('pluginSourceDefaults', () => {
  /**
   * A face with no list keeps the page's own defaults. A watch that never got a save sends back its
   * default, so one that differed from the page would put a choice the wearer never made back on
   * the phone after a reinstall.
   */
  test('gives a face with no list the defaults the framework page shows', () => {
    const result = pluginSourceDefaults({ PLUGIN_WEATHER: 1, PLUGIN_CALENDAR: 1 }, {});

    expect(result).toEqual({ PLUGIN_SOURCE_WEATHER_DEFAULT: 'openmeteo', PLUGIN_SOURCE_CALENDAR_DEFAULT: 'ical' });
    expect(weatherSection({ weather: {} })?.items?.find((item) => item.messageKey === 'WEATHER_PROVIDER')?.defaultValue).toBe('openmeteo');
  });

  /** The page defaults to the first custom provider listed wherever plugin sits, so the watch has to as well. */
  test.each([
    [['plugin', 'openmeteo']],
    [['owm', 'plugin', 'openmeteo']],
    [['plugin', 'weatherapi', 'owm']],
  ])('gives a weather list of %j the default the narrowed page shows', (list) => {
    const result = pluginSourceDefaults({ PLUGIN_WEATHER: 1 }, { weather: list }).PLUGIN_SOURCE_WEATHER_DEFAULT;

    expect(result).toBe(narrowedWeatherDefault(list));
  });

  /** The calendar's select arrives with the page hook, so the watch's default has to match the select the opened page shows. */
  test.each([
    [undefined],
    [['plugin', 'ical']],
    [['ical', 'plugin']],
  ])('gives a calendar list of %j the default the opened page shows', (list) => {
    const result = pluginSourceDefaults({ PLUGIN_CALENDAR: 1 }, list ? { calendar: list } : {}).PLUGIN_SOURCE_CALENDAR_DEFAULT;

    expect(result).toBe(openedCalendarDefault(list));
  });

  /** A plugin only kind keeps no choice on the watch, so a default for it would ask the C for a field that is not there. */
  test('gives a plugin only kind no default', () => {
    const result = pluginSourceDefaults({ PLUGIN_WEATHER: 1, PLUGIN_CALENDAR: 1, PLUGIN_STOCKS: 1 }, { weather: ['plugin'], calendar: ['plugin', 'ical'], stocks: ['plugin'] });

    expect(result).toEqual({ PLUGIN_SOURCE_CALENDAR_DEFAULT: 'ical' });
  });

  /**
   * The stocks' Data Source opens on Finnhub with no list, and on the first custom provider listed
   * with one, so a watch that never got a save has to send back the same.
   */
  test.each([
    [undefined, 'finnhub'],
    [['plugin', 'yahoo'], 'yahoo'],
    [['twelvedata', 'plugin'], 'twelvedata'],
  ])('gives a stock list of %j the default the page shows', (list, expected) => {
    const result = pluginSourceDefaults({ PLUGIN_STOCKS: 1 }, list ? { stocks: list } : {}).PLUGIN_SOURCE_STOCK_DEFAULT;

    expect(result).toBe(expected);
    expect(stocksSection({ stocks: {} })?.items?.find((item) => item.messageKey === 'STOCK_PROVIDER')?.defaultValue).toBe('finnhub');
  });

  /** A face without a kind's define keeps none of the framework's settings code, so it gets no default either. */
  test.each([
    ['with no define', {}],
    ['with the define at 0', { PLUGIN_WEATHER: 0 }],
    ['with only the kinds that have no select', { PLUGIN_MUSIC: 1, PLUGIN_PHONE: 1 }],
  ])('gives a face %s no default', (_label, defines) => {
    const result = pluginSourceDefaults(defines, {});

    expect(result).toEqual({});
  });

  /**
   * The watch keeps each choice in a fixed buffer, so a provider name that does not fit is kept cut
   * short. The phone then reads it back after a reinstall as a provider no page offers.
   */
  test.each([
    ['weather', 'PLUGIN_SOURCE_WEATHER_LEN'],
    ['calendar', 'PLUGIN_SOURCE_CALENDAR_LEN'],
    ['stocks', 'PLUGIN_SOURCE_STOCK_LEN'],
  ])('fits every %s value the page saves in the buffer the watch keeps it in', (kind, buffer) => {
    const size = watchBuffer(buffer);

    const result = PROVIDERS.filter((provider) => provider.kind === kind && provider.name.length + 1 > size).map((provider) => provider.name);

    expect(result).toEqual([]);
  });
});
