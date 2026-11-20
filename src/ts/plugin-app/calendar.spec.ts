/**
 * Specs for serving calendar events from a plugin app.
 *
 * A face reads these through the same reader it reads the built-in Calendar plugin with, so what is
 * worth pinning is that an event served here comes back from that reader as the event it was, on the
 * same day east and west of UTC. All-day events carry the risk, since they go out on UTC midnights and
 * come back on the phone's. The plugin block is pinned for the one thing the Pebble app checks it for.
 *
 * Vitest runs every spec on a Toronto phone, on standard time at UTC-5 from 1 November 2026. The usual
 * now is Wednesday 4 November 2026 at 12:00 there. The zones east of UTC are passed in as fixed
 * offsets, since the zone cannot be changed for one test.
 */

import { describe, test, expect } from 'vitest';
import { CALENDAR_EVENT_SOURCE, eventInstance } from './calendar';
import { eventsFromUpdate } from '../plugin-sources/calendar';
import type { CalendarEvent } from '../calendar/ical';

/** Epoch seconds for a moment given in UTC, in 2026. */
function utc(month: number, day: number, hour: number, minute = 0): number {
  return Date.UTC(2026, month - 1, day, hour, minute) / 1000;
}

// Wednesday 4 November 2026, 12:00 in Toronto
const NOW = utc(11, 4, 17);

// Sydney is on daylight time at UTC+11 in November, and New Zealand at UTC+13
const SYDNEY = (): number => 11 * 60;
const NEW_ZEALAND = (): number => 13 * 60;

// Santiago, where the clocks went forward at midnight on Sunday 6 September 2026, from UTC-4 to UTC-3
const SANTIAGO = (epochMs: number): number => (epochMs >= Date.UTC(2026, 8, 6, 4) ? -3 * 60 : -4 * 60);

/** The events a face reads back from one served event, through the framework's plugin calendar reader. */
function readBack(event: CalendarEvent, offsetAt?: () => number): CalendarEvent[] {
  return eventsFromUpdate({ pluginUuid: 'plugin-app', validUntilMs: null, instances: [eventInstance(event, 'one', offsetAt)] }, NOW, offsetAt);
}

describe('eventInstance', () => {
  /** Every field a face shows has to go out in the shape the built-in sends it, or a face reading the built-in misses it. */
  test('serves a timed event the way the built-in does', () => {
    const event: CalendarEvent = { startEpoch: utc(11, 4, 20), endEpoch: utc(11, 4, 20, 30), allDay: false, title: 'Standup', location: 'Room 4', calendar: 'Work' };

    const result = eventInstance(event, 'standup');

    expect(result).toEqual({
      instanceId: 'standup',
      properties: {
        name: { shortText: { text: 'Standup' }, longText: { text: 'Standup' } },
        starts_at: { shortText: { text: '15:00' }, longText: { text: '15:00' }, timestamp: { value: utc(11, 4, 20) } },
        ends_at: { shortText: { text: '15:30' }, timestamp: { value: utc(11, 4, 20, 30) } },
        all_day: { boolean: { value: false } },
        location: { shortText: { text: 'Room 4' }, longText: { text: 'Room 4' } },
        calendar: { shortText: { text: 'Work' }, longText: { text: 'Work' } },
      },
    });
  });

  /** The built-in leaves out a blank location, and a face shows an empty one as a row of nothing. */
  test('leaves out a blank location and a calendar it does not have', () => {
    const event: CalendarEvent = { startEpoch: utc(11, 4, 20), endEpoch: utc(11, 4, 21), allDay: false, title: 'Standup', location: '  ' };

    const result = Object.keys(eventInstance(event, 'standup').properties ?? {});

    expect(result).toEqual(['name', 'starts_at', 'ends_at', 'all_day']);
  });

  /** An all-day event has to go out on UTC midnights as the built-in's does, or a face rounds it onto the wrong day. */
  test('serves an all-day event on the UTC midnights of its days', () => {
    // Friday 6 November in Toronto, local midnight to local midnight
    const event: CalendarEvent = { startEpoch: utc(11, 6, 5), endEpoch: utc(11, 7, 5), allDay: true, title: 'Holiday', location: '' };

    const result = eventInstance(event, 'holiday').properties;

    expect([result?.starts_at?.timestamp?.value, result?.ends_at?.timestamp?.value, result?.starts_at?.shortText?.text]).toEqual([utc(11, 6, 0), utc(11, 7, 0), 'All day']);
  });

  /**
   * A day that starts with the clocks going forward has its midnight an hour early, at 23:00 the evening
   * before, which is where the reader puts the phone's all-day event. Rounding that down served the
   * holiday a day early.
   */
  test('serves an all-day event on its own day when the clocks went forward at midnight', () => {
    // Sunday 6 September in Santiago, whose midnight is 23:00 on the 5th, or 03:00 UTC on the 6th
    const event: CalendarEvent = { startEpoch: Date.UTC(2026, 8, 6, 3) / 1000, endEpoch: Date.UTC(2026, 8, 7, 3) / 1000, allDay: true, title: 'Holiday', location: '' };

    const result = eventInstance(event, 'holiday', SANTIAGO).properties?.starts_at?.timestamp?.value;

    expect(result).toBe(Date.UTC(2026, 8, 6) / 1000);
  });
});

describe('eventInstance descriptions', () => {
  /** A face reading the built-in reads the notes as a `longText`, cleaned the way the built-in cleans them. */
  test('serves the notes as plain text in a longText', () => {
    const event: CalendarEvent = { startEpoch: utc(11, 4, 20), endEpoch: utc(11, 4, 21), allDay: false, title: 'Standup', location: '', description: ' Bring <b>the slides</b> ' };

    const result = eventInstance(event, 'standup').properties?.description;

    expect(result).toEqual({ longText: { text: 'Bring the slides' } });
  });

  /** The built-in leaves out blank notes, and a face would show them as an empty row. */
  test('leaves out blank notes', () => {
    const event: CalendarEvent = { startEpoch: utc(11, 4, 20), endEpoch: utc(11, 4, 21), allDay: false, title: 'Standup', location: '', description: '<br>  ' };

    const result = eventInstance(event, 'standup').properties;

    expect(result).not.toHaveProperty('description');
  });
});

describe('eventInstance short labels', () => {
  /** A timed event from 14:30 to 15:30 in Toronto on the day given in November. */
  function timedOn(month: number, day: number): CalendarEvent {
    return { startEpoch: utc(month, day, 19, 30), endEpoch: utc(month, day, 20, 30), allDay: false, title: 'Review', location: '' };
  }

  /** The start's short and long labels and the end's short label, in the short style as of NOW. */
  function labels(event: CalendarEvent, clock: '12h' | '24h' = '24h', locale?: string, nowSeconds = NOW): Array<string | undefined> {
    const properties = eventInstance(event, 'one', undefined, { style: 'short', nowSeconds, clock, locale }).properties;

    return [properties?.starts_at?.shortText?.text, properties?.starts_at?.longText?.text, properties?.ends_at?.shortText?.text];
  }

  /** An event today is the time alone, which is all a wearer needs to tell it from the next. */
  test('labels an event today with its time', () => {
    const result = labels(timedOn(11, 4));

    expect(result).toEqual(['14:30', '14:30', '15:30']);
  });

  /** A 12-hour wearer reads 2:30p, and a leading zero or a 12 shown as 0 would read wrong. */
  test.each([
    ['midnight', utc(11, 4, 5), '12:00a'],
    ['09:05', utc(11, 4, 14, 5), '9:05a'],
    ['noon', utc(11, 4, 17), '12:00p'],
    ['14:30', utc(11, 4, 19, 30), '2:30p'],
    ['23:59', utc(11, 5, 4, 59), '11:59p'],
  ])('labels %s on a 12-hour clock as %s', (label, start, expected) => {
    const result = labels({ startEpoch: start, endEpoch: start + 60, allDay: false, title: 'Review', location: '' }, '12h')[0];

    expect(result).toBe(expected);
  });

  /** An event later in the week as only its time would read as today's. */
  test('labels an event in the next six days with its weekday', () => {
    const result = labels(timedOn(11, 5));

    expect(result).toEqual(['Thu', 'Thu 14:30', '15:30']);
  });

  /** The long label adds the time on the wearer's own clock. */
  test('puts the 12-hour time after the weekday in the long label', () => {
    const result = labels(timedOn(11, 10), '12h');

    expect(result).toEqual(['Tue', 'Tue 2:30p', '3:30p']);
  });

  /** A week out is the same weekday as today, so a weekday there would read as today's. */
  test('labels an event a week or more out with its day and month', () => {
    const result = [labels(timedOn(11, 11)), labels(timedOn(11, 27))];

    expect(result).toEqual([
      ['Nov 11', 'Nov 11 14:30', '15:30'],
      ['Nov 27', 'Nov 27 14:30', '15:30'],
    ]);
  });

  /** A meeting that started yesterday and runs on would read as next week's if it were named by weekday. */
  test('labels a start on a past day with its day and month', () => {
    const event: CalendarEvent = { startEpoch: utc(11, 3, 19, 30), endEpoch: utc(11, 4, 20, 30), allDay: false, title: 'Offsite', location: '' };

    const result = labels(event);

    expect(result).toEqual(['Nov 3', 'Nov 3 14:30', '15:30']);
  });

  /** An end on its start's day reads its time, so tomorrow's meeting reads `Thu` to `15:00` rather than `Thu` to `Thu`. */
  test('labels an end on its start day with its time', () => {
    const event: CalendarEvent = { startEpoch: utc(11, 5, 19), endEpoch: utc(11, 5, 20), allDay: false, title: 'Review', location: '' };

    const result = labels(event);

    expect(result).toEqual(['Thu', 'Thu 14:00', '15:00']);
  });

  /** A meeting ending at the midnight that closes its day never reaches the next one, so naming that day reads as an extra day. */
  test.each([
    ['24h', '00:00'],
    ['12h', '12:00a'],
  ])('labels an end at midnight with its time on a %s clock', (clock, expected) => {
    // Thursday 5 November 22:00 to Friday 00:00 in Toronto
    const event: CalendarEvent = { startEpoch: utc(11, 6, 3), endEpoch: utc(11, 6, 5), allDay: false, title: 'Late shift', location: '' };

    const result = labels(event, clock as '12h' | '24h')[2];

    expect(result).toBe(expected);
  });

  /** A clock named in capitals is still the wearer's choice, and only a 12-hour one reads `2:30p`. */
  test.each([
    ['12H', '2:30p'],
    ['24H', '14:30'],
  ])('reads a clock of %s', (clock, expected) => {
    const result = labels(timedOn(11, 4), clock as '12h')[0];

    expect(result).toBe(expected);
  });

  /** An end past its start's day names its own day, so a late shift running past midnight ends on the next day's label. */
  test('labels an end on a later day by that day', () => {
    const event: CalendarEvent = { startEpoch: utc(11, 5, 3), endEpoch: utc(11, 5, 6), allDay: false, title: 'Late shift', location: '' };

    const result = labels(event);

    expect(result).toEqual(['22:00', '22:00', 'Thu']);
  });

  /** An event running for days ends on the date once its end is a week out, the same rule as a start. */
  test('labels an end a week out by its date', () => {
    const event: CalendarEvent = { startEpoch: utc(11, 5, 19), endEpoch: utc(11, 12, 20), allDay: false, title: 'Conference', location: '' };

    const result = labels(event);

    expect(result).toEqual(['Thu', 'Thu 14:00', 'Nov 12']);
  });

  /** An all-day event has no time to show, and the built-in's own label is what a face looks for. */
  test('keeps All day for an all-day event', () => {
    const event: CalendarEvent = { startEpoch: utc(11, 6, 5), endEpoch: utc(11, 7, 5), allDay: true, title: 'Holiday', location: '' };

    const result = labels(event);

    expect(result).toEqual(['All day', 'All day', 'All day']);
  });

  /**
   * The clocks go back in Toronto on Sunday 1 November 2026, so that week is an hour longer. A week
   * counted in hours would put Saturday the 7th's last half hour a week out and name it by date.
   */
  test('counts the days on the phone clock across a clock change', () => {
    // Sunday 1 November 00:30 in Toronto, still on summer time at UTC-4
    const now = utc(11, 1, 4, 30);
    // Saturday 7 November 23:30 in Toronto, on standard time at UTC-5, exactly seven days of seconds later
    const event: CalendarEvent = { startEpoch: utc(11, 8, 4, 30), endEpoch: utc(11, 8, 4, 45), allDay: false, title: 'Late film', location: '' };

    const result = labels(event, '24h', undefined, now);

    expect(result).toEqual(['Sat', 'Sat 23:30', '23:45']);
  });

  /** A date in another locale's order reads backwards to its wearer, as `26 Nov` does in the US and `Nov 26` does in Britain. */
  test.each([
    ['en-US', 'Nov 26'],
    ['en-GB', '26 Nov'],
    ['ja', '11月26日'],
    ['ko', '11월 26일'],
  ])('writes the date in the order %s does', (locale, expected) => {
    const result = labels(timedOn(11, 26), '24h', locale)[0];

    expect(result).toBe(expected);
  });

  /** French writes `sept.` and `jeu.`, which run `27 sept.` a character past the limit, so the full stop goes rather than the whole locale. */
  test('drops a trailing full stop to fit', () => {
    const result = [labels(timedOn(11, 5), '24h', 'fr-FR')[0], labels(timedOn(9, 27), '24h', 'fr-FR')[0]];

    expect(result).toEqual(['jeu', '27 sept']);
  });

  /** Canadian French writes July as `juill.`, which still runs past the limit without its full stop, so it is cut to four letters. */
  test('cuts a long Latin name to four letters', () => {
    const result = labels(timedOn(7, 27), '24h', 'fr-CA')[0];

    expect(result).toBe('27 juil');
  });

  /** German writes `28. Sept.`, whose separator leaves room for three letters, and four would send the whole locale to English. */
  test('cuts a German month to the room its separator leaves', () => {
    const result = [labels(timedOn(11, 5), '24h', 'de-DE')[0], labels(timedOn(9, 28), '24h', 'de-DE')[0]];

    expect(result).toEqual(['Do', '28. Sep']);
  });

  /** Hungarian writes the month first as `szept. 28.`, so the cut has to measure the room in the locale's own order. */
  test('cuts a Hungarian month to the room its own order leaves', () => {
    const result = labels(timedOn(9, 28), '24h', 'hu-HU')[0];

    expect(result).toBe('sze 28.');
  });

  /** Brazilian Portuguese writes `28 de set.`, which leaves fewer than three letters for the month, too few to read as one. */
  test('uses English for a locale with room for fewer than three letters', () => {
    const result = labels(timedOn(9, 28), '24h', 'pt-BR')[0];

    expect(result).toBe('Sep 28');
  });

  /** Swahili's weekdays all cut to `Juma`, so a cut locale would name three days the same and the wearer could not tell them apart. */
  test('uses English for a locale whose cut names clash', () => {
    const result = [labels(timedOn(11, 5), '24h', 'sw')[0], labels(timedOn(11, 26), '24h', 'sw')[0]];

    expect(result).toEqual(['Thu', 'Nov 26']);
  });

  /** Hindi's months run long and a cut would leave a mark hanging off the last letter, so the whole locale is named in English. */
  test('uses English for a long name in a script it cannot cut', () => {
    const result = [labels(timedOn(11, 5), '24h', 'hi')[0], labels(timedOn(10, 26), '24h', 'hi')[0]];

    expect(result).toEqual(['Thu', 'Oct 26']);
  });

  /** The Pebble app can name a locale as `fr_FR`, which `Intl` refuses, and the wearer would get English. */
  test('reads a locale tag written with an underscore', () => {
    const result = labels(timedOn(11, 5), '24h', 'fr_FR')[0];

    expect(result).toBe('jeu');
  });

  /**
   * A locale whose own calendar is not the Gregorian one named the month on its own calendar, so a
   * Persian phone read 10 February as 10 Bahman. Persian's own names run too long and go to English,
   * and a Spanish locale asking for the Persian calendar shows the Gregorian month in Spanish.
   */
  test.each([
    ['fa', 'Feb 10'],
    ['es-ES-u-ca-persian', '10 feb'],
  ])('names the Gregorian month in %s', (locale, expected) => {
    const event: CalendarEvent = { startEpoch: Date.UTC(2027, 1, 10, 19) / 1000, endEpoch: Date.UTC(2027, 1, 10, 20) / 1000, allDay: false, title: 'Review', location: '' };

    const result = labels(event, '24h', locale)[0];

    expect(result).toBe(expected);
  });

  /** A locale the runtime cannot read must not throw away the run, so its names fall back to English. */
  test('falls back to English for a locale the runtime cannot read', () => {
    const result = labels(timedOn(11, 5), '24h', 'not a locale!!')[0];

    expect(result).toBe('Thu');
  });

  /**
   * Building a formatter on a runtime with no locale data runs the script out of memory, which no
   * try/catch can stop, so the labels check first and name the days in English. The locale is one no
   * other spec reads, since a locale's names are kept once read.
   */
  test('labels in English with no crash on a runtime with no locale data', () => {
    const real = Intl.DateTimeFormat;
    let built = 0;

    function stub(): never {
      built += 1;
      throw new Error('a formatter was built');
    }

    (stub as unknown as { supportedLocalesOf: unknown }).supportedLocalesOf = () => [];
    (Intl as unknown as { DateTimeFormat: unknown }).DateTimeFormat = stub;

    try {
      const result = [labels(timedOn(11, 5), '24h', 'it-IT'), labels(timedOn(11, 26), '24h', 'it-IT')[0], built];

      expect(result).toEqual([['Thu', 'Thu 14:30', '15:30'], 'Nov 26', 0]);
    } finally {
      (Intl as unknown as { DateTimeFormat: unknown }).DateTimeFormat = real;
    }
  });

  /** The Pebble app warns on a shortText past 7 characters and the tight spots cut it, so a long local name has to give way to English. */
  test.each(['en-US', 'en-GB', 'fr-FR', 'fr-CA', 'de-DE', 'pt-PT', 'ru-RU', 'hu-HU', 'lv-LV', 'tr-TR', 'ar-EG', 'vi-VN', 'th-TH', 'ja', 'ko'])('keeps every short label to seven characters in %s', (locale) => {
    const events = Array.from({ length: 40 }, (unused, day) => ({ startEpoch: NOW + day * 86400, endEpoch: NOW + day * 86400 + 60, allDay: false, title: 'Review', location: '' }));

    const result = events.flatMap((event) => [labels(event, '12h', locale)[0], labels(event, '24h', locale)[2]]).filter((label) => (label ?? '').length > 7);

    expect(result).toEqual([]);
  });

  /** The built-in style is the default, and a face written against the built-in reads HH:MM whatever the day. */
  test('keeps the built-in labels when no style is asked', () => {
    const properties = eventInstance(timedOn(11, 27), 'one').properties;

    const result = [properties?.starts_at?.shortText?.text, properties?.starts_at?.longText?.text, properties?.ends_at?.shortText?.text];

    expect(result).toEqual(['14:30', '14:30', '15:30']);
  });
});

describe('an event served and read back', () => {
  /** West of UTC, the read back has to land on the same evening and the same day as the event served. */
  test.each([
    ['a timed event', { startEpoch: utc(11, 4, 20), endEpoch: utc(11, 4, 21), allDay: false, title: 'Standup', location: '' }],
    ['an all-day event', { startEpoch: utc(11, 6, 5), endEpoch: utc(11, 7, 5), allDay: true, title: 'Holiday', location: '' }],
  ])('comes back unchanged on a Toronto phone for %s', (label, event) => {
    const result = readBack(event);

    expect(result).toEqual([event]);
  });

  /** East of UTC an all-day event's UTC midnight is late morning, which has to round back to the day it started on. */
  test('keeps an all-day event on its own day on a Sydney phone', () => {
    // Friday 6 November in Sydney, local midnight to local midnight
    const event: CalendarEvent = { startEpoch: utc(11, 5, 13), endEpoch: utc(11, 6, 13), allDay: true, title: 'Holiday', location: '' };

    const result = readBack(event, SYDNEY);

    expect(result.map((read) => [read.startEpoch, read.endEpoch])).toEqual([[utc(11, 5, 13), utc(11, 6, 13)]]);
  });

  /**
   * The known limit: at UTC+13 an all-day event's UTC midnight is 13:00 local, which rounds to the next
   * midnight, so the event reads a day late. The built-in's own all-day events do the same there.
   */
  test('reads an all-day event a day late on a New Zealand phone in summer', () => {
    // Friday 6 November in Auckland, local midnight to local midnight
    const event: CalendarEvent = { startEpoch: utc(11, 5, 11), endEpoch: utc(11, 6, 11), allDay: true, title: 'Holiday', location: '' };

    const result = readBack(event, NEW_ZEALAND);

    expect(result.map((read) => read.startEpoch)).toEqual([utc(11, 6, 11)]);
  });
});

describe('CALENDAR_EVENT_SOURCE', () => {
  /** The Pebble app drops any property or shape the plugin block does not declare, so a face would never see it. */
  test('declares every property and shape an event goes out with', () => {
    const event: CalendarEvent = { startEpoch: utc(11, 4, 20), endEpoch: utc(11, 4, 21), allDay: false, title: 'Standup', location: 'Room 4', calendar: 'Work', description: 'Bring the slides' };
    const declared = CALENDAR_EVENT_SOURCE.properties as Record<string, string[]>;

    const result = Object.entries(eventInstance(event, 'standup').properties ?? {}).flatMap(([name, shapes]) => Object.keys(shapes ?? {}).filter((shape) => !(declared[name] ?? []).includes(shape)).map((shape) => `${name}.${shape}`));

    expect(result).toEqual([]);
  });

  /** The Pebble app refuses a plugin's read of the phone's calendars unless every source it serves asks Calendar of its callers. */
  test('asks Calendar of its callers', () => {
    const result = CALENDAR_EVENT_SOURCE.callerPermissions;

    expect(result).toEqual(['Calendar']);
  });
});
