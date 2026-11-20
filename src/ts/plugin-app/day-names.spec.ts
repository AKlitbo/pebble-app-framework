/**
 * Specs for the locale tag the short labels read names under, and the cut that fits a name.
 *
 * The labels ask `Intl` for the Gregorian calendar twice, by option and in the tag, since an older
 * engine reads only the tag. A tag that gains a second `-u-` extension is one `Intl` refuses, which
 * sends the wearer's locale to English, so what is worth pinning is how the keyword joins a tag that
 * already has one. The cut's floor of three letters is pinned here too, since no real locale's names
 * reach it without clashing first. The labels themselves are pinned through `eventInstance` in
 * calendar.spec.ts.
 */

import { describe, test, expect } from 'vitest';
import { fitNames, gregorianTag } from './day-names';

describe('gregorianTag', () => {
  /** A tag with no extension gains one, or an older engine reads a Persian phone's months on its own calendar. */
  test.each([
    ['fa-IR', 'fa-IR-u-ca-gregory'],
    ['de-DE-x-work', 'de-DE-u-ca-gregory-x-work'],
  ])('adds the calendar to %s', (tag, expected) => {
    const result = gregorianTag(tag);

    expect(result).toBe(expected);
  });

  /** A second `-u-` extension makes the tag one `Intl` refuses, so the keyword joins the one there. */
  test('joins an extension the tag has', () => {
    const result = gregorianTag('ar-EG-u-nu-latn');

    expect(result).toBe('ar-EG-u-ca-gregory-nu-latn');
  });

  /** A tag asking for another calendar has to read Gregorian months, so its own calendar keyword goes. */
  test('replaces a calendar the tag asks for', () => {
    const result = gregorianTag('es-ES-u-ca-persian-nu-latn');

    expect(result).toBe('es-ES-u-ca-gregory-nu-latn');
  });
});

describe('fitNames', () => {
  /** A month cut to one or two letters stops reading as a month, so a locale with that little room has to go to English. */
  test.each([
    ['one letter', '28 de '],
    ['two letters', '28 d '],
  ])('gives up when the room holds %s', (room, before) => {
    const result = fitNames(['Alpha', 'Bravo'], (name) => `${before}${name}`);

    expect(result).toBeNull();
  });

  /** The cut keeps as many letters as the room holds, so a name that fits at four is not cut to three. */
  test('keeps as many letters as fit', () => {
    const result = fitNames(['Alpha.', 'Bravo'], (name) => `28 ${name}`);

    expect(result).toEqual(['Alph', 'Brav']);
  });
});
