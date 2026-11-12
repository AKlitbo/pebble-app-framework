/**
 * The stock fetch cache the phone keeps between runs.
 *
 * PebbleKit JS gets killed and restarted whenever the phone feels like it, and everything the
 * fetch layer knows dies with it. That matters for a quota-limited provider: the throttle in
 * schedule.ts works out whether a poll is worth spending a call on by looking at when we last
 * fetched and which trading day we already hold, and both of those reset to nothing on a restart,
 * so the gate reopens and Alpha Vantage gets polled all over again.
 *
 * Keeping the last good strip alongside them means a watch with an empty store still has something
 * to show while the gate is shut, which is the whole point of the gate being shut.
 *
 * The stamps and the strip belong to the provider that fetched them, so the cache records that
 * provider too. One that starts with a cache saved under another provider starts fresh, since the
 * gate would otherwise read the old provider's close as one it already holds.
 *
 * Kept next to the stock layer it serves rather than in the pkjs bootstrap, same as schedule.ts.
 */

import type { StockQuote } from './util';

/** What survives a restart: the throttle stamps plus the last strip worth showing, and whose they are. */
export interface StockCache {
  lastAsOf: string;
  lastFetchMs: number;
  strip: number[] | null;
  /** The provider the stamps and the strip came from, by its lowercase name, such as `finnhub`. */
  provider: string;
  /** When a rate limit said to try again, as epoch milliseconds, or 0 for none. */
  retryAtMs?: number;
  /** The wait the last rate limit left, which the next one doubles. */
  backoffMs?: number;
  /** The last good quote for each ticker, so a save under Alpha Vantage asks only for new tickers. */
  quotes?: StockQuote[];
}

/** The most tickers whose last good quote is kept. */
const QUOTES_KEPT_MAX = 8;

/** The slice of localStorage this needs, passed in so the specs can hand it a fake. */
export interface CacheStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Where the cache lives in localStorage. Its own key, since Clay rewrites its settings blob whole on
 * every save and anything extra parked in there would be lost.
 */
export const CACHE_KEY = 'stock-cache';

/** A packed strip is only worth keeping if it is really a list of numbers we can hand the watch. */
function readStrip(value: unknown): number[] | null {
  if (!Array.isArray(value) || !value.length) {
    return null;
  }

  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'number' || !isFinite(value[i])) {
      return null;
    }
  }

  return value as number[];
}

/** A whole number of milliseconds of at least 0, or 0 for anything else. */
function readMs(value: unknown): number {
  return typeof value === 'number' && isFinite(value) && value > 0 ? value : 0;
}

/** The kept quotes, keeping only those that are whole good quotes under a ticker. */
function readQuotes(value: unknown): StockQuote[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((quote) => quote && typeof quote === 'object' && quote.ok === true
    && typeof quote.symbol === 'string' && quote.symbol !== '' && typeof quote.asOf === 'string'
    && [quote.price, quote.change, quote.changePercent].every((number) => typeof number === 'number' && isFinite(number)))
    .slice(0, QUOTES_KEPT_MAX)
    .map((quote) => ({
      symbol: quote.symbol,
      price: quote.price,
      change: quote.change,
      changePercent: quote.changePercent,
      asOf: quote.asOf,
      ok: true,
      ...(typeof quote.fetchedAtMs === 'number' && isFinite(quote.fetchedAtMs) ? { fetchedAtMs: quote.fetchedAtMs } : {}),
    }));
}

/**
 * Reads the cache back, falling back to empty for anything that does not look right.
 *
 * Nothing here is trusted. The blob may be missing, half-written, or left over from an older
 * shape, and a bad strip would go straight to the watch, so each field is checked on its own and
 * a bad one costs only itself.
 *
 * A cache saved under another provider reads as empty, so a provider that changed while nothing was
 * running starts on its own quotes. A cache with no provider at all reads as the provider's own, and
 * keeps its stamps and strip. Treating it as another's would spend a call on the first launch of
 * every phone holding one.
 *
 * @param storage Where to read from, normally localStorage.
 * @param provider The provider about to fetch, in any case.
 * @return The saved cache, or empty values when there is nothing usable for that provider.
 */
function load(storage: CacheStorage, provider: string): StockCache {
  const name = provider.toLowerCase();
  const empty: StockCache = { lastAsOf: '', lastFetchMs: 0, strip: null, provider: name, retryAtMs: 0, backoffMs: 0, quotes: [] };

  try {
    const saved = JSON.parse(storage.getItem(CACHE_KEY) as string);

    if (!saved || typeof saved !== 'object') {
      return empty;
    }

    if (typeof saved.provider === 'string' && saved.provider.toLowerCase() !== name) {
      return empty;
    }

    return {
      lastAsOf: typeof saved.lastAsOf === 'string' ? saved.lastAsOf : '',
      lastFetchMs: typeof saved.lastFetchMs === 'number' && isFinite(saved.lastFetchMs) ? saved.lastFetchMs : 0,
      strip: readStrip(saved.strip),
      provider: name,
      retryAtMs: readMs(saved.retryAtMs),
      backoffMs: readMs(saved.backoffMs),
      quotes: readQuotes(saved.quotes),
    };
  } catch (error) {
    return empty;
  }
}

/**
 * Writes the cache, and shrugs if the phone will not take it.
 *
 * Storage throws when it is full or turned off, and a cache that cannot be written is only a
 * missed saving on the next fetch, so it must never take the app down with it.
 *
 * @param storage Where to write to, normally localStorage.
 * @param cache The stamps and strip to keep, and the provider they came from.
 */
function save(storage: CacheStorage, cache: StockCache): void {
  try {
    storage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    // nothing to do about it and nothing that needs saying
  }
}

/**
 * Empties the cache because the face moved to another provider while nothing was running, unless the
 * cache was already saved under that provider.
 *
 * A cache with no provider recorded reads as whichever provider loads it, so a move the feature never
 * saw would hand the old provider's stamps and strip to the new one. A cache the new provider saved
 * itself is kept, so running this again after the first fetch spends nothing.
 *
 * @param storage Where the cache lives, normally localStorage.
 * @param provider The provider the face uses now, in any case.
 */
export function forget(storage: CacheStorage, provider: string): void {
  try {
    const saved = JSON.parse(storage.getItem(CACHE_KEY) as string);

    if (saved && typeof saved === 'object' && typeof saved.provider === 'string' && saved.provider.toLowerCase() === provider.toLowerCase()) {
      return;
    }

    if (saved !== null) {
      storage.setItem(CACHE_KEY, JSON.stringify({ lastAsOf: '', lastFetchMs: 0, strip: null, provider: provider.toLowerCase() }));
    }
  } catch (error) {
    // a cache that cannot be read is read as empty anyway, and one that cannot be written costs only a saving
    save(storage, { lastAsOf: '', lastFetchMs: 0, strip: null, provider: provider.toLowerCase() });
  }
}

export default { load, save, forget, CACHE_KEY };
