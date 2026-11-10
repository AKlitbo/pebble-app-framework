// @vitest-environment jsdom
/**
 * Specs for reading the Clay settings the phone keeps.
 *
 * Every part of the runtime reads settings through these, so a value read wrong here is read
 * wrong everywhere. The cases worth pinning are the stored blob that is missing or will not parse,
 * Clay's habit of wrapping a value in an object, and a real zero or false that must not be
 * mistaken for unset. A select reads as its choice whether Clay stored it as text or as a number,
 * since text is what it nearly always holds. The settings watch decides whether a save refetches,
 * so a miss there either leaves a new city unfetched or spends a provider call on every theme
 * change.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { getConfig, readBool, readChoice, readFahrenheit, readText, readValue, watchSettings } from './settings-store';

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

describe('readText', () => {
  /**
   * A wearer who empties a field with a default saved an empty string. Taking the default for it
   * kept fetching the default tickers or feed however often they cleared it.
   */
  test('keeps an emptied field rather than taking the default', () => {
    const result = readText('', 'AAPL');

    expect(result).toBe('');
  });

  /** A field that was never saved has no choice in it yet, so it gets the default. */
  test.each([
    ['null', null],
    ['undefined', undefined],
  ])('takes the default for a field never saved (%s)', (label, value) => {
    const result = readText(value, 'AAPL');

    expect(result).toBe('AAPL');
  });

  /** Clay wraps some values as {value}, so the wrapper must come off or the field reads as an object. */
  test('unwraps a Clay value wrapper', () => {
    const result = readText({ value: 'MSFT' }, 'AAPL');

    expect(result).toBe('MSFT');
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

describe('readChoice', () => {
  /**
   * Clay stores a select as the option's text, and the watch's reply writes a choice back as text,
   * so the phone's copy holds "3" far more often than 3. All three forms must read as the same
   * choice, or a face reading a select sees its default whenever the value came back as text.
   */
  test.each([['3'], [3], [{ value: '3' }], [{ value: 3 }]])('reads %j as 3', (value) => {
    const result = readChoice(value, 0);

    expect(result).toBe(3);
  });

  /** The first option is a real choice, so "0" must not be mistaken for unset and take the fallback. */
  test.each([['0'], [0]])('reads %j as the first choice', (value) => {
    const result = readChoice(value, 7);

    expect(result).toBe(0);
  });

  /**
   * A toggle saved under the same key leaves a boolean, or the word for one, and it must still read
   * as the matching choice.
   */
  test.each([
    [true, 1],
    [false, 0],
    ['true', 1],
    ['false', 0],
  ])('reads %j as %d', (value, expected) => {
    const result = readChoice(value, 5);

    expect(result).toBe(expected);
  });

  /**
   * Nothing saved, a word, a negative, a fraction, or text with anything but digits is no choice,
   * so each takes the fallback rather than landing on a choice nobody picked.
   */
  test.each([[undefined], [null], [''], ['abc'], ['3a'], [' 3'], ['-1'], [-1], [1.5], ['1.5'], [{ value: '' }]])('gives the fallback for %j', (value) => {
    const result = readChoice(value, 4);

    expect(result).toBe(4);
  });

  /** A run of digits too long to hold exactly is no choice either, rather than a rounded one. */
  test('gives the fallback for digits past a safe integer', () => {
    const result = readChoice('99999999999999999999', 2);

    expect(result).toBe(2);
  });
});

describe('readFahrenheit', () => {
  /**
   * Every value a page, a toggle, or the watch's reply saves for the unit has to give the unit
   * readBool gave it, or a wearer's Fahrenheit flips to Celsius on update. Nothing saved takes the
   * page's default, either way round and in any of its forms.
   */
  test.each([
    [0, 0, false],
    [1, 0, true],
    ['0', 1, false],
    ['1', 0, true],
    [true, 0, true],
    [false, 1, false],
    ['true', 0, true],
    ['false', 1, false],
    [{ value: '1' }, 0, true],
    [undefined, 0, false],
    [undefined, 1, true],
    [undefined, '1', true],
    [undefined, true, true],
    [undefined, 'true', true],
    [undefined, 'false', false],
    ['', 1, true],
  ])('reads a saved unit of %j with a default of %j as Fahrenheit %s', (saved, fallback, expected) => {
    const config = saved === undefined ? {} : { WEATHER_TEMPERATURE_UNIT: saved };

    const result = readFahrenheit(config, { WEATHER_TEMPERATURE_UNIT: fallback });

    expect(result).toBe(expected);
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

  /**
   * A first run has nothing saved, and the fetch on ready used the default. A seed that wrote the
   * same value back counted as a change, and weather spent a second metered call on the same answer.
   */
  test('reads a setting with nothing saved as its default', () => {
    const watch = watchSettings(['WEATHER_TEMPERATURE_UNIT'], { WEATHER_TEMPERATURE_UNIT: false });

    watch.opened();
    localStorage.setItem('clay-settings', JSON.stringify({ WEATHER_TEMPERATURE_UNIT: false }));

    const result = watch.changed();

    expect(result).toBe(false);
  });

  /**
   * A default declared as the number 0 comes back from Clay as the string "0". Compared as JSON the
   * two differed, so a first save of anything counted as a unit change and spent a metered call.
   */
  test('matches a number default against the string Clay saves', () => {
    const watch = watchSettings(['WEATHER_TEMPERATURE_UNIT'], { WEATHER_TEMPERATURE_UNIT: 0 });

    watch.opened();
    localStorage.setItem('clay-settings', JSON.stringify({ WEATHER_TEMPERATURE_UNIT: '0' }));

    const result = watch.changed();

    expect(result).toBe(false);
  });

  /** With no snapshot the page never reported opening, so the safe answer is to refetch. */
  test('reports a change when the page never reported opening', () => {
    const watch = watchSettings(['WEATHER_PROVIDER']);

    const result = watch.changed();

    expect(result).toBe(true);
  });
});
