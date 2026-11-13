/**
 * Specs for the store readings a dev build seeds from paf.dev.config.json.
 *
 * The readings go straight into C structs, so what is worth pinning is the packing the watch reads
 * back: a forecast column's night bit, a price in cents, and an HRV run laid out minute by minute. A
 * reading the watch would cut short or draw as its fallback has to stop the build, since on the
 * emulator it only shows as a screenshot that is quietly wrong. So does a store the face cannot show.
 */
import { describe, expect, test } from 'vitest';
import { checkStoresFit, NO_STORES, readStores } from './dev-seeds.ts';

const FILE = 'mosaic/paf.dev.config.json';

/** 20:42 as minutes past midnight, the clock the HRV log has to end by. */
const CLOCK = 20 * 60 + 42;

describe('readStores', () => {
  /** The hourly strip marks a column after dark with the night bit, or the watch draws a sun at midnight. */
  test('packs an hourly column ending in _NIGHT with the night bit', () => {
    const result = readStores({ weather: { hourly: { from: 18, every: 2, columns: [['CLEAR', 21], ['PCLDY_NIGHT', 15]] } } }, CLOCK, FILE, '');

    expect(result.weather?.hourly).toEqual({ baseHour: 18, stepHours: 2, columns: [{ code: 0, temp: 21 }, { code: 0x81, temp: 15 }] });
  });

  /** The daily strip only draws day glyphs, so a night token there is a mistake rather than a look. */
  test('refuses a night condition on the daily strip', () => {
    const call = () => readStores({ weather: { daily: { from: 'sat', columns: [['CLEAR_NIGHT', 30, 18]] } } }, CLOCK, FILE, '');

    expect(call).toThrow(`${FILE} sets stores.weather.daily.columns[0] to "CLEAR_NIGHT", which is not a weather condition`);
  });

  /** A token the shared list does not hold draws the fallback icon, which reads as a broken face in a screenshot. */
  test('refuses a weather condition the watch has no icon for', () => {
    const call = () => readStores({ weather: { cond: 'SUNNY' } }, CLOCK, FILE, "gridlock's ");

    expect(call).toThrow(`${FILE} sets gridlock's stores.weather.cond to "SUNNY", which is not a weather condition. They are CLEAR, PCLDY`);
  });

  /** A misspelt field would leave the reading out with nothing to say, and the panel would draw dashes. */
  test('refuses a field the store does not take and names the ones it does', () => {
    const call = () => readStores({ phone: { batery: 84 } }, CLOCK, FILE, '');

    expect(call).toThrow(`${FILE} sets stores.phone.batery, which the phone seed does not take. It takes battery`);
  });

  /** The watch keeps a title in a fixed buffer, so one past it would show cut short. */
  test('refuses an event title longer than the watch keeps', () => {
    const call = () => readStores({ calendar: [{ title: 'A meeting with a much longer title', inMinutes: 60 }] }, CLOCK, FILE, '');

    expect(call).toThrow('longer than the 24 bytes the watch keeps');
  });

  /** The buffers count bytes, so text outside ASCII fills them faster than its characters suggest. */
  test('counts a title in bytes rather than characters', () => {
    const call = () => readStores({ calendar: [{ title: 'é'.repeat(13), inMinutes: 60 }] }, CLOCK, FILE, '');

    expect(call).toThrow('longer than the 24 bytes the watch keeps');
  });

  /** The strip carries cents and hundredths, and 890.55 times 100 is 89054.99999 in floating point. */
  test('packs a quote in cents and hundredths of a percent', () => {
    const result = readStores({ stocks: [{ symbol: 'NFLX', price: 890.55, change: -0.8 }] }, CLOCK, FILE, '');

    expect(result.stocks).toEqual([{ symbol: 'NFLX', priceCents: 89055, changeHundredths: -80, ok: true }]);
  });

  /** A price past the strip's int32 of cents would overflow its C field and stop the build with a gcc error far from the config. */
  test('refuses a price past what the strip carries', () => {
    const call = () => readStores({ stocks: [{ symbol: 'BRK', price: 30_000_000, change: 1 }] }, CLOCK, FILE, '');

    expect(call).toThrow(`${FILE} sets stores.stocks[0].price to 30000000. It takes a number from 0 to 21474836.47`);
  });

  /** The strip carries the change in an int16 of hundredths, so a change past it could never arrive from the phone. */
  test('refuses a change past what the strip carries', () => {
    const call = () => readStores({ stocks: [{ symbol: 'GME', price: 20, change: 400 }] }, CLOCK, FILE, '');

    expect(call).toThrow('stores.stocks[0].change to 400. It takes a number from -327.68 to 327.67');
  });

  /** The strip holds four quotes, and a fifth would never reach the screen. */
  test('refuses more quotes than the strip holds', () => {
    const quote = { symbol: 'F', price: 11.92, change: 2.15 };

    const call = () => readStores({ stocks: [quote, quote, quote, quote, quote] }, CLOCK, FILE, '');

    expect(call).toThrow(`${FILE} sets stores.stocks to 5 entries, and the watch keeps 4`);
  });

  /** An all-day event lands on a whole day, so a start time on one has nowhere to go. */
  test('refuses an all-day event with a time', () => {
    const call = () => readStores({ calendar: [{ title: 'Birthday', allDay: true, inMinutes: 60 }] }, CLOCK, FILE, '');

    expect(call).toThrow('as all day with a time');
  });

  /** A run lays its readings out from its start, so the panels see the times the config means. */
  test('lays an HRV run out every few minutes with a state for each reading', () => {
    const result = readStores({ health: { hrvLog: [{ from: '18:45', every: 5, ms: [28, 25, 31], state: ['busy', 'busy', 'still'] }] } }, CLOCK, FILE, '');

    expect(result.health?.hrvLog).toEqual([
      { minute: 1125, ms: 28, state: 'busy', asleep: false },
      { minute: 1130, ms: 25, state: 'busy', asleep: false },
      { minute: 1135, ms: 31, state: 'still', asleep: false },
    ]);
  });

  /** The watch dates each reading back from the pinned clock, so one after it would read as from the future. */
  test('refuses an HRV reading after the pinned clock', () => {
    const call = () => readStores({ health: { hrvLog: [{ from: '20:40', every: 5, ms: [41, 42] }] } }, CLOCK, FILE, '');

    expect(call).toThrow('to a reading after the pinned clock');
  });

  /** The log files readings as they come, so a run out of order would scramble the history panel. */
  test('refuses HRV runs out of time order', () => {
    const call = () => readStores({ health: { hrvLog: [{ from: '10:00', ms: [30] }, { from: '09:00', ms: [31] }] } }, CLOCK, FILE, '');

    expect(call).toThrow('to start at or before the run ahead of it ends');
  });

  /** A store the block leaves out keeps the fixture, which the C reads as the store not being seeded. */
  test('leaves every store the block does not name to the fixture', () => {
    const result = readStores({ phone: { battery: 84 } }, CLOCK, FILE, '');

    expect(result).toEqual({ ...NO_STORES, phone: { battery: 84 } });
  });
});

describe('checkStoresFit', () => {
  /** A seed for a store the face has no keys for builds into nothing, and the shot shows the store empty. */
  test('refuses a stock seed for a face without STOCK_STRIP', () => {
    const stores = readStores({ stocks: [{ symbol: 'F', price: 11.92, change: 2.15 }] }, CLOCK, FILE, '');

    const call = () => checkStoresFit(stores, ['WEATHER_TEMPERATURE'], {}, 'ridgeline');

    expect(call).toThrow("paf.dev.config.json seeds ridgeline's stocks store, but ridgeline does not declare STOCK_STRIP");
  });

  /** A face built without HEALTH_HRV leaves the HRV store out, so its readings would never show. */
  test('refuses an HRV seed for a face built without HEALTH_HRV', () => {
    const stores = readStores({ health: { hrvMs: 41 } }, CLOCK, FILE, '');

    const call = () => checkStoresFit(stores, [], {}, 'sidereel');

    expect(call).toThrow('does not set HEALTH_HRV');
  });
});
