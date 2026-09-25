// @vitest-environment jsdom
/**
 * Specs for reading the Clay settings the phone keeps.
 *
 * Every part of the runtime reads settings through these, so a value read wrong here is read
 * wrong everywhere. The cases worth pinning are the stored blob that is missing or will not parse,
 * Clay's habit of wrapping a value in an object, and a real zero or false that must not be
 * mistaken for unset. The settings watch decides whether a save refetches, so a miss there either
 * leaves a new city unfetched or spends a provider call on every theme change.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { getConfig, readBool, readValue, watchSettings } from './settings-store';

describe('getConfig', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** The persisted settings must parse back out or every read falls through to defaults. */
  test('returns the parsed clay settings', () => {
    localStorage.setItem('clay-settings', JSON.stringify({ WEATHER_PROVIDER: 'owm' }));

    const result = getConfig();

    expect(result).toEqual({ WEATHER_PROVIDER: 'owm' });
  });

  /** With nothing saved the store must read as an empty object, never null that a caller dots into. */
  test('returns an empty object when nothing is saved', () => {
    const result = getConfig();

    expect(result).toEqual({});
  });

  /** A corrupt blob must not throw: it falls back to empty so the app still starts. */
  test('returns an empty object on corrupt json', () => {
    localStorage.setItem('clay-settings', '{ not valid');

    const result = getConfig();

    expect(result).toEqual({});
  });
});

describe('readValue', () => {
  /** A plain stored value must pass straight through. */
  test('returns a primitive value unchanged', () => {
    const result = readValue('finnhub', 'fallback');

    expect(result).toBe('finnhub');
  });

  /** Clay wraps some values as {value}, so the wrapper must be unwrapped or the setting reads as an object. */
  test('unwraps a Clay value wrapper', () => {
    const result = readValue({ value: '3' }, 'fallback');

    expect(result).toBe('3');
  });

  /** An empty string, null, or undefined must take the fallback so a blank setting uses its default. */
  test.each([
    ['empty string', ''],
    ['null', null],
    ['undefined', undefined],
  ])('falls back on an empty value (%s)', (label, value) => {
    const result = readValue(value, 'fallback');

    expect(result).toBe('fallback');
  });

  /** Zero is a real reading, not an empty value, so it must not be swallowed by the fallback. */
  test('keeps a zero value rather than taking the fallback', () => {
    const result = readValue(0, 5);

    expect(result).toBe(0);
  });
});

describe('readBool', () => {
  /** The truthy wire forms (true, "true", 1, "1") must all read as true or a toggle silently stays off. */
  test.each([true, 'true', 1, '1'])('reads %s as true', (value) => {
    const result = readBool(value, false);

    expect(result).toBe(true);
  });

  /** Anything else, including the string "0", must read as false so an off toggle stays off. */
  test.each([false, 'false', 0, '0'])('reads %s as false', (value) => {
    const result = readBool(value, true);

    expect(result).toBe(false);
  });

  /** An unset setting must take the fallback so a defaulted-on toggle starts on. */
  test('applies the fallback when the value is unset', () => {
    const result = readBool(undefined, true);

    expect(result).toBe(true);
  });
});

describe('watchSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** A save that only touched the theme must not spend a provider call on a refetch. */
  test('reports no change when only other settings moved', () => {
    localStorage.setItem('clay-settings', JSON.stringify({ WEATHER_PROVIDER: 'owm', THEME: 1 }));
    const watch = watchSettings(['WEATHER_PROVIDER']);
    watch.opened();
    localStorage.setItem('clay-settings', JSON.stringify({ WEATHER_PROVIDER: 'owm', THEME: 2 }));

    const result = watch.changed();

    expect(result).toBe(false);
  });

  /** A new provider has to be fetched straight away rather than on the next poll. */
  test('reports a change when a watched setting moved', () => {
    localStorage.setItem('clay-settings', JSON.stringify({ WEATHER_PROVIDER: 'owm' }));
    const watch = watchSettings(['WEATHER_PROVIDER']);
    watch.opened();
    localStorage.setItem('clay-settings', JSON.stringify({ WEATHER_PROVIDER: 'openmeteo' }));

    const result = watch.changed();

    expect(result).toBe(true);
  });

  /** With no snapshot the page never reported opening, so the safe answer is to refetch. */
  test('reports a change when the page never reported opening', () => {
    const watch = watchSettings(['WEATHER_PROVIDER']);

    const result = watch.changed();

    expect(result).toBe(true);
  });
});
