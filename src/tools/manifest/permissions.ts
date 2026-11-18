/**
 * The permissions a face's phone-side script asks for, worked out from its message keys.
 *
 * A pbw built as manifestVersion 2 gets only the sites and phone features its appinfo lists in
 * usesPermissions, once the wearer turns plugins on in the Pebble app. A request to a site it never
 * listed fails at once, and a location lookup it never listed is turned away. The list follows the
 * features a face's keys switch on, narrowed by the providers it lists, so a face never names a
 * provider's site by hand. Each entry the build writes carries the reason the wearer reads and
 * `required: false`, since a face still tells the time with any of them turned down.
 */
import { ToolError } from '../shared/tool-error.ts';
import { keyNames } from './message-keys.ts';
import { pluginKindsOn } from './plugin-kinds.ts';
import { FEATURE_KEYS, providerMode, providersOffered } from './providers.ts';
import type { ProviderKind, ProviderLists } from './providers.ts';

/**
 * One usesPermissions entry, as the Pebble app reads it: a bare name, or a name with its arguments. An
 * entry can also carry the reason shown to the wearer and whether the permission is required.
 */
export type Permission = string | { name: string; parameters?: Record<string, string[]>; plugin?: string; reason?: string; required?: boolean };

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
 * What a generated Internet entry is for. `reason` is the line the wearer reads when the entry has one
 * purpose, and `phrase` is the same purpose joined to another, for a site two features share.
 */
interface Purpose {
  reason: string;
  phrase: string;
}

const WEATHER_PURPOSE: Purpose = { reason: 'To get the weather', phrase: 'get the weather' };
const STOCK_PURPOSE: Purpose = { reason: 'To get your stock quotes', phrase: 'get your stock quotes' };
const PICKER_PURPOSE: Purpose = { reason: 'To search for places in settings', phrase: 'search for places' };
const ICAL_PURPOSE: Purpose = { reason: 'To fetch your iCal calendar link', phrase: 'fetch your iCal calendar link' };

// the reasons for the phone features the keys and defines bring
const LOCATION_REASON = 'To show the weather where you are';
const CALENDAR_REASON = "To show events from your phone's calendars";
const MUSIC_REASON = "To show what's playing on your phone";

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

/**
 * A face's own usesPermissions entries, or a plugin app's, checked so each one reads the way the
 * Pebble app expects.
 *
 * @param declared The usesPermissions the appinfo lists, if it lists any.
 * @param face The face or plugin app the appinfo belongs to, which a refusal names.
 * @return The entries as the appinfo writes them, empty when it lists none.
 */
export function readOwn(declared: unknown, face: string): Permission[] {
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

    // the phone shows reason as the line under the permission and reads required as yes or no
    if (typeof entry === 'object' && entry.reason !== undefined && typeof entry.reason !== 'string') {
      throw new ToolError(`${face}'s appinfo usesPermissions gives ${entry.name} the reason ${JSON.stringify(entry.reason)}, which has to be text`);
    }

    if (typeof entry === 'object' && entry.required !== undefined && typeof entry.required !== 'boolean') {
      throw new ToolError(`${face}'s appinfo usesPermissions gives ${entry.name} required ${JSON.stringify(entry.required)}, which has to be true or false`);
    }
  }

  return declared;
}

/** The refusal for calendar hosts beside the face's own Internet entry opening every site. */
function hostsOpenedWide(face: string): string {
  return `${face}'s appinfo lists providers.calendarHosts while its own usesPermissions opens Internet to any site, so the hosts would do nothing. Take the bare Internet out of usesPermissions, or take calendarHosts out`;
}

/** True for an entry of the face's own that opens every site, as permissionsFor reads one: a bare Internet, or an Internet whose only parameter is an empty domains list. */
function opensEverySite(entry: Permission): boolean {
  if (typeof entry === 'string') {
    return entry === 'Internet';
  }

  const parameters = entry.parameters ?? {};

  if (entry.name !== 'Internet' || entry.plugin !== undefined) {
    return false;
  }

  return Object.keys(parameters).every((key) => key === 'domains') && (parameters.domains ?? []).length === 0;
}

/**
 * Whether a usesPermissions list lets the phone reach a site. An Internet entry reaches each site it
 * names and their subdomains, and one naming no site reaches every site, as on the phone.
 *
 * @param declared The entries, as readOwn gives them.
 * @param site The site, such as `open-meteo.com`.
 * @return Whether the phone lets a request to the site through.
 */
export function reachesSite(declared: Permission[], site: string): boolean {
  return declared.some((entry) => {
    if (opensEverySite(entry)) {
      return true;
    }

    if (typeof entry === 'string' || entry.name !== 'Internet' || entry.plugin !== undefined) {
      return false;
    }

    return (entry.parameters?.domains ?? []).some((domain) => site === domain || site.endsWith('.' + domain));
  });
}

/**
 * Refuses the face's own usesPermissions entries the build cannot use, from the appinfo alone.
 *
 * Each entry has to read the way the Pebble app expects, and calendar hosts beside an entry of the
 * face's own that opens every site would do nothing. Neither needs the keys the features bring, so the
 * build checks them before the phone build. permissionsFor checks both again on the whole list.
 *
 * @param declared The face's own usesPermissions from its appinfo, if it has any.
 * @param face The face the appinfo belongs to, which a refusal names.
 * @param providers The face's providers list, from readProviders.
 */
export function checkOwnPermissions(declared: unknown, face: string, providers: ProviderLists): void {
  const own = readOwn(declared, face);

  if (providers.calendarHosts && own.some(opensEverySite)) {
    throw new ToolError(hostsOpenedWide(face));
  }
}

/** True for a parameters object the phone can read, each name mapped to a list of text. */
function isParameters(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((list) => Array.isArray(list) && list.every((item) => typeof item === 'string'));
}

/** The reason for an entry serving each of these purposes, joined into one sentence when there is more than one. */
function reasonFor(purposes: Purpose[]): string {
  if (purposes.length === 1) {
    return purposes[0].reason;
  }

  const phrases = purposes.map((purpose) => purpose.phrase);
  const last = phrases.pop();
  const joined = phrases.length === 1 ? `${phrases[0]} and ${last}` : `${phrases.join(', ')}, and ${last}`;

  return `To ${joined}`;
}

/**
 * One Internet entry per feature that fetches, each holding the sites no earlier feature took. A site
 * two features share stays in the first one's entry, and that entry's reason gains the second purpose,
 * so the wearer reads each site once with everything it is for. A feature left with no site of its
 * own gets no entry. A site one of the face's own marked entries lists is left out, since it sits in
 * that entry already.
 */
function siteEntries(groups: { purpose: Purpose; sites: string[] }[], claimed: Set<string>): Permission[] {
  const entries: { sites: string[]; purposes: Purpose[] }[] = [];
  const owners = new Map<string, { sites: string[]; purposes: Purpose[] }>();

  for (const group of groups) {
    const entry = { sites: [] as string[], purposes: [group.purpose] };

    for (const site of group.sites) {
      const owner = owners.get(site);

      if (claimed.has(site) || owner === entry) {
        continue;
      }

      if (owner === undefined) {
        entry.sites.push(site);
        owners.set(site, entry);
      } else if (!owner.purposes.includes(group.purpose)) {
        owner.purposes.push(group.purpose);
      }
    }

    if (entry.sites.length > 0) {
      entries.push(entry);
    }
  }

  return entries.map((entry) => ({ name: 'Internet', parameters: { domains: entry.sites }, reason: reasonFor(entry.purposes), required: false }));
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
 * calendar offering its iCal link asks for the hosts the face lists in `calendarHosts`, in the face's
 * own order, or for the whole web without them, since a feed can sit on any site. A calendar from a
 * plugin alone asks for no site. A face built with `PLUGIN_CALENDAR` also asks for the calendar,
 * which the calendar plugins need, and one built with `PLUGIN_MUSIC` asks for `ReadMusic`, which the
 * Pebble app's music plugin needs.
 *
 * Every entry it writes has a reason and `required: false`, and each feature's sites get an Internet
 * entry of their own, so the store listing says what each site is for and the phone asks about one
 * only when the face first uses it. A site goes in one entry. The whole web for an iCal link sits
 * beside the per-site entries rather than in place of them, so the listing still says what each named
 * site is for.
 *
 * The face's own entries join these. One with a reason or `required` goes in as written, and takes
 * the place of a generated entry for the same name or site. A bare name joins the list once. A bare
 * Internet opens every site, and the sites of a plain Internet entry go in one entry of their own,
 * after the generated ones and without any site those already list.
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
  // the build cannot see the settings page, since the phone builds it, so it goes by the keys a picker
  // saves under. a page that puts a locationsearch under any other key gets no site from here, and
  // the face lists open-meteo.com in its own usesPermissions, as the docs say. a plugin only weather
  // list takes the marked location rows off the page, the location search with them, so LOCATION_NAME
  // counts for every other list. a face that keeps a location search of its own with no mark lists
  // the site itself. a time zone picker stays on the page whatever the weather comes from
  const noLocationSearch = providerMode(providers.weather) === 'plugin';
  const picker = [...keys].some((key) => isPickerKey(key) && !(noLocationSearch && key === 'LOCATION_NAME'));
  const ical = keys.has(FEATURE_KEYS.calendar) && providersOffered('calendar', providers.calendar).some((provider) => provider.anySite);
  const groups = [
    { purpose: WEATHER_PURPOSE, sites: weather ? narrowed(WEATHER_DOMAINS, 'weather', providers.weather) : [] },
    { purpose: STOCK_PURPOSE, sites: keys.has(FEATURE_KEYS.stocks) ? narrowed(STOCK_DOMAINS, 'stocks', providers.stocks) : [] },
    { purpose: PICKER_PURPOSE, sites: picker ? PICKER_DOMAINS : [] },
    { purpose: ICAL_PURPOSE, sites: ical ? providers.calendarHosts ?? [] : [] },
  ];
  const generated: { name: string; reason: string; required: boolean }[] = [];

  // whether GPS is used comes from the saved setting and its default, which the build cannot read,
  // so every weather face lists it. the phone only asks the wearer once a lookup actually happens
  if (weather) {
    generated.push({ name: 'Location', reason: LOCATION_REASON, required: false });
  }

  // CALENDAR_SOURCE needs no check here, since the build adds it beside PLUGIN_CALENDAR when the face keeps a choice
  const kindsOn = pluginKindsOn(defines).map((kind) => kind.define);

  if (kindsOn.includes('PLUGIN_CALENDAR')) {
    generated.push({ name: 'Calendar', reason: CALENDAR_REASON, required: false });
  }

  // the Pebble app's own Music plugin asks its callers for ReadMusic. the phone's Phone plugin asks
  // for nothing, so PLUGIN_PHONE adds no entry
  if (kindsOn.includes('PLUGIN_MUSIC')) {
    generated.push({ name: 'ReadMusic', reason: MUSIC_REASON, required: false });
  }

  const names: string[] = [];
  const ownSites: string[] = [];
  const kept: Permission[] = [];
  let ownAnySite = false;

  for (const entry of readOwn(declared, face)) {
    const name = typeof entry === 'string' ? entry : entry.name;
    const parameters = typeof entry === 'string' ? {} : entry.parameters ?? {};
    const marked = typeof entry !== 'string' && (entry.reason !== undefined || entry.required !== undefined);
    const plain = typeof entry === 'string' || (entry.plugin === undefined && Object.keys(parameters).length === 0);
    const sitesOnly = name === 'Internet' && (typeof entry === 'string' || entry.plugin === undefined) && Object.keys(parameters).every((key) => key === 'domains');

    if (sitesOnly && !marked) {
      // a list with nothing in it means any site, as on the phone
      const sites = parameters.domains ?? [];

      ownSites.push(...sites);
      ownAnySite = ownAnySite || sites.length === 0;
    } else if (plain && !marked) {
      names.push(name);
    } else if (!kept.some((other) => JSON.stringify(other) === JSON.stringify(entry))) {
      kept.push(entry);
    }
  }

  // a marked entry of the face's own takes the place of a generated one for the same name or site
  const claimedNames = new Set<string>();
  const claimedSites = new Set<string>();
  let claimedAnySite = false;

  for (const entry of kept) {
    if (typeof entry === 'string' || entry.plugin !== undefined) {
      continue;
    }

    if (opensEverySite(entry)) {
      claimedAnySite = true;
    } else if (entry.name === 'Internet') {
      (entry.parameters?.domains ?? []).forEach((site) => claimedSites.add(site));
    } else if (Object.keys(entry.parameters ?? {}).length === 0) {
      claimedNames.add(entry.name);
    }
  }

  // with hosts listed the calendar opens no site itself, so any site here came from the face's own
  // entries, which would leave the hosts doing nothing
  if (providers.calendarHosts && (ownAnySite || claimedAnySite)) {
    throw new ToolError(hostsOpenedWide(face));
  }

  const generatedNames = generated.map((entry) => entry.name);
  const ownNames = names.filter((name, index) => names.indexOf(name) === index && !generatedNames.includes(name) && !claimedNames.has(name));
  const generatedSites = groups.flatMap((group) => group.sites);
  const plainSites = ownSites.filter((site, index) => ownSites.indexOf(site) === index && !generatedSites.includes(site) && !claimedSites.has(site));
  const anySite: Permission[] = [];

  // the face's own marked entry for any site is in kept already, and stands for the iCal link's too
  if (!claimedAnySite && ical && providers.calendarHosts === undefined) {
    anySite.push({ name: 'Internet', reason: ICAL_PURPOSE.reason, required: false });
  } else if (!claimedAnySite && ownAnySite) {
    anySite.push('Internet');
  }

  return [
    ...generated.filter((entry) => !claimedNames.has(entry.name)),
    ...ownNames,
    ...siteEntries(groups, claimedSites),
    ...anySite,
    ...(plainSites.length > 0 ? [{ name: 'Internet', parameters: { domains: plainSites } }] : []),
    ...kept,
  ];
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
