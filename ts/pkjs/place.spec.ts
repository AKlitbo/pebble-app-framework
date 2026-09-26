/**
 * Specs for reading a saved place back.
 *
 * The weather fetch and a time zone field both read the value a location field saved, and each
 * accepted a slightly different set of shapes. One reader now takes the union: the place as JSON,
 * the place already parsed, and the "offset,label" an older time zone field kept. What is worth
 * pinning is that each shape still reads, and that a bad coordinate never reaches a provider.
 */

import { describe, test, expect } from 'vitest';
import { readPlace } from './place';

describe('readPlace', () => {
  /** The shape the config page saves today, so every weather fetch and second clock reads it. */
  test('reads a place saved as JSON', () => {
    const saved = JSON.stringify({ lat: 51.5, lon: -0.12, label: 'London', offset: 60, tz: 'Europe/London' });

    const result = readPlace(saved);

    expect(result).toEqual({ label: 'London', lat: 51.5, lon: -0.12, offset: 60, tz: 'Europe/London' });
  });

  /** Clay can hand the value back already parsed, and it must read the same as the string. */
  test('reads a place Clay already parsed', () => {
    const result = readPlace({ lat: 33.4, lon: -112, label: 'Phoenix' });

    expect(result).toEqual({ label: 'Phoenix', lat: 33.4, lon: -112 });
  });

  /** A second clock set up before the zone was kept holds offset then label, and must keep its time. */
  test('reads the older offset,label a time zone field kept', () => {
    const result = readPlace('-300,New York');

    expect(result).toEqual({ label: 'New York', offset: -300 });
  });

  /** A coordinate out of range would send a provider a request for nowhere, so it is dropped. */
  test('drops a coordinate pair out of range', () => {
    const result = readPlace(JSON.stringify({ lat: 999, lon: -112, label: 'Bad' }));

    expect(result).toEqual({ label: 'Bad' });
  });

  /** A zone picked on its own has no coordinates, and fixed says a missing zone was meant. */
  test('keeps a fixed offset with no zone', () => {
    const result = readPlace(JSON.stringify({ label: 'UTC+05:30', offset: 330, tz: '', fixed: true }));

    expect(result).toEqual({ label: 'UTC+05:30', offset: 330, fixed: true });
  });

  /** Anything that is not a place reads as nothing saved rather than a place with no name. */
  test.each([[''], ['not json'], ['5'], [null], [undefined], [42]])('reads %s as no place', (saved) => {
    const result = readPlace(saved);

    expect(result).toBeNull();
  });
});
