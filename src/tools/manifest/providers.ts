/**
 * The providers a face offers for each kind of data, from the `providers` list in its appinfo.
 *
 * A face lists them beside its defines, as in `"providers": { "weather": ["plugin", "openmeteo"],
 * "stocks": ["yahoo"] }`. The names are the values the provider selects save, with `ical` for the
 * calendar's link and `plugin` for the Pebble app's Preferred Source. A calendar offering its link can
 * add `calendarHosts`, the hosts its feeds come from. The manifest build narrows `usesPermissions` to
 * the sites the listed providers call, and a kind left out keeps every provider it has.
 *
 * This file holds the table of every provider with the sites it calls, reads and checks the list, and
 * works out each kind's mode. The face names providers and never sites, so the table is the only place
 * that knows which sites a provider reaches.
 */
import net from 'node:net';
import { ToolError } from '../shared/tool-error.ts';
import { keyNames } from './message-keys.ts';
import { PLUGIN_KINDS, pluginKindsOn } from './plugin-kinds.ts';
import type { PluginKind } from './plugin-kinds.ts';

/** A kind of data a face can list providers for, which is also its key in the providers list. */
export type ProviderKind = 'weather' | 'stocks' | 'calendar' | 'music' | 'phone';

/** One provider a face can list. */
export interface Provider {
  /** The kind of data it gives. */
  kind: ProviderKind;
  /** The name the face lists, which is the value its select saves. */
  name: string;
  /** Every site it calls, each covering its subdomains on the phone. */
  sites: readonly string[];
  /** True for a provider that reaches whatever site the wearer gives it, such as an iCal link. */
  anySite?: boolean;
  /** True when it fetches nothing without an API key from the wearer. */
  needsKey: boolean;
  /** The plugin kind behind it, for `plugin`, whose define puts the plugin code in. */
  plugin?: PluginKind;
}

/** The `plugin` row for a kind, tied to its plugin kind by its define. */
function pluginRow(kind: ProviderKind, define: string): Provider {
  const plugin = PLUGIN_KINDS.find((known) => known.define === define);

  // a row naming a define the plugin kinds lack is a mistake in this file, not in a face
  if (!plugin) {
    throw new Error(`no plugin kind has the define ${define}`);
  }

  return { kind, name: 'plugin', sites: [], needsKey: false, plugin };
}

/**
 * Every provider the framework has.
 *
 * OpenWeatherMap and WeatherAPI borrow the readings they lack from Open-Meteo, so each lists
 * `open-meteo.com` too. A plugin calls no site, since its data comes through the Pebble app. Stocks
 * have no plugin kind yet, so they have no `plugin` row.
 */
export const PROVIDERS: readonly Provider[] = [
  { kind: 'weather', name: 'openmeteo', sites: ['open-meteo.com'], needsKey: false },
  { kind: 'weather', name: 'owm', sites: ['openweathermap.org', 'open-meteo.com'], needsKey: true },
  { kind: 'weather', name: 'weatherapi', sites: ['weatherapi.com', 'open-meteo.com'], needsKey: true },
  pluginRow('weather', 'PLUGIN_WEATHER'),
  { kind: 'stocks', name: 'alphavantage', sites: ['alphavantage.co'], needsKey: true },
  { kind: 'stocks', name: 'finnhub', sites: ['finnhub.io'], needsKey: true },
  { kind: 'stocks', name: 'twelvedata', sites: ['twelvedata.com'], needsKey: true },
  { kind: 'stocks', name: 'yahoo', sites: ['yahoo.com'], needsKey: false },
  { kind: 'calendar', name: 'ical', sites: [], anySite: true, needsKey: false },
  pluginRow('calendar', 'PLUGIN_CALENDAR'),
  pluginRow('music', 'PLUGIN_MUSIC'),
  pluginRow('phone', 'PLUGIN_PHONE'),
];

/** Every kind a face can list providers for, in the order the checks run. */
export const PROVIDER_KINDS: readonly ProviderKind[] = ['weather', 'stocks', 'calendar', 'music', 'phone'];

/** A kind in the words a refusal uses for it. */
const KIND_WORDS: Record<ProviderKind, string> = {
  weather: 'weather',
  stocks: 'stocks',
  calendar: 'the calendar',
  music: 'now playing',
  phone: 'phone battery',
};

/** The key in the providers list that holds the calendar's hosts rather than a kind's providers. */
const HOSTS_KEY = 'calendarHosts';

/**
 * The message key that says a face has a kind at all. Now playing and phone battery have none here,
 * since their define already needs every key they use.
 */
export const FEATURE_KEYS: Readonly<Record<'weather' | 'stocks' | 'calendar', string>> = {
  weather: 'WEATHER_REQUEST',
  stocks: 'STOCK_STRIP',
  calendar: 'CALENDAR_STRIP',
};

/** The feature that brings each kind's feature key, as a face imports it, for the line that says to pass it. */
const KIND_FEATURES: Readonly<Record<keyof typeof FEATURE_KEYS, string>> = {
  weather: 'weather from ts/weather/feature',
  stocks: 'stocks from ts/stock/feature',
  calendar: 'calendar from ts/calendar/feature',
};

/** True for a kind with a feature key, which is every kind but the plugin only ones. */
function hasFeatureKey(kind: ProviderKind): kind is keyof typeof FEATURE_KEYS {
  return kind in FEATURE_KEYS;
}

/** A face's checked providers list. A kind it leaves out is missing. */
export type ProviderLists = Partial<Record<ProviderKind | 'calendarHosts', string[]>>;

/**
 * What a kind's list makes of it.
 *
 * `unlisted` is a kind the face leaves out, which keeps every provider. `custom` lists no plugin,
 * `plugin` lists the plugin alone, and `mixed` lists the plugin and at least one custom provider.
 */
export type ProviderMode = 'unlisted' | 'custom' | 'plugin' | 'mixed';

/**
 * The mode a kind's list puts it in.
 *
 * @param list The kind's list, or undefined for a kind the face leaves out.
 * @return The mode.
 */
export function providerMode(list: readonly string[] | undefined): ProviderMode {
  if (list === undefined) {
    return 'unlisted';
  }

  if (!list.includes('plugin')) {
    return 'custom';
  }

  return list.length === 1 ? 'plugin' : 'mixed';
}

/**
 * The mode a face's providers list puts a plugin kind in.
 *
 * @param kind The plugin kind.
 * @param providers The face's checked providers list.
 * @return The mode of the list the kind's plugin row sits in.
 */
export function pluginKindMode(kind: PluginKind, providers: ProviderLists): ProviderMode {
  const row = PROVIDERS.find((provider) => provider.plugin === kind);

  return providerMode(row ? providers[row.kind] : undefined);
}

/**
 * The default the watch keeps for each plugin kind's source choice, as the text each one's define
 * hands the watch C, such as `{ PLUGIN_SOURCE_WEATHER_DEFAULT: 'openmeteo' }`.
 *
 * The watch keeps a choice for a kind whose define is on and whose list is not plugin only, since the
 * build adds the kind's select key to the face's message keys for one. The default is the
 * settings page's own. That is the first custom provider the kind's list names, wherever `plugin` sits,
 * or with no list the page default the framework's page gives the select. So a watch that never got a
 * save sends back the choice the phone would make anyway.
 *
 * @param defines The face's defines, from readDefines.
 * @param providers The face's checked providers list, from readProviders.
 * @return Each default by its define, empty when the face keeps no choice on the watch.
 */
export function pluginSourceDefaults(defines: Record<string, number>, providers: ProviderLists): Record<string, string> {
  const defaults: Record<string, string> = {};

  for (const kind of pluginKindsOn(defines)) {
    const row = PROVIDERS.find((provider) => provider.plugin === kind);

    if (!kind.defaultDefine || !kind.pageDefault || !row || pluginKindMode(kind, providers) === 'plugin') {
      continue;
    }

    defaults[kind.defaultDefine] = providers[row.kind]?.find((name) => name !== 'plugin') ?? kind.pageDefault;
  }

  return defaults;
}

/** The table's rows for one kind. */
function rowsFor(kind: ProviderKind): Provider[] {
  return PROVIDERS.filter((provider) => provider.kind === kind);
}

/**
 * The providers a kind's list offers, each from the table.
 *
 * @param kind The kind of data.
 * @param list The kind's checked list, or undefined for a kind the face leaves out, which offers every one.
 * @return The table's rows for the providers offered, in table order.
 */
export function providersOffered(kind: ProviderKind, list: readonly string[] | undefined): Provider[] {
  return rowsFor(kind).filter((provider) => list === undefined || list.includes(provider.name));
}

/** A list of text, each entry once. Empty is refused unless the caller checks that itself. */
function readList(value: unknown, face: string, key: string, allowEmpty: boolean): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    const example = key === HOSTS_KEY ? '["google.com"]' : '["openmeteo"]';

    throw new ToolError(`${face}'s appinfo providers.${key} has to be a list of names as text, as in ${example}`);
  }

  if (value.length === 0 && !allowEmpty) {
    throw new ToolError(`${face}'s appinfo providers.${key} is empty. List at least one provider, or leave ${key} out`);
  }

  const twice = value.find((entry, index) => value.indexOf(entry) !== index);

  if (twice !== undefined) {
    throw new ToolError(`${face}'s appinfo providers.${key} names ${twice} twice. Take the second one out`);
  }

  return value;
}

/**
 * Joins names into a sentence's list, with a serial comma, as in "A, B, and C".
 *
 * @param names The names to join.
 * @return The names as a list a sentence can hold.
 */
export function sentenceList(names: readonly string[]): string {
  if (names.length <= 2) {
    return names.join(' and ');
  }

  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/** Refuses a name the table does not have for the kind, naming the ones it does have. */
function checkNames(kind: ProviderKind, list: string[], face: string): void {
  const names = rowsFor(kind).map((provider) => provider.name);
  const unknown = list.find((name) => !names.includes(name));

  if (unknown === undefined) {
    return;
  }

  const prefix = `${face}'s appinfo providers.${kind} names ${unknown}`;

  if (kind === 'stocks' && unknown === 'plugin') {
    throw new ToolError(`${prefix}, but stocks have no plugin kind yet. The stock providers are ${sentenceList(names)}`);
  }

  if (names.length === 1 && names[0] === 'plugin') {
    throw new ToolError(`${prefix}, but ${KIND_WORDS[kind]} comes only from a plugin, so its list can only be ["plugin"]`);
  }

  throw new ToolError(`${prefix}, which is not a ${kind} provider. The ${kind} providers are ${sentenceList(names)}`);
}

/** Refuses a list that names a provider the kind does not have, or one its plugin define disagrees with. */
function checkKind(kind: ProviderKind, list: string[], face: string, kindsOn: PluginKind[]): void {
  checkNames(kind, list, face);

  const plugin = rowsFor(kind).find((provider) => provider.plugin)?.plugin;

  if (!plugin) {
    return;
  }

  const on = kindsOn.includes(plugin);
  const mode = providerMode(list);

  // the define decides whether the plugin code is in the phone bundle, and the list what the page
  // offers, so a list offering a plugin the bundle leaves out, or a bundle carrying a plugin the
  // page never offers, is refused
  if (mode !== 'custom' && !on) {
    throw new ToolError(`${face}'s appinfo lists plugin in providers.${kind} without ${plugin.define} turned on, so the face would offer a plugin its phone code leaves out. Add "${plugin.define}": 1 to its defines, or take plugin out of the list`);
  }

  if (mode === 'custom' && on) {
    throw new ToolError(`${face}'s appinfo defines ${plugin.define}, but providers.${kind} does not list plugin, so the plugin code would ship with nothing to offer it. Add "plugin" to the list, or take ${plugin.define} out of its defines`);
  }
}

/** Refuses a list the face has no feature for, or a plugin only list beside the kind's select key. */
function checkKindKeys(kind: ProviderKind, list: string[], face: string, declared: Set<string>): void {
  if (hasFeatureKey(kind) && !declared.has(FEATURE_KEYS[kind])) {
    throw new ToolError(`${face}'s appinfo lists providers.${kind} without the ${FEATURE_KEYS[kind]} message key, so the face has no ${KIND_WORDS[kind]} to offer them for. Pass ${KIND_FEATURES[kind]} in startPebbleApp's features, which brings the key, or take providers.${kind} out`);
  }

  checkSelectKey(kind, list, face, declared);
}

/** Refuses a plugin only list beside the kind's select key. */
function checkSelectKey(kind: ProviderKind, list: string[], face: string, declared: Set<string>): void {
  const plugin = rowsFor(kind).find((provider) => provider.plugin)?.plugin;

  // the watch keeps the select's choice through a reset whenever the face declares this key, and a
  // plugin only kind has no choice to keep. the build adds the select key only beside a list that is
  // not plugin only, so this one is a key the face lists itself
  if (plugin?.selectKey && providerMode(list) === 'plugin' && declared.has(plugin.selectKey)) {
    throw new ToolError(`${face}'s appinfo lists providers.${kind} as ["plugin"] and still declares ${plugin.selectKey}. A plugin only kind keeps no choice on the watch, so take ${plugin.selectKey} out of messageKeys and build with --clean`);
  }
}

// a host name in lowercase with at least one dot, each label letters, digits, and inner hyphens
const HOST_NAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Refuses calendar hosts that mean nothing for the face's calendar, or that the phone cannot match. */
function checkHosts(hosts: string[], calendar: string[] | undefined, face: string): void {
  // the hosts only say where an iCal link can reach, so they need the link on offer
  if (calendar !== undefined && !calendar.includes('ical')) {
    throw new ToolError(`${face}'s appinfo lists providers.${HOSTS_KEY}, but providers.calendar does not offer ical, so no iCal link would use them. Add "ical" to the calendar list, or take ${HOSTS_KEY} out`);
  }

  if (hosts.length === 0) {
    throw new ToolError(`${face}'s appinfo providers.${HOSTS_KEY} is empty, which would let an iCal link reach no site at all. List the hosts its feeds come from, such as google.com, or leave ${HOSTS_KEY} out to let a link reach any site`);
  }

  for (const host of hosts) {
    // the phone matches a feed's host by name, so an address never matches. an IPv6 one can come
    // in its brackets, as a link writes it. the lowercase form is tested, so a host such as
    // Example.123 is refused as an address straight away rather than told to be lowercase first
    if (net.isIP(host.replace(/^\[(.*)\]$/, '$1')) !== 0 || (HOST_NAME.test(host.toLowerCase()) && /\.[0-9]+$/.test(host))) {
      throw new ToolError(`${face}'s appinfo providers.${HOSTS_KEY} holds ${host}, which is an IP address. The phone matches host names only, so list the feed's host name instead`);
    }

    if (host !== host.toLowerCase() && HOST_NAME.test(host.toLowerCase())) {
      throw new ToolError(`${face}'s appinfo providers.${HOSTS_KEY} holds ${host}. Write it in lowercase, as ${host.toLowerCase()}, since the phone matches hosts in lowercase`);
    }

    if (!HOST_NAME.test(host)) {
      throw new ToolError(`${face}'s appinfo providers.${HOSTS_KEY} holds ${host}, which is not a bare host name. Write the host alone in lowercase, with no scheme, path, port, or wildcard. A host covers its subdomains, so google.com takes in calendar.google.com`);
    }
  }
}

/**
 * Reads and checks the `providers` list in a face's appinfo.
 *
 * The build stops on a list that does not read, a kind or a name the table does not have, a list and a
 * plugin define that disagree, and calendar hosts that are empty, mean nothing for the face's calendar,
 * or are not bare host names. The phone build reads the list before the build knows every message key
 * the face's features bring, so the checks against the keys wait for checkProviderKeys.
 *
 * @param config The face's appinfo, read for providers.
 * @param face The face the appinfo belongs to, which a refusal names.
 * @param defines The face's defines, from readDefines.
 * @return The checked lists, or `{}` for a face that lists none.
 */
export function readProviders(config: { providers?: unknown; messageKeys?: unknown }, face: string, defines: Record<string, number>): ProviderLists {
  const raw = config.providers;

  if (raw === undefined) {
    return {};
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ToolError(`${face}'s appinfo providers has to be a map of kind to a list of providers, as in "providers": { "weather": ["openmeteo"] }`);
  }

  const known: string[] = [...PROVIDER_KINDS, HOSTS_KEY];
  const lists: ProviderLists = {};

  for (const [key, value] of Object.entries(raw)) {
    if (!known.includes(key)) {
      throw new ToolError(`${face}'s appinfo providers names ${key}, which is not a kind it knows. The kinds are ${sentenceList(known)}`);
    }

    lists[key as keyof ProviderLists] = readList(value, face, key, key === HOSTS_KEY);
  }

  const kindsOn = pluginKindsOn(defines);

  for (const kind of PROVIDER_KINDS) {
    const list = lists[kind];

    if (list) {
      checkKind(kind, list, face, kindsOn);
    }
  }

  if (lists.calendarHosts) {
    checkHosts(lists.calendarHosts, lists.calendar, face);
  }

  return lists;
}

/**
 * Refuses a plugin only list beside the kind's select key, from the face's own keys.
 *
 * The build adds a select key only beside a list that is not plugin only, so the face's own keys give
 * the same answer as the whole list, and the build checks this before the phone build.
 * checkProviderKeys checks it again on the whole list.
 *
 * @param providers The face's checked providers list, from readProviders.
 * @param messageKeys The face's own message keys, as its appinfo declares them.
 * @param face The face the appinfo belongs to, which a refusal names.
 */
export function checkSelectKeys(providers: ProviderLists, messageKeys: unknown, face: string): void {
  const declared = keyNames(messageKeys);

  for (const kind of PROVIDER_KINDS) {
    const list = providers[kind];

    if (list) {
      checkSelectKey(kind, list, face, declared);
    }
  }
}

/**
 * Refuses a providers list the face's message keys cannot back.
 *
 * A list for a kind the face has no feature key for offers providers for nothing, and so do calendar
 * hosts without `CALENDAR_STRIP`. A plugin only list keeps no choice on the watch, so the kind's
 * select key beside it is refused. The keys are the whole list the build writes, the face's own and
 * the ones its features and defines bring, so a face that passes a kind's feature passes the first two.
 *
 * @param providers The face's checked providers list, from readProviders.
 * @param messageKeys The message keys the manifest carries, a list or a map.
 * @param face The face the appinfo belongs to, which a refusal names.
 */
export function checkProviderKeys(providers: ProviderLists, messageKeys: unknown, face: string): void {
  const declared = keyNames(messageKeys);

  for (const kind of PROVIDER_KINDS) {
    const list = providers[kind];

    if (list) {
      checkKindKeys(kind, list, face, declared);
    }
  }

  if (providers.calendarHosts && !declared.has('CALENDAR_STRIP')) {
    throw new ToolError(`${face}'s appinfo lists providers.${HOSTS_KEY} without the CALENDAR_STRIP message key, so the face has no calendar to fetch from them. Pass ${KIND_FEATURES.calendar} in startPebbleApp's features, which brings the key, or take providers.${HOSTS_KEY} out`);
  }
}

/**
 * The warnings a face's checked providers list earns, which the build prints and carries on past.
 *
 * The first custom provider in a list is the kind's default, so one that needs a key leaves a fresh
 * install on No API Key until the wearer pastes a key. Its warning names a provider of the kind that
 * needs none.
 *
 * @param providers The face's checked providers list.
 * @param face The face the appinfo belongs to, which a warning names.
 * @return Each warning's text, empty when there are none.
 */
export function providerWarnings(providers: ProviderLists, face: string): string[] {
  const warnings: string[] = [];

  for (const kind of PROVIDER_KINDS) {
    const first = providers[kind]?.find((name) => name !== 'plugin');
    const row = rowsFor(kind).find((provider) => provider.name === first);

    if (!row || !row.needsKey) {
      continue;
    }

    const keyless = rowsFor(kind).find((provider) => !provider.needsKey && !provider.plugin);
    const sentences = [`${face}'s appinfo providers.${kind} lists ${first} as its first custom provider, which is the default and needs an API key, so a fresh install shows No API Key until the wearer pastes one`];

    if (keyless) {
      sentences.push(`List one that needs no key first, such as ${keyless.name}, to start a fresh install on working ${KIND_WORDS[kind]}`);
    }

    warnings.push(sentences.join('. '));
  }

  return warnings;
}
