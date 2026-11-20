/**
 * The weekday and date words an event's short labels use, in the wearer's locale where they fit a
 * `shortText`, and in English where they do not.
 *
 * `Intl` gives each locale's own short names and its own order, so en-US writes `Nov 27`, en-GB
 * `27 Nov`, and Japanese `11月27日`. Some names run long, so each is made to fit first. A trailing full
 * stop goes, as in `sept.`, and a Latin or Cyrillic name that is still too long is cut. A weekday is
 * cut to four letters, and a month to whatever room the date's own separators leave beside a
 * two-digit day, so German reads `28. Sep`, but never below three letters. If any of a locale's seven
 * weekdays or twelve months still does not fit, or the cut leaves two the same, the whole locale is
 * named in English, so a label never mixes two languages.
 */

import { intlUsable } from '../pkjs/intl-usable';
import { SHORT_TEXT_MAX } from './short-text';

/** The words a locale names a day with, as a phone-clock `Date` whose UTC fields are the phone's own. */
export interface DayNames {
  /** The short weekday, such as `Thu`. */
  weekday(wall: Date): string;
  /** The day and short month, in the locale's own order, such as `Nov 27` or `27 nov`. */
  date(wall: Date): string;
}

// the English names, and the en-US order they go in
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The English names, for a locale whose own do not fit and for none at all. */
export const ENGLISH_NAMES: DayNames = {
  weekday: (wall) => WEEKDAYS[wall.getUTCDay()],
  date: (wall) => `${MONTHS[wall.getUTCMonth()]} ${wall.getUTCDate()}`,
};

const DAY_MS = 24 * 60 * 60 * 1000;

// a Sunday, the day the weekday names are read from onward. any week would do, since only the names are kept
const FIRST_SUNDAY = Date.UTC(2026, 0, 4);

// the day each month's name is read beside, two digits wide, as wide as a date gets
const WIDEST_DAY = 28;

// the letters a cut is safe on, Latin and Cyrillic, where one code point is one letter. a cut in a
// script such as Devanagari can leave a mark hanging off the last letter, so those names are never cut
const CUTTABLE = /^[A-Za-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u024f\u1e00-\u1eff\u0400-\u052f]+$/;

// the most letters a long Latin or Cyrillic weekday is cut to. a weekday stands alone, so four always
// fits, and keeping four keeps weekdays such as Swahili's, which all start `Juma`, from looking apart
// when they are not
const WEEKDAY_LETTERS = 4;

// the fewest letters a cut leaves. fewer stop reading as a name, so a locale with less room falls back
const FEWEST_LETTERS = 3;

/**
 * A locale tag that asks for the Gregorian calendar, so an engine that ignores the `calendar` option
 * still reads the right month. It joins a `-u-` extension the tag already has, in place of any `ca`
 * keyword there, rather than adding a second one, and goes before a private `-x-` part.
 *
 * @param tag The locale tag, with `-` between its parts.
 * @return The tag with `ca-gregory` in its `-u-` extension.
 */
export function gregorianTag(tag: string): string {
  const subtags = tag.split('-');
  const extension = subtags.findIndex((subtag, index) => index > 0 && subtag.toLowerCase() === 'u');

  if (extension === -1) {
    const privateUse = subtags.findIndex((subtag, index) => index > 0 && subtag.toLowerCase() === 'x');
    const at = privateUse === -1 ? subtags.length : privateUse;

    return [...subtags.slice(0, at), 'u', 'ca', 'gregory', ...subtags.slice(at)].join('-');
  }

  // the extension runs to the next one-letter subtag. its attributes come first, then its keywords,
  // each a two-letter key and the values after it
  const next = subtags.findIndex((subtag, index) => index > extension && subtag.length === 1);
  const end = next === -1 ? subtags.length : next;
  const body = subtags.slice(extension + 1, end);
  const firstKey = body.findIndex((subtag) => subtag.length === 2);
  const attributes = firstKey === -1 ? body : body.slice(0, firstKey);
  const keywords: string[] = [];
  let inCalendar = false;

  (firstKey === -1 ? [] : body.slice(firstKey)).forEach((subtag) => {
    if (subtag.length === 2) {
      inCalendar = subtag.toLowerCase() === 'ca';
    }

    if (!inCalendar) {
      keywords.push(subtag);
    }
  });

  return [...subtags.slice(0, extension), 'u', ...attributes, 'ca', 'gregory', ...keywords, ...subtags.slice(end)].join('-');
}

/**
 * Makes a list of names fit, or null when one cannot. Each loses a trailing full stop, and one whose
 * label still runs past `SHORT_TEXT_MAX` is cut when it is all Latin or Cyrillic, to the most letters
 * that fit, no more than `mostLetters` and no fewer than three. The names must still all differ after
 * the cut, or two days would read the same.
 *
 * @param names The names as `Intl` gives them.
 * @param labelOf The label a name goes out in, which the limit is measured on.
 * @param mostLetters The most letters a cut keeps. Left out, a cut keeps as many as fit.
 * @return The fitted names in the same order, or null when one cannot fit or two end up the same.
 */
export function fitNames(names: string[], labelOf: (name: string, index: number) => string, mostLetters = Infinity): string[] | null {
  const fit: string[] = [];

  for (let index = 0; index < names.length; index++) {
    let name = names[index].trim().replace(/\.$/, '');

    if (labelOf(name, index).length > SHORT_TEXT_MAX && CUTTABLE.test(name)) {
      const letters = Array.from(name);
      let keep = Math.min(mostLetters, letters.length - 1);

      while (keep > FEWEST_LETTERS && labelOf(letters.slice(0, keep).join(''), index).length > SHORT_TEXT_MAX) {
        keep -= 1;
      }

      name = letters.slice(0, Math.max(keep, FEWEST_LETTERS)).join('');
    }

    if (!name || labelOf(name, index).length > SHORT_TEXT_MAX) {
      return null;
    }

    fit.push(name);
  }

  return new Set(fit).size === fit.length ? fit : null;
}

/** A date label from the locale's own parts, with its month swapped for the fitted name and runs of spaces made one. */
function joinParts(parts: Intl.DateTimeFormatPart[], month: string): string {
  return parts
    .map((part) => (part.type === 'month' ? month : part.value))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reads a locale's names off `Intl`, on the Gregorian calendar whatever the locale's own, so a month's
 * name always matches the day beside it. Null where the runtime has no `Intl`, cannot read the locale,
 * or any name cannot be made to fit.
 */
function readDayNames(tag: string): DayNames | null {
  if (!intlUsable()) {
    return null;
  }

  try {
    const locale = gregorianTag(tag);
    const options: Intl.DateTimeFormatOptions = { timeZone: 'UTC', calendar: 'gregory' };
    const weekdayFormat = new Intl.DateTimeFormat(locale, { ...options, weekday: 'short' });
    const dateFormat = new Intl.DateTimeFormat(locale, { ...options, day: 'numeric', month: 'short' });
    const weekdayNames = WEEKDAYS.map((english, index) => weekdayFormat.format(new Date(FIRST_SUNDAY + index * DAY_MS)));
    const weekdays = fitNames(weekdayNames, (name) => name, WEEKDAY_LETTERS);
    const samples = MONTHS.map((english, index) => dateFormat.formatToParts(new Date(Date.UTC(2026, index, WIDEST_DAY))));
    const monthParts = samples.map((parts) => parts.find((part) => part.type === 'month'));
    const months = monthParts.every(Boolean) ? fitNames(monthParts.map((part) => (part as Intl.DateTimeFormatPart).value), (name, index) => joinParts(samples[index], name)) : null;

    if (!weekdays || !months) {
      return null;
    }

    return {
      weekday: (wall) => weekdays[wall.getUTCDay()],
      date: (wall) => {
        const label = joinParts(dateFormat.formatToParts(wall), months[wall.getUTCMonth()]);

        // every month was checked beside a two-digit day, so this holds unless a locale writes some
        // days wider than others. the one date then reads in English rather than run past the limit
        return label.length <= SHORT_TEXT_MAX ? label : ENGLISH_NAMES.date(wall);
      },
    };
  } catch (error) {
    return null;
  }
}

// reading a locale's names builds formatters, which costs far more than a label, so each locale keeps
// what it read, or null for English, under its tag with `_` swapped for `-`
const read: Record<string, DayNames | null> = {};

/**
 * The names the short labels use for a locale, its own or English. The Pebble app can name a locale
 * as `de_DE`, which `Intl` refuses, so the tag is read as `de-DE`.
 *
 * @param locale The locale, such as `fr-FR` or `fr_FR`, or nothing for English.
 * @return The names.
 */
export function dayNamesFor(locale: string | null | undefined): DayNames {
  const tag = String(locale || '')
    .trim()
    .replace(/_/g, '-');

  if (!tag) {
    return ENGLISH_NAMES;
  }

  if (!Object.prototype.hasOwnProperty.call(read, tag)) {
    read[tag] = readDayNames(tag);
  }

  return read[tag] || ENGLISH_NAMES;
}

export default { dayNamesFor, fitNames, gregorianTag, ENGLISH_NAMES };
