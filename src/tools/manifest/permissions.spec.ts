/**
 * Specs for the usesPermissions list a face's manifest carries.
 *
 * Once the SDK builds manifestVersion 2, the Pebble app holds a face's phone-side script to this list
 * whenever the wearer has plugins on. A site missing from it fails every fetch to that site at once,
 * and a missing Location turns the GPS lookup away. Nothing in the build or on the phone says which
 * site was left out, so the list each feature asks for is pinned here, along with a check that every
 * host a provider calls is one the list covers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { STOCK_DOMAINS, WEATHER_DOMAINS, permissionsFor } from './permissions';

const TS = path.join(import.meta.dirname, '..', '..', 'ts');

/** Every host a feature folder's sources call, providers and all, read off the URLs written in them. */
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

  /** A face with no phone-side fetches gets an empty list, which the manifest then leaves out. */
  test('asks for nothing when no feature key is declared', () => {
    const keys = ['SETTINGS_REQUEST', 'APPEARANCE_THEME'];

    const result = permissionsFor(keys, undefined, 'face');

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

describe('the site lists', () => {
  /** A provider moved to a new host that the list does not cover fails every fetch to it once the wearer has plugins on. */
  test.each([
    ['weather', WEATHER_DOMAINS],
    ['stock', STOCK_DOMAINS],
  ])('cover every host a %s provider calls', (folder, domains) => {
    const result = hostsCalledIn(folder).filter((host) => !covers(domains, host));

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
