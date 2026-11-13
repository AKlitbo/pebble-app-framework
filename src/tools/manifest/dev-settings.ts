/**
 * Reads the settings a dev build applies, out of a `settings` block in a unit's paf.dev.config.json or
 * one step of a step walk.
 *
 * A setting goes by its message key, with the value the settings page would send for it: a number for
 * a choice, a whole number, or a colour as 0xRRGGBB, true or false for a toggle, and text for text. The
 * watch takes them through the settings catalogue the way it takes a save from the phone, in memory and
 * never saved, so the catalogue clamps a choice past its count and a face's own field takes its value
 * the same way. A key the face does not declare stops the build once the keys are known, in
 * checkSettingKeys.
 */
import { ToolError } from '../shared/tool-error.ts';
import { isObject } from '../shared/values.ts';

/** One setting's value, as the settings page sends it. */
export type DevValue = number | string;

/** A message key as the appinfo spells it. */
const KEY_NAME = /^[A-Z][A-Z0-9_]*$/;

/** The largest whole number a dictionary's int32 holds, and the smallest. */
const INT32_MAX = 2 ** 31 - 1;
const INT32_MIN = -(2 ** 31);

/**
 * Reads a settings block.
 *
 * A toggle's true or false goes in as 1 or 0, which is what the catalogue keeps it as.
 *
 * @param value The block as the file holds it.
 * @param file The file as a message names it.
 * @param owner `gridlock's ` for a face's entry, or empty for the top of the file.
 * @param field Where the block sits, such as `settings` or `walks.presets.steps[2].settings`.
 * @return Each setting's value by its message key.
 */
export function readSettings(value: unknown, file: string, owner: string, field: string = 'settings'): Record<string, DevValue> {
  if (!isObject(value)) {
    throw new ToolError(`${file} sets ${owner}${field} to ${JSON.stringify(value)}. It takes values by message key, such as { "APPEARANCE_THEME": 2 }`);
  }

  const settings: Record<string, DevValue> = Object.create(null);

  for (const [key, setting] of Object.entries(value)) {
    if (!KEY_NAME.test(key)) {
      throw new ToolError(`${file} sets ${owner}${field}.${key}, which is not a message key. A key is in capitals, such as APPEARANCE_THEME`);
    }

    if (typeof setting === 'boolean') {
      settings[key] = setting ? 1 : 0;
    } else if (typeof setting === 'string' || (typeof setting === 'number' && Number.isInteger(setting) && setting >= INT32_MIN && setting <= INT32_MAX)) {
      settings[key] = setting;
    } else {
      throw new ToolError(`${file} sets ${owner}${field}.${key} to ${JSON.stringify(setting)}. It takes a whole number, true or false, or text, as the settings page sends it`);
    }
  }

  return settings;
}

/**
 * Refuses a setting on a key the face does not declare, since the build would stop on its undeclared
 * MESSAGE_KEY with nothing to say where it came from.
 *
 * @param settings The settings, by message key.
 * @param keys The face's message keys, its own and the ones its features bring.
 * @param face The face, which a refusal names.
 * @param where Where the settings sit in the file, such as `settings` or `walks.presets.steps[2].settings`.
 */
export function checkSettingKeys(settings: Record<string, DevValue>, keys: string[], face: string, where: string): void {
  const undeclared = Object.keys(settings).filter((key) => !keys.includes(key));

  if (undeclared.length > 0) {
    throw new ToolError(`paf.dev.config.json sets ${face}'s ${where}.${undeclared.join(', ')}, which ${face} does not declare in its messageKeys`);
  }
}

/**
 * The bytes a dictionary holding these settings takes, the way the SDK's dict_calc_buffer_size counts.
 *
 * One byte heads the dictionary, and each entry takes seven for its key, type, and length before its
 * value. A number goes in as an int32, and text takes its UTF-8 bytes and a terminator.
 *
 * @param settings The settings, by message key.
 * @return The dictionary's size in bytes.
 */
export function dictSize(settings: Record<string, DevValue>): number {
  return Object.values(settings).reduce<number>((total, value) => total + 7 + (typeof value === 'number' ? 4 : Buffer.byteLength(value, 'utf8') + 1), 1);
}

/** What the face's settings page says about each key, which the type check reads. */
export type SettingsCatalogue = {
  /** How many choices the page offers on each choice key, by message key. */
  counts: Record<string, number>;
  /** Every control on the page, by its message key and its Clay type. */
  controls: Array<{ key: string; type: string }>;
  /** The keys the framework's catalogue keeps, with the field each keeps its value in and its own count. */
  known: Readonly<Record<string, { field: 'default_num'; count?: number } | { field: 'default_str'; size: number }>>;
};

/** The Clay types whose value is a choice, which the catalogue keeps as a number below its count. */
const CHOICE_CONTROLS = ['select', 'radiogroup', 'themePreview'];

/** The largest colour the catalogue keeps, as 0xRRGGBB. */
const COLOUR_MAX = 0xffffff;

/**
 * Refuses a setting whose value the face's settings catalogue would not take, naming the key and what
 * it takes.
 *
 * The catalogue skips a value of the wrong type and keeps what the field held, and resets a choice past
 * its count to the default, so either would build and show the wrong screen without a word. A key the
 * page has no control for and the framework does not keep, such as a face's own field written by its
 * own component, takes any value, since the type is the face's alone.
 *
 * @param settings The settings, by message key.
 * @param catalogue What the face's settings page and the framework's catalogue say about each key.
 * @param face The face, which a refusal names.
 * @param where Where the settings sit in the file, such as `settings` or `walks.presets.steps[2].settings`.
 */
export function checkSettingTypes(settings: Record<string, DevValue>, catalogue: SettingsCatalogue, face: string, where: string): void {
  for (const [key, value] of Object.entries(settings)) {
    const at = `paf.dev.config.json sets ${face}'s ${where}.${key} to ${JSON.stringify(value)}`;
    const known = catalogue.known[key];
    const type = catalogue.controls.find((control) => control.key === key)?.type;

    if (known?.field === 'default_str' || type === 'input') {
      if (typeof value !== 'string') {
        throw new ToolError(`${at}, but it is text. Write it in quotes`);
      }

      if (known?.field === 'default_str' && Buffer.byteLength(value, 'utf8') >= known.size) {
        throw new ToolError(`${at}, which is longer than the ${known.size - 1} bytes the watch keeps`);
      }

      continue;
    }

    const count = known?.field === 'default_num' && known.count !== undefined ? known.count : catalogue.counts[key];
    const choice = known?.field === 'default_num' || (type !== undefined && CHOICE_CONTROLS.includes(type));
    const limit = type === 'toggle' ? 2 : type === 'color' ? COLOUR_MAX + 1 : choice ? count : undefined;

    if (!choice && type !== 'toggle' && type !== 'color') {
      continue;
    }

    if (typeof value !== 'number') {
      throw new ToolError(`${at}, but it is ${type === 'toggle' ? 'a toggle, true or false' : type === 'color' ? 'a colour, 0xRRGGBB written as a whole number such as 16711680' : 'a choice, a whole number'}`);
    }

    if (limit !== undefined && (value < 0 || value >= limit)) {
      throw new ToolError(`${at}, which is past what it holds, 0 to ${limit - 1}. The watch would reset it to its default`);
    }
  }
}
