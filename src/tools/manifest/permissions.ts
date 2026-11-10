/**
 * The permissions a face's phone-side script asks for, worked out from its message keys.
 *
 * A pbw built as manifestVersion 2 gets only the sites and phone features its appinfo lists in
 * usesPermissions, once the wearer turns plugins on in the Pebble app. A request to a site it never
 * listed fails at once, and a location lookup it never listed is turned away. The list follows the
 * features a face's keys switch on, narrowed by the providers it lists, so a face never names a
 * provider's site by hand.
 */
import { ToolError } from '../shared/tool-error.ts';
import { keyNames } from './message-keys.ts';
import { pluginKindsOn } from './plugin-kinds.ts';
import { FEATURE_KEYS, providerMode, providersOffered } from './providers.ts';
import type { ProviderKind, ProviderLists } from './providers.ts';

/** One usesPermissions entry, as the Pebble app reads it: a bare name, or a name with its arguments. */
export type Permission = string | { name: string; parameters?: Record<string, string[]>; plugin?: string };

// each domain covers its subdomains on the phone, so open-meteo.com takes in api.open-meteo.com
// OpenWeatherMap and WeatherAPI borrow the readings they lack from Open-Meteo, so every weather face lists it
export const WEATHER_DOMAINS = ['open-meteo.com', 'openweathermap.org', 'weatherapi.com'];
export const STOCK_DOMAINS = ['alphavantage.co', 'finnhub.io', 'twelvedata.com', 'yahoo.com'];

/**
 * The sites the settings page itself reaches. The location and time zone pickers search Open-Meteo
 * from inside the page, and on Android the Pebble app holds that page to the face's listed sites, so
 * a face with either picker lists it whether or not it fetches weather.
 */
export const PICKER_DOMAINS = ['open-meteo.com'];

/**
 * True for a key whose row is a location or time zone picker. The framework builds its location
 * picker under `LOCATION_NAME` and its time zone picker under `CLOCK_TIMEZONE_1`. The numbered
 * pattern also covers any further time zone pickers a face builds itself, such as `CLOCK_TIMEZONE_2`.
 *
 * @param key A message key name, without its array suffix.
 * @return Whether a face declaring it has a picker that searches Open-Meteo.
 */
export function isPickerKey(key: string): boolean {
  return key === 'LOCATION_NAME' || /^CLOCK_TIMEZONE_[0-9]+$/.test(key);
}

/**
 * A framework site list cut down to the sites a kind's listed providers call. It keeps the framework
 * list's order rather than the face's, so the order a face lists its providers in never changes the
 * manifest, and a face listing every provider gets the same list as one listing none.
 */
function narrowed(all: string[], kind: ProviderKind, list: string[] | undefined): string[] {
  if (list === undefined) {
    return all;
  }

  const sites = new Set(providersOffered(kind, list).flatMap((provider) => provider.sites));

  return all.filter((site) => sites.has(site));
}

/** A face's own usesPermissions entries, checked so each one reads the way the Pebble app expects. */
function readOwn(declared: unknown, face: string): Permission[] {
  if (declared === undefined) {
    return [];
  }

  if (!Array.isArray(declared)) {
    throw new ToolError(`${face}'s appinfo usesPermissions has to be a list`);
  }

  for (const entry of declared) {
    const name = typeof entry === 'string' ? entry : typeof entry === 'object' && entry !== null ? entry.name : undefined;
    const named = typeof name === 'string' && name.length > 0;

    if (!named) {
      throw new ToolError(`${face}'s appinfo usesPermissions holds ${JSON.stringify(entry)}, which is neither a name nor an object with one`);
    }

    // the phone reads each parameter as a list of text, so a bare string such as "domains": "example.com"
    // would leave the whole entry unreadable there and the fetch it was for blocked
    if (typeof entry === 'object' && entry.parameters !== undefined && !isParameters(entry.parameters)) {
      throw new ToolError(`${face}'s appinfo usesPermissions gives ${entry.name} parameters ${JSON.stringify(entry.parameters)}, which has to map each name to a list of text`);
    }

    // the phone reads plugin as the id of the plugin that defines the permission, which is text
    if (typeof entry === 'object' && entry.plugin !== undefined && typeof entry.plugin !== 'string') {
      throw new ToolError(`${face}'s appinfo usesPermissions gives ${entry.name} the plugin ${JSON.stringify(entry.plugin)}, which has to be the plugin's id as text`);
    }
  }

  return declared;
}

/** True for a parameters object the phone can read, each name mapped to a list of text. */
function isParameters(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((list) => Array.isArray(list) && list.every((item) => typeof item === 'string'));
}

/**
 * The usesPermissions list for a face, from the features its message keys switch on plus any the
 * face lists itself.
 *
 * Weather asks for location and the sites of the providers it offers, which is every one unless the
 * face's providers list names fewer, and none when the weather comes from a plugin alone. Stocks ask
 * for theirs the same way. A face with the location or time zone picker asks for Open-Meteo, which the
 * picker searches from inside the settings page. The location picker is left out of that when the
 * weather comes from a plugin alone, since the page then drops it with the other location rows. A
 * calendar offering its iCal link asks for the hosts
 * the face lists in `calendarHosts`, after the other sites and in the face's own order, or for the
 * whole web without them, since a feed can sit on any site. A calendar from a plugin alone asks for no
 * site. A face built with `PLUGIN_CALENDAR` also asks for the calendar, which the calendar plugins
 * need, and one built with `PLUGIN_MUSIC` asks for `ReadMusic`, which the Pebble app's music plugin
 * needs. The face's own entries join these. Its sites go into the one Internet entry, a bare Internet
 * of its own opens it to every site, and a name already on the list is not added twice.
 *
 * @param messageKeys The face's message keys, as its appinfo declares them.
 * @param declared The face's own usesPermissions from its appinfo, if it has any.
 * @param face The face the appinfo belongs to, which a mistake in it names.
 * @param defines The face's defines, from readDefines. Left out, the face sets none.
 * @param providers The face's providers list, from readProviders. Left out, the face lists none.
 * @return The entries in the order they go into the manifest, empty when the face needs none.
 */
export function permissionsFor(messageKeys: unknown, declared: unknown, face: string, defines: Record<string, number> = {}, providers: ProviderLists = {}): Permission[] {
  const keys = keyNames(messageKeys);
  const weather = keys.has(FEATURE_KEYS.weather);
  const names = new Set<string>();
  // the build cannot see the settings page, since the phone builds it, so it goes by the keys a picker
  // saves under. a page that puts a locationsearch under any other key gets no site from here, and
  // the face lists open-meteo.com in its own usesPermissions, as the docs say. a plugin only weather
  // list takes the marked location rows off the page, the location search with them, so LOCATION_NAME
  // counts for every other list. a face that keeps a location search of its own with no mark lists
  // the site itself. a time zone picker stays on the page whatever the weather comes from
  const noLocationSearch = providerMode(providers.weather) === 'plugin';
  const picker = [...keys].some((key) => isPickerKey(key) && !(noLocationSearch && key === 'LOCATION_NAME'));
  const ical = keys.has(FEATURE_KEYS.calendar) && providersOffered('calendar', providers.calendar).some((provider) => provider.anySite);
  const hosts = ical ? providers.calendarHosts ?? [] : [];
  const domains = new Set([
    ...(weather ? narrowed(WEATHER_DOMAINS, 'weather', providers.weather) : []),
    ...(keys.has(FEATURE_KEYS.stocks) ? narrowed(STOCK_DOMAINS, 'stocks', providers.stocks) : []),
    ...(picker ? PICKER_DOMAINS : []),
    ...hosts,
  ]);
  const others: Permission[] = [];
  let anySite = ical && providers.calendarHosts === undefined;

  // whether GPS is used comes from the saved setting and its default, which the build cannot read,
  // so every weather face lists it. the phone only asks the wearer once a lookup actually happens
  if (weather) {
    names.add('Location');
  }

  // CALENDAR_SOURCE needs no check here, since checkAppinfo runs checkPluginKeys before this
  const kindsOn = pluginKindsOn(defines).map((kind) => kind.define);

  if (kindsOn.includes('PLUGIN_CALENDAR')) {
    names.add('Calendar');
  }

  // the Pebble app's own Music plugin asks its callers for ReadMusic. the phone's Phone plugin asks
  // for nothing, so PLUGIN_PHONE adds no entry
  if (kindsOn.includes('PLUGIN_MUSIC')) {
    names.add('ReadMusic');
  }

  for (const entry of readOwn(declared, face)) {
    const name = typeof entry === 'string' ? entry : entry.name;
    const parameters = typeof entry === 'string' ? {} : entry.parameters ?? {};
    const plain = typeof entry === 'string' || (entry.plugin === undefined && Object.keys(parameters).length === 0);

    if (name === 'Internet' && typeof entry !== 'string' && entry.plugin === undefined && Object.keys(parameters).every((key) => key === 'domains')) {
      // one Internet entry carries every site, and a list with nothing in it means any site, as on the phone
      const sites = parameters.domains ?? [];

      sites.forEach((site) => domains.add(site));
      anySite = anySite || sites.length === 0;
    } else if (plain) {
      if (name === 'Internet') {
        anySite = true;
      } else {
        names.add(name);
      }
    } else if (!others.some((other) => JSON.stringify(other) === JSON.stringify(entry))) {
      others.push(entry);
    }
  }

  // with hosts listed the calendar opens no site itself, so any site here came from the face's own
  // entries, which would leave the hosts doing nothing
  if (providers.calendarHosts && anySite) {
    throw new ToolError(`${face}'s appinfo lists providers.calendarHosts while its own usesPermissions opens Internet to any site, so the hosts would do nothing. Take the bare Internet out of usesPermissions, or take calendarHosts out`);
  }

  const permissions: Permission[] = [...names];

  if (anySite) {
    permissions.push('Internet');
  } else if (domains.size > 0) {
    permissions.push({ name: 'Internet', parameters: { domains: [...domains] } });
  }

  return [...permissions, ...others];
}

/**
 * The warnings a face's permissions earn, which the build prints and carries on past.
 *
 * A plugin only weather list leaves `open-meteo.com` out for `LOCATION_NAME`, since the page drops the
 * location search marked to hide while the plugin is picked. The build cannot see whether the face's
 * own search carries that mark, so a face declaring the key hears what to do about one that does not.
 *
 * @param messageKeys The face's message keys, as its appinfo declares them.
 * @param face The face the appinfo belongs to, which a warning names.
 * @param providers The face's providers list, from readProviders.
 * @return Each warning's text, empty when there are none.
 */
export function permissionWarnings(messageKeys: unknown, face: string, providers: ProviderLists): string[] {
  if (providerMode(providers.weather) !== 'plugin' || !keyNames(messageKeys).has('LOCATION_NAME')) {
    return [];
  }

  return [`${face}'s appinfo lists providers.weather as ["plugin"] and declares LOCATION_NAME, so its usesPermissions leaves out open-meteo.com. A location search on its settings page that is not marked pluginSourceHides: 'WEATHER_PROVIDER' stays on the page and finds nothing. Mark it so the page drops it, or list open-meteo.com in the face's own usesPermissions`];
}
