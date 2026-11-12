/**
 * The HTTP GET a plugin app's script fetches with.
 *
 * A plugin runs in the Pebble app's plugin runtime, which has no XMLHttpRequest and no timers, and
 * hands the script its own `fetch` instead. So the face's request in ts/pkjs/request.ts, which is XHR
 * with a timer as its watchdog, cannot run there. `pluginRequest` is the same call shape on `fetch`,
 * so the framework's weather and stock providers take it unchanged. A hung fetch is cut off with
 * `AbortSignal.timeout` where the runtime has it. Without it the Pebble app ends the run on its own.
 */

import { NETWORK_ERROR } from '../pkjs/request';
import type { RequestFn } from '../pkjs/request';

/** How long a fetch may take before it is given up, under the Pebble app's own limit on a run. */
export const PLUGIN_FETCH_TIMEOUT_MS = 8000;

/** A signal that gives up a fetch after the timeout, or nothing on a runtime without `AbortSignal.timeout`. */
function timeoutSignal(): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(PLUGIN_FETCH_TIMEOUT_MS) : undefined;
}

/** True for the error a fetch throws when its timeout signal gives it up. */
function timedOut(error: unknown): boolean {
  const name = error instanceof Error || (typeof error === 'object' && error !== null) ? (error as { name?: unknown }).name : undefined;

  return name === 'TimeoutError' || name === 'AbortError';
}

/**
 * Fetches a URL with an HTTP GET, in the shape the framework's providers call.
 *
 * A 2xx answers with null and the body. Any other status answers with `http <status>` and the body,
 * so a provider still reads its own error JSON and a 429 still reads as a rate limit. A fetch that
 * never reaches the host answers `NETWORK_ERROR`, and one given up after the timeout answers
 * `timeout`, with no body either way. A body that cannot be read after the host answered gives the
 * status with no body.
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

  // only a fetch that fails reached no host. one whose body cannot be read after the host answered
  // was counted by the provider, so it answers its status with no body rather than NETWORK_ERROR,
  // and a ledger keeps its stamp
  fetch(url, signal ? { signal } : undefined).then(
    (response) => response.text().then(
      (body) => answer(response.ok ? null : `http ${response.status}`, body),
      (error: unknown) => answer(timedOut(error) ? 'timeout' : `http ${response.status}`)
    ),
    (error: unknown) => answer(timedOut(error) ? 'timeout' : NETWORK_ERROR)
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
