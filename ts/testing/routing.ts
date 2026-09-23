/**
 * A stub `request` for the weather provider specs.
 *
 * It routes by URL substring and records the calls in order, so a spec asserts both what the
 * provider parsed and which URLs it asked for.
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
