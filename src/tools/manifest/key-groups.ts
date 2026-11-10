/**
 * The sets of message keys the watch reads as a unit, and the check that a face declares each set
 * whole.
 *
 * The watch only reads a group when the face declares every key in it, and only reads a weather group
 * beside a reading. A face that declares part of a group, or a weather group without the four weather
 * keys, would build and never see those readings arrive. The keys checked are the ones the manifest
 * carries, so the four weather keys the weather feature brings count. The C build stops on both too, but only once
 * `pebble build` runs, after every sandbox is written, and its error does not name the face. So the
 * build checks the same groups first, before it writes anything.
 *
 * Now playing and the phone's battery are left to plugin-kinds.ts, which refuses a part of either set
 * whichever way its define is set.
 */
import { ToolError } from '../shared/tool-error.ts';
import { keyNames } from './message-keys.ts';
import { WEATHER_READING_KEYS } from './plugin-kinds.ts';
import { sentenceList } from './providers.ts';

/** One set of message keys the watch reads as a unit. */
export interface KeyGroup {
  /** What the refusal calls the group, such as "the weather extras". */
  name: string;
  /** Every key in the group. A face declares all of them or none. */
  keys: readonly string[];
  /** The group this one is only read beside, left out for a group that stands on its own. */
  needs?: KeyGroup;
  /** The feature that brings the group's keys, as a face imports it, left out for a group the face lists itself. */
  from?: string;
  /** Whether a framework feature or a plugin define can bring the group's keys, so a check before the features are read skips it. */
  brought?: boolean;
}

/** The four keys a weather reading needs, which every other weather group is read beside, and which the weather feature brings. */
const WEATHER: KeyGroup = { name: 'weather', keys: WEATHER_READING_KEYS, from: 'weather from ts/weather/feature', brought: true };

/**
 * Every group, in the order the refusals are checked.
 *
 * The settings pair goes first. The phone asks for the watch's settings with `SETTINGS_REQUEST`, and
 * `SETTINGS_FRESH` is how the watch tells it the settings were wiped, so the phone puts the wearer's
 * back rather than copying the watch's defaults over them. A face with neither never has its settings
 * sent back or restored. A kept plugin source choice brings both, but the check before the features
 * runs on the face's own keys, so a face that lists only one of them is still refused there.
 */
export const KEY_GROUPS: readonly KeyGroup[] = [
  { name: 'the settings reply', keys: ['SETTINGS_REQUEST', 'SETTINGS_FRESH'] },
  WEATHER,
  { name: 'the weather extras', keys: ['WEATHER_HUMIDITY', 'WEATHER_WIND_SPEED', 'WEATHER_WIND_DIR', 'WEATHER_SUNRISE', 'WEATHER_SUNSET'], needs: WEATHER },
  { name: "today's forecast", keys: ['WEATHER_UV_INDEX', 'WEATHER_TEMP_MAX', 'WEATHER_TEMP_MIN', 'WEATHER_PRECIP_CHANCE'], needs: WEATHER },
  { name: 'the air readings', keys: ['WEATHER_FEELS_LIKE', 'WEATHER_PRESSURE', 'WEATHER_DEW_POINT'], needs: WEATHER },
  { name: 'the condition label', keys: ['WEATHER_CONDITION_LABEL'], needs: WEATHER },
  { name: 'the hourly forecast', keys: ['WEATHER_FORECAST_HOURLY'], needs: WEATHER },
  { name: 'the daily forecast', keys: ['WEATHER_FORECAST_DAILY'], needs: WEATHER },
  { name: 'coordinates', keys: ['LOCATION_LATITUDE', 'LOCATION_LONGITUDE'] },
];

/**
 * Refuses a group the face declares only part of, and a group declared without the keys it is read
 * beside, naming the face and each key it has to add.
 *
 * Before the features are read, the build runs it on the face's own keys with early set. That skips
 * the checks a feature or a define could still settle: a part of a group they can bring, and a group
 * read beside one. Every other group no framework feature or define ever completes, so a part of one
 * is refused before the phone build compiles anything. The settings pair is the one exception. A kept
 * plugin source choice brings it whole, but no feature does, so a face that lists half of it is still
 * refused here, and one that lists neither half gets both. A face's own feature that carries a key of
 * such a group has the face list the group whole, which costs a few lines in the appinfo and keeps
 * the refusal ahead of the build.
 *
 * @param messageKeys The face's message keys, the face's own or the manifest's, a list or a map.
 * @param face The face the appinfo belongs to, which the refusal names.
 * @param early Whether the features are still to be read, which skips what they could settle.
 */
export function checkKeyGroups(messageKeys: unknown, face: string, early: boolean = false): void {
  const declared = keyNames(messageKeys);

  for (const group of KEY_GROUPS) {
    if (early && group.brought) {
      continue;
    }

    const present = group.keys.filter((key) => declared.has(key));
    const missing = group.keys.filter((key) => !declared.has(key));

    if (present.length === 0) {
      continue;
    }

    if (missing.length > 0) {
      throw new ToolError(`${face}'s appinfo declares only part of ${group.name}. Add ${sentenceList(missing)} to messageKeys, or take ${sentenceList(present)} out of it, and build with --clean`);
    }

    // a part of the group it needs is refused on that group's own turn, so here it has all or none
    const needs = group.needs;

    if (needs && !(early && needs.brought) && !needs.keys.some((key) => declared.has(key))) {
      const bring = needs.from ? `Pass ${needs.from} in startPebbleApp's features, which brings ${sentenceList(needs.keys)}` : `Add ${sentenceList(needs.keys)} to messageKeys`;

      throw new ToolError(`${face}'s appinfo declares ${group.name} without ${needs.name}, and the watch only reads ${group.name} beside it. ${bring}, or take ${sentenceList(group.keys)} out of messageKeys, and build with --clean`);
    }
  }
}
