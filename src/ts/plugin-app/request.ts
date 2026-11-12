/**
 * The HTTP GET a plugin app's script fetches with.
 *
 * A plugin runs in the Pebble app's plugin runtime, which has no XMLHttpRequest and no timers, and
 * hands the script its own `fetch` instead. So the face's request in ts/pkjs/request.ts, which is XHR
 * with a timer as its watchdog, cannot run there. `pluginRequest` is the same call shape on `fetch`,
 * so the framework's weather and stock providers take it unchanged. A hung fetch is cut off with
 * `AbortSignal.timeout` where the runtime has it. Without it the Pebble app ends the run on its own.
 */

import { FETCH_FAILED, NETWORK_ERROR } from '../pkjs/request';
import type { RequestFn } from '../pkjs/request';

/** How long a fetch may take before it is given up, under the Pebble app's own limit on a run. */
export const PLUGIN_FETCH_TIMEOUT_MS = 8000;

/** A signal that gives up a fetch after the timeout, or nothing on a runtime without `AbortSignal.timeout`. */
function timeoutSignal(): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(PLUGIN_FETCH_TIMEOUT_MS) : undefined;
}

// what a fetch that fails answers when the request may have reached the provider, the same text the
// face's XHR request answers for its error event
export { FETCH_FAILED };

/** The name and the message of whatever a fetch rejected with, empty where it has none. */
function errorParts(error: unknown): { name: string; message: string } {
  const parts = typeof error === 'object' && error !== null ? (error as { name?: unknown; message?: unknown }) : {};

  return { name: typeof parts.name === 'string' ? parts.name : '', message: typeof parts.message === 'string' ? parts.message : '' };
}

/**
 * The answer for a fetch that rejected.
 *
 * The Pebble app's own fetch rejects every failure as a `TypeError` whose message is `fetch failed:`,
 * `fetch timeout:`, or `fetch abort:` and the URL, with no `TimeoutError` or `AbortError` name, so the
 * message is read as well as the name. A timeout or an abort answers `timeout`. Its refusal of a site
 * the wearer has not allowed is an `Error` named `NotAllowedError`, raised before the request leaves,
 * so only that answers `NETWORK_ERROR`. A plain `fetch failed:` comes both from a request that never
 * left and from a body the host could not read after the provider answered, and nothing tells the two
 * apart. It answers `FETCH_FAILED`, which keeps the stamp, since counting a call that never left costs
 * one call of room where missing one the provider counted can run a plan past its limit.
 */
function rejection(error: unknown): string {
  const { name, message } = errorParts(error);

  if (name === 'NotAllowedError') {
    return NETWORK_ERROR;
  }

  if (name === 'TimeoutError' || name === 'AbortError' || /^fetch (timeout|abort):/.test(message)) {
    return 'timeout';
  }

  return FETCH_FAILED;
}

/**
 * Fetches a URL with an HTTP GET, in the shape the framework's providers call.
 *
 * A 2xx answers with null and the body. Any other status answers with `http <status>` and the body,
 * so a provider still reads its own error JSON and a 429 still reads as a rate limit. A fetch given
 * up after the timeout answers `timeout`. A fetch refused before it left, for a site the wearer has
 * not allowed, answers `NETWORK_ERROR`, and any other failed fetch answers `FETCH_FAILED`, with no
 * body in each case. A body that cannot be read after the host answered gives a non-2xx's status with
 * no body, and `FETCH_FAILED` after a 2xx.
 * Only `NETWORK_ERROR` is known never to have reached the provider, so only it takes a stamp back.
 *
 * @param url The address to fetch.
 * @param callback Called once with an error, or with null and the body.
 */
export const pluginRequest: RequestFn = (url, callback) => {
  const signal = timeoutSignal();

  // the callback runs outside the fetch's own catch, so a provider that throws while reading the
  // body is not answered a second time as a network error. its throw is caught on its own, so it
  // cannot surface as an unhandled rejection that ends the plugin's run
  function answer(err: string | null, body?: string) {
    try {
      callback(err, body);
    } catch (error) {
      console.error(`a request callback threw: ${String(error)}`);
    }
  }

  // a failed fetch answers what rejection() makes of it. a body that cannot be read after the host
  // answered was counted by the provider, so it keeps its stamp too. a non-2xx keeps its status, so a
  // 429 still reads as a rate limit, and a 2xx answers FETCH_FAILED, since a provider handed an error
  // of http 200 would read a failure that says it worked
  fetch(url, signal ? { signal } : undefined).then(
    (response) => response.text().then(
      (body) => answer(response.ok ? null : `http ${response.status}`, body),
      (error: unknown) => {
        if (rejection(error) === 'timeout') {
          answer('timeout');
        } else {
          answer(response.ok ? FETCH_FAILED : `http ${response.status}`);
        }
      }
    ),
    (error: unknown) => answer(rejection(error))
  );
};

/**
 * Fetches a URL's text, for a plugin that reads a whole document rather than a provider's JSON.
 *
 * @param url The address to fetch.
 * @return The body of a 2xx answer.
 * @throws An `Error` whose message is `HTTP <status>` for any other answer, or the runtime's own error when the fetch fails.
 */
export async function fetchText(url: string): Promise<string> {
  const signal = timeoutSignal();
  const response = await fetch(url, signal ? { signal } : undefined);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.text();
}
