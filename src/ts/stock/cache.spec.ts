/**
 * Specs for the stock cache that survives a PebbleKit JS restart.
 *
 * This is what stops Alpha Vantage spending its 25-a-day allowance twice over: the throttle only
 * holds if the stamps it reads outlive the restart. The blob comes back off the phone's storage
 * though, so it is untrusted input, and a strip read out of it goes straight to the watch. The
 * round trip and the ways a bad blob can arrive are what these pin down, along with the provider the
 * cache belongs to, since another provider's stamps would hold this one's gate shut.
 */

import { describe, test, expect } from 'vitest';
import cache from './cache';
import schedule from './schedule';
import type { CacheStorage, StockCache } from './cache';

/** A storage that behaves, so a spec can drive a real round trip. */
function fakeStorage(seed?: string): CacheStorage & { written: string | null } {
  return {
    written: seed === undefined ? null : seed,
    getItem(): string | null {
      return this.written;
    },
    setItem(_key: string, value: string): void {
      this.written = value;
    },
  };
}

const FULL: StockCache = {
  lastAsOf: '2026-07-01',
  lastFetchMs: 1750000000000,
  strip: [1, 0, 57, 48],
  provider: 'finnhub',
  retryAtMs: 1750000900000,
  backoffMs: 900000,
  quotes: [{ symbol: 'AAPL', price: 187.42, change: 0.97, changePercent: 0.52, asOf: '2026-07-01', ok: true }],
};

// what a cache that holds nothing usable reads as, for the provider loading it
const EMPTY: StockCache = { lastAsOf: '', lastFetchMs: 0, strip: null, provider: 'finnhub', retryAtMs: 0, backoffMs: 0, quotes: [] };

describe('stock cache round trip', () => {
  /** If the stamps did not survive the trip the throttle reopens and the quota burns again. */
  test('reads back what it wrote', () => {
    const storage = fakeStorage();

    cache.save(storage, FULL);

    const result = cache.load(storage, 'finnhub');

    expect(result).toEqual(FULL);
  });

  /** The cache must keep out of the Clay settings blob or the config page would overwrite it. */
  test('writes under its own key, not the settings one', () => {
    expect(cache.CACHE_KEY).toBe('stock-cache');
    expect(cache.CACHE_KEY).not.toBe('clay-settings');
  });
});

describe('stock cache load guards', () => {
  /** First run has nothing saved, and it must read as empty rather than throw on the way up. */
  test('returns empty values when nothing is saved', () => {
    const result = cache.load(fakeStorage(null as unknown as string), 'finnhub');

    expect(result).toEqual(EMPTY);
  });

  /** A half-written blob must not take the app down before it ever reaches a fetch. */
  test('returns empty values for corrupt json', () => {
    const result = cache.load(fakeStorage('{"lastAsOf":'), 'finnhub');

    expect(result).toEqual(EMPTY);
  });

  /** Stored json that is not an object at all still has to land on the empty shape. */
  test('returns empty values when the blob is not an object', () => {
    const result = cache.load(fakeStorage('"just a string"'), 'finnhub');

    expect(result).toEqual(EMPTY);
  });

  /** A wrong-typed stamp must cost only itself, so the rest of a usable cache still loads. */
  test('drops a bad field without losing the good ones', () => {
    const storage = fakeStorage(JSON.stringify({ lastAsOf: 42, lastFetchMs: 'soon', strip: [1, 0] }));

    const result = cache.load(storage, 'finnhub');

    expect(result.lastAsOf).toBe('');
    expect(result.lastFetchMs).toBe(0);
    expect(result.strip).toEqual([1, 0]);
  });

  /** A strip is packed wire bytes and goes straight to the watch, so a non-array must not pass. */
  test('rejects a strip that is not an array', () => {
    const result = cache.load(fakeStorage(JSON.stringify({ ...FULL, strip: 'nope' })), 'finnhub');

    expect(result.strip).toBeNull();
  });

  /** One junk byte poisons the whole strip, so a mixed array is refused rather than half sent. */
  test('rejects a strip holding anything that is not a number', () => {
    const result = cache.load(fakeStorage(JSON.stringify({ ...FULL, strip: [1, 'x', 3] })), 'finnhub');

    expect(result.strip).toBeNull();
  });

  /** JSON turns NaN and Infinity into null, and a null byte would pack as garbage. */
  test('rejects a strip holding a non-finite number', () => {
    const result = cache.load(fakeStorage('{"strip":[1,null,3]}'), 'finnhub');

    expect(result.strip).toBeNull();
  });

  /** An empty strip is nothing to show, so it must read as absent and not as a strip of zero. */
  test('reads an empty strip as nothing', () => {
    const result = cache.load(fakeStorage(JSON.stringify({ ...FULL, strip: [] })), 'finnhub');

    expect(result.strip).toBeNull();
  });
});

describe('the gate surviving a restart', () => {
  // 18:00 ET on a Wednesday, in the post-close window where Alpha Vantage chases the day's close
  const POSTCLOSE = Date.UTC(2026, 6, 1, 22, 0);
  const THIRTY_MIN = 30 * 60 * 1000;

  /**
   * The reason the cache exists. The phone kills this JS whenever it likes, and a throttle that
   * forgets when it last fetched lets every restart spend another four calls out of the 25 a day
   * Alpha Vantage allows. Half a dozen restarts in one evening would be enough to run it dry
   * and leave every slot reading RATE LIMIT.
   */
  test('a poll straight after a restart is still throttled', () => {
    const storage = fakeStorage();

    cache.save(storage, { lastAsOf: '', lastFetchMs: POSTCLOSE - THIRTY_MIN, strip: null, provider: 'alphavantage' });

    // the restart: everything in memory is gone and only what the phone kept comes back
    const restored = cache.load(storage, 'alphavantage');
    const result = schedule.shouldThrottleStockFetch('alphavantage', false, restored.lastFetchMs, restored.lastAsOf, POSTCLOSE);

    expect(result).toBe(true);
  });

  /**
   * The other half of the same bug. Once it holds a trading day there is nothing new to fetch
   * until tomorrow, but forgetting which day it held across a restart would start chasing a
   * close it already has.
   */
  test('a restart still knows it is holding today\'s close', () => {
    const storage = fakeStorage();

    cache.save(storage, { lastAsOf: '2026-07-01', lastFetchMs: 0, strip: null, provider: 'alphavantage' });

    const restored = cache.load(storage, 'alphavantage');
    const result = schedule.shouldThrottleStockFetch('alphavantage', false, restored.lastFetchMs, restored.lastAsOf, POSTCLOSE);

    expect(result).toBe(true);
  });

  /** The strip has to come back too or a watch with an empty store shows nothing till tomorrow. */
  test('a restart still has a strip to show while the gate is shut', () => {
    const storage = fakeStorage();

    cache.save(storage, FULL);

    const restored = cache.load(storage, 'finnhub');

    expect(restored.strip).toEqual(FULL.strip);
  });
});

describe('stock cache save guards', () => {
  /** Storage throws when it is full or switched off, and a missed save must not kill the fetch. */
  test('swallows a storage that refuses to write', () => {
    const storage: CacheStorage = {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError'); },
    };

    expect(() => cache.save(storage, FULL)).not.toThrow();
  });
});

describe('stock cache provider', () => {
  /**
   * A provider switched while nothing was running would read the old provider's close as one it
   * already holds, so Alpha Vantage after a day of Finnhub quotes kept Finnhub's strip until tomorrow.
   */
  test('reads a cache saved under another provider as empty', () => {
    const storage = fakeStorage(JSON.stringify(FULL));

    const result = cache.load(storage, 'alphavantage');

    expect(result).toEqual({ ...EMPTY, provider: 'alphavantage' });
  });

  /** A relaunch on the same provider has to keep its stamps, or every restart spends another call. */
  test('reads a cache saved under the same provider whole, in any case', () => {
    const storage = fakeStorage(JSON.stringify(FULL));

    const result = cache.load(storage, 'Finnhub');

    expect(result).toEqual(FULL);
  });

  /**
   * Every cache written before the provider was recorded has none. Reading those as another
   * provider's would cost every phone its strip and a quota call on its first launch after an update.
   */
  test('reads a cache with no provider as the loading provider\'s own', () => {
    const storage = fakeStorage(JSON.stringify({ lastAsOf: '2026-07-01', lastFetchMs: 1750000000000, strip: [1, 0, 57, 48] }));

    const result = cache.load(storage, 'alphavantage');

    expect(result).toEqual({ ...FULL, provider: 'alphavantage', retryAtMs: 0, backoffMs: 0, quotes: [] });
  });
});

describe('stock cache forget', () => {
  /** A cache the new provider already saved holds its own quota stamps, and emptying it would spend a call on every launch. */
  test('keeps a cache saved under the provider given, in any case', () => {
    const storage = fakeStorage(JSON.stringify(FULL));

    cache.forget(storage, 'Finnhub');

    expect(storage.written).toBe(JSON.stringify(FULL));
  });

  /** A cache from before the move reads as the new provider's own, so it has to be emptied under that provider. */
  test('empties a cache saved under another provider or none', () => {
    const storage = fakeStorage(JSON.stringify({ lastAsOf: '2026-07-01', lastFetchMs: 1, strip: [1] }));

    cache.forget(storage, 'alphavantage');

    expect(JSON.parse(storage.written as string)).toEqual({ lastAsOf: '', lastFetchMs: 0, strip: null, provider: 'alphavantage' });
  });

  /** A phone with no cache has nothing to forget, and writing one would cost a write for nothing. */
  test('writes nothing when there is no cache', () => {
    const storage = fakeStorage(null as unknown as string);

    cache.forget(storage, 'alphavantage');

    expect(storage.written).toBeNull();
  });
});
