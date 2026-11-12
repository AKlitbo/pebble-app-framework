/**
 * Specs for the shared call ledger.
 *
 * The stock providers' own edges are pinned in `ts/stock/ledger.spec.ts`. What is worth pinning here
 * is what the stock plans never reach: a call that counts as several, an hour and a month window, a
 * rolling limit counted beside a clock one, stamps saved before weights existed, and a keyless provider
 * keeping one count whatever key is typed. Each is a way for a provider's plan to be overspent.
 */

import { describe, test, expect } from 'vitest';
import { addStamp, allowance, keepStamps, ledgerPrint, loadStamps, saveStamps, takeBack } from './ledger';
import type { LedgerStorage, QuotaPlan, Stamp } from './ledger';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// Wednesday 1 July 2026, 14:30:20 UTC
const NOW = Date.UTC(2026, 6, 1, 14, 30, 20);

const LEDGER_KEY = 'test-ledger';

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

/** A plan of one limit, enough for most specs. */
function onePlan(calls: number, window: 'minute' | 'hour' | 'day' | 'month', follows: 'clock' | 'rolling', keyed = true): QuotaPlan {
  return { keyed, limits: [{ calls, window, follows }] };
}

describe('a weighted call', () => {
  /** A request billed as 4 calls counted as 1 would let a provider's day go four times over. */
  test('counts each stamp by its weight', () => {
    const plan = onePlan(10, 'day', 'clock');
    const sent: Stamp[] = [
      [NOW - HOUR, 4],
      [NOW - MINUTE, 4],
    ];

    const result = [allowance(plan, sent, { calls: 3, weight: 1 }, NOW).room, allowance(plan, sent, { calls: 1, weight: 4 }, NOW).room];

    expect(result).toEqual([2, 0]);
  });

  /** A weight lost on a restart would read every heavy request back as one call. */
  test('keeps its weight through a save and a load', () => {
    const storage = fakeStorage();
    const plan = onePlan(10, 'day', 'clock');
    const sent: Stamp[] = [];

    addStamp(sent, NOW - 1000);
    addStamp(sent, NOW, 3.9);
    saveStamps(storage, LEDGER_KEY, 'provider', 'print', sent, plan, NOW);

    const result = loadStamps(storage, LEDGER_KEY, 'provider', 'print', plan, NOW);

    expect(result).toEqual([NOW - 1000, [NOW, 3.9]]);
  });

  /** A heavy call lost to the network spent nothing, so leaving its stamp would hold back calls never made. */
  test('takes back a weighted call whole', () => {
    const sent: Stamp[] = [NOW - 1000, [NOW, 4]];

    takeBack(sent, NOW, 4);

    expect(sent).toEqual([NOW - 1000]);
  });

  /** A light call failing in the same millisecond as a heavy one took the heavy stamp, and 3 spent calls left the count. */
  test('takes back only the stamp with the same weight', () => {
    const sent: Stamp[] = [[NOW, 4], NOW];

    takeBack(sent, NOW, 1);

    expect(sent).toEqual([[NOW, 4]]);
  });

  /** A weight that is not a number above 0 made the sums come out as room on a limit already spent. */
  test.each([
    [NaN, 10],
    [0, 10],
    [-1, 12],
  ])('gives no room to a call of weight %s', (weight, spent) => {
    const plan = onePlan(10, 'day', 'clock');
    const sent = Array.from({ length: spent }, (_unused, index) => NOW - index - 1);

    const result = allowance(plan, sent, { calls: 3, weight }, NOW).room;

    expect(result).toBe(0);
  });

  /** A stamp of weight NaN or -8 counted as nothing or less, so a spent limit opened again while the calls had gone out. */
  test('stamps a weight that is not a number above 0 as 1', () => {
    const sent: Stamp[] = [NOW - 1000];

    addStamp(sent, NOW, NaN);
    addStamp(sent, NOW, -8);

    expect(sent).toEqual([NOW - 1000, NOW, NOW]);
  });

  /** The ledger caps how many stamps it keeps, not their weight, so calls under 1 were cut while still in the window. */
  test('counts a weight under 1 as a whole call', () => {
    const plan = onePlan(3, 'day', 'clock');
    const sent: Stamp[] = [];

    addStamp(sent, NOW - 2000, 0.5);
    addStamp(sent, NOW - 1000, 0.5);

    const result = allowance(plan, sent, { calls: 2, weight: 0.5 }, NOW).room;

    expect(result).toBe(1);
  });
});

describe('an hour window', () => {
  /** A clock hour that counted the hour before would hold calls the provider has already let go. */
  test('counts the clock hour, and opens a minute past the next one', () => {
    const plan = onePlan(5, 'hour', 'clock');
    const sent = [Date.UTC(2026, 6, 1, 13, 50), Date.UTC(2026, 6, 1, 13, 55), Date.UTC(2026, 6, 1, 14, 5), Date.UTC(2026, 6, 1, 14, 10), Date.UTC(2026, 6, 1, 14, 20)];

    const result = allowance(plan, sent, { calls: 4 }, NOW);

    expect(result).toEqual({ room: 2, retryAtMs: Date.UTC(2026, 6, 1, 15, 1) });
  });

  /** A rolling hour that only counted since the clock hour would let a burst at :59 and :01 through twice. */
  test('counts the last 60 minutes when it rolls', () => {
    const plan = onePlan(5, 'hour', 'rolling');
    const sent = [Date.UTC(2026, 6, 1, 13, 20), Date.UTC(2026, 6, 1, 13, 50), Date.UTC(2026, 6, 1, 13, 55), Date.UTC(2026, 6, 1, 14, 10)];

    const result = allowance(plan, sent, { calls: 3 }, NOW);

    expect(result).toEqual({ room: 2, retryAtMs: Date.UTC(2026, 6, 1, 14, 50, 1) });
  });
});

describe('a month window', () => {
  /** WeatherAPI.com starts its month again on the 1st, UTC, so the evening of the 31st is last month's. */
  test('counts from the 1st, UTC', () => {
    const plan = onePlan(3, 'month', 'clock');
    const sent = [Date.UTC(2026, 9, 31, 23, 58), Date.UTC(2026, 9, 31, 23, 59), Date.UTC(2026, 10, 1, 0, 0, 10)];

    const result = allowance(plan, sent, { calls: 3 }, Date.UTC(2026, 10, 1, 0, 0, 30));

    expect(result).toEqual({ room: 2, retryAtMs: Date.UTC(2026, 11, 1, 0, 1) });
  });

  /** A month of stamps one for every call grew the saved ledger past what the phone would write each call. */
  test('merges each hour a day old into one stamp carrying its weight', () => {
    const plan = onePlan(100000, 'month', 'clock');
    const sent = Array.from({ length: 48 * 6 }, (_unused, index) => Date.UTC(2026, 5, 20) + index * 10 * MINUTE);

    const result = keepStamps(sent, plan, NOW);

    expect([result.length, result[0], result[47]]).toEqual([48, [Date.UTC(2026, 5, 20, 0, 59, 59, 999), 6], [Date.UTC(2026, 5, 21, 23, 59, 59, 999), 6]]);
  });

  /** Rounding a merged hour down dropped part of a call, and a merge has to err toward counting more. */
  test('rounds a merged weight up', () => {
    const plan = onePlan(100000, 'month', 'clock');
    const hour = Date.UTC(2026, 5, 20, 5);

    const result = keepStamps([[hour + 1000, 1.0004], hour + 2000], plan, NOW);

    expect(result).toEqual([[Date.UTC(2026, 5, 20, 5, 59, 59, 999), 2.001]]);
  });
});

describe('a rolling window beside a clock window', () => {
  /**
   * Calls just before midnight UTC are yesterday's for the clock day but still inside the rolling day.
   * Counting both the clock's way gave the rolling limit back its whole day at midnight.
   */
  test('counts each limit its own way and waits for the later to open', () => {
    const plan: QuotaPlan = {
      keyed: true,
      limits: [
        { calls: 10, window: 'day', follows: 'clock' },
        { calls: 10, window: 'day', follows: 'rolling' },
      ],
    };
    const sent = Array.from({ length: 8 }, (_unused, index) => Date.UTC(2026, 5, 30, 23, index));

    const result = allowance(plan, sent, { calls: 4 }, Date.UTC(2026, 6, 1, 2, 0));

    expect(result).toEqual({ room: 2, retryAtMs: Date.UTC(2026, 6, 1, 23, 1, 1) });
  });
});

describe('keepStamps', () => {
  /** A stamp whose time is not a number was kept, and sorting it among the others left the order to chance. */
  test('drops a stamp whose time is not a number', () => {
    const result = keepStamps([NaN, NOW - 1000, [NaN, 4]], onePlan(10, 'day', 'clock'), NOW);

    expect(result).toEqual([NOW - 1000]);
  });
});

describe('the saved ledger', () => {
  /** A ledger saved before weights were kept holds plain times, and dropping them would let a day's calls go out twice. */
  test('reads in stamps saved as plain times beside weighted ones, and drops what is not a stamp', () => {
    const storage = fakeStorage();

    storage.items[LEDGER_KEY] = JSON.stringify({ provider: { print: [NOW - 2000, 'x', [NOW - 1000, 4], [NOW], [NOW, -1], NOW] } });

    const result = loadStamps(storage, LEDGER_KEY, 'provider', 'print', onePlan(25, 'day', 'rolling'), NOW);

    expect(result).toEqual([NOW - 2000, [NOW - 1000, 4], NOW]);
  });

  /** A damaged weight such as 1e308 read back in held the provider off for a whole window. */
  test('drops a saved weight above the largest limit', () => {
    const storage = fakeStorage();

    storage.items[LEDGER_KEY] = JSON.stringify({ provider: { print: [[NOW - 5, 1e308], [NOW - 4, 10], NOW - 3] } });

    const result = loadStamps(storage, LEDGER_KEY, 'provider', 'print', onePlan(10, 'day', 'clock'), NOW);

    expect(result).toEqual([[NOW - 4, 10], NOW - 3]);
  });

  /** A keyless provider's count started again whenever the wearer typed a key for another provider. */
  test('keeps one ledger for a keyless provider whatever key is in use', () => {
    const storage = fakeStorage();
    const plan = onePlan(600, 'minute', 'clock', false);

    saveStamps(storage, LEDGER_KEY, 'openmeteo', ledgerPrint(plan, 'a key for another provider'), [NOW], plan, NOW);

    const result = loadStamps(storage, LEDGER_KEY, 'openmeteo', ledgerPrint(plan, ''), plan, NOW);

    expect(result).toEqual([NOW]);
  });
});
