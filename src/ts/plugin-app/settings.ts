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

/** How long a save's `onSaved` hook, and the refresh after it, get before the page hears the save as kept anyway. */
export const SAVE_HOOK_LIMIT_MS = 4000;

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

/** What a plugin app's own code hears from `handleSettings`, beside the load and the save it answers. */
export interface SettingsHooks {
  /**
   * Answers a message from the settings page that is neither the load nor the save, such as one asking
   * for something only the plugin can read. It calls `respond` once, before it returns or before its
   * promise settles. A message it does not reply to in that time gets the error `handleSettings` gives
   * a message it does not know, so the page is never left waiting, and a `respond` after that is only
   * logged. Only the first reply goes to the page. A hook that throws before replying is answered with
   * the error, and one that throws after is logged.
   */
  onMessage?: (type: unknown, message: unknown, respond: (reply: unknown) => void) => void | Promise<void>;
  /**
   * Hears a save once it is kept, with the settings before and after it. Each has the defaults under
   * what was saved and leaves out every secret key, so a key that was saved in plain storage before the
   * plugin made it secret is left out too.
   *
   * The hook runs, and its promise settles, before the page hears the save as kept, since the Pebble app
   * ends the plugin's run as soon as the page is answered and a hook still running then may never
   * finish. The Pebble app is asked to read the sources again after the hook, so a run it starts sees
   * what the hook did. The page gives up on a save after about five seconds, so the page hears the save
   * as kept once `SAVE_HOOK_LIMIT_MS`, 4 seconds, has passed, whether or not the hook has finished, and
   * the wait is logged. Keep the hook's work well inside that. The hooks run one at a time in the order
   * the saves came in, and each hears the settings as its own save left them. A hook that throws or
   * rejects is logged, and the page still hears the save as kept.
   */
  onSaved?: (before: Record<string, unknown>, after: Record<string, unknown>) => void | Promise<void>;
}

/** Settles true once the work settles, or false once the limit passes first. */
function settlesWithin(work: Promise<unknown>, limitMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), limitMs);
    const done = () => {
      clearTimeout(timer);
      resolve(true);
    };

    work.then(done, done);
  });
}

/** The `type` a message from the settings page carries, or undefined for anything that is not an object. */
function messageType(message: unknown): unknown {
  return typeof message === 'object' && message !== null ? (message as { type?: unknown }).type : undefined;
}

/** The settings saved in plain storage, or none for a saved value that is not a JSON object. */
function readSavedSettings(storage: SettingsStorage): Record<string, unknown> {
  try {
    const saved = JSON.parse(storage.getItem(SETTINGS_KEY) || 'null');

    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch {
    // unreadable, so nothing was saved that can be used
    return {};
  }
}

/**
 * The plugin app's settings, its defaults under what the wearer saved.
 *
 * Saved settings that do not read as a JSON object read as none, so the defaults stand. A secret key that
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
  // a saved value that does not read as an object leaves the defaults standing
  const settings: Record<string, unknown> = { ...(options.defaults || {}), ...readSavedSettings(storage) };

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
 * Hands a message to the plugin's own `onMessage` and says whether the page got its answer. Only the
 * first reply reaches the page, so a hook that replies and then throws sends no second, error reply.
 * The reply closes once the hook returns or its promise settles, so a `respond` from a callback after
 * that, once the page has had the error, is only logged.
 */
async function answerOwn(onMessage: NonNullable<SettingsHooks['onMessage']>, type: unknown, message: unknown, respond: (reply: unknown) => void): Promise<boolean> {
  let replied = false;
  let open = true;
  const once = (reply: unknown): void => {
    if (!open) {
      console.log('plugin settings: the message hook replied after it returned, so the reply was dropped');
      return;
    }

    if (!replied) {
      replied = true;
      respond(reply);
    }
  };

  try {
    await onMessage(type, message, once);
  } catch (error) {
    if (!replied) {
      throw error;
    }

    console.log(`plugin settings: the message hook threw after it replied: ${error}`);
  } finally {
    open = false;
  }

  return replied;
}

/** The settings in plain storage with the defaults under them and every secret key left out, for `onSaved`. */
function plainSettings(options: SettingsOptions, storage: SettingsStorage): Record<string, unknown> {
  const settings: Record<string, unknown> = { ...(options.defaults || {}), ...readSavedSettings(storage) };

  (options.secret || []).forEach((key) => delete settings[key]);

  return settings;
}

/**
 * Answers the plugin app's settings page.
 *
 * A load gets every setting, secret ones included, so the page opens on what was saved, and a secret
 * that cannot be read fails the load so the page cannot save over it. A save keeps the settings and
 * then has the Pebble app read the sources the plugin names again, so a changed setting shows without
 * waiting for the next refresh. Anything that fails is answered with the reason, which the page shows.
 *
 * The plugin runtime takes one config handler, so a plugin app that answers messages of its own, or
 * acts on a save, does it through `hooks` rather than a handler of its own. With no hooks, a message
 * that is neither the load nor the save is answered with an error.
 *
 * Saves are kept one at a time, in the order they came in, so a second save never reads the
 * settings halfway through the first one's write.
 *
 * @param options The plugin app's secret keys, defaults, and sources to read again.
 * @param pebble The plugin runtime's `Pebble`, which a spec stands in for.
 * @param storage Where the settings that are not secret are kept, normally `localStorage`.
 * @param hooks The plugin app's answer to its own messages, and what it does once a save is kept.
 */
export function handleSettings(options: SettingsOptions = {}, pebble: PluginPebble = pluginPebble(), storage: SettingsStorage = localStorage, hooks: SettingsHooks = {}): void {
  // the saves still being written, and the save hooks still running, each in the order they came in
  let saving: Promise<unknown> = Promise.resolve();
  let hearing: Promise<unknown> = Promise.resolve();

  const refresh = (): void => {
    if (options.refresh && options.refresh.length > 0) {
      pebble.refreshSources(options.refresh);
    }
  };

  pebble.registerConfigHandler(async (message, respond) => {
    const type = messageType(message);

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

        const kept = saving.then(async () => {
          const before = plainSettings(options, storage);

          await saveSettings(settings as Record<string, unknown>, options, pebble, storage);

          return { before, after: plainSettings(options, storage) };
        });

        saving = kept.catch(() => undefined);

        const { before, after } = await kept;
        const onSaved = hooks.onSaved;

        if (!onSaved) {
          refresh();
          respond({ ok: true });
          return;
        }

        // the hook runs before the answer, since the Pebble app ends the run once the page is answered
        // and a hook left running, such as one deleting pins, would be cut off. the refresh waits for
        // the hook so a run it starts sees what the hook did
        const ran = hearing.then(async () => {
          try {
            await onSaved(before, after);
          } catch (error) {
            console.log(`plugin settings: the save hook threw: ${error}`);
          }

          try {
            refresh();
          } catch (error) {
            console.log(`plugin settings: the refresh after a save threw: ${error}`);
          }
        });

        // the page hears the save as kept once 4 seconds have passed since it was kept, whether or not
        // the hook and the refresh have finished. a hook still going then can be cut off when the run
        // ends, and a save tapped behind a stuck one can have its own hook start late. that is worth it
        // since the page gives up after five seconds, and a wait with no cap shows a kept save as failed
        // and holds back every save chained behind it. 4 leaves the answer a second to reach the page.
        // the cap counts from the save being kept, not from its hook starting, so a save queued behind
        // another still answers in time
        const heard = settlesWithin(ran, SAVE_HOOK_LIMIT_MS).then((finished) => {
          if (!finished) {
            console.log(`plugin settings: the save hook ran past ${SAVE_HOOK_LIMIT_MS} ms, so the page hears the save as kept without it`);
          }
        });

        hearing = heard;
        await heard;
        respond({ ok: true });
        return;
      }

      if (hooks.onMessage && (await answerOwn(hooks.onMessage, type, message, respond))) {
        return;
      }

      respond({ error: 'the plugin does not know that message' });
    } catch (error) {
      respond({ error: String(error) });
    }
  });
}
