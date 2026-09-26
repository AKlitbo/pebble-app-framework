/**
 * Reads the Clay settings the phone keeps, and diffs them across a settings save.
 *
 * Shared by the app and the features it starts, so every part of the runtime reads settings the same
 * way.
 */

// the anys here sit at a genuinely dynamic boundary: whatever the user saved to localStorage
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Reads the persisted Clay settings from localStorage.
 *
 * @return The saved settings, or an empty object when there is nothing saved yet or
 *   the stored value will not parse.
 */
export function getConfig(): Record<string, any> {
  try {
    return JSON.parse(localStorage.getItem('clay-settings') as string) || {};
  } catch (error) {
    return {};
  }
}

/**
 * Unwraps a Clay value, applying a fallback for empty values.
 *
 * @param value The raw Clay value, which may already be unwrapped or still wrapped
 *   as an object with a value field.
 * @param fallback What to return when the value is missing or empty.
 * @return The unwrapped value, or the fallback.
 */
export function readValue(value: any, fallback: any): any {
  let result = value;

  if (result && typeof result === 'object' && 'value' in result) {
    result = result.value;
  }

  if (result === undefined || result === null || result === '') {
    return fallback;
  }

  return result;
}

/**
 * Reads a text Clay setting, applying a fallback only when it was never saved.
 *
 * A text field the wearer emptied saves an empty string, and that is their choice, so it is kept.
 * Taking the fallback for it would bring a field with a default straight back, and a cleared
 * watchlist or calendar link could never be cleared.
 *
 * @param value The raw Clay value, which may already be unwrapped or still wrapped.
 * @param fallback What to return when the value is missing.
 * @return The setting as a string, or the fallback.
 */
export function readText(value: any, fallback: string): string {
  let result = value;

  if (result && typeof result === 'object' && 'value' in result) {
    result = result.value;
  }

  if (result === undefined || result === null) {
    return fallback;
  }

  return String(result);
}

/**
 * Reads a boolean Clay setting, applying a fallback when it is unset.
 *
 * @param value The raw Clay value.
 * @param fallback What to return when the value is missing or empty.
 * @return The setting as a real boolean.
 */
export function readBool(value: any, fallback: boolean): boolean {
  const result = readValue(value, fallback);
  return result === true || result === 'true' || result === 1 || result === '1';
}

/**
 * Snapshots the settings behind a key list so a later save can be diffed against them. A setting
 * with nothing saved reads as its default, which is what a fetch used for it, so a first save or
 * seed that writes the default back does not count as a change. A single value compares by its
 * text, since a default declared as the number 0 comes back from Clay as the string "0", and
 * anything else is JSON-encoded so objects compare by content.
 *
 * @param keys The settings to snapshot, by message key.
 * @param defaults The face's config defaults, read for a setting with nothing saved.
 * @return Each setting as text, in the same order as the keys.
 */
export function settingsSnapshot(keys: string[], defaults: Record<string, unknown> = {}): string[] {
  const config = getConfig();
  return keys.map((key) => {
    const value = config[key] === undefined ? defaults[key] : config[key];
    return ['string', 'number', 'boolean'].includes(typeof value) ? String(value) : JSON.stringify(value);
  });
}

/**
 * Reports whether any setting behind a key list changed between two snapshots.
 *
 * @param keys The settings the snapshots were taken of.
 * @param before The snapshot from before the settings page opened, or null when none was taken.
 * @param after The snapshot from after it closed.
 * @return True when a setting changed, or when there was no before snapshot to compare.
 */
export function settingsChanged(keys: string[], before: string[] | null, after: string[]): boolean {
  // no snapshot means the page never reported opening so refetch to be safe
  if (!before) {
    return true;
  }

  // walks the key list rather than the snapshot so a short after array cannot cut the diff early
  return keys.some((key, index) => after[index] !== before[index]);
}

/** Watches some settings across one visit to the settings page. */
export interface SettingsWatch {
  /** The page is opening, so the saved values are still the old ones. Snapshots them. */
  opened(): void;
  /** The page closed and saved. Reports whether any watched setting moved, and forgets the snapshot. */
  changed(): boolean;
}

/**
 * Watches a list of settings across a visit to the settings page, so a feature refetches only when
 * one of its own settings moved rather than on every save.
 *
 * @param keys The settings to watch, by message key.
 * @param defaults The face's config defaults, read for a setting with nothing saved.
 * @return The watch. Call opened when the page opens and changed once it has saved.
 */
export function watchSettings(keys: string[], defaults: Record<string, unknown> = {}): SettingsWatch {
  let before: string[] | null = null;

  return {
    opened() {
      before = settingsSnapshot(keys, defaults);
    },

    changed() {
      const snapshot = before;

      before = null;

      return settingsChanged(keys, snapshot, settingsSnapshot(keys, defaults));
    },
  };
}
