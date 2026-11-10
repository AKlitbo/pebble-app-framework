/**
 * The phone's battery from a Pebble app plugin, as the whole percent the watch shows.
 *
 * The Pebble app's own Phone plugin serves `phone/phone_state` on Android and iOS, with one instance
 * holding `battery_level` as a percent, beside the cell, Wi-Fi, and mobile data readings this leaves
 * alone. It sends the whole state on any change, so a Wi-Fi switch with the battery where it was
 * still arrives, and the feature's deduped sender is what keeps the watch asleep then. iOS only moves
 * the level in steps of 5, and the watch shows it as it comes. Reading it asks the wearer for no
 * permission.
 *
 * The page hook's wording lives here too, so a face built without `PLUGIN_PHONE` carries none of it.
 */

import { firstProperties, numeric } from './shapes';
import type { PluginSourceTexts } from './page';
import { PHONE_STANDARD } from './standard';
import { createReadingDriver } from './reading-driver';
import type { PhonePlugins, SourceEnvelope } from './types';

/** The properties the phone subscription asks for, the battery alone. */
export const PHONE_PROPERTIES = ['battery_level'];

/** The level the watch takes for no reading. */
export const NO_LEVEL = -1;

/**
 * Turns one phone plugin update into the battery level the watch shows.
 *
 * The level is rounded to a whole percent and kept from 0 to 100, so a plugin sending a fraction or
 * a number past either end still reads as a battery. An update with no instance, or one with no
 * number for the battery, reads as no reading.
 *
 * @param envelope The update, which may be missing or carry anything.
 * @return The level from 0 to 100, or -1 for none.
 */
export function batteryFromUpdate(envelope: SourceEnvelope | null | undefined): number {
  const properties = firstProperties(envelope);
  const level = properties ? numeric(properties.battery_level) : undefined;

  if (!level) {
    return NO_LEVEL;
  }

  return Math.min(100, Math.max(0, Math.round(level.value)));
}

/** The phone battery page hook's notes. */
export const PHONE_TEXTS: PluginSourceTexts = {
  notStandard: (pluginName) => `${pluginName} sends phone details this watchface cannot read. Pick the Pebble app's own Phone plugin under Preferred Sources in the Pebble app.`,
  noPlugin: 'Phone battery comes from the Phone plugin built into the Pebble app. Turn on plugins in the Pebble app under Settings, Plugins, or update the Pebble app.',
};

/**
 * Everything the phone battery feature reads the plugin with, which plugin-sources/index hands it on
 * a face built with `PLUGIN_PHONE`.
 */
export const phonePlugins: PhonePlugins = {
  driver: createReadingDriver({
    category: 'phone',
    item: 'phone_state',
    properties: PHONE_PROPERTIES,
    requestKey: 'PHONE_REQUEST',
    fromUpdate: batteryFromUpdate,
    empty: NO_LEVEL,
    standard: PHONE_STANDARD,
    texts: PHONE_TEXTS,
  }),
};

export default { batteryFromUpdate, PHONE_PROPERTIES, PHONE_TEXTS, NO_LEVEL };
