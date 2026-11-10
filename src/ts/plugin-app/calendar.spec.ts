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
    const event: CalendarEvent = { startEpoch: utc(11, 4, 20), endEpoch: utc(11, 4, 21), allDay: false, title: 'Standup', location: 'Room 4', calendar: 'Work' };
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
