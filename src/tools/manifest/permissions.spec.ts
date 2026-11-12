/**
 * Specs for the usesPermissions list a face's manifest carries.
 *
 * Once the SDK builds manifestVersion 2, the Pebble app holds a face's phone-side script to this list
 * whenever the wearer has plugins on. A site missing from it fails every fetch to that site at once,
 * and a missing Location turns the GPS lookup away. Nothing in the build or on the phone says which
 * site was left out, so the list each feature asks for is pinned here, along with a check that every
 * host a provider or the settings page calls is one the list covers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { PICKER_DOMAINS, STOCK_DOMAINS, WEATHER_DOMAINS, permissionWarnings, permissionsFor } from './permissions';

const TS = path.join(import.meta.dirname, '..', '..', 'ts');

/** Every host a folder's sources call, providers and all, read off the URLs written in them. */
function hostsCalledIn(folder: string): string[] {
  const dir = path.join(TS, folder);
  const sources = fs.readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'));
  const hosts = sources.flatMap((file) => [...fs.readFileSync(path.join(dir, file), 'utf8').matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((match) => match[1].toLowerCase()));

  return [...new Set(hosts)];
}

/** True when a domain on the list lets the phone reach the host, the way the Pebble app matches them. */
function covers(domains: string[], host: string): boolean {
  return domains.some((domain) => host === domain || host.endsWith('.' + domain));
}

describe('permissionsFor', () => {
  /** A weather face needs both, or wearers with plugins on get No GPS and Net Error. */
  test('asks a weather face for location and the weather sites', () => {
    const keys = ['WEATHER_REQUEST', 'WEATHER_TEMPERATURE'];

    const result = permissionsFor(keys, undefined, 'face');

    expect(result).toEqual([
      'Location',
      { name: 'Internet', parameters: { domains: ['open-meteo.com', 'openweathermap.org', 'weatherapi.com'] } },
    ]);
  });

  /**
   * GPS can be on from a default in the settings page without the face declaring LOCATION_USE_GPS, and
   * a lookup the list leaves out is turned away, so a weather face asks for location either way.
   */
  test('asks for location without the GPS switch key', () => {
    const keys = ['WEATHER_REQUEST'];

    const result = permissionsFor(keys, undefined, 'face');

    expect(result).toContain('Location');
  });

  /** Weather and stocks on one face share the one Internet entry, so both sets of sites have to be in it. */
  test('lists the weather and the stock sites together', () => {
    const keys = ['WEATHER_REQUEST', 'STOCK_STRIP'];

    const result = permissionsFor(keys, undefined, 'face');

    expect(result).toEqual([
      'Location',
      { name: 'Internet', parameters: { domains: [...WEATHER_DOMAINS, ...STOCK_DOMAINS] } },
    ]);
  });

  /** A calendar feed can be on any site, so a list of sites would block every feed the wearer pastes in. */
  test('asks a calendar face for the whole web rather than a list', () => {
    const keys = ['WEATHER_REQUEST', 'STOCK_STRIP', 'CALENDAR_STRIP'];

    const result = permissionsFor(keys, undefined, 'face');

    expect(result).toEqual(['Location', 'Internet']);
  });

  /** A key declared as an array, such as STOCK_STRIP[2], is the same key and still switches the feature on. */
  test('reads a key with an array suffix as the key itself', () => {
    const keys = ['STOCK_STRIP[2]'];

    const result = permissionsFor(keys, undefined, 'face');

    expect(result).toEqual([{ name: 'Internet', parameters: { domains: STOCK_DOMAINS } }]);
  });

  /**
   * The pickers search Open-Meteo from inside the settings page, which the Pebble app holds to the
   * listed sites on Android. A face with a picker and no weather whose search finds nothing is the
   * bug this catches.
   */
  test.each([['CLOCK_TIMEZONE_1'], ['CLOCK_TIMEZONE_2'], ['LOCATION_NAME']])('asks a face with %s alone for Open-Meteo', (key) => {
    const keys = [key];

    const result = permissionsFor(keys, undefined, 'face');

    expect(result).toEqual([{ name: 'Internet', parameters: { domains: ['open-meteo.com'] } }]);
  });

  /** A weather face lists Open-Meteo already, and the picker listing it a second time would change its manifest for nothing. */
  test('lists Open-Meteo once for a weather face with the location picker', () => {
    const keys = ['WEATHER_REQUEST', 'LOCATION_NAME'];

    const result = permissionsFor(keys, undefined, 'face');

    expect(result).toEqual([
      'Location',
      { name: 'Internet', parameters: { domains: ['open-meteo.com', 'openweathermap.org', 'weatherapi.com'] } },
    ]);
  });

  /** The picker's site has to join the one Internet entry the stocks made, or the time zone search finds nothing on that face. */
  test('adds Open-Meteo after the stock sites for a stock face with a time zone picker', () => {
    const keys = ['STOCK_STRIP', 'CLOCK_TIMEZONE_1'];

    const result = permissionsFor(keys, undefined, 'face');

    expect(result).toEqual([{ name: 'Internet', parameters: { domains: [...STOCK_DOMAINS, 'open-meteo.com'] } }]);
  });

  /** A calendar face already reaches every site, and a list beside it would narrow what its feeds can reach. */
  test('keeps a calendar face with a time zone picker on any site', () => {
    const keys = ['CALENDAR_STRIP', 'CLOCK_TIMEZONE_1'];

    const result = permissionsFor(keys, undefined, 'face');

    expect(result).toEqual(['Internet']);
  });

  /** A face with no phone-side fetches gets an empty list, which the manifest then leaves out. */
  test('asks for nothing when no feature key is declared', () => {
    const keys = ['SETTINGS_REQUEST', 'APPEARANCE_THEME'];

    const result = permissionsFor(keys, undefined, 'face');

    expect(result).toEqual([]);
  });

  /** The calendar plugins need the calendar, so a face offering them without it would subscribe and get nothing but a refusal. */
  test('asks a face built with PLUGIN_CALENDAR for the calendar', () => {
    const keys = ['CALENDAR_STRIP', 'CALENDAR_SOURCE'];

    const result = permissionsFor(keys, undefined, 'face', { PLUGIN_CALENDAR: 1 });

    expect(result).toEqual(['Calendar', 'Internet']);
  });

  /** The wearer is asked to allow the calendar, so a face that offers no phone calendars must never put that question to them. */
  test.each([
    ['without the define', {}],
    ['with the define at 0', { PLUGIN_CALENDAR: 0 }],
    ['with only PLUGIN_WEATHER', { PLUGIN_WEATHER: 1 }],
  ])('leaves the calendar off a calendar face %s', (_name, defines) => {
    const keys = ['CALENDAR_STRIP', 'CALENDAR_SOURCE'];

    const result = permissionsFor(keys, undefined, 'face', defines);

    expect(result).toEqual(['Internet']);
  });

  /**
   * The Pebble app's music plugin asks callers for ReadMusic, so a face that never lists it is refused
   * and its now playing panel stays empty. Listed, the wearer reviews it at install.
   */
  test('asks a face built with PLUGIN_MUSIC for ReadMusic', () => {
    const keys = ['MUSIC_TITLE', 'MUSIC_ARTIST', 'MUSIC_PLAYING', 'MUSIC_REQUEST'];

    const result = permissionsFor(keys, undefined, 'face', { PLUGIN_MUSIC: 1 });

    expect(result).toEqual(['ReadMusic']);
  });

  /** The wearer is asked about their music, so a face that shows none must never put that question to them. */
  test.each([
    ['without the define', {}],
    ['with the define at 0', { PLUGIN_MUSIC: 0 }],
    ['with only PLUGIN_PHONE', { PLUGIN_PHONE: 1 }],
  ])('leaves ReadMusic off a face %s', (_name, defines) => {
    const keys = ['WEATHER_REQUEST'];

    const result = permissionsFor(keys, undefined, 'face', defines);

    expect(result).not.toContain('ReadMusic');
  });

  /** The Phone plugin asks for nothing, so a phone battery face lists nothing, and the wearer is never asked. */
  test('adds nothing for PLUGIN_PHONE', () => {
    const keys = ['PHONE_BATTERY', 'PHONE_REQUEST'];

    const result = permissionsFor(keys, undefined, 'face', { PLUGIN_PHONE: 1 });

    expect(result).toEqual([]);
  });

  /** A face that fetches from a site of its own has to be able to list it, or that fetch fails for every wearer with plugins on. */
  test('adds a face\'s own sites to the one Internet entry', () => {
    const keys = ['WEATHER_REQUEST'];
    const own = [{ name: 'Internet', parameters: { domains: ['example.com'] } }];

    const result = permissionsFor(keys, own, 'face');

    expect(result).toEqual([
      'Location',
      { name: 'Internet', parameters: { domains: [...WEATHER_DOMAINS, 'example.com'] } },
    ]);
  });

  /** A face that asks for any site of its own would still be held to the providers' sites if its entry sat beside the list. */
  test('opens the Internet entry to any site when the face asks for it bare', () => {
    const keys = ['STOCK_STRIP'];

    const result = permissionsFor(keys, ['Internet'], 'face');

    expect(result).toEqual(['Internet']);
  });

  /** A calendar face already reaches every site, so a site list of the face's own beside it would only narrow what the wearer sees asked for. */
  test('keeps a calendar face on any site when it also lists sites of its own', () => {
    const keys = ['CALENDAR_STRIP'];
    const own = [{ name: 'Internet', parameters: { domains: ['example.com'] } }];

    const result = permissionsFor(keys, own, 'face');

    expect(result).toEqual(['Internet']);
  });

  /** Location written as an object is the same permission, and listing it twice puts it on the install prompt twice. */
  test('does not add a name the list already has, whichever way it is written', () => {
    const keys = ['WEATHER_REQUEST'];
    const own = [{ name: 'Location' }, 'Location', 'Calendar'];

    const result = permissionsFor(keys, own, 'face');

    expect(result).toEqual(['Location', 'Calendar', { name: 'Internet', parameters: { domains: WEATHER_DOMAINS } }]);
  });

  /** An entry with no name reaches the phone as a permission it cannot read, so the build stops on it and names the face. */
  test('refuses an entry of the face\'s own that has no name', () => {
    const call = () => permissionsFor([], [{ parameters: { domains: ['example.com'] } }], 'my-face');

    expect(call).toThrow(/my-face's appinfo usesPermissions holds/);
  });

  /** An empty name is no permission the phone knows, so the entry would ship and ask for nothing. */
  test.each([[''], [{ name: '' }]])('refuses an entry of the face\'s own with an empty name', (entry) => {
    const call = () => permissionsFor([], [entry], 'my-face');

    expect(call).toThrow(/my-face's appinfo usesPermissions holds/);
  });

  /** A plugin id written as a number leaves the entry unreadable on the phone, so the permission it names is never granted. */
  test('refuses a plugin that is not text', () => {
    const call = () => permissionsFor([], [{ name: 'HomeControl', plugin: 5 }], 'my-face');

    expect(call).toThrow(/gives HomeControl the plugin 5/);
  });

  /** A site written as a bare string rather than a list leaves the entry unreadable on the phone, so the fetch it was for is blocked. */
  test('refuses parameters that are not lists of text', () => {
    const call = () => permissionsFor([], [{ name: 'Internet', parameters: { domains: 'example.com' } }], 'my-face');

    expect(call).toThrow(/my-face's appinfo usesPermissions gives Internet parameters/);
  });

  /** A single entry written without its list around it would otherwise be read letter by letter. */
  test('refuses a face\'s own usesPermissions that is not a list', () => {
    const call = () => permissionsFor([], 'Internet', 'my-face');

    expect(call).toThrow(/has to be a list/);
  });
});

describe('permissionsFor with a providers list', () => {
  const weatherKeys = ['WEATHER_REQUEST'];

  /** Every caller from before the list passes nothing for it, and those faces have to keep today's manifest. */
  test.each([
    [['WEATHER_REQUEST', 'STOCK_STRIP']],
    [['WEATHER_REQUEST', 'STOCK_STRIP', 'CALENDAR_STRIP', 'CLOCK_TIMEZONE_1']],
    [['STOCK_STRIP', 'LOCATION_NAME']],
    [['CALENDAR_STRIP', 'CALENDAR_SOURCE']],
  ])('gives %j the same list with no providers as with the argument left out', (keys) => {
    const result = permissionsFor(keys, undefined, 'face', { PLUGIN_CALENDAR: 1 }, {});

    expect(result).toEqual(permissionsFor(keys, undefined, 'face', { PLUGIN_CALENDAR: 1 }));
  });

  /** The manifest keeps the framework's order, so a face listing every provider gets today's bytes whatever order it lists them in. */
  test('gives a face listing every provider the same list as one listing none', () => {
    const keys = ['WEATHER_REQUEST', 'STOCK_STRIP'];
    const providers = { weather: ['weatherapi', 'owm', 'openmeteo'], stocks: ['yahoo', 'twelvedata', 'finnhub', 'alphavantage'] };

    const result = permissionsFor(keys, undefined, 'face', {}, providers);

    expect(result).toEqual(permissionsFor(keys, undefined, 'face'));
  });

  /** A face offering Open-Meteo alone should show the wearer one site on its install page, not three. */
  test('asks a face offering Open-Meteo alone for Location and its one site', () => {
    const result = permissionsFor(weatherKeys, undefined, 'face', {}, { weather: ['openmeteo'] });

    expect(result).toEqual(['Location', { name: 'Internet', parameters: { domains: ['open-meteo.com'] } }]);
  });

  /** OWM borrows readings from Open-Meteo, so a face offering it alone that left Open-Meteo out would lose its UV, dew point, and forecast. */
  test('asks a face offering OWM alone for Open-Meteo too, in the framework order', () => {
    const result = permissionsFor(weatherKeys, undefined, 'face', {}, { weather: ['owm'] });

    expect(result).toEqual(['Location', { name: 'Internet', parameters: { domains: ['open-meteo.com', 'openweathermap.org'] } }]);
  });

  /** The weather plugin needs the location and no site, so a plugin only face still showing the weather sites is the bug this catches. */
  test('asks a plugin only weather face for Location and no site', () => {
    const result = permissionsFor(weatherKeys, undefined, 'face', { PLUGIN_WEATHER: 1 }, { weather: ['plugin'] });

    expect(result).toEqual(['Location']);
  });

  /** A mixed list still fetches from its custom providers when the wearer picks one, so their sites stay. */
  test('asks a mixed weather face for its custom providers\' sites', () => {
    const result = permissionsFor(weatherKeys, undefined, 'face', { PLUGIN_WEATHER: 1 }, { weather: ['plugin', 'openmeteo'] });

    expect(result).toEqual(['Location', { name: 'Internet', parameters: { domains: ['open-meteo.com'] } }]);
  });

  /** A stock plugin fetches its own quotes, so a plugin only stock face still asking for the stock sites is the bug this catches. */
  test('asks a plugin only stock face for no Internet', () => {
    const result = permissionsFor(['STOCK_STRIP', 'STOCK_REQUEST'], undefined, 'face', { PLUGIN_STOCKS: 1 }, { stocks: ['plugin'] });

    expect(result).toEqual([]);
  });

  /** A mixed stock list still fetches from the providers it lists when the wearer picks one, so their sites stay. */
  test('asks a mixed stock face for the sites of the providers it lists alone', () => {
    const result = permissionsFor(['STOCK_STRIP', 'STOCK_REQUEST'], undefined, 'face', { PLUGIN_STOCKS: 1 }, { stocks: ['plugin', 'finnhub'] });

    expect(result).toEqual([{ name: 'Internet', parameters: { domains: ['finnhub.io'] } }]);
  });

  /** A plugin only calendar face still showing "Connect to any website" is the bug this catches. */
  test('asks a plugin only calendar face for Calendar and no Internet', () => {
    const keys = ['CALENDAR_STRIP'];

    const result = permissionsFor(keys, undefined, 'face', { PLUGIN_CALENDAR: 1 }, { calendar: ['plugin'] });

    expect(result).toEqual(['Calendar']);
  });

  /** The iCal link beside the plugin can still sit on any site, so the mixed calendar keeps the whole web. */
  test('asks a calendar offering the plugin and iCal for Calendar and any site', () => {
    const keys = ['CALENDAR_STRIP', 'CALENDAR_SOURCE'];

    const result = permissionsFor(keys, undefined, 'face', { PLUGIN_CALENDAR: 1 }, { calendar: ['plugin', 'ical'] });

    expect(result).toEqual(['Calendar', 'Internet']);
  });

  /** With its hosts listed the calendar asks for those alone, which is what takes "any website" off the install page. */
  test.each([
    ['beside a mixed calendar list', { calendar: ['plugin', 'ical'], calendarHosts: ['google.com', 'icloud.com'] }, { PLUGIN_CALENDAR: 1 }, ['Calendar']],
    ['with no calendar list', { calendarHosts: ['google.com', 'icloud.com'] }, {}, []],
  ])('asks for the calendar hosts in place of any site %s', (_name, providers, defines, names) => {
    const keys = ['CALENDAR_STRIP', 'CALENDAR_SOURCE'];

    const result = permissionsFor(keys, undefined, 'face', defines, providers);

    expect(result).toEqual([...names, { name: 'Internet', parameters: { domains: ['google.com', 'icloud.com'] } }]);
  });

  /** The hosts follow the other sites in the face's own order, and a host already listed goes on once. */
  test('puts the calendar hosts after the other sites, each once', () => {
    const keys = ['STOCK_STRIP', 'CALENDAR_STRIP', 'CLOCK_TIMEZONE_1'];
    const providers = { stocks: ['yahoo'], calendarHosts: ['icloud.com', 'yahoo.com', 'google.com'] };

    const result = permissionsFor(keys, undefined, 'face', {}, providers);

    expect(result).toEqual([{ name: 'Internet', parameters: { domains: ['yahoo.com', 'open-meteo.com', 'icloud.com', 'google.com'] } }]);
  });

  /** A face whose kinds all come from plugins reaches no site, so an Internet entry would only add a prompt the wearer never needed. */
  test('gives a face with only plugin only kinds and no picker no Internet entry', () => {
    const keys = ['WEATHER_REQUEST', 'CALENDAR_STRIP', 'MUSIC_REQUEST'];
    const defines = { PLUGIN_WEATHER: 1, PLUGIN_CALENDAR: 1, PLUGIN_MUSIC: 1 };
    const providers = { weather: ['plugin'], calendar: ['plugin'], music: ['plugin'] };

    const result = permissionsFor(keys, undefined, 'face', defines, providers);

    expect(result).toEqual(['Location', 'Calendar', 'ReadMusic']);
  });

  /** The page drops the location search with the other location rows when the weather comes from a plugin alone, so Open-Meteo would sit on the install page for a search that is not there. */
  test('leaves Open-Meteo out for a plugin only weather face whose one picker is the location search', () => {
    const keys = ['WEATHER_REQUEST', 'LOCATION_NAME'];

    const result = permissionsFor(keys, undefined, 'face', { PLUGIN_WEATHER: 1 }, { weather: ['plugin'] });

    expect(result).toEqual(['Location']);
  });

  /** The time zone picker stays on the page whatever the weather comes from, and it searches Open-Meteo from there. */
  test('keeps Open-Meteo for a plugin only weather face with a time zone picker', () => {
    const keys = ['WEATHER_REQUEST', 'LOCATION_NAME', 'CLOCK_TIMEZONE_1'];

    const result = permissionsFor(keys, undefined, 'face', { PLUGIN_WEATHER: 1 }, { weather: ['plugin'] });

    expect(result).toEqual(['Location', { name: 'Internet', parameters: { domains: ['open-meteo.com'] } }]);
  });

  /** Weather and stocks narrowed together still share the one Internet entry the phone reads. */
  test('puts narrowed weather and stock sites in one Internet entry', () => {
    const keys = ['WEATHER_REQUEST', 'STOCK_STRIP'];

    const result = permissionsFor(keys, undefined, 'face', {}, { weather: ['openmeteo'], stocks: ['yahoo'] });

    expect(result).toEqual(['Location', { name: 'Internet', parameters: { domains: ['open-meteo.com', 'yahoo.com'] } }]);
  });

  /** Each kind narrows on its own, so one face mixing its weather, taking its calendar from a plugin, and offering Yahoo asks for each kind's own part. */
  test('asks the mixed face with a plugin only calendar for Location, Calendar, and two sites', () => {
    const keys = ['WEATHER_REQUEST', 'WEATHER_PROVIDER', 'STOCK_STRIP', 'CALENDAR_STRIP'];
    const providers = { weather: ['plugin', 'openmeteo'], calendar: ['plugin'], stocks: ['yahoo'] };

    const result = permissionsFor(keys, undefined, 'face', { PLUGIN_WEATHER: 1, PLUGIN_CALENDAR: 1 }, providers);

    expect(result).toEqual(['Location', 'Calendar', { name: 'Internet', parameters: { domains: ['open-meteo.com', 'yahoo.com'] } }]);
  });

  /** A face's own fetches still need their site on a narrowed face, and a site the providers already list goes on once. */
  test('adds a face\'s own sites to a narrowed entry, each once', () => {
    const own = [{ name: 'Internet', parameters: { domains: ['example.com', 'yahoo.com'] } }];

    const result = permissionsFor(['STOCK_STRIP'], own, 'face', {}, { stocks: ['yahoo'] });

    expect(result).toEqual([{ name: 'Internet', parameters: { domains: ['yahoo.com', 'example.com'] } }]);
  });

  /** A face that opens every site itself would get nothing from its hosts, so it has to pick one or the other. */
  test.each([
    ['a bare Internet', ['Internet']],
    ['an Internet with no sites', [{ name: 'Internet', parameters: { domains: [] } }]],
  ])('refuses calendarHosts beside %s of the face\'s own', (_name, own) => {
    const call = () => permissionsFor(['CALENDAR_STRIP'], own, 'my-face', {}, { calendarHosts: ['google.com'] });

    expect(call).toThrow("my-face's appinfo lists providers.calendarHosts while its own usesPermissions opens Internet to any site");
  });
});

describe('permissionWarnings', () => {
  /** A face's own location search with no mark stays on a plugin only page with its site gone, so the developer has to hear of it. */
  test('warns a plugin only weather face that declares LOCATION_NAME', () => {
    const result = permissionWarnings(['WEATHER_REQUEST', 'LOCATION_NAME'], 'my-face', { weather: ['plugin'] });

    expect(result).toEqual(["my-face's appinfo lists providers.weather as [\"plugin\"] and declares LOCATION_NAME, so its usesPermissions leaves out open-meteo.com. A location search on its settings page that is not marked pluginSourceHides: 'WEATHER_PROVIDER' stays on the page and finds nothing. Mark it so the page drops it, or list open-meteo.com in the face's own usesPermissions"]);
  });

  /** Every other face keeps open-meteo.com for its location search, so a warning there would be noise. */
  test.each([
    ['a mixed weather list', ['WEATHER_REQUEST', 'WEATHER_PROVIDER', 'LOCATION_NAME'], { weather: ['plugin', 'openmeteo'] }],
    ['no weather list', ['WEATHER_REQUEST', 'LOCATION_NAME'], {}],
    ['a plugin only list without LOCATION_NAME', ['WEATHER_REQUEST'], { weather: ['plugin'] }],
  ])('says nothing for %s', (_name, keys, providers) => {
    const result = permissionWarnings(keys, 'my-face', providers);

    expect(result).toEqual([]);
  });
});

describe('the site lists', () => {
  /** A provider moved to a new host that the list does not cover fails every fetch to it once the wearer has plugins on. */
  test.each([
    ['weather', WEATHER_DOMAINS],
    ['stock', STOCK_DOMAINS],
  ])('cover every host a %s provider calls', (folder, domains) => {
    const result = hostsCalledIn(folder).filter((host) => !covers(domains, host));

    expect(result).toEqual([]);
  });

  /** A picker moved to a host the list does not cover finds nothing on Android once the wearer has plugins on. */
  test('cover every host the settings page calls', () => {
    const result = hostsCalledIn('clay').filter((host) => !covers(PICKER_DOMAINS, host));

    expect(result).toEqual([]);
  });

  /** A site the pickers never call still shows on the install prompt of every face with a picker. */
  test('name only sites the settings page calls', () => {
    const hosts = hostsCalledIn('clay');

    const result = PICKER_DOMAINS.filter((domain) => !hosts.some((host) => covers([domain], host)));

    expect(result).toEqual([]);
  });

  /** A site no provider calls still shows on the wearer's install prompt as somewhere the face connects to. */
  test.each([
    ['weather', WEATHER_DOMAINS],
    ['stock', STOCK_DOMAINS],
  ])('name only sites a %s provider calls', (folder, domains) => {
    const hosts = hostsCalledIn(folder);

    const result = domains.filter((domain) => !hosts.some((host) => covers([domain], host)));

    expect(result).toEqual([]);
  });
});
