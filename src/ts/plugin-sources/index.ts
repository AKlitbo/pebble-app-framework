/**
 * Pebble app plugins, the one way into this folder for the rest of the phone code.
 *
 * Each kind of data has one export here, the mode its feature reads plugins with. A face turns a kind
 * on with its define in the appinfo, such as `PLUGIN_WEATHER`. The phone build writes its own copy of
 * this file in place of the compiled one, with each kind that is on required from its own file and
 * each kind that is off set to null. The bundler follows require, so a kind that is off leaves its
 * code, and anything only it reaches, out of the face's bundle.
 *
 * That copy writes the named exports alone, so this file has no default export. One here would read
 * as undefined on the phone. Anything outside the folder reaches the rest of it with `import type`
 * only, since a value import of another file here would survive the swap as a require for a file a
 * face without the define may not have.
 */

import { weatherPlugins as weatherMode } from './weather';
import { calendarPlugins as calendarMode } from './calendar';
import { musicPlugins as musicMode } from './music';
import { phonePlugins as phoneMode } from './phone';
import type { CalendarPlugins, MusicPlugins, PhonePlugins, WeatherPlugins } from './types';

/** Plugin weather, or null on a face built without `PLUGIN_WEATHER`. */
export const weatherPlugins: WeatherPlugins | null = weatherMode;

/** Plugin calendar events, or null on a face built without `PLUGIN_CALENDAR`. */
export const calendarPlugins: CalendarPlugins | null = calendarMode;

/** What the phone is playing, or null on a face built without `PLUGIN_MUSIC`. */
export const musicPlugins: MusicPlugins | null = musicMode;

/** The phone's battery, or null on a face built without `PLUGIN_PHONE`. */
export const phonePlugins: PhonePlugins | null = phoneMode;
