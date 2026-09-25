/**
 * Stub `request` functions for the weather and stock provider specs.
 *
 * They record the calls in order, so a spec asserts both what the provider parsed and which URLs
 * it asked for. `routing` answers by URL substring, and `replying` answers every call the same.
 */
import type { RequestFn } from '../weather/util';

/**
 * Builds a stub `request` that answers each URL from a table.
 *
 * @param byPath Maps a URL substring to the error or body to hand back for it.
 * @param calls Collects every requested URL in the order the provider asked for them.
 * @return The stub, which throws on a URL the table does not cover.
 */
export function routing(byPath: Record<string, { err?: string | null; body?: string }>, calls: string[]): RequestFn {
  return (url, callback) => {
    calls.push(url);

    const key = Object.keys(byPath).find((path) => url.includes(path));
    if (!key) {
      throw new Error('unexpected request url: ' + url);
    }

    const response = byPath[key];
    callback(response.err || null, response.body);
  };
}

/**
 * Builds a stub `request` that gives every URL the same answer.
 *
 * @param response The body to hand back, or the error and body together.
 * @param calls Collects every requested URL in the order the provider asked for them.
 * @return The stub.
 */
export function replying(response: string | { err?: string | null; body?: string }, calls: string[]): RequestFn {
  const answer = typeof response === 'string' ? { body: response } : response;

  return (url, callback) => {
    calls.push(url);
    callback(answer.err || null, answer.body);
  };
}
