// @vitest-environment jsdom
/**
 * Specs for the HTTP GET every fetch on the phone goes through.
 *
 * The four callbacks the SDK fires come first: a success, an HTTP error that still carries its
 * body, a transport failure, and a timeout. The rest is the half that exists because the Pebble
 * app's XHR cannot be trusted:
 * the watchdog that answers a request the SDK never reports on, the guard that keeps a late reply
 * from calling back a second time, and a send that throws before anything is in flight. A caller
 * that never hears back leaves the watch blank with no retry, so each one is the difference
 * between a slow answer and no answer at all.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { request } from './request';
import { installFakeXhr } from '../testing/xhr';

describe('request', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * The Pebble app does not reliably honour xhr.timeout, so a request can hang with no onload,
   * onerror or ontimeout ever firing. Without the watchdog the caller waits for good and the panel
   * it was filling stays blank until the JS restarts.
   */
  test('reports a timeout for a request the phone never answers', () => {
    installFakeXhr();
    const callback = vi.fn();

    request('https://example', callback);
    vi.advanceTimersByTime(15000);

    expect(callback).toHaveBeenCalledWith('timeout');
  });

  /** A request still running as the watchdog nears must not be cut short of its own answer. */
  test('leaves a request alone until the watchdog is due', () => {
    installFakeXhr();
    const callback = vi.fn();

    request('https://example', callback);
    vi.advanceTimersByTime(14999);

    expect(callback).not.toHaveBeenCalled();
  });

  /**
   * A hung request that answers after the watchdog gave up would call back a second time, and a
   * caller that has already moved on runs its whole round again on that stale body.
   */
  test('drops a reply that lands after the watchdog gave up', () => {
    const opened = installFakeXhr();
    const callback = vi.fn();

    request('https://example', callback);
    vi.advanceTimersByTime(15000);
    opened[0].status = 200;
    opened[0].responseText = '{"late":1}';
    opened[0].onload?.();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('timeout');
  });

  /** A request that answered has no watchdog left to fire, or every fetch reports twice a few seconds on. */
  test('does not report a timeout after the request already answered', () => {
    const opened = installFakeXhr();
    const callback = vi.fn();

    request('https://example', callback);
    opened[0].status = 200;
    opened[0].responseText = '{"ok":1}';
    opened[0].onload?.();
    vi.advanceTimersByTime(15000);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(null, '{"ok":1}');
  });

  /**
   * A malformed URL or a send the phone blocks throws before anything is in flight. Letting it out
   * kills the round that called it, so the fetch never completes and nothing retries.
   */
  test('reports a send that throws rather than letting it escape', () => {
    installFakeXhr(() => {
      throw new Error('blocked');
    });
    const callback = vi.fn();

    const attempt = () => request('https://example', callback);

    expect(attempt).not.toThrow();
    expect(callback).toHaveBeenCalledWith('send error');
  });
});

describe('request callbacks', () => {
  /** A successful response must reach the callback as data with no error. */
  test('reports a 2xx response as success with the body', () => {
    const sent = installFakeXhr();
    const callback = vi.fn();

    request('https://example', callback);
    sent[0].respond(200, '{"ok":1}');

    expect(callback).toHaveBeenCalledWith(null, '{"ok":1}');
  });

  /** A non-2xx must be flagged as an error while still forwarding the body so a provider can read a structured error. */
  test('reports a non-2xx as an http error but still forwards the body', () => {
    const sent = installFakeXhr();
    const callback = vi.fn();

    request('https://example', callback);
    sent[0].respond(404, '{"cod":404}');

    expect(callback).toHaveBeenCalledWith('http 404', '{"cod":404}');
  });

  /** A transport failure must surface as a network error, never a silent success. */
  test('reports a transport failure as a network error', () => {
    const sent = installFakeXhr();
    const callback = vi.fn();

    request('https://example', callback);
    sent[0].fail();

    expect(callback).toHaveBeenCalledWith('network error');
  });

  /** A timeout must surface distinctly so the caller can show a clear status. */
  test('reports a timeout', () => {
    const sent = installFakeXhr();
    const callback = vi.fn();

    request('https://example', callback);
    sent[0].timeOut();

    expect(callback).toHaveBeenCalledWith('timeout');
  });
});
