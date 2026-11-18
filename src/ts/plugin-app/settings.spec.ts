/**
 * Specs for a plugin app's settings, as its script keeps them.
 *
 * The plugin runs fresh for every request and its settings page cannot keep anything itself, so these
 * helpers are the only place a wearer's choices live. The parts worth pinning are where each key goes,
 * a secret one only to secure storage, what a missing or broken saved value reads as, and what the page
 * hears back, since a save that fails without saying so loses the wearer's change.
 */

import { describe, test, expect, vi } from 'vitest';
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

  /** A saved list spread its indexes into the settings as keys of their own, which no page ever saved. */
  test('reads a saved value that is not an object as the defaults', async () => {
    const runtime = fakeRuntime();

    const result = await readSettings({ defaults: { REFRESH: '30' } }, runtime.pebble, fakeStorage({ [SETTINGS_KEY]: '["5"]' }));

    expect(result).toEqual({ REFRESH: '30' });
  });
});

describe('the hooks', () => {
  /** The runtime takes one config handler, so a plugin's own message with no hook has to be told it is not known rather than left hanging. */
  test('answers a message it does not know with an error when there is no hook', async () => {
    const runtime = fakeRuntime();

    handleSettings({}, runtime.pebble, fakeStorage());
    const result = await runtime.send({ type: 'my-plugin-units' });

    expect(result).toEqual({ error: 'the plugin does not know that message' });
  });

  /** A plugin answering its own messages beside the settings has no handler of its own to answer them with. */
  test('hands a message it does not know to onMessage with its type', async () => {
    const runtime = fakeRuntime();
    const heard: unknown[] = [];

    handleSettings({}, runtime.pebble, fakeStorage(), { onMessage: (type, message, respond) => { heard.push(type, message); respond({ units: 'metric' }); } });
    const reply = await runtime.send({ type: 'my-plugin-units', extra: 1 });

    const result = [reply, heard];

    expect(result).toEqual([{ units: 'metric' }, ['my-plugin-units', { type: 'my-plugin-units', extra: 1 }]]);
  });

  /**
   * A hook that did not wait for its own callback had the page hear the error and then its late reply
   * as well, so the page saw two answers to one message.
   */
  test('drops a reply onMessage makes after it returned', async () => {
    const runtime = fakeRuntime();
    const replies: unknown[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let later: () => void = () => undefined;
    let handler: ((message: unknown, respond: (reply: unknown) => void) => Promise<void>) | null = null;
    const pebble = { ...runtime.pebble, registerConfigHandler: (registered: typeof handler) => void (handler = registered) } as unknown as PluginPebble;

    handleSettings({}, pebble, fakeStorage(), { onMessage: (_type, _message, respond) => void (later = () => respond({ units: 'metric' })) });
    await handler!({ type: 'my-plugin-units' }, (reply) => void replies.push(reply));
    later();
    log.mockRestore();

    expect(replies).toEqual([{ error: 'the plugin does not know that message' }]);
  });

  /** A hook that forgot to reply for a type it does not know left the page's sendMessage waiting for good. */
  test('answers with the error when onMessage returns without replying', async () => {
    const runtime = fakeRuntime();

    handleSettings({}, runtime.pebble, fakeStorage(), { onMessage: () => undefined });
    const result = await runtime.send({ type: 'someone-else' });

    expect(result).toEqual({ error: 'the plugin does not know that message' });
  });

  /** A hook that replied and then threw had the page hear a second, error reply after its real answer. */
  test('sends one reply when onMessage replies and then throws', async () => {
    const runtime = fakeRuntime();
    const replies: unknown[] = [];
    let handler: ((message: unknown, respond: (reply: unknown) => void) => Promise<void>) | null = null;
    const pebble = { ...runtime.pebble, registerConfigHandler: (registered: typeof handler) => void (handler = registered) } as unknown as PluginPebble;

    handleSettings({}, pebble, fakeStorage(), {
      onMessage: (_type, _message, respond) => {
        respond({ units: 'metric' });
        throw new Error('boom');
      },
    });
    await handler!({ type: 'my-plugin-units' }, (reply) => void replies.push(reply));

    expect(replies).toEqual([{ units: 'metric' }]);
  });

  /** A hook that threw before replying would otherwise leave the page with no answer at all. */
  test('answers with the reason when onMessage throws before replying', async () => {
    const runtime = fakeRuntime();

    handleSettings({}, runtime.pebble, fakeStorage(), { onMessage: () => { throw new Error('boom'); } });
    const result = await runtime.send({ type: 'my-plugin-units' });

    expect(result).toEqual({ error: 'Error: boom' });
  });

  /** A hook that took the load or the save would leave the page opening blank or never saving. */
  test('keeps answering the load and the save itself with onMessage set', async () => {
    const runtime = fakeRuntime();
    const heard: unknown[] = [];

    handleSettings({ defaults: { REFRESH: '30' } }, runtime.pebble, fakeStorage(), { onMessage: (type) => void heard.push(type) });
    const loaded = await runtime.send({ type: LOAD_MESSAGE });
    const saved = await runtime.send({ type: SAVE_MESSAGE, settings: { REFRESH: '15' } });

    const result = [loaded, saved, heard];

    expect(result).toEqual([{ settings: { REFRESH: '30' } }, { ok: true }, []]);
  });

  /**
   * A plugin acting on a changed setting, such as lifting a hold when a plan switch flips, needs the
   * settings before and after. A secret in either would hand an API key to code that only compares
   * switches, and a default missing from before would read as a change the wearer never made.
   */
  test('tells onSaved the settings before and after, defaults under them and secrets left out', async () => {
    const runtime = fakeRuntime();
    const storage = fakeStorage({ [SETTINGS_KEY]: JSON.stringify({ PAID: false, FEED_URL: 'https://old.example' }) });
    const heard: unknown[] = [];

    handleSettings({ secret: ['FEED_URL'], defaults: { REFRESH: '30', PAID: false } }, runtime.pebble, storage, { onSaved: (before, after) => void heard.push(before, after) });
    await runtime.send({ type: SAVE_MESSAGE, settings: { PAID: true, FEED_URL: 'https://new.example' } });

    expect(heard).toEqual([
      { REFRESH: '30', PAID: false },
      { REFRESH: '30', PAID: true },
    ]);
  });

  /** A hook run on a save that failed would act on settings the plugin never kept. */
  test('runs onSaved only for a save it kept', async () => {
    const runtime = fakeRuntime(true);
    const heard: unknown[] = [];

    handleSettings({ secret: ['FEED_URL'] }, runtime.pebble, fakeStorage(), { onSaved: () => void heard.push('saved') });
    await runtime.send({ type: SAVE_MESSAGE, settings: { FEED_URL: 'https://new.example' } });

    expect(heard).toEqual([]);
  });

  /**
   * The page gives up on a save after five seconds. Answering only once a slow hook finished made a kept
   * save look failed there, so the page hears it kept first, and the refresh waits for the hook so a run
   * it starts sees what the hook did.
   */
  test('answers the save as kept before onSaved runs, and refreshes once it settles', async () => {
    const runtime = fakeRuntime();
    const order: string[] = [];
    let finish: () => void = () => undefined;
    let handler: ((message: unknown, respond: (reply: unknown) => void) => Promise<void>) | null = null;
    const pebble = {
      ...runtime.pebble,
      registerConfigHandler: (registered: typeof handler) => void (handler = registered),
      refreshSources: () => void order.push('refresh'),
    } as unknown as PluginPebble;

    handleSettings({ refresh: ['weather/location'] }, pebble, fakeStorage(), {
      onSaved: () => new Promise<void>((resolve) => {
        order.push('hook started');

        finish = () => {
          order.push('hook done');
          resolve();
        };
      }),
    });
    const done = handler!({ type: SAVE_MESSAGE, settings: { REFRESH: '15' } }, (reply) => void order.push(`reply ${JSON.stringify(reply)}`));

    for (let turn = 0; turn < 10; turn++) {
      await Promise.resolve();
    }

    const whileRunning = [...order];

    finish();
    await done;

    const result = [whileRunning, order];

    expect(result).toEqual([
      ['reply {"ok":true}', 'hook started'],
      ['reply {"ok":true}', 'hook started', 'hook done', 'refresh'],
    ]);
  });

  /**
   * A second tap while the first save's hook was still running ran a second hook at once, alongside the
   * first. Each hook runs only after the one before it, and hears the settings its own save changed.
   */
  test('runs the hooks of two quick saves one at a time, each with its own before and after', async () => {
    const runtime = fakeRuntime();
    const heard: unknown[] = [];
    const replies: unknown[] = [];
    let finishFirst: () => void = () => undefined;
    let handler: ((message: unknown, respond: (reply: unknown) => void) => Promise<void>) | null = null;
    const pebble = { ...runtime.pebble, registerConfigHandler: (registered: typeof handler) => void (handler = registered) } as unknown as PluginPebble;

    handleSettings({ defaults: { REFRESH: '30' } }, pebble, fakeStorage(), {
      onSaved: (before, after) => {
        heard.push([before.REFRESH, after.REFRESH]);

        return heard.length === 1 ? new Promise<void>((resolve) => void (finishFirst = resolve)) : undefined;
      },
    });
    const first = handler!({ type: SAVE_MESSAGE, settings: { REFRESH: '15' } }, (reply) => void replies.push(reply));
    const second = handler!({ type: SAVE_MESSAGE, settings: { REFRESH: '60' } }, (reply) => void replies.push(reply));

    for (let turn = 0; turn < 10; turn++) {
      await Promise.resolve();
    }

    const whileFirstRuns = [replies.length, heard.length];

    finishFirst();
    await Promise.all([first, second]);

    const result = [whileFirstRuns, heard];

    expect(result).toEqual([
      [2, 1],
      [
        ['30', '15'],
        ['15', '60'],
      ],
    ]);
  });

  /** An async hook that rejected escaped the save's catch, so the failure was never logged. */
  test('logs an async onSaved that rejects, with the save still answered as kept', async () => {
    const runtime = fakeRuntime();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    handleSettings({}, runtime.pebble, fakeStorage(), {
      onSaved: async () => {
        await Promise.resolve();
        throw new Error('boom');
      },
    });
    const reply = await runtime.send({ type: SAVE_MESSAGE, settings: { REFRESH: '15' } });
    const result = [reply, log.mock.calls.length];

    log.mockRestore();

    expect(result).toEqual([{ ok: true }, 1]);
  });

  /** The settings are already kept by the time the hook runs, so a hook that throws must not tell the page the save failed. */
  test('answers a kept save as kept when onSaved throws', async () => {
    const runtime = fakeRuntime();

    handleSettings({}, runtime.pebble, fakeStorage(), { onSaved: () => { throw new Error('boom'); } });
    const result = await runtime.send({ type: SAVE_MESSAGE, settings: { REFRESH: '15' } });

    expect(result).toEqual({ ok: true });
  });
});
