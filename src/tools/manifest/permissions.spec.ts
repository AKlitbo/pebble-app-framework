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
import type { Permission } from './permissions';

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

// the entries the build writes, as the store listing and the phone read them
const LOCATION = { name: 'Location', reason: 'To show the weather where you are', required: false };
const CALENDAR = { name: 'Calendar', reason: "To show events from your phone's calendars", required: false };
const READ_MUSIC = { name: 'ReadMusic', reason: "To show what's playing on your phone", required: false };
const ICAL_ANY_SITE = { name: 'Internet', reason: 'To fetch your iCal calendar link', required: false };
const WEATHER_REASON = 'To get the weather';
const STOCK_REASON = 'To get your stock quotes';
const PICKER_REASON = 'To search for places in settings';
const ICAL_REASON = 'To fetch your iCal calendar link';

/** A generated Internet entry for these sites. */
function sitesEntry(domains: string[], reason: string) {
  return { name: 'Internet', parameters: { domains }, reason, required: false };
}

/** An entry's name, whichever way it is written. */
function nameOf(entry: Permission): string {
  return typeof entry === 'string' ? entry : entry.name;
}

describe('permissionsFor', () => {
  /** A weather face needs both, or wearers with plugins on get No GPS and Net Error. */
  test('asks a weather face for location and the weather sites', () => {
    const keys = ['WEATHER_REQUEST', 'WEATHER_TEMPERATURE'];

    const result = permissionsFor(keys, undefined, 'face');

    expect(result).toEqual([LOCATION, sitesEntry(['open-meteo.com', 'openweathermap.org', 'weatherapi.com'], WEATHER_REASON)]);
  });

  /**
   * GPS can be on from a default in the settings page without the face declaring LOCATION_USE_GPS, and
   * a lookup the list leaves out is turned away, so a weather face asks for location either way.
   */
  test('asks for location without the GPS switch key', () => {
    const keys = ['WEATHER_REQUEST'];

    const result = permissionsFor(keys, undefined, 'face');

    expect(result).toContainEqual(LOCATION);
  });

  /**
   * Installing asks about every entry when none says required, and waits on any that does, so one
   * generated entry without `required: false` holds the face's weather behind a prompt at install. One
   * without a reason shows on the store listing as a bare line.
   */
  test('marks every generated entry optional with a reason', () => {
    const keys = ['WEATHER_REQUEST', 'STOCK_STRIP', 'CALENDAR_STRIP', 'CALENDAR_SOURCE', 'CLOCK_TIMEZONE_1', 'MUSIC_REQUEST'];

    const result = permissionsFor(keys, undefined, 'face', { PLUGIN_CALENDAR: 1, PLUGIN_MUSIC: 1 }).filter((entry) => typeof entry === 'string' || entry.required !== false || !entry.reason);

    expect(result).toEqual([]);
  });

  /** One entry's reason covers every site in it, so stock sites under the weather's reason would tell the wearer the wrong thing. */
  test('gives the weather and the stock sites an entry each', () => {
    const keys = ['WEATHER_REQUEST', 'STOCK_STRIP'];

    const result = permissionsFor(keys, undefined, 'face');

    expect(result).toEqual([LOCATION, sitesEntry(WEATHER_DOMAINS, WEATHER_REASON), sitesEntry(STOCK_DOMAINS, STOCK_REASON)]);
  });

  /**
   * A calendar feed can be on any site, so a list of sites would block every feed the wearer pastes
   * in. The per-site entries stay beside it, so the listing still says what each named site is for.
   */
  test('puts the whole web for a calendar beside the per-site entries', () => {
    const keys = ['WEATHER_REQUEST', 'STOCK_STRIP', 'CALENDAR_STRIP'];

    const result = permissionsFor(keys, undefined, 'face');

    expect(result).toEqual([LOCATION, sitesEntry(WEATHER_DOMAINS, WEATHER_REASON), sitesEntry(STOCK_DOMAINS, STOCK_REASON), ICAL_ANY_SITE]);
  });

  /** A key declared as an array, such as STOCK_STRIP[2], is the same key and still switches the feature on. */
  test('reads a key with an array suffix as the key itself', () => {
    const keys = ['STOCK_STRIP[2]'];

    const result = permissionsFor(keys, undefined, 'face');

    expect(result).toEqual([sitesEntry(STOCK_DOMAINS, STOCK_REASON)]);
  });

  /**
   * The pickers search Open-Meteo from inside the settings page, which the Pebble app holds to the
   * listed sites on Android. A face with a picker and no weather whose search finds nothing is the
   * bug this catches.
   */
  test.each([['CLOCK_TIMEZONE_1'], ['CLOCK_TIMEZONE_2'], ['LOCATION_NAME']])('asks a face with %s alone for Open-Meteo', (key) => {
    const keys = [key];

    const result = permissionsFor(keys, undefined, 'face');

    expect(result).toEqual([sitesEntry(['open-meteo.com'], PICKER_REASON)]);
  });

  /** The weather entry lists Open-Meteo already, so the picker's purpose joins its reason rather than the site going on twice. */
  test('lists Open-Meteo once for a weather face with the location picker, with both purposes', () => {
    const keys = ['WEATHER_REQUEST', 'LOCATION_NAME'];

    const result = permissionsFor(keys, undefined, 'face');

    expect(result).toEqual([LOCATION, sitesEntry(['open-meteo.com', 'openweathermap.org', 'weatherapi.com'], 'To get the weather and search for places')]);
  });

  /** With no weather, Open-Meteo is the picker's alone, so the time zone search on a stock face needs an entry of its own. */
  test('gives a stock face\'s time zone picker an entry of its own after the stock sites', () => {
    const keys = ['STOCK_STRIP', 'CLOCK_TIMEZONE_1'];

    const result = permissionsFor(keys, undefined, 'face');

    expect(result).toEqual([sitesEntry(STOCK_DOMAINS, STOCK_REASON), sitesEntry(['open-meteo.com'], PICKER_REASON)]);
  });

  /** The picker's entry says what Open-Meteo is for, which the calendar's any site does not. */
  test('keeps the picker\'s entry beside a calendar face\'s any site', () => {
    const keys = ['CALENDAR_STRIP', 'CLOCK_TIMEZONE_1'];

    const result = permissionsFor(keys, undefined, 'face');

    expect(result).toEqual([sitesEntry(['open-meteo.com'], PICKER_REASON), ICAL_ANY_SITE]);
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

    expect(result).toEqual([CALENDAR, ICAL_ANY_SITE]);
  });

  /** The wearer is asked to allow the calendar, so a face that offers no phone calendars must never put that question to them. */
  test.each([
    ['without the define', {}],
    ['with the define at 0', { PLUGIN_CALENDAR: 0 }],
    ['with only PLUGIN_WEATHER', { PLUGIN_WEATHER: 1 }],
  ])('leaves the calendar off a calendar face %s', (_name, defines) => {
    const keys = ['CALENDAR_STRIP', 'CALENDAR_SOURCE'];

    const result = permissionsFor(keys, undefined, 'face', defines);

    expect(result).toEqual([ICAL_ANY_SITE]);
  });

  /**
   * The Pebble app's music plugin asks callers for ReadMusic, so a face that never lists it is refused
   * and its now playing panel stays empty. Listed, the wearer reviews it at install.
   */
  test('asks a face built with PLUGIN_MUSIC for ReadMusic', () => {
    const keys = ['MUSIC_TITLE', 'MUSIC_ARTIST', 'MUSIC_PLAYING', 'MUSIC_REQUEST'];

    const result = permissionsFor(keys, undefined, 'face', { PLUGIN_MUSIC: 1 });

    expect(result).toEqual([READ_MUSIC]);
  });

  /** The wearer is asked about their music, so a face that shows none must never put that question to them. */
  test.each([
    ['without the define', {}],
    ['with the define at 0', { PLUGIN_MUSIC: 0 }],
    ['with only PLUGIN_PHONE', { PLUGIN_PHONE: 1 }],
  ])('leaves ReadMusic off a face %s', (_name, defines) => {
    const keys = ['WEATHER_REQUEST'];

    const result = permissionsFor(keys, undefined, 'face', defines).map(nameOf);

    expect(result).not.toContain('ReadMusic');
  });

  /** The Phone plugin asks for nothing, so a phone battery face lists nothing, and the wearer is never asked. */
  test('adds nothing for PLUGIN_PHONE', () => {
    const keys = ['PHONE_BATTERY', 'PHONE_REQUEST'];

    const result = permissionsFor(keys, undefined, 'face', { PLUGIN_PHONE: 1 });

    expect(result).toEqual([]);
  });

  /**
   * A face that fetches from a site of its own has to be able to list it, or that fetch fails for every
   * wearer with plugins on. In the weather's entry it would read as fetching the weather.
   */
  test('puts a face\'s own sites in an entry of their own after the generated ones', () => {
    const keys = ['WEATHER_REQUEST'];
    const own = [{ name: 'Internet', parameters: { domains: ['example.com'] } }];

    const result = permissionsFor(keys, own, 'face');

    expect(result).toEqual([LOCATION, sitesEntry(WEATHER_DOMAINS, WEATHER_REASON), { name: 'Internet', parameters: { domains: ['example.com'] } }]);
  });

  /** A site in two entries puts two reasons on one line of the listing, so the face's own entry leaves out what the providers list. */
  test('leaves a site the generated entries list out of the face\'s own, and lists the rest once', () => {
    const keys = ['WEATHER_REQUEST'];
    const own = [{ name: 'Internet', parameters: { domains: ['open-meteo.com', 'example.com'] } }, { name: 'Internet', parameters: { domains: ['example.com', 'tides.example.org'] } }];

    const result = permissionsFor(keys, own, 'face');

    expect(result).toEqual([LOCATION, sitesEntry(WEATHER_DOMAINS, WEATHER_REASON), { name: 'Internet', parameters: { domains: ['example.com', 'tides.example.org'] } }]);
  });

  /** A bare Internet of the face's own still opens every site, and the stock sites keep their entry so the listing says what they are for. */
  test('keeps the per-site entries beside a bare Internet of the face\'s own', () => {
    const keys = ['STOCK_STRIP'];

    const result = permissionsFor(keys, ['Internet'], 'face');

    expect(result).toEqual([sitesEntry(STOCK_DOMAINS, STOCK_REASON), 'Internet']);
  });

  /** Two entries for any site would put the same question to the wearer twice, so the calendar's stands for the face's bare one. */
  test('writes one any site entry for a calendar face with a bare Internet of its own', () => {
    const keys = ['CALENDAR_STRIP'];

    const result = permissionsFor(keys, ['Internet'], 'face');

    expect(result).toEqual([ICAL_ANY_SITE]);
  });

  /** The face's own site is a different purpose from the calendar's feeds, so it keeps its own entry beside any site. */
  test('keeps a face\'s own sites beside a calendar face\'s any site', () => {
    const keys = ['CALENDAR_STRIP'];
    const own = [{ name: 'Internet', parameters: { domains: ['example.com'] } }];

    const result = permissionsFor(keys, own, 'face');

    expect(result).toEqual([ICAL_ANY_SITE, { name: 'Internet', parameters: { domains: ['example.com'] } }]);
  });

  /** Location written as an object is the same permission, and listing it twice puts it on the install prompt twice. */
  test('does not add a name the list already has, whichever way it is written', () => {
    const keys = ['WEATHER_REQUEST'];
    const own = [{ name: 'Location' }, 'Location', 'Calendar'];

    const result = permissionsFor(keys, own, 'face');

    expect(result).toEqual([LOCATION, 'Calendar', sitesEntry(WEATHER_DOMAINS, WEATHER_REASON)]);
  });

  /** The reason and required flag are the face's word to the wearer, so rewriting them would change what the listing and the install ask. */
  test('keeps a face\'s own entry with a reason as written, after the rest', () => {
    const keys = ['WEATHER_REQUEST'];
    const own = [{ name: 'Internet', parameters: { domains: ['example.com'] }, reason: 'To show the tides', required: true }];

    const result = permissionsFor(keys, own, 'face');

    expect(result).toEqual([LOCATION, sitesEntry(WEATHER_DOMAINS, WEATHER_REASON), own[0]]);
  });

  /** A face marking one of the providers' sites required has to win, or the site sits in two entries with two answers to required. */
  test('lets a face\'s own marked site take the place of the generated one', () => {
    const own = [{ name: 'Internet', parameters: { domains: ['yahoo.com'] }, reason: 'To get quotes from Yahoo', required: true }];

    const result = permissionsFor(['STOCK_STRIP'], own, 'face', {}, { stocks: ['yahoo', 'finnhub'] });

    expect(result).toEqual([sitesEntry(['finnhub.io'], STOCK_REASON), own[0]]);
  });

  /** A face making Location required writes its own, and a second Location beside it would ask the wearer twice with two answers. */
  test('lets a face\'s own marked Location take the place of the generated one', () => {
    const own = [{ name: 'Location', reason: 'To show the sunrise where you are', required: true }];

    const result = permissionsFor(['WEATHER_REQUEST'], own, 'face');

    expect(result).toEqual([sitesEntry(WEATHER_DOMAINS, WEATHER_REASON), own[0]]);
  });

  /** A marked any site of the face's own already reaches every feed, so the calendar's beside it would ask the same question twice. */
  test('lets a face\'s own marked any site stand for the calendar\'s', () => {
    const own = [{ name: 'Internet', reason: 'To reach your feeds', required: false }];

    const result = permissionsFor(['CALENDAR_STRIP'], own, 'face');

    expect(result).toEqual([own[0]]);
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

  /** The phone shows the reason as text and reads required as yes or no, so anything else leaves the listing and the install guessing. */
  test.each([
    ['a reason that is not text', { name: 'Location', reason: 5 }, /gives Location the reason 5, which has to be text/],
    ['a required that is not true or false', { name: 'Location', required: 'yes' }, /gives Location required "yes", which has to be true or false/],
  ])('refuses %s', (_name, entry, message) => {
    const call = () => permissionsFor([], [entry], 'my-face');

    expect(call).toThrow(message);
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

    expect(result).toEqual([LOCATION, sitesEntry(['open-meteo.com'], WEATHER_REASON)]);
  });

  /** OWM borrows readings from Open-Meteo, so a face offering it alone that left Open-Meteo out would lose its UV, dew point, and forecast. */
  test('asks a face offering OWM alone for Open-Meteo too, in the framework order', () => {
    const result = permissionsFor(weatherKeys, undefined, 'face', {}, { weather: ['owm'] });

    expect(result).toEqual([LOCATION, sitesEntry(['open-meteo.com', 'openweathermap.org'], WEATHER_REASON)]);
  });

  /** The weather plugin needs the location and no site, so a plugin only face still showing the weather sites is the bug this catches. */
  test('asks a plugin only weather face for Location and no site', () => {
    const result = permissionsFor(weatherKeys, undefined, 'face', { PLUGIN_WEATHER: 1 }, { weather: ['plugin'] });

    expect(result).toEqual([LOCATION]);
  });

  /** A mixed list still fetches from its custom providers when the wearer picks one, so their sites stay. */
  test('asks a mixed weather face for its custom providers\' sites', () => {
    const result = permissionsFor(weatherKeys, undefined, 'face', { PLUGIN_WEATHER: 1 }, { weather: ['plugin', 'openmeteo'] });

    expect(result).toEqual([LOCATION, sitesEntry(['open-meteo.com'], WEATHER_REASON)]);
  });

  /** A stock plugin fetches its own quotes, so a plugin only stock face still asking for the stock sites is the bug this catches. */
  test('asks a plugin only stock face for no Internet', () => {
    const result = permissionsFor(['STOCK_STRIP', 'STOCK_REQUEST'], undefined, 'face', { PLUGIN_STOCKS: 1 }, { stocks: ['plugin'] });

    expect(result).toEqual([]);
  });

  /** A mixed stock list still fetches from the providers it lists when the wearer picks one, so their sites stay. */
  test('asks a mixed stock face for the sites of the providers it lists alone', () => {
    const result = permissionsFor(['STOCK_STRIP', 'STOCK_REQUEST'], undefined, 'face', { PLUGIN_STOCKS: 1 }, { stocks: ['plugin', 'finnhub'] });

    expect(result).toEqual([sitesEntry(['finnhub.io'], STOCK_REASON)]);
  });

  /** A plugin only calendar face still showing "Connect to any website" is the bug this catches. */
  test('asks a plugin only calendar face for Calendar and no Internet', () => {
    const keys = ['CALENDAR_STRIP'];

    const result = permissionsFor(keys, undefined, 'face', { PLUGIN_CALENDAR: 1 }, { calendar: ['plugin'] });

    expect(result).toEqual([CALENDAR]);
  });

  /** The iCal link beside the plugin can still sit on any site, so the mixed calendar keeps the whole web. */
  test('asks a calendar offering the plugin and iCal for Calendar and any site', () => {
    const keys = ['CALENDAR_STRIP', 'CALENDAR_SOURCE'];

    const result = permissionsFor(keys, undefined, 'face', { PLUGIN_CALENDAR: 1 }, { calendar: ['plugin', 'ical'] });

    expect(result).toEqual([CALENDAR, ICAL_ANY_SITE]);
  });

  /** With its hosts listed the calendar asks for those alone, which is what takes "any website" off the install page. */
  test.each([
    ['beside a mixed calendar list', { calendar: ['plugin', 'ical'], calendarHosts: ['google.com', 'icloud.com'] }, { PLUGIN_CALENDAR: 1 }, [CALENDAR]],
    ['with no calendar list', { calendarHosts: ['google.com', 'icloud.com'] }, {}, []],
  ])('asks for the calendar hosts in place of any site %s', (_name, providers, defines, named) => {
    const keys = ['CALENDAR_STRIP', 'CALENDAR_SOURCE'];

    const result = permissionsFor(keys, undefined, 'face', defines, providers);

    expect(result).toEqual([...named, sitesEntry(['google.com', 'icloud.com'], ICAL_REASON)]);
  });

  /**
   * A host the stocks already list stays in the stock entry, and that entry's reason names the calendar
   * too, so the wearer reads each site once with everything it is for. The rest follow in the face's
   * own order.
   */
  test('puts each calendar host in one entry, and names the calendar on a shared one', () => {
    const keys = ['STOCK_STRIP', 'CALENDAR_STRIP', 'CLOCK_TIMEZONE_1'];
    const providers = { stocks: ['yahoo'], calendarHosts: ['icloud.com', 'yahoo.com', 'google.com'] };

    const result = permissionsFor(keys, undefined, 'face', {}, providers);

    expect(result).toEqual([
      sitesEntry(['yahoo.com'], 'To get your stock quotes and fetch your iCal calendar link'),
      sitesEntry(['open-meteo.com'], PICKER_REASON),
      sitesEntry(['icloud.com', 'google.com'], ICAL_REASON),
    ]);
  });

  /** A site serving three features names all three in one sentence, which is what the wearer reads on its one line. */
  test('names every purpose of a site three features share', () => {
    const keys = ['WEATHER_REQUEST', 'CALENDAR_STRIP', 'LOCATION_NAME'];
    const providers = { weather: ['openmeteo'], calendarHosts: ['open-meteo.com'] };

    const result = permissionsFor(keys, undefined, 'face', {}, providers);

    expect(result).toEqual([LOCATION, sitesEntry(['open-meteo.com'], 'To get the weather, search for places, and fetch your iCal calendar link')]);
  });

  /** A face whose kinds all come from plugins reaches no site, so an Internet entry would only add a prompt the wearer never needed. */
  test('gives a face with only plugin only kinds and no picker no Internet entry', () => {
    const keys = ['WEATHER_REQUEST', 'CALENDAR_STRIP', 'MUSIC_REQUEST'];
    const defines = { PLUGIN_WEATHER: 1, PLUGIN_CALENDAR: 1, PLUGIN_MUSIC: 1 };
    const providers = { weather: ['plugin'], calendar: ['plugin'], music: ['plugin'] };

    const result = permissionsFor(keys, undefined, 'face', defines, providers);

    expect(result).toEqual([LOCATION, CALENDAR, READ_MUSIC]);
  });

  /** The page drops the location search with the other location rows when the weather comes from a plugin alone, so Open-Meteo would sit on the install page for a search that is not there. */
  test('leaves Open-Meteo out for a plugin only weather face whose one picker is the location search', () => {
    const keys = ['WEATHER_REQUEST', 'LOCATION_NAME'];

    const result = permissionsFor(keys, undefined, 'face', { PLUGIN_WEATHER: 1 }, { weather: ['plugin'] });

    expect(result).toEqual([LOCATION]);
  });

  /** The time zone picker stays on the page whatever the weather comes from, and it searches Open-Meteo from there, so the site is the picker's alone. */
  test('keeps Open-Meteo for a plugin only weather face with a time zone picker', () => {
    const keys = ['WEATHER_REQUEST', 'LOCATION_NAME', 'CLOCK_TIMEZONE_1'];

    const result = permissionsFor(keys, undefined, 'face', { PLUGIN_WEATHER: 1 }, { weather: ['plugin'] });

    expect(result).toEqual([LOCATION, sitesEntry(['open-meteo.com'], PICKER_REASON)]);
  });

  /** Narrowing cuts each kind's entry down on its own, and neither borrows the other's reason. */
  test('gives narrowed weather and stock sites an entry each', () => {
    const keys = ['WEATHER_REQUEST', 'STOCK_STRIP'];

    const result = permissionsFor(keys, undefined, 'face', {}, { weather: ['openmeteo'], stocks: ['yahoo'] });

    expect(result).toEqual([LOCATION, sitesEntry(['open-meteo.com'], WEATHER_REASON), sitesEntry(['yahoo.com'], STOCK_REASON)]);
  });

  /** Each kind narrows on its own, so one face mixing its weather, taking its calendar from a plugin, and offering Yahoo asks for each kind's own part. */
  test('asks the mixed face with a plugin only calendar for Location, Calendar, and two sites', () => {
    const keys = ['WEATHER_REQUEST', 'WEATHER_PROVIDER', 'STOCK_STRIP', 'CALENDAR_STRIP'];
    const providers = { weather: ['plugin', 'openmeteo'], calendar: ['plugin'], stocks: ['yahoo'] };

    const result = permissionsFor(keys, undefined, 'face', { PLUGIN_WEATHER: 1, PLUGIN_CALENDAR: 1 }, providers);

    expect(result).toEqual([LOCATION, CALENDAR, sitesEntry(['open-meteo.com'], WEATHER_REASON), sitesEntry(['yahoo.com'], STOCK_REASON)]);
  });

  /** A face's own fetches still need their site on a narrowed face, and a site the providers already list goes on once. */
  test('leaves a site a narrowed entry lists out of the face\'s own', () => {
    const own = [{ name: 'Internet', parameters: { domains: ['example.com', 'yahoo.com'] } }];

    const result = permissionsFor(['STOCK_STRIP'], own, 'face', {}, { stocks: ['yahoo'] });

    expect(result).toEqual([sitesEntry(['yahoo.com'], STOCK_REASON), { name: 'Internet', parameters: { domains: ['example.com'] } }]);
  });

  /** A face that opens every site itself would get nothing from its hosts, so it has to pick one or the other. */
  test.each([
    ['a bare Internet', ['Internet']],
    ['an Internet with no sites', [{ name: 'Internet', parameters: { domains: [] } }]],
    ['a marked Internet with no sites', [{ name: 'Internet', reason: 'To reach your feeds', required: false }]],
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
