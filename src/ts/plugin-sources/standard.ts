/**
 * Checks what a Pebble app plugin says it serves, against what a feature needs to read.
 *
 * The phone only holds a plugin's data to that plugin's own manifest. A weather plugin that names its
 * reading `temp` rather than `temperature` still reaches the face, which then finds nothing it can
 * use. So the face reads the manifest itself and warns the wearer on the settings page.
 *
 * Every plugin list comes off the phone, so a missing or odd field reads as not served rather than
 * throwing.
 */

import type { PluginSummary, SourceDeclaration } from './types';

/** Each property a feature needs, mapped to the shapes that satisfy it. Any one of them is enough. */
export type StandardReadings = Record<string, string[]>;

/**
 * The readings a weather plugin needs for the face to show anything, the names Core's plugin guide
 * gives the weather category. The rest stay optional, and a plugin leaving one out only leaves
 * that readout on its dashes.
 */
export const WEATHER_STANDARD: StandardReadings = {
  temperature: ['numericValue'],
  condition_code: ['longText'],
};

/**
 * The readings a calendar plugin needs for an event to land on the agenda, the title and the start.
 * The guide publishes no names for `calendar/event`, so these are the built-in calendar plugin's.
 * The end stays optional, since the mapping gives an event with no end an hour, or a day when it is
 * all day.
 */
export const CALENDAR_STANDARD: StandardReadings = {
  name: ['shortText', 'longText'],
  starts_at: ['timestamp'],
};

/**
 * The reading a phone plugin needs for the face to show the phone's battery, as the Pebble app's own
 * Phone plugin names it under `phone/phone_state`.
 */
export const PHONE_STANDARD: StandardReadings = {
  battery_level: ['numericValue'],
};

/**
 * The readings a music plugin needs for the face to show what is playing, as the Pebble app's own
 * Music plugin names them under `music/track`. The artist stays optional, and a plugin leaving it out
 * only leaves that line empty.
 */
export const MUSIC_STANDARD: StandardReadings = {
  title: ['shortText', 'longText'],
  playing: ['boolean'],
};

/** The blocks of one plugin's manifest that serve a category and item. */
function declarationsFor(plugin: PluginSummary | undefined, category: string, item: string): SourceDeclaration[] {
  if (!plugin || typeof plugin !== 'object' || !Array.isArray(plugin.sources)) {
    return [];
  }

  return plugin.sources.filter((source) => {
    return Boolean(source) && typeof source === 'object' && source.category === category && Array.isArray(source.items) && source.items.includes(item);
  });
}

/** Whether one manifest block offers every needed property in at least one shape that satisfies it. */
function declaresAll(source: SourceDeclaration, required: StandardReadings): boolean {
  const properties = source.properties && typeof source.properties === 'object' ? source.properties : {};

  return Object.keys(required).every((name) => {
    const offered = properties[name];

    return Array.isArray(offered) && required[name].some((shape) => offered.includes(shape));
  });
}

/**
 * Whether one plugin's manifest declares what a feature needs.
 *
 * The plugin passes when one block serving the item offers every needed property. Two blocks for one
 * item are not read together, since the manifest has nothing that says which one the data follows.
 *
 * @param plugin One entry from the plugin list.
 * @param category The category the feature subscribes to, such as `weather`.
 * @param item The item inside it, such as `location`.
 * @param required Each property the feature needs, mapped to the shapes that satisfy it.
 * @return True when the plugin serves the item and declares every needed property.
 */
export function declaresStandard(plugin: PluginSummary | undefined, category: string, item: string, required: StandardReadings): boolean {
  return declarationsFor(plugin, category, item).some((source) => declaresAll(source, required));
}

/**
 * Whether any installed plugin serves a category and item.
 *
 * @param plugins The plugin list, as the subscription reads it.
 * @param category The category, such as `calendar`.
 * @param item The item inside it, such as `event`.
 * @return True when at least one plugin lists the item under the category.
 */
export function servesItem(plugins: PluginSummary[], category: string, item: string): boolean {
  return Array.isArray(plugins) && plugins.some((plugin) => declarationsFor(plugin, category, item).length > 0);
}

export default { declaresStandard, servesItem, WEATHER_STANDARD, CALENDAR_STANDARD, PHONE_STANDARD, MUSIC_STANDARD };
