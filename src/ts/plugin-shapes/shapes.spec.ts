/**
 * Specs for the plugin shape readers.
 *
 * An update comes from someone else's plugin, and the mappers read every field through these. A
 * reader that throws on a bad field takes the whole update down, and one that lets the wrong type
 * through puts it on the watch. So the cases worth pinning are the misses: a missing property, a
 * wrong shape, a null point, and a moment before or past a series. The index into a series is
 * pinned on its own, since a forecast starts at the place's midnight and reading the first point
 * shows hours already gone.
 */

import { describe, test, expect } from 'vitest';
import { base64Bytes, firstProperties, flag, image, instancesOf, numeric, propertiesOf, seriesIndex, seriesValue, text, timestamp } from './shapes';
import type { SeriesShape, SourceEnvelope, SourceProperty } from '../plugin-sources/types';

// an hourly series from 2026-07-10 00:00 UTC with four points, the shape the built-in weather sends
const SERIES_START = Math.floor(Date.UTC(2026, 6, 10, 0, 0) / 1000);
const HOUR = 3600;

const hourly: SeriesShape = {
  start: SERIES_START,
  stepSec: HOUR,
  numericValue: { values: [18.5, 19, null, 21], unit: '°C' },
  longText: { values: ['sun', 'cloudy', null, 'light_rain'] },
};

describe('text', () => {
  /** A calendar title wants the long form, since a short one is sized for about 7 characters. */
  test('reads the preferred shape when both are there', () => {
    const property: SourceProperty = { shortText: { text: 'Standup' }, longText: { text: 'Standup with the design team' } };

    const result = text(property, 'long');

    expect(result).toBe('Standup with the design team');
  });

  /** A plugin that only sends one text shape must still get its words read. */
  test('falls back to the other shape', () => {
    const property: SourceProperty = { shortText: { text: 'Partly cloudy' } };

    const result = text(property, 'long');

    expect(result).toBe('Partly cloudy');
  });

  /** An empty long text beside a real short one would otherwise blank the title. */
  test('treats a blank text as missing and falls back', () => {
    const property: SourceProperty = { longText: { text: '  ' }, shortText: { text: 'Lunch' } };

    const result = text(property, 'long');

    expect(result).toBe('Lunch');
  });

  /** A missing property, a number sent as text, and a text with no words all read as nothing. */
  test.each([
    ['a missing property', undefined],
    ['a property with no text shape', { numericValue: { value: 3 } }],
    ['a text that is not a string', { shortText: { text: 42 } }],
    ['a shape that is not an object', { longText: 'Lunch' }],
  ])('reads %s as undefined', (_label, property) => {
    const result = text(property as unknown as SourceProperty, 'short');

    expect(result).toBeUndefined();
  });
});

describe('numeric', () => {
  /** The unit rides with the number, since a °F reading read as °C is off by the whole conversion. */
  test('reads the value with its unit', () => {
    const property: SourceProperty = { numericValue: { value: 72, unit: '°F' } };

    const result = numeric(property);

    expect(result).toEqual({ value: 72, unit: '°F' });
  });

  /** A temperature only sent as text must not be parsed out of it, so it reads as nothing. */
  test.each([
    ['a missing property', undefined],
    ['a property sent only as text', { shortText: { text: '21°' } }],
    ['a value that is a string', { numericValue: { value: '21' } }],
    ['a value that is not a number at all', { numericValue: { value: Number.NaN } }],
  ])('reads %s as undefined', (_label, property) => {
    const result = numeric(property as unknown as SourceProperty);

    expect(result).toBeUndefined();
  });
});

describe('timestamp', () => {
  /** An event's start must come back as the same epoch seconds the plugin sent. */
  test('reads the moment as epoch seconds', () => {
    const property: SourceProperty = { timestamp: { value: SERIES_START } };

    const result = timestamp(property);

    expect(result).toBe(SERIES_START);
  });

  /** A start sent only as text cannot be placed on the agenda, so it reads as nothing. */
  test.each([
    ['a missing property', undefined],
    ['a property sent only as text', { shortText: { text: '9:00 AM' } }],
    ['a value that is a string', { timestamp: { value: '1783641600' } }],
    ['a moment no Date can hold', { timestamp: { value: 1e13 } }],
    ['a moment before 1970', { timestamp: { value: -1 } }],
    ['NaN', { timestamp: { value: NaN } }],
  ])('reads %s as undefined', (_label, property) => {
    const result = timestamp(property as unknown as SourceProperty);

    expect(result).toBeUndefined();
  });
});

describe('flag', () => {
  /** A false must read as false, not as missing, or a timed event could pick up a default. */
  test('reads a false as false', () => {
    const property: SourceProperty = { boolean: { value: false } };

    const result = flag(property);

    expect(result).toBe(false);
  });

  /** A string "true" is not a boolean the plugin sent, so it reads as nothing. */
  test.each([
    ['a missing property', undefined],
    ['a value that is a string', { boolean: { value: 'true' } }],
  ])('reads %s as undefined', (_label, property) => {
    const result = flag(property as unknown as SourceProperty);

    expect(result).toBeUndefined();
  });
});

describe('seriesIndex', () => {
  /** The series starts at midnight, so at 02:30 the current hour is the third point, not the first. */
  test('counts whole steps from the start', () => {
    const result = seriesIndex(hourly, SERIES_START + 2 * HOUR + 30 * 60);

    expect(result).toBe(2);
  });

  /** A moment before the start has no point, rather than a negative index that reads the wrong end. */
  test('reads a moment before the start as undefined', () => {
    const result = seriesIndex(hourly, SERIES_START - 1);

    expect(result).toBeUndefined();
  });

  /** A stale series runs out after its last point, and a column there must show no reading. */
  test('reads a moment past the last point as undefined', () => {
    const result = seriesIndex(hourly, SERIES_START + 4 * HOUR);

    expect(result).toBeUndefined();
  });

  /** A series with no step would divide by zero and hand back an index of Infinity. */
  test.each([
    ['no start', { stepSec: HOUR, numericValue: { values: [1] } }],
    ['a step of zero', { start: SERIES_START, stepSec: 0, numericValue: { values: [1] } }],
    ['no values at all', { start: SERIES_START, stepSec: HOUR }],
    ['a start no Date can hold', { start: 1e13, stepSec: HOUR, numericValue: { values: [1] } }],
    ['a start of NaN', { start: NaN, stepSec: HOUR, numericValue: { values: [1] } }],
  ])('reads a series with %s as undefined', (_label, series) => {
    const result = seriesIndex(series as unknown as SeriesShape, SERIES_START);

    expect(result).toBeUndefined();
  });
});

describe('seriesValue', () => {
  /** An hourly temperature needs its unit as much as a single reading does. */
  test('reads a number with the series unit', () => {
    const result = seriesValue(hourly, 'numericValue', 1);

    expect(result).toEqual({ value: 19, unit: '°C' });
  });

  /** A null point is a reading the plugin did not have, so its column must stay empty. */
  test('reads a null point as undefined', () => {
    const result = seriesValue(hourly, 'numericValue', 2);

    expect(result).toBeUndefined();
  });

  /** A null text point reads as missing too, so its condition code falls to unknown. */
  test('reads a null text point as undefined', () => {
    const result = seriesValue(hourly, 'longText', 2);

    expect(result).toBeUndefined();
  });

  /** A sun time a Date cannot hold would throw once a mapper reads it on the phone's clock. */
  test('reads a timestamp point no Date can hold as undefined', () => {
    const sun: SeriesShape = { start: SERIES_START, stepSec: HOUR, timestamp: { values: [1e13] } };

    const result = seriesValue(sun, 'timestamp', 0);

    expect(result).toBeUndefined();
  });

  /** A shape the series does not carry and an index from a moment past the end both read as nothing. */
  test.each([
    ['a shape the series does not carry', 'timestamp', 0],
    ['an index past the end', 'longText', 4],
    ['no index', 'longText', undefined],
  ])('reads %s as undefined', (_label, shape, index) => {
    const result = seriesValue(hourly, shape as 'longText', index);

    expect(result).toBeUndefined();
  });
});

describe('reading instances off an update', () => {
  const properties = { battery_level: { numericValue: { value: 84 } } };

  /** A one-instance kind reads its readings from here, so the first instance's properties have to come back as sent. */
  test('reads the first instance\'s properties', () => {
    const result = firstProperties({ instances: [{ instanceId: 'phone', properties }, { properties: {} }] });

    expect(result).toBe(properties);
  });

  /** Nothing off the phone is trusted, so an update of any wrong shape reads as no properties rather than throwing. */
  test.each([
    ['a missing update', undefined],
    ['an update with no list', {}],
    ['a list that is not one', { instances: 'phone' }],
    ['an empty list', { instances: [] }],
    ['an instance that is not an object', { instances: [7] }],
    ['an instance with no properties', { instances: [{ instanceId: 'phone' }] }],
    ['properties that are not an object', { instances: [{ properties: 'many' }] }],
  ])('reads %s as no properties', (_label, envelope) => {
    const result = firstProperties(envelope as SourceEnvelope | undefined);

    expect(result).toBeNull();
  });

  /** A list that is not one would make the calendar walk a string a letter at a time. */
  test('reads a list that is not one as no instances', () => {
    const result = instancesOf({ instances: 'events' } as unknown as SourceEnvelope);

    expect(result).toEqual([]);
  });

  /** An event entry that is null is passed over, not read, so one bad event costs only itself. */
  test('reads a null instance as no properties', () => {
    const result = propertiesOf(null);

    expect(result).toBeNull();
  });
});

describe('base64Bytes', () => {
  /** The phone's art comes as base64, and a wrong byte would put a wrong colour on the watch. */
  test('decodes base64 with its padding', () => {
    const result = base64Bytes('ARAi');

    expect(result).toEqual([0x01, 0x10, 0x22]);
  });

  /** The padding at the end is only filler, so two bytes read back as two. */
  test('decodes a run ending in padding to its own length', () => {
    const result = base64Bytes('wP8=');

    expect(result).toEqual([0xc0, 0xff]);
  });

  /** Text that is not base64 must not turn into bytes a bitmap would be built from. */
  test.each([['a character outside the alphabet', 'AR*A'], ['a length no run can have', 'ARAiA'], ['something other than text', 12]])('reads %s as none', (_label, encoded) => {
    const result = base64Bytes(encoded);

    expect(result).toBeUndefined();
  });
});

describe('image', () => {
  // a 2 by 2 picture in two colours, one byte a row
  const TWO_BY_TWO = { image: { width: 2, height: 2, palette: 'wP8=', pixels: 'ARA=' } };

  /** The watch builds its bitmap straight from these bytes, so each part has to come through as sent. */
  test('reads a bitmap whose parts agree', () => {
    const result = image(TWO_BY_TWO);

    expect(result).toEqual({ width: 2, height: 2, palette: [0xc0, 0xff], pixels: [0x01, 0x10] });
  });

  /** An odd width still fills a whole byte a row, so a 3 wide row takes two bytes. */
  test('takes a row padded to a whole byte for an odd width', () => {
    const result = image({ image: { width: 3, height: 1, palette: 'wP8=', pixels: 'EjA=' } });

    expect(result?.pixels).toEqual([0x12, 0x30]);
  });

  /** A bitmap built from a short run would draw whatever memory followed it. */
  test.each([
    ['pixels short of the size', { width: 2, height: 3, palette: 'wP8=', pixels: 'ARA=' }],
    ['a palette past 16 colours', { width: 2, height: 2, palette: 'AAAAAAAAAAAAAAAAAAAAAAAA', pixels: 'ARA=' }],
    ['an empty palette', { width: 2, height: 2, palette: '', pixels: 'ARA=' }],
    ['a width that is not a whole number', { width: 1.5, height: 2, palette: 'wP8=', pixels: 'ARA=' }],
    ['a height of 0', { width: 2, height: 0, palette: 'wP8=', pixels: '' }],
  ])('reads %s as no image', (_label, shape) => {
    const result = image({ image: shape } as SourceProperty);

    expect(result).toBeUndefined();
  });

  /** A property sent only as text has no picture, so it must not read as one. */
  test('reads a property with no image as none', () => {
    const result = image({ shortText: { text: 'art' } });

    expect(result).toBeUndefined();
  });
});
