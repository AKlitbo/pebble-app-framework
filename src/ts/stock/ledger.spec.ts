/**
 * Specs for the ledger of calls sent to each metered stock provider.
 *
 * The ledger is the one thing that keeps Twelve Data inside 8 calls a clock minute and 800 a UTC day,
 * and a free Alpha Vantage key inside 25 calls a day, whatever sequence of launches, saves, retries,
 * and restarts the day brings. What is worth pinning is each count's edge, the room it gives a save
 * that only partly fits, when it says room opens again, and that a phone clock moving cannot shrink it.
 */

import { describe, test, expect } from 'vitest';
import { allowance, keepSent, keyPrint, loadLedger, saveLedger, LEDGER_KEY } from './ledger';
import type { LedgerStorage } from './ledger';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// Wednesday 1 July 2026, 14:30:20 UTC
const NOW = Date.UTC(2026, 6, 1, 14, 30, 20);

/** A storage that behaves, so a spec can drive a real round trip. */
function fakeStorage(): LedgerStorage & { items: Record<string, string> } {
  return {
    items: {},
    getItem(key: string): string | null {
      return this.items[key] ?? null;
    },
    setItem(key: string, value: string): void {
      this.items[key] = value;
    },
  };
}

describe('allowance for Twelve Data', () => {
  /** Two saves inside one clock minute after a routine round sent 12 calls against the free key's 8. */
  test('gives the room left in the clock minute, and the next minute for the rest', () => {
    const sent = [NOW - 15 * 1000, NOW - 10 * 1000, NOW - 5 * 1000, NOW - 1000, NOW, NOW, NOW];

    const result = allowance('twelvedata', sent, 4, true, false, NOW);

    expect(result).toEqual({ room: 1, retryAtMs: Date.UTC(2026, 6, 1, 14, 31, 1) });
  });

  /** A call sent in the minute before is outside this one, so it must not hold this minute's calls. */
  test('counts only the current clock minute', () => {
    const sent = Array.from({ length: 8 }, () => NOW - 21 * 1000);

    const result = allowance('twelvedata', sent, 4, false, false, NOW);

    expect(result.room).toBe(4);
  });

  /** Twelve Data's day starts again at midnight UTC, so a spent day waits for it rather than the next minute. */
  test('waits for midnight UTC once the day is spent', () => {
    const sent = Array.from({ length: 800 }, (_unused, index) => NOW - 2 * MINUTE - index * 1000);

    const result = allowance('twelvedata', sent, 4, false, false, NOW);

    expect(result).toEqual({ room: 0, retryAtMs: Date.UTC(2026, 6, 2, 0, 1) });
  });
});

describe('allowance for Alpha Vantage', () => {
  /** A routine try is held at 20, so the wearer's saves keep the last 5 of the free key's 25. */
  test('holds a routine fetch at 20 and a save at 25', () => {
    const sent = Array.from({ length: 19 }, (_unused, index) => NOW - (index + 1) * HOUR / 2);

    const result = [allowance('alphavantage', sent, 4, false, false, NOW).room, allowance('alphavantage', sent, 4, true, false, NOW).room];

    expect(result).toEqual([1, 4]);
  });

  /** Room for the rest opens once enough of the oldest calls are a day old, and not a moment sooner. */
  test('says room opens once the oldest calls are a day old', () => {
    const sent = Array.from({ length: 25 }, (_unused, index) => NOW - (25 - index) * HOUR / 2);

    const result = allowance('alphavantage', sent, 2, true, false, NOW);

    expect(result).toEqual({ room: 0, retryAtMs: sent[1] + 24 * HOUR + 1000 });
  });

  /** Asking for more than the routine 20 with nothing spent gave a wait of NaN, which no gate can hold to. */
  test('waits a day past now when more is asked than the day allows and nothing is spent', () => {
    const result = allowance('alphavantage', [], 21, false, false, NOW);

    expect(result).toEqual({ room: 20, retryAtMs: NOW + 24 * HOUR + 1000 });
  });
});

describe('allowance with nothing to count', () => {
  /** Yahoo and Finnhub publish no daily cap, and a paid plan has its own limits, so none of them is held here. */
  test('lets every call through for Yahoo, Finnhub, and a paid plan', () => {
    const full = Array.from({ length: 900 }, () => NOW);

    const result = [allowance('yahoo', full, 4, false, false, NOW), allowance('finnhub', full, 4, false, false, NOW), allowance('alphavantage', full, 4, false, true, NOW)].map((room) => room.room);

    expect(result).toEqual([4, 4, 4]);
  });

  /** A saved provider id such as `constructor` found a function on every object and threw before any fetch. */
  test.each(['constructor', '__proto__'])('lets every call through for an id of %s', (provider) => {
    const result = allowance(provider, [], 1, false, false, NOW);

    expect(result).toEqual({ room: 1, retryAtMs: 0 });
  });
});

describe('keepSent', () => {
  /** A phone clock stepping back dropped every call sent since, and a save then spent 29 of the 25. */
  test('counts a stamp in the future as sent now rather than dropping it', () => {
    const result = keepSent([NOW + HOUR, NOW - HOUR], NOW);

    expect(result).toEqual([NOW - HOUR, NOW]);
  });

  /** A call a day old no longer counts against the day. */
  test('lets go of a stamp a day old', () => {
    const result = keepSent([NOW - 24 * HOUR, NOW - 24 * HOUR + 1], NOW);

    expect(result).toEqual([NOW - 24 * HOUR + 1]);
  });
});

describe('the saved ledger', () => {
  /**
   * The minute count lived in memory, so a restart between two saves forgot it and sent 16 calls in a
   * minute. The stamps come back off the phone for the same provider and key.
   */
  test('reads back what it wrote for the same provider and key', () => {
    const storage = fakeStorage();

    saveLedger(storage, 'twelvedata', { keyPrint: keyPrint('k'), sentMs: [NOW - 1000, NOW] }, NOW);

    const result = loadLedger(storage, 'twelvedata', keyPrint('k'), NOW);

    expect(result).toEqual([NOW - 1000, NOW]);
  });

  /** A new key has its own quota, so a wearer who swaps one in is not held by the old key's calls. */
  test('starts fresh for another key', () => {
    const storage = fakeStorage();

    saveLedger(storage, 'alphavantage', { keyPrint: keyPrint('old'), sentMs: [NOW] }, NOW);

    const result = loadLedger(storage, 'alphavantage', keyPrint('new'), NOW);

    expect(result).toEqual([]);
  });

  /** Switching providers and back must not wipe a provider's count, or the switch would reset its day. */
  test('keeps each provider apart', () => {
    const storage = fakeStorage();

    saveLedger(storage, 'alphavantage', { keyPrint: keyPrint('k'), sentMs: [NOW] }, NOW);
    saveLedger(storage, 'twelvedata', { keyPrint: keyPrint('k'), sentMs: [NOW - 1000] }, NOW);

    const result = loadLedger(storage, 'alphavantage', keyPrint('k'), NOW);

    expect(result).toEqual([NOW]);
  });

  /** Swapping to another key and back found the first key's count empty, and its 25 a day could be spent twice. */
  test('keeps the count of each key apart, so a swap and back finds it where it was left', () => {
    const storage = fakeStorage();

    saveLedger(storage, 'alphavantage', { keyPrint: keyPrint('a'), sentMs: [NOW - 1000, NOW] }, NOW);
    saveLedger(storage, 'alphavantage', { keyPrint: keyPrint('b'), sentMs: [NOW] }, NOW);

    const result = loadLedger(storage, 'alphavantage', keyPrint('a'), NOW);

    expect(result).toEqual([NOW - 1000, NOW]);
  });

  /** A ledger stored as a list took no stamps at all, so every restart began the day's count at zero. */
  test('replaces a ledger stored as a list rather than writing into it', () => {
    const storage = fakeStorage();

    storage.items[LEDGER_KEY] = '[]';
    saveLedger(storage, 'alphavantage', { keyPrint: keyPrint('k'), sentMs: [NOW] }, NOW);

    const result = loadLedger(storage, 'alphavantage', keyPrint('k'), NOW);

    expect(result).toEqual([NOW]);
  });

  /** 900 weighted pairs under the stock key pushed out the 25 real stamps, and Alpha Vantage's day read as unspent. */
  test('reads only plain times under the stock key', () => {
    const storage = fakeStorage();
    const real = Array.from({ length: 25 }, (_unused, index) => NOW - HOUR - index * 1000);
    const pairs = Array.from({ length: 900 }, (_unused, index) => [NOW - index, 2]);

    storage.items[LEDGER_KEY] = JSON.stringify({ alphavantage: { [keyPrint('k')]: [...real, ...pairs] } });

    const result = loadLedger(storage, 'alphavantage', keyPrint('k'), NOW).length;

    expect(result).toBe(25);
  });

  /** A damaged ledger must read as empty rather than take the phone's code down. */
  test('reads a damaged ledger as empty', () => {
    const storage = fakeStorage();

    storage.items[LEDGER_KEY] = '{not json';

    const result = loadLedger(storage, 'alphavantage', keyPrint('k'), NOW);

    expect(result).toEqual([]);
  });
});
