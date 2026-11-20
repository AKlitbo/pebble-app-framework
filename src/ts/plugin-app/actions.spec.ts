/**
 * Specs for routing a plugin app's actions by name.
 *
 * The watch waits on the answer to a `pluginAction` and shows `Done` or `Failed` from it, and the
 * Pebble app turns down an answer with a field of the wrong type as `UNKNOWN`. What is worth pinning
 * is the routing, the answer for an action the plugin does not have, the answer for an action that
 * throws or rejects, and that the answer carries only fields the Pebble app reads. The fake runtime's
 * own answers are pinned here too, since a plugin's specs stand on it.
 */

import { describe, test, expect } from 'vitest';
import { handleActions, INVALID_REQUEST } from './actions';
import { fakePluginPebble } from '../testing/plugin-pebble';

/** A phone whose plugin routes its actions through `handleActions`. */
function phoneWithActions(actions: Parameters<typeof handleActions>[0]) {
  const phone = fakePluginPebble();

  handleActions(actions, phone.pebble);

  return phone;
}

describe('handleActions', () => {
  /** An action has to get the arguments the pin carried, or Done on the watch completes the wrong task. */
  test('sends a request to the action it names, with its arguments', async () => {
    const phone = phoneWithActions({ complete: (args) => ({ text: `Done ${String(args.id)}`, refreshed: ['calendar/event'] }) });

    const result = await phone.invoke('complete', { id: '42' });

    expect(result).toEqual({ ok: { text: 'Done 42', refreshed: ['calendar/event'] } });
  });

  /** An action that answers nothing still has to answer, or the watch waits on it. */
  test('answers ok for an action that hands back nothing', async () => {
    const phone = phoneWithActions({ complete: () => undefined });

    const result = await phone.invoke('complete');

    expect(result).toEqual({ ok: {} });
  });

  /** A pin left over from an older version can name an action the plugin no longer has. */
  test('answers INVALID_REQUEST for an action the plugin does not have', async () => {
    const phone = phoneWithActions({ complete: () => undefined });

    const result = await phone.invoke('toString');

    expect(result).toEqual({ error: { code: INVALID_REQUEST, message: 'no action named toString' } });
  });

  /** An action that threw left the watch waiting, and one that names its code has to keep it so a caller can tell why. */
  test.each([
    ['throws', () => { throw Object.assign(new Error('sign in again'), { code: 'AUTH_REQUIRED' }); }, { code: 'AUTH_REQUIRED', message: 'sign in again' }],
    ['rejects', () => Promise.reject(new Error('the feed did not answer')), { code: 'UNKNOWN', message: 'the feed did not answer' }],
    ['throws with a numeric code', () => { throw Object.assign(new Error('gone'), { code: 404 }); }, { code: '404', message: 'gone' }],
    ['throws with a code of 0', () => { throw Object.assign(new Error('boom'), { code: 0 }); }, { code: 'UNKNOWN', message: 'boom' }],
  ])('answers an error for an action that %s', async (label, action, expected) => {
    const phone = phoneWithActions({ complete: action });

    const result = await phone.invoke('complete');

    expect(result).toEqual({ error: expected });
  });
});

describe('the answer an action gives', () => {
  /** A field of the wrong type made the Pebble app turn the whole answer down as a malformed response. */
  test('keeps only the fields the Pebble app reads, as text', async () => {
    const phone = phoneWithActions({ complete: () => ({ text: 5, semanticResult: 'done', refreshed: ['calendar/event', 7], extra: true }) as never });

    const result = await phone.invoke('complete');

    expect(result).toEqual({ ok: { semanticResult: 'done', refreshed: ['calendar/event'] } });
  });

  /** An action handing back something that is not an object still answers Done rather than a malformed response. */
  test('answers Done for a result that is not an object', async () => {
    const phone = phoneWithActions({ complete: () => 'done' as never });

    const result = await phone.invoke('complete');

    expect(result).toEqual({ ok: {} });
  });

  /** Arguments sent as a list are no arguments an action can read by name, so they read as none. */
  test('reads arguments sent as a list as none', async () => {
    const seen: unknown[] = [];
    const phone = phoneWithActions({ complete: (args) => void seen.push(args) });

    await phone.invoke('complete', ['42'] as never);

    expect(seen).toEqual([{}]);
  });
});

describe('fakePluginPebble invoke', () => {
  /** The Pebble app takes an answer whenever it comes inside its wait, so a late one has to resolve too. */
  test('resolves on a late answer', async () => {
    const phone = fakePluginPebble();

    phone.pebble.registerActionHandler((request, respond) => {
      void Promise.resolve().then(() => respond.ok({ text: 'late' }));
    });

    const result = await phone.invoke('complete');

    expect(result).toEqual({ ok: { text: 'late' } });
  });

  /** The Pebble app ignores a second answer, so a spec must see the first. */
  test('keeps the first answer', async () => {
    const phone = fakePluginPebble();

    phone.pebble.registerActionHandler((request, respond) => {
      respond.ok({ text: 'first' });
      respond.error('UNKNOWN', 'second');
    });

    const result = await phone.invoke('complete');

    expect(result).toEqual({ ok: { text: 'first' } });
  });

  /** The Pebble app answers a handler that throws or rejects before answering as UNKNOWN, with the error as text. */
  test.each([
    ['throws', () => { throw new Error('boom'); }],
    ['rejects', () => Promise.reject(new Error('boom'))],
  ])('answers UNKNOWN for a handler that %s before answering', async (label, handler) => {
    const phone = fakePluginPebble();

    phone.pebble.registerActionHandler(handler);

    const result = await phone.invoke('complete');

    expect(result).toEqual({ error: { code: 'UNKNOWN', message: 'Error: boom' } });
  });
});
