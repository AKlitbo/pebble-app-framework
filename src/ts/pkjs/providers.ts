/**
 * Helpers the weather and stock providers share: picking the provider a face saved, and waiting on
 * requests that run side by side.
 */

/**
 * Finds the provider a face saved, or the fallback when the name is not one of the table's own.
 *
 * Only the table's own keys count. A saved `constructor` would otherwise pull a built-in off the
 * object's prototype and crash calling `.fetch` on it.
 *
 * @param providers The provider modules by lowercase name.
 * @param name The provider name from settings, in any case, or nothing when none is saved yet.
 * @param fallback The table key to use when the name matches nothing.
 * @param kind What kind of provider this is, for the log.
 * @return The provider to call.
 */
export function pickProvider<P>(providers: Record<string, P>, name: unknown, fallback: string, kind: string): P {
  const key = String(name || '').toLowerCase();

  if (Object.prototype.hasOwnProperty.call(providers, key)) {
    return providers[key];
  }

  // an unknown provider would quietly fall back and hide the mistake so log it
  console.log(`Unknown ${kind} provider "${name}", using ${fallback}`);

  return providers[fallback];
}

/**
 * Waits on requests running side by side and runs whenAll once, after the last one reports.
 *
 * request() holds a watchdog that settles every call, so each one always reports and the join
 * always closes. A report after the last one does not run whenAll again.
 *
 * @param count How many requests to wait on.
 * @param whenAll Run once every request has reported.
 * @return What each request runs when it reports.
 */
export function joinCalls(count: number, whenAll: () => void): () => void {
  let left = count;

  return () => {
    left--;

    if (left === 0) {
      whenAll();
    }
  };
}
