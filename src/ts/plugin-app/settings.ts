/**
 * A plugin app's settings, as its script keeps them and its settings page reads and saves them.
 *
 * A plugin app's settings page cannot keep its own settings, since the page's storage is not the
 * plugin's. So the page asks the plugin for them when it opens and hands them back on Save, and the
 * plugin keeps them. `handleSettings` answers the page, and `readSettings` reads them back in a
 * source handler.
 *
 * A key the plugin marks secret, such as a private iCal link, goes to `Pebble.secureStorage`, which the
 * phone encrypts and which only the plugin can read. The rest go to `localStorage` as one JSON value.
 * The plugin runs fresh for every request, so nothing is kept in a variable between runs.
 *
 * The page's side of the talk is `pluginSettingsPage` in page.ts. It runs on the page as text, so it
 * spells the two message types out itself, and the spec runs both sides against each other.
 */

import { pluginPebble } from './runtime';
import type { PluginPebble } from './runtime';

/** The message the page sends when it opens, for the saved settings. */
export const LOAD_MESSAGE = 'paf-settings-load';

/** The message the page sends on Save, carrying every setting on the page. */
export const SAVE_MESSAGE = 'paf-settings-save';

/** Where the settings that are not secret are kept in `localStorage`, as one JSON value. */
export const SETTINGS_KEY = 'paf-plugin-settings';

/** What a plugin app tells the settings helpers about its own settings. */
export interface SettingsOptions {
  /** The keys kept in `Pebble.secureStorage` rather than `localStorage`, such as an iCal link. */
  secret?: string[];
  /** The value each key reads as before the wearer saves one, normally the page's own defaults. */
  defaults?: Record<string, unknown>;
  /** The sources to have the Pebble app read again after a save, such as `calendar/event`. */
  refresh?: string[];
}

/** The part of `localStorage` the helpers use, which a spec stands in for. */
export type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * The plugin app's settings, its defaults under what the wearer saved.
 *
 * Saved settings that do not read as JSON read as none, so the defaults stand. A secret key that
 * cannot be read keeps its default in a source handler, so a phone whose keystore is locked still
 * serves with the other settings. The settings page asks for it strictly, since a page that opened on
 * a blank secret would delete the real one on its next save.
 *
 * @param options The plugin app's secret keys and defaults.
 * @param pebble The plugin runtime's `Pebble`, which a spec stands in for.
 * @param storage Where the other settings are kept, normally `localStorage`.
 * @param strict Whether a secret that cannot be read stops the read rather than keeping its default.
 * @return Every setting, saved or default.
 */
export async function readSettings(options: SettingsOptions = {}, pebble: PluginPebble = pluginPebble(), storage: SettingsStorage = localStorage, strict = false): Promise<Record<string, unknown>> {
  let saved: Record<string, unknown> = {};

  try {
    saved = JSON.parse(storage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    // unreadable, so the defaults stand
  }

  const settings: Record<string, unknown> = { ...(options.defaults || {}), ...saved };

  for (const key of options.secret || []) {
    try {
      const value = await pebble.secureStorage.getItem(key);

      if (typeof value === 'string') {
        settings[key] = value;
      }
    } catch (error) {
      if (strict) {
        throw error;
      }

      console.log(`plugin settings: could not read ${key} from secure storage: ${error}`);
    }
  }

  return settings;
}

/**
 * Keeps the settings the page saved. Each secret key goes to `Pebble.secureStorage` first, and one
 * saved empty is removed rather than kept as an empty value. The rest go to `localStorage` after, so a
 * secret that cannot be written leaves the other settings as they were. With more than one secret, the
 * ones written before the failure stay written.
 */
async function saveSettings(settings: Record<string, unknown>, options: SettingsOptions, pebble: PluginPebble, storage: SettingsStorage): Promise<void> {
  const secret = options.secret || [];
  const plain: Record<string, unknown> = {};

  for (const key of secret.filter((name) => name in settings)) {
    const value = settings[key];

    if (value === undefined || value === null || value === '') {
      await pebble.secureStorage.removeItem(key);
    } else {
      await pebble.secureStorage.setItem(key, String(value));
    }
  }

  Object.keys(settings).filter((key) => !secret.includes(key)).forEach((key) => {
    plain[key] = settings[key];
  });

  storage.setItem(SETTINGS_KEY, JSON.stringify(plain));
}

/**
 * Answers the plugin app's settings page.
 *
 * A load gets every setting, secret ones included, so the page opens on what was saved, and a secret
 * that cannot be read fails the load so the page cannot save over it. A save keeps the settings and
 * then has the Pebble app read the sources the plugin names again, so a changed setting shows without
 * waiting for the next refresh. Anything that fails is answered with the reason, which the page shows.
 *
 * @param options The plugin app's secret keys, defaults, and sources to read again.
 * @param pebble The plugin runtime's `Pebble`, which a spec stands in for.
 * @param storage Where the settings that are not secret are kept, normally `localStorage`.
 */
export function handleSettings(options: SettingsOptions = {}, pebble: PluginPebble = pluginPebble(), storage: SettingsStorage = localStorage): void {
  pebble.registerConfigHandler(async (message, respond) => {
    const type = typeof message === 'object' && message !== null ? (message as { type?: unknown }).type : undefined;

    try {
      if (type === LOAD_MESSAGE) {
        respond({ settings: await readSettings(options, pebble, storage, true) });
        return;
      }

      if (type === SAVE_MESSAGE) {
        const settings = (message as { settings?: unknown }).settings;

        if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
          respond({ error: 'the page sent no settings to save' });
          return;
        }

        await saveSettings(settings as Record<string, unknown>, options, pebble, storage);

        if (options.refresh && options.refresh.length > 0) {
          pebble.refreshSources(options.refresh);
        }

        respond({ ok: true });
        return;
      }

      respond({ error: 'the plugin does not know that message' });
    } catch (error) {
      respond({ error: String(error) });
    }
  });
}
