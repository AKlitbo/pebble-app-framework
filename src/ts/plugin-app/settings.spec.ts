/**
 * Specs for a plugin app's settings, as its script keeps them.
 *
 * The plugin runs fresh for every request and its settings page cannot keep anything itself, so these
 * helpers are the only place a wearer's choices live. The parts worth pinning are where each key goes,
 * a secret one only to secure storage, what a missing or broken saved value reads as, and what the page
 * hears back, since a save that fails without saying so loses the wearer's change.
 */

import { describe, test, expect } from 'vitest';
import { handleSettings, LOAD_MESSAGE, readSettings, SAVE_MESSAGE, SETTINGS_KEY } from './settings';
import type { PluginPebble } from './runtime';

/** A plugin runtime with its secure storage and config handler kept where a spec can reach them. */
function fakeRuntime(failSecureWrites = false, failSecureReads = false) {
  const secure = new Map<string, string>();
  const refreshed: string[][] = [];
  let handler: ((message: unknown, respond: (reply: unknown) => void) => void | Promise<void>) | null = null;
  const pebble = {
    registerConfigHandler: (fn: typeof handler) => { handler = fn; },
    refreshSources: (sources: string[]) => { refreshed.push(sources); },
    secureStorage: {
      getItem: async (key: string) => {
        if (failSecureReads) {
          throw new Error('the keystore is locked');
        }

        return secure.get(key) ?? null;
      },
      setItem: async (key: string, value: string) => {
        if (failSecureWrites) {
          throw new Error('the keystore is locked');
        }

        secure.set(key, value);
      },
      removeItem: async (key: string) => { secure.delete(key); },
    },
  } as unknown as PluginPebble;

  /** Sends the handler a message and hands back its answer. */
  async function send(message: unknown): Promise<unknown> {
    let reply: unknown;

    await handler?.(message, (answer) => { reply = answer; });
    return reply;
  }

  return { pebble, secure, refreshed, send };
}

/** A localStorage with nothing in it but what the spec puts there. */
function fakeStorage(start: Record<string, string> = {}) {
  const store = new Map(Object.entries(start));

  return { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); }, store };
}

describe('handleSettings', () => {
  /** A private link in localStorage is readable by the app's PebbleKit JS and sits unencrypted on the phone. */
  test('keeps a secret key only in secure storage', async () => {
    const runtime = fakeRuntime();
    const storage = fakeStorage();

    handleSettings({ secret: ['FEED_URL'] }, runtime.pebble, storage);

    const result = await runtime.send({ type: SAVE_MESSAGE, settings: { FEED_ON: true, FEED_URL: 'https://example.com/a.ics' } });

    expect(result).toEqual({ ok: true });
    expect(runtime.secure.get('FEED_URL')).toBe('https://example.com/a.ics');
    expect(JSON.parse(storage.store.get(SETTINGS_KEY) ?? '{}')).toEqual({ FEED_ON: true });
  });

  /** The page opens on what the plugin answers, so a secret left out of the load comes back blank and the next save wipes it. */
  test('loads every saved setting, the secret ones included', async () => {
    const runtime = fakeRuntime();
    const storage = fakeStorage();

    handleSettings({ secret: ['FEED_URL'] }, runtime.pebble, storage);
    await runtime.send({ type: SAVE_MESSAGE, settings: { FEED_ON: true, FEED_URL: 'https://example.com/a.ics' } });

    const result = await runtime.send({ type: LOAD_MESSAGE });

    expect(result).toEqual({ settings: { FEED_ON: true, FEED_URL: 'https://example.com/a.ics' } });
  });

  /** A changed setting has to reach the faces now, not at the next refresh minutes later. */
  test('has the Pebble app read the plugin\'s sources again after a save', async () => {
    const runtime = fakeRuntime();

    handleSettings({ refresh: ['calendar/event'] }, runtime.pebble, fakeStorage());

    await runtime.send({ type: SAVE_MESSAGE, settings: { FEED_ON: true } });

    expect(runtime.refreshed).toEqual([['calendar/event']]);
  });

  /**
   * The page only closes on a save that worked, so a failure it never hears about loses the wearer's
   * change silently. The other settings stay as they were, so a failed save is not half done.
   */
  test('answers a save that fails with the reason and keeps the earlier settings', async () => {
    const runtime = fakeRuntime(true);
    const storage = fakeStorage({ [SETTINGS_KEY]: JSON.stringify({ FEED_ON: false }) });

    handleSettings({ secret: ['FEED_URL'] }, runtime.pebble, storage);

    const result = await runtime.send({ type: SAVE_MESSAGE, settings: { FEED_ON: true, FEED_URL: 'https://example.com/a.ics' } });

    expect(result).toEqual({ error: 'Error: the keystore is locked' });
    expect(JSON.parse(storage.store.get(SETTINGS_KEY) ?? '{}')).toEqual({ FEED_ON: false });
  });

  /** A page that opened on a blank secret it could not read would delete the real one on its next save. */
  test('fails the load when a secret cannot be read', async () => {
    const runtime = fakeRuntime(false, true);

    handleSettings({ secret: ['FEED_URL'] }, runtime.pebble, fakeStorage());

    const result = await runtime.send({ type: LOAD_MESSAGE });

    expect(result).toEqual({ error: 'Error: the keystore is locked' });
  });

});

describe('readSettings', () => {
  /** A wearer who never saved still gets the page's defaults, rather than a plugin running with nothing set. */
  test('reads the defaults under what was saved', async () => {
    const runtime = fakeRuntime();
    const storage = fakeStorage({ [SETTINGS_KEY]: JSON.stringify({ REFRESH: '5' }) });

    const result = await readSettings({ defaults: { REFRESH: '30', FEED_ON: false } }, runtime.pebble, storage);

    expect(result).toEqual({ REFRESH: '5', FEED_ON: false });
  });

  /** Saved settings that do not read as JSON would throw in every run, so the plugin would serve nothing at all. */
  test('reads broken saved settings as the defaults', async () => {
    const runtime = fakeRuntime();

    const result = await readSettings({ defaults: { REFRESH: '30' } }, runtime.pebble, fakeStorage({ [SETTINGS_KEY]: '{ not json' }));

    expect(result).toEqual({ REFRESH: '30' });
  });

  /** A source handler still serves with the other settings when the phone's keystore is locked for a moment. */
  test('keeps the default of a secret it cannot read in a source handler', async () => {
    const runtime = fakeRuntime(false, true);

    const result = await readSettings({ secret: ['FEED_URL'], defaults: { FEED_URL: '', REFRESH: '30' } }, runtime.pebble, fakeStorage());

    expect(result).toEqual({ FEED_URL: '', REFRESH: '30' });
  });
});
