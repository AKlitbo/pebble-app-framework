/**
 * Specs for reading a saved place's UTC offset.
 *
 * The offset a config page saved is only right for the day the place was picked, so what matters
 * here is that the same saved place gives different answers either side of a daylight saving
 * switch. The dates below are fixed moments chosen to sit on each side of one.
 */

import { describe, test, expect } from 'vitest';
import { offsetMinutes, toWire } from './timezone';

// a January and a July moment, so a northern zone is on standard time for one and summer time for
// the other. both are midday UTC, well clear of any switch, which all happen overnight
const WINTER = Date.UTC(2026, 0, 15, 12, 0);
const SUMMER = Date.UTC(2026, 6, 15, 12, 0);

describe('offsetMinutes', () => {
  /** A zone read once and kept is the whole bug. London is UTC in winter and an hour ahead in summer. */
  test('reads London an hour further ahead in summer than in winter', () => {
    expect(offsetMinutes('Europe/London', WINTER)).toBe(0);
    expect(offsetMinutes('Europe/London', SUMMER)).toBe(60);
  });

  /** A zone west of UTC has to come back negative, or the watch shows a clock on the wrong side of the day. */
  test('reads a zone west of UTC as a negative offset', () => {
    const result = offsetMinutes('America/New_York', WINTER);

    expect(result).toBe(-300);
  });

  /** Not every zone lands on a whole hour, and rounding India to one would put its clock half an hour out. */
  test('reads a zone that is not on a whole hour', () => {
    const result = offsetMinutes('Asia/Kolkata', WINTER);

    expect(result).toBe(330);
  });

  /** A zone that keeps one offset all year must not pick up a switch from its neighbours. */
  test('reads a zone with no summer time the same in both halves of the year', () => {
    expect(offsetMinutes('America/Phoenix', WINTER)).toBe(-420);
    expect(offsetMinutes('America/Phoenix', SUMMER)).toBe(-420);
  });

  /** A zone the runtime cannot read must say so rather than throwing out of the settings send. */
  test('returns null for a zone name the runtime does not know', () => {
    const result = offsetMinutes('Nowhere/Atlantis', WINTER);

    expect(result).toBeNull();
  });
});

describe('toWire', () => {
  const berlin = JSON.stringify({ lat: 52.5, lon: 13.4, label: 'Berlin', offset: 60, tz: 'Europe/Berlin' });

  /** The offset saved in January would leave the watch an hour behind all summer. */
  test('reads the offset off the saved zone rather than the saved number', () => {
    const result = toWire(berlin, SUMMER);

    expect(result).toBe('120,Berlin');
  });

  /** A place picked before the zone was kept still has to reach the watch, with the only offset it has. */
  test('passes an older offset,label value straight through', () => {
    const result = toWire('60,Berlin', SUMMER);

    expect(result).toBe('60,Berlin');
  });

  /** A saved place whose zone the runtime cannot read falls back to the number rather than sending nothing. */
  test('falls back to the saved offset when the zone cannot be read', () => {
    const saved = JSON.stringify({ label: 'Berlin', offset: 60, tz: 'Nowhere/Atlantis' });

    const result = toWire(saved, SUMMER);

    expect(result).toBe('60,Berlin');
  });

  /** The watch header fonts have no glyph for an accented letter and draw it as a box. */
  test('flattens an accented place name to ASCII', () => {
    const saved = JSON.stringify({ label: 'Zürich', offset: 60, tz: 'Europe/Zurich' });

    const result = toWire(saved, WINTER);

    expect(result).toBe('60,Zurich');
  });

  /** An empty field must send an empty string, not the word undefined or a stray comma. */
  test.each([[''], [null], [undefined]])('returns an empty string for %s', (saved) => {
    const result = toWire(saved, WINTER);

    expect(result).toBe('');
  });
});
