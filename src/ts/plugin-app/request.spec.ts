/**
 * Specs for the HTTP GET a plugin app fetches with.
 *
 * The framework's providers read the error a request reports to tell a rate limit from a bad key
 * from a network fault, so what is worth pinning is that the fetch-based request reports each of
 * them the way the face's XHR request does. The runtime's `fetch` is stood in for, since no spec
 * reaches the network.
 */

import { describe, test, expect, vi, afterEach } from 'vitest';
import { FETCH_FAILED, FETCH_FAILURE_KINDS, fetchFailure, pluginRequest, fetchText } from './request';
import { NETWORK_ERROR } from '../pkjs/request';

/** Runs the request with a stand-in fetch and returns what the callback heard. */
async function heard(fake: () => Promise<unknown>): Promise<{ err: string | null; body?: string }> {
  vi.stubGlobal('fetch', vi.fn(fake));

  return new Promise((resolve) => {
    pluginRequest('https://example.com/quote', (err, body) => resolve({ err, body }));
  });
}

/** A stand-in fetch answer with a status and a body. */
function answer(status: number, body: string): Promise<unknown> {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pluginRequest', () => {
  /** A provider reads its quote from the body of a 2xx. */
  test('answers a 2xx with no error and the body', async () => {
    const result = await heard(() => answer(200, '{"c":1}'));

    expect(result).toEqual({ err: null, body: '{"c":1}' });
  });

  /** A 429 has to keep its status, or a rate limit reads as a network fault and the provider never pauses. */
  test('answers another status with http and the status, and still hands over the body', async () => {
    const result = await heard(() => answer(429, 'Too Many Requests'));

    expect(result).toEqual({ err: 'http 429', body: 'Too Many Requests' });
  });

  /**
   * The Pebble app's fetch rejects each failure as a TypeError named only by its message, and every
   * one read as NETWORK_ERROR, so a ledger took back a call the provider had counted. That let a
   * timed out Alpha Vantage call go uncounted against its 25 a day. Only the refusal of a site the
   * wearer has not allowed is known never to have left, so only it takes the stamp back.
   */
  test.each([
    ['a host timeout', new TypeError('fetch timeout: https://example.com/quote'), 'timeout'],
    ['an abort from the plugin timeout', new TypeError('fetch abort: https://example.com/quote'), 'timeout'],
    ['a failure the host cannot place', new TypeError('fetch failed: https://example.com/quote'), FETCH_FAILED],
    ['a site the wearer has not allowed', Object.assign(new Error('fetch not allowed: https://example.com/quote'), { name: 'NotAllowedError' }), NETWORK_ERROR],
  ])('answers the Pebble app fetch rejecting for %s as the call it spent', async (_label, error, err) => {
    const result = await heard(() => Promise.reject(error));

    expect(result).toEqual({ err, body: undefined });
  });

  /** A runtime's own failed fetch may have reached the host, so it keeps its stamp too. */
  test('answers a failed fetch with no shim message as FETCH_FAILED', async () => {
    const result = (await heard(() => Promise.reject(new TypeError('Failed to fetch')))).err;

    expect(result).toBe(FETCH_FAILED);
  });

  /** A host timeout while reading the body is a timeout, not the status the host had answered. */
  test('answers a body read the host timed out as a timeout', async () => {
    const result = await heard(() => Promise.resolve({ ok: true, status: 200, text: () => Promise.reject(new TypeError('fetch timeout: https://example.com/quote')) }));

    expect(result.err).toBe('timeout');
  });

  /**
   * A body lost after the host answered was answered NETWORK_ERROR, so a ledger took back a call the
   * provider had counted. After a 2xx it answered http 200, an error that read as the call working.
   */
  test.each([
    ['a 200', 200, FETCH_FAILED],
    ['a 429', 429, 'http 429'],
  ])('answers a body that cannot be read after %s as a call spent, with no body', async (_label, status, err) => {
    const result = await heard(() => Promise.resolve({ ok: status < 300, status, text: () => Promise.reject(new TypeError('stream lost')) }));

    expect(result).toEqual({ err, body: undefined });
  });

  /** A fetch the timeout gave up is told apart, so it is not counted as the host refusing. */
  test('answers a fetch given up by its timeout as a timeout', async () => {
    const result = await heard(() => Promise.reject(Object.assign(new Error('signal timed out'), { name: 'TimeoutError' })));

    expect(result.err).toBe('timeout');
  });

  /**
   * A provider that throws while reading a good body must not hear a second answer, or it reports
   * twice, and its throw must not escape as an unhandled rejection that ends the plugin's run.
   */
  test('answers once when the callback throws', async () => {
    vi.stubGlobal('fetch', vi.fn(() => answer(200, 'ok')));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const calls: (string | null)[] = [];

    pluginRequest('https://example.com/quote', (err) => {
      calls.push(err);
      throw new Error('provider bug');
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(calls).toEqual([null]);
  });

  /** The Pebble app's runtime may lack AbortSignal.timeout, and the request must still go out. */
  test('still fetches on a runtime with no AbortSignal.timeout', async () => {
    vi.stubGlobal('AbortSignal', {});

    const result = await heard(() => answer(200, 'ok'));

    expect(result.err).toBeNull();
  });
});

describe('fetchText', () => {
  /** A feed's own status is the only thing safe to log, so it has to come through as the message. */
  test('throws HTTP and the status for a non-2xx answer', async () => {
    vi.stubGlobal('fetch', vi.fn(() => answer(404, 'gone')));

    const result = fetchText('https://example.com/feed.ics');

    await expect(result).rejects.toThrow('HTTP 404');
  });
});

describe('fetchFailure', () => {
  /** A plugin keeps the kind and shows it on its settings page, so each failure the runtime raises has to land on its own kind. */
  test.each([
    ['a non-2xx from fetchText', new Error('HTTP 404'), { kind: 'HTTP', status: 404 }],
    ['the Pebble app giving up', new TypeError('fetch timeout: https://example.com/feed.ics'), { kind: 'TIMEOUT' }],
    ['an aborted fetch', Object.assign(new Error('aborted'), { name: 'AbortError' }), { kind: 'TIMEOUT' }],
    ['a host the wearer has not allowed', Object.assign(new Error('denied'), { name: 'NotAllowedError' }), { kind: 'NOT_ALLOWED' }],
    ['no network', new TypeError('fetch failed: https://example.com/feed.ics'), { kind: 'FAILED' }],
    ['something that is not an error', null, { kind: 'FAILED' }],
  ])('sorts %s', (label, error, expected) => {
    const result = fetchFailure(error);

    expect(result).toEqual(expected);
  });

  /** A refused host is the one failure the wearer can fix, so a message that reads like a timeout must not hide it. */
  test('reads a refused host as not allowed whatever its message', () => {
    const result = fetchFailure(Object.assign(new Error('fetch timeout: https://example.com'), { name: 'NotAllowedError' }));

    expect(result).toEqual({ kind: 'NOT_ALLOWED' });
  });

  /** What fetchText throws for a 503 has to sort back to its status, or the page shows a server fault as no network. */
  test('sorts what fetchText throws back to its status', async () => {
    vi.stubGlobal('fetch', vi.fn(() => answer(503, 'down')));

    const result = await fetchText('https://example.com/feed.ics').catch((error: unknown) => fetchFailure(error));

    expect(result).toEqual({ kind: 'HTTP', status: 503 });
  });

  /**
   * A plugin keeping what `pluginRequest` answered has its error as text. Read as an error message, a
   * 429 read as a failed fetch and the page showed no network rather than the provider's limit.
   */
  test.each([
    ['http 429', { kind: 'HTTP', status: 429 }],
    ['HTTP 503', { kind: 'HTTP', status: 503 }],
    ['timeout', { kind: 'TIMEOUT' }],
    [NETWORK_ERROR, { kind: 'NOT_ALLOWED' }],
    [FETCH_FAILED, { kind: 'FAILED' }],
  ])('sorts the pluginRequest answer %j', (answered, expected) => {
    const result = fetchFailure(answered);

    expect(result).toEqual(expected);
  });

  /** A plugin checks a kept code against the list before showing it, so the list has to hold every kind. */
  test('lists every kind', () => {
    const result = FETCH_FAILURE_KINDS;

    expect(result).toEqual(['HTTP', 'TIMEOUT', 'NOT_ALLOWED', 'FAILED']);
  });
});
