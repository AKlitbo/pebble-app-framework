/**
 * Specs for the coordinate helpers every weather path shares.
 *
 * Open-Meteo refuses a whole batch over one place out of range, so the range check decides whether a
 * run gets any weather at all. The rounding is what a plugin app keeps a place at and what the weather
 * source serves it as, so both have to land on the same four decimals.
 */

import { describe, test, expect } from 'vitest';
import { roundCoordinate, validCoords } from './coords';

describe('validCoords', () => {
  /** A place past a pole or the date line in the batch has Open-Meteo refuse every place in it. */
  test.each([
    [{ lat: 90, lon: 180 }, true],
    [{ lat: -90, lon: -180 }, true],
    [{ lat: 90.0001, lon: 0 }, false],
    [{ lat: 0, lon: -180.0001 }, false],
    [{ lat: Number.NaN, lon: 0 }, false],
    [null, false],
  ])('reads %o as %s', (coords, expected) => {
    const result = validCoords(coords);

    expect(result).toBe(expected);
  });
});

describe('roundCoordinate', () => {
  /** A place kept at one rounding and served at another would show a face a coordinate a hair off the one picked. */
  test.each([
    [-114.07188, -114.0719],
    [45.638912, 45.6389],
    [51.04472, 51.0447],
  ])('cuts %s to %s', (value, expected) => {
    const result = roundCoordinate(value);

    expect(result).toBe(expected);
  });

  /** Page code that cannot import the rounder rounds with `toFixed` too, and a different method lands a step off on a value like this one. */
  test('rounds as toFixed does, not by multiplying up', () => {
    const result = roundCoordinate(45.12345);

    expect(result).toBe(45.1234);
  });
});
