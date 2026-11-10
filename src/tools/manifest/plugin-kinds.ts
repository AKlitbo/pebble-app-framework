/**
 * The kinds of Pebble app plugin data a face can turn on, one define each.
 *
 * A face sets a kind's define in its appinfo, such as `"PLUGIN_WEATHER": 1`. The manifest build reads
 * this table to refuse a define without its message keys and to work out the permissions, and the
 * phone build reads it to write the plugin-sources/index.js that requires only the kinds that are on.
 */

/** One kind of plugin data. */
export interface PluginKind {
  /** The define that turns it on, such as `PLUGIN_WEATHER`. */
  define: string;
  /** Its file in ts/plugin-sources/, without the extension. */
  file: string;
  /** The name plugin-sources/index.ts exports its mode under. */
  exportName: string;
  /** The message keys a face needs before the build takes the define, whatever its providers list says. */
  keys: string[];
  /**
   * The key of the select a plugin choice joins, needed beside the define unless the face's providers
   * list for the kind is plugin only. Clay saves a setting to the watch under its key's number, so a
   * select whose key the face never declared would put a key the phone cannot map into every settings
   * save. The watch keeps the choice whenever the face declares the key, so a plugin only kind, which
   * has no select, has the key refused. Left out for a kind with no select.
   */
  selectKey?: string;
  /**
   * What the select saves by default on a page that lists no providers for the kind, which is the
   * framework's own page default. Set beside `selectKey`.
   */
  pageDefault?: string;
  /**
   * The define the build hands the watch the select's default under, as text, so the choice the
   * watch keeps starts on the page's own default. Set beside `selectKey`.
   */
  defaultDefine?: string;
  /**
   * Whether only this kind's plugin fills its keys, so the build refuses any of them without the
   * define. With no plugin code behind them the watch would ask and wait forever, and its panel would
   * stay empty. Left out for a kind whose keys a face also uses without plugins, such as the weather's.
   */
  pluginOnly?: boolean;
}

/**
 * Every kind, in the order the phone build writes them.
 *
 * Weather needs the keys the weather feature will not run without, and the calendar needs its strip.
 * Each also has its select, `WEATHER_PROVIDER` for the weather and `CALENDAR_SOURCE` for the calendar,
 * which the plugin choice joins. Its page default is the one `buildConfig` gives the weather's Data
 * Source and the one the calendar's page hook gives its Calendar Source. Now playing and the phone's
 * battery need every key their store on the watch reads and asks with, and since only their plugins
 * fill those keys, the build refuses the keys without the define as well.
 */
export const PLUGIN_KINDS: readonly PluginKind[] = [
  {
    define: 'PLUGIN_WEATHER',
    file: 'weather',
    exportName: 'weatherPlugins',
    keys: ['WEATHER_REQUEST', 'WEATHER_TEMPERATURE', 'WEATHER_CONDITIONS', 'WEATHER_OK'],
    selectKey: 'WEATHER_PROVIDER',
    pageDefault: 'openmeteo',
    defaultDefine: 'PLUGIN_SOURCE_WEATHER_DEFAULT',
  },
  {
    define: 'PLUGIN_CALENDAR',
    file: 'calendar',
    exportName: 'calendarPlugins',
    keys: ['CALENDAR_STRIP'],
    selectKey: 'CALENDAR_SOURCE',
    pageDefault: 'ical',
    defaultDefine: 'PLUGIN_SOURCE_CALENDAR_DEFAULT',
  },
  {
    define: 'PLUGIN_MUSIC',
    file: 'music',
    exportName: 'musicPlugins',
    keys: ['MUSIC_TITLE', 'MUSIC_ARTIST', 'MUSIC_PLAYING', 'MUSIC_REQUEST'],
    pluginOnly: true,
  },
  {
    define: 'PLUGIN_PHONE',
    file: 'phone',
    exportName: 'phonePlugins',
    keys: ['PHONE_BATTERY', 'PHONE_REQUEST'],
    pluginOnly: true,
  },
];

/**
 * The plugin kinds a face turns on.
 *
 * A define that is missing or set to 0 is off, the same as the C side reads one, so a face can turn
 * a kind off by setting it to 0 without taking the line out.
 *
 * @param defines The face's defines, each a macro name and a whole number.
 * @return The kinds that are on, in table order.
 */
export function pluginKindsOn(defines: Record<string, number>): PluginKind[] {
  return PLUGIN_KINDS.filter((kind) => defines[kind.define] !== undefined && defines[kind.define] !== 0);
}
