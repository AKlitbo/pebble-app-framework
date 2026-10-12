/**
 * Single source of truth for the weather-condition vocabulary.
 *
 * Each token is the short condition word the PebbleKit JS producer emits (see
 * util.ts wmoToCondition / applyNight / CONDITION_ALIASES) and the C side looks up
 * to pick an icon. The C icon table, icons_table.g.h, is generated from this list by the
 * framework repo's tools/build-conditions.ts. Edit the
 * vocabulary here, never there.
 *
 * Fields per row:
 *   token         stable wire/icon key. NEVER reword it. Saved settings, the
 *                 icon table and in-flight messages all depend on its spelling.
 *   resource      day icon (RESOURCE_ID_ICON_<resource>).
 *   nightResource optional night icon. When present the JS emits "<token>_NIGHT"
 *                 after dark and the generator adds a "<token>_NIGHT" branch to
 *                 the icon table.
 *   labelLong     the sky in words, sent as WEATHER_CONDITION_LABEL to a face
 *                 that declares it.
 *
 * FZDZ and FZRN share WEATHER_NOW_SLEET and WEATHER_NOW_NIGHT_SLEET, since there is no
 * freezing-drizzle glyph of its own.
 */

/** One condition row: its wire token plus its day/night icons and its label. */
export interface ConditionEntry {
  token: string;
  resource: string;
  nightResource?: string;
  /** @deprecated Nothing reads it, since the watch's wx_label_short shows the token itself. It goes at the next major release. */
  labelShort?: string;
  labelLong: string;
}

/** The glyph and label an unrecognized condition falls back to. No token: nothing sends it. */
export interface ConditionFallback {
  resource: string;
  /** @deprecated Nothing reads it. It goes at the next major release. */
  labelShort?: string;
  labelLong: string;
}

/** What the C generators read out of the vocabulary: the fallback plus the ordered rows. */
export interface ConditionVocabulary {
  fallback: ConditionFallback;
  conditions: ConditionEntry[];
}

// wire code for a condition the watch doesn't recognize, which a face draws as its fallback
// glyph. real conditions ride as their array index
const UNKNOWN_CODE = 255;

// high bit OR-ed onto an hourly forecast code to mark a night hour so the watch loads the
// night glyph for that column. real indices are 0-11 so this bit is free. the C side mirrors
// it as WX_FORECAST_NIGHT_BIT in wire/wire_caps.g.h, generated from this file. only the hourly
// strip sets it (the daily strip is whole-day and stays on day glyphs)
const FORECAST_NIGHT_BIT = 0x80;

// shown when a condition isn't recognized (the UNKNOWN token routes here)
const fallback: ConditionFallback = { resource: 'WEATHER_NOW_NA', labelLong: 'Unknown' };

const conditions: ConditionEntry[] = [
  { token: 'CLEAR', resource: 'WEATHER_NOW_CLEAR',         nightResource: 'WEATHER_NOW_NIGHT_CLEAR',         labelLong: 'Clear' },
  { token: 'PCLDY', resource: 'WEATHER_NOW_PARTLY_CLOUDY', nightResource: 'WEATHER_NOW_NIGHT_PARTLY_CLOUDY', labelLong: 'Partly Cloudy' },
  { token: 'CLDY',  resource: 'WEATHER_NOW_CLOUDY',        nightResource: 'WEATHER_NOW_NIGHT_CLOUDY',        labelLong: 'Cloudy' },
  { token: 'FOGGY', resource: 'WEATHER_NOW_FOG',           nightResource: 'WEATHER_NOW_NIGHT_FOG',           labelLong: 'Fog' },
  { token: 'DRZL',  resource: 'WEATHER_NOW_DRIZZLE',       nightResource: 'WEATHER_NOW_NIGHT_DRIZZLE',       labelLong: 'Drizzle' },
  { token: 'FZDZ',  resource: 'WEATHER_NOW_SLEET',         nightResource: 'WEATHER_NOW_NIGHT_SLEET',         labelLong: 'Freezing Drizzle' },
  { token: 'RAIN',  resource: 'WEATHER_NOW_RAIN',          nightResource: 'WEATHER_NOW_NIGHT_RAIN',          labelLong: 'Rain' },
  { token: 'FZRN',  resource: 'WEATHER_NOW_SLEET',         nightResource: 'WEATHER_NOW_NIGHT_SLEET',         labelLong: 'Freezing Rain' },
  { token: 'SNOW',  resource: 'WEATHER_NOW_SNOW',          nightResource: 'WEATHER_NOW_NIGHT_SNOW',          labelLong: 'Snow' },
  { token: 'SHWR',  resource: 'WEATHER_NOW_SHOWERS',       nightResource: 'WEATHER_NOW_NIGHT_SHOWERS',       labelLong: 'Showers' },
  { token: 'SNSH',  resource: 'WEATHER_NOW_SNOW_WIND',     nightResource: 'WEATHER_NOW_NIGHT_SNOW_WIND',     labelLong: 'Snow Showers' },
  { token: 'STRM',  resource: 'WEATHER_NOW_THUNDERSTORM',  nightResource: 'WEATHER_NOW_NIGHT_THUNDERSTORM',  labelLong: 'Thunderstorm' },
];

/**
 * Turns a condition token into its compact wire code for the forecast row.
 *
 * The forecast columns can't each carry a token string, so a condition rides as
 * a single byte: its index in the conditions array. The night marker is dropped
 * first, and anything unrecognized becomes UNKNOWN_CODE so the watch draws
 * WEATHER_NOW_NA. The daily strip sends the code as it is and shows day glyphs.
 * The hourly strip ORs FORECAST_NIGHT_BIT onto it for a column after dark.
 *
 * @param token The condition token to look up, with or without its night marker.
 * @return The token's index in the conditions array, or UNKNOWN_CODE when it isn't recognized.
 */
function codeFor(token: string): number {
  if (!token) {
    return UNKNOWN_CODE;
  }

  const base = String(token).replace(/_NIGHT$/, '');
  const index = conditions.findIndex((entry) => entry.token === base);

  return index < 0 ? UNKNOWN_CODE : index;
}

const vocabulary = { fallback, conditions, UNKNOWN_CODE, FORECAST_NIGHT_BIT, codeFor };

export default vocabulary;
