/**
 * The permissions a face's phone-side script asks for, worked out from its message keys.
 *
 * A pbw built as manifestVersion 2 gets only the sites and phone features its appinfo lists in
 * usesPermissions, once the wearer turns plugins on in the Pebble app. A request to a site it never
 * listed fails at once, and a location lookup it never listed is turned away. The list follows the
 * features a face's keys switch on, so a face never names a provider's site by hand.
 *
 * An SDK that builds manifestVersion 1 copies the list into appinfo.json too, and the phone ignores it
 * there, so a face can carry it before the SDK moves.
 */
import { ToolError } from '../shared/tool-error.ts';

/** One usesPermissions entry, as the Pebble app reads it: a bare name, or a name with its arguments. */
export type Permission = string | { name: string; parameters?: Record<string, string[]>; plugin?: string };

// each domain covers its subdomains on the phone, so open-meteo.com takes in api.open-meteo.com
// OpenWeatherMap and WeatherAPI borrow the readings they lack from Open-Meteo, so every weather face lists it
export const WEATHER_DOMAINS = ['open-meteo.com', 'openweathermap.org', 'weatherapi.com'];
export const STOCK_DOMAINS = ['alphavantage.co', 'finnhub.io', 'twelvedata.com', 'yahoo.com'];

/** The key names a face declares, with any [n] array suffix taken off. */
function keyNames(messageKeys: unknown): Set<string> {
  const names = Array.isArray(messageKeys) ? messageKeys : Object.keys(messageKeys ?? {});

  return new Set(names.filter((name) => typeof name === 'string').map((name) => name.split('[')[0]));
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
    const named = typeof entry === 'string' || (typeof entry === 'object' && entry !== null && typeof entry.name === 'string');

    if (!named) {
      throw new ToolError(`${face}'s appinfo usesPermissions holds ${JSON.stringify(entry)}, which is neither a name nor an object with one`);
    }

    // the phone reads each parameter as a list of text, so a bare string such as "domains": "example.com"
    // would leave the whole entry unreadable there and the fetch it was for blocked
    if (typeof entry === 'object' && entry.parameters !== undefined && !isParameters(entry.parameters)) {
      throw new ToolError(`${face}'s appinfo usesPermissions gives ${entry.name} parameters ${JSON.stringify(entry.parameters)}, which has to map each name to a list of text`);
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
 * Weather asks for location and its providers' sites. Stocks ask for theirs. A calendar feed can sit
 * on any site, so a face with the calendar asks for the whole web rather than a list. The face's own
 * entries join these. Its sites go into the one Internet entry, a bare Internet of its own opens it
 * to every site, and a name already on the list is not added twice.
 *
 * @param messageKeys The face's message keys, as its appinfo declares them.
 * @param declared The face's own usesPermissions from its appinfo, if it has any.
 * @param face The face the appinfo belongs to, which a mistake in it names.
 * @return The entries in the order they go into the manifest, empty when the face needs none.
 */
export function permissionsFor(messageKeys: unknown, declared: unknown, face: string): Permission[] {
  const keys = keyNames(messageKeys);
  const weather = keys.has('WEATHER_REQUEST');
  const names = new Set<string>();
  const domains = new Set([...(weather ? WEATHER_DOMAINS : []), ...(keys.has('STOCK_STRIP') ? STOCK_DOMAINS : [])]);
  const others: Permission[] = [];
  let anySite = keys.has('CALENDAR_STRIP');

  // whether GPS is used comes from the saved setting and its default, which the build cannot read,
  // so every weather face lists it. the phone only asks the wearer once a lookup actually happens
  if (weather) {
    names.add('Location');
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

  const permissions: Permission[] = [...names];

  if (anySite) {
    permissions.push('Internet');
  } else if (domains.size > 0) {
    permissions.push({ name: 'Internet', parameters: { domains: [...domains] } });
  }

  return [...permissions, ...others];
}
