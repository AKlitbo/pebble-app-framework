/**
 * Specs for the plugin calendar mapping.
 *
 * A plugin update has to reach the agenda as exactly the events an iCal feed gives. The parts worth
 * pinning are the all-day rounding and the defaults for a missing end. The built-in plugin sends an
 * all-day event at UTC midnight, and iOS ends it on the last second of the day in UTC, so a mapping
 * that reads either shape as it comes puts the event on the wrong day or ends it the moment it
 * starts. The fixtures follow the built-in calendar plugin's shapes.
 *
 * Vitest runs every spec on a Toronto phone, which is on standard time at UTC-5 from 1 November
 * 2026. The usual now is Wednesday 4 November 2026 at 12:00 there. The cases for a phone east of UTC
 * pass the mapping a fixed offset instead, since the zone cannot be changed for one test.
 */

import { describe, test, expect } from 'vitest';
import { eventsFromUpdate } from './calendar';
import type { SourceEnvelope, SourceProperty } from './types';

const HOUR = 60 * 60;

/** Epoch seconds for a moment given in UTC. */
function utc(month: number, day: number, hour: number, minute = 0, second = 0): number {
  return Date.UTC(2026, month - 1, day, hour, minute, second) / 1000;
}

// Wednesday 4 November 2026, 12:00 in Toronto
const NOW = utc(11, 4, 17);

// the phone offsets the zone cases stand in, in minutes as the phone clock reads them. Sydney is
// on daylight time at UTC+11 in November
const SYDNEY = (): number => 11 * 60;
const UTC_PLUS_12 = (): number => 12 * 60;
const UTC_MINUS_12 = (): number => -12 * 60;

interface EventSetup {
  title?: string | null;
  location?: string | null;
  start?: number;
  end?: number;
  allDay?: boolean | null;
}

/** One event as the built-in serves it. A null leaves that property off. */
function event(setup: EventSetup): Record<string, SourceProperty> {
  const properties: Record<string, SourceProperty> = {
    calendar: { shortText: { text: 'Work' } },
  };

  if (setup.title !== null) {
    const title = setup.title ?? 'Standup';

    properties.name = { shortText: { text: title }, longText: { text: title } };
  }

  if (setup.location !== null && setup.location !== undefined) {
    properties.location = { shortText: { text: setup.location }, longText: { text: setup.location } };
  }

  if (setup.start !== undefined) {
    properties.starts_at = { shortText: { text: setup.allDay ? 'All day' : '10:00' }, longText: { text: '10:00' }, timestamp: { value: setup.start } };
  }

  if (setup.end !== undefined) {
    properties.ends_at = { shortText: { text: setup.allDay ? 'All day' : '10:30' }, timestamp: { value: setup.end } };
  }

  if (setup.allDay !== null) {
    properties.all_day = { boolean: { value: Boolean(setup.allDay) } };
  }

  return properties;
}

/** An update from the built-in plugin carrying the given events in the order given. */
function update(...events: Record<string, SourceProperty | undefined>[]): SourceEnvelope {
  return {
    pluginUuid: '00000000-0000-0000-0001-000000000004',
    validUntilMs: null,
    instances: events.map((properties, index) => ({ instanceId: String(index), properties })),
  };
}

describe('eventsFromUpdate', () => {
  /** Every field the strip carries has to come off the event, or the agenda shows the wrong meeting. */
  test('maps a timed event', () => {
    const standup = event({ title: 'Standup', location: 'Room 4', start: utc(11, 4, 20), end: utc(11, 4, 20, 30) });

    const result = eventsFromUpdate(update(standup), NOW);

    expect(result).toEqual([{ startEpoch: utc(11, 4, 20), endEpoch: utc(11, 4, 20, 30), allDay: false, title: 'Standup', location: 'Room 4' }]);
  });

  /** The plugin guide sizes a shortText at about 7 characters, and the strip holds 24, so a title would come out cut. */
  test('takes the title longText over its shortText', () => {
    const review = { ...event({ start: utc(11, 4, 20), end: utc(11, 4, 21) }), name: { shortText: { text: 'Design' }, longText: { text: 'Design review' } } };

    const result = eventsFromUpdate(update(review), NOW);

    expect(result[0].title).toBe('Design review');
  });

  /** A plugin sending only the short title still has its title read. */
  test('falls back to the title shortText', () => {
    const review = { ...event({ start: utc(11, 4, 20), end: utc(11, 4, 21) }), name: { shortText: { text: 'Design' } } };

    const result = eventsFromUpdate(update(review), NOW);

    expect(result[0].title).toBe('Design');
  });

  /** An untitled event has to read as one, the way the iCal reader shows it, rather than as a blank row. */
  test.each([
    ['blank', '  '],
    ['missing', null],
  ])('reads a %s title as (no title)', (label, title) => {
    const untitled = event({ title, start: utc(11, 4, 20), end: utc(11, 4, 21) });

    const result = eventsFromUpdate(update(untitled), NOW);

    expect(result[0].title).toBe('(no title)');
  });

  /** The built-in leaves out a blank location and a plugin may leave out all_day, and neither may break the event. */
  test('reads a missing location as empty and a missing all-day flag as timed', () => {
    const bare = event({ location: null, allDay: null, start: utc(11, 4, 20), end: utc(11, 4, 21) });

    const result = eventsFromUpdate(update(bare), NOW);

    expect(result[0]).toMatchObject({ location: '', allDay: false });
  });

  /** The panels shade a block for each event, so an event with no length gets the hour the iCal reader gives it. */
  test.each([
    ['ends at its start', utc(11, 4, 20)],
    ['ends before its start', utc(11, 4, 19)],
    ['has no end', undefined],
  ])('gives a timed event an hour when it %s', (label, end) => {
    const point = event({ start: utc(11, 4, 20), end });

    const result = eventsFromUpdate(update(point), NOW);

    expect(result[0].endEpoch).toBe(utc(11, 4, 21));
  });

  /**
   * Android's shape for Thursday runs from UTC midnight to UTC midnight, which is 19:00 to 19:00 in
   * Toronto. It has to land on Thursday's local midnights, or it would show on Wednesday evening.
   */
  test('moves an Android all-day event to the local midnights', () => {
    const holiday = event({ allDay: true, start: utc(11, 5, 0), end: utc(11, 6, 0) });

    const result = eventsFromUpdate(update(holiday), NOW);

    expect(result[0]).toMatchObject({ startEpoch: utc(11, 5, 5), endEpoch: utc(11, 6, 5), allDay: true });
  });

  /**
   * iOS ends Thursday's all-day event at 23:59:59 UTC, which is 18:59:59 in Toronto. Reading its UTC
   * date would end it the moment it began, and every all-day event from an iPhone would vanish on
   * its own day. At 22:00 on Thursday it has to still be on the agenda.
   */
  test('ends an iOS all-day event on the next local midnight and keeps it through its day', () => {
    const holiday = event({ allDay: true, start: utc(11, 5, 0), end: utc(11, 5, 23, 59, 59) });

    const result = eventsFromUpdate(update(holiday), utc(11, 6, 3));

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ startEpoch: utc(11, 5, 5), endEpoch: utc(11, 6, 5) });
  });

  /** A plugin that already sends the phone's midnights keeps them. */
  test('keeps an all-day event already on the local midnights', () => {
    const holiday = event({ allDay: true, start: utc(11, 5, 5), end: utc(11, 6, 5) });

    const result = eventsFromUpdate(update(holiday), NOW);

    expect(result[0]).toMatchObject({ startEpoch: utc(11, 5, 5), endEpoch: utc(11, 6, 5) });
  });

  /**
   * Toronto's clocks went back on Sunday 1 November, so that day ran 25 hours, from 04:00 UTC to
   * 05:00 UTC the next day. Adding 24 hours to the start would end the event an hour early.
   */
  test('ends an all-day event across a clock change on the right midnight', () => {
    const sunday = event({ allDay: true, start: utc(11, 1, 0), end: utc(11, 2, 0) });

    const result = eventsFromUpdate(update(sunday), utc(11, 1, 17));

    expect(result[0]).toMatchObject({ startEpoch: utc(11, 1, 4), endEpoch: utc(11, 2, 5) });
  });

  /** An all-day event with no length would end the moment it began and never show, so it gets its one day. The day is the 25 hour Sunday. */
  test.each([
    ['ends where it starts', utc(11, 1, 0)],
    ['has no end', undefined],
  ])('gives an all-day event that %s one day', (label, end) => {
    const sunday = event({ allDay: true, start: utc(11, 1, 0), end });

    const result = eventsFromUpdate(update(sunday), utc(11, 1, 17));

    expect(result[0]).toMatchObject({ startEpoch: utc(11, 1, 4), endEpoch: utc(11, 2, 5) });
  });

  /** Another plugin may not sort, and the strip shows the first six it is handed. */
  test('sorts the events by start', () => {
    const later = event({ title: 'Later', start: utc(11, 5, 15), end: utc(11, 5, 16) });
    const sooner = event({ title: 'Sooner', start: utc(11, 4, 20), end: utc(11, 4, 21) });

    const result = eventsFromUpdate(update(later, sooner), NOW);

    expect(result.map((item) => item.title)).toEqual(['Sooner', 'Later']);
  });

  /** The agenda shows today and the next six days, the same week the iCal reader keeps. Tuesday 10 November is the last. */
  test('leaves out an event past the end of the sixth day ahead', () => {
    const lastDay = event({ title: 'Tuesday', start: utc(11, 11, 4), end: utc(11, 11, 4, 30) });
    const pastIt = event({ title: 'Wednesday', start: utc(11, 11, 5), end: utc(11, 11, 6) });

    const result = eventsFromUpdate(update(lastDay, pastIt), NOW);

    expect(result.map((item) => item.title)).toEqual(['Tuesday']);
  });

  /** A finished meeting has to come off the agenda, while one in progress stays. */
  test('keeps an event in progress and leaves out one that has ended', () => {
    const ended = event({ title: 'Ended', start: utc(11, 4, 15), end: utc(11, 4, 16) });
    const running = event({ title: 'Running', start: utc(11, 4, 16), end: utc(11, 4, 18) });

    const result = eventsFromUpdate(update(ended, running), NOW);

    expect(result.map((item) => item.title)).toEqual(['Running']);
  });

  /** An event with no start cannot be placed, so it is left out rather than shown at 1970. */
  test('leaves out an event with no start', () => {
    const unplaced = event({ end: utc(11, 4, 21) });

    const result = eventsFromUpdate(update(unplaced), NOW);

    expect(result).toEqual([]);
  });

  /** An empty update is how the watch hears every event was deleted, so it has to give an empty list rather than throw. */
  test.each([
    ['no events', update()],
    ['a list with junk in it', { instances: [null, 'event', { properties: null }] }],
    ['no update at all', null],
  ])('gives an empty list for %s', (label, envelope) => {
    const result = eventsFromUpdate(envelope as SourceEnvelope | null, NOW);

    expect(result).toEqual([]);
  });
});

describe('eventsFromUpdate on a phone east of UTC', () => {
  // Thursday 5 November 2026, 09:00 in Sydney
  const SYDNEY_MORNING = utc(11, 4, 22);

  /**
   * Thursday from UTC midnight is 11:00 Thursday to 11:00 Friday in Sydney. It has to land on
   * Thursday's local midnights, both 13:00 UTC, whether it came from Android or from iOS.
   */
  test.each([
    ['Android', utc(11, 6, 0)],
    ['iOS', utc(11, 5, 23, 59, 59)],
  ])('moves an all-day event in the %s shape to the local midnights', (label, end) => {
    const holiday = event({ allDay: true, start: utc(11, 5, 0), end });

    const result = eventsFromUpdate(update(holiday), SYDNEY_MORNING, SYDNEY);

    expect(result[0]).toMatchObject({ startEpoch: utc(11, 4, 13), endEpoch: utc(11, 5, 13) });
  });

  /** Sydney's Thursday midnight is 13:00 UTC on Wednesday, so a reader going by the UTC date would show the event a day early. */
  test('keeps an all-day event already on the local midnights on its own day', () => {
    const holiday = event({ allDay: true, start: utc(11, 4, 13), end: utc(11, 5, 13) });

    const result = eventsFromUpdate(update(holiday), SYDNEY_MORNING, SYDNEY);

    expect(result[0]).toMatchObject({ startEpoch: utc(11, 4, 13), endEpoch: utc(11, 5, 13) });
  });

  /**
   * Wednesday's all-day event ends at UTC midnight, which is 11:00 Thursday in Sydney, so the plugin
   * still sends it on Thursday morning. Once it is rounded it ended at Sydney's midnight, and the
   * window takes it off.
   */
  test("leaves out yesterday's all-day event once it is rounded", () => {
    const yesterday = event({ allDay: true, start: utc(11, 4, 0), end: utc(11, 5, 0) });

    const result = eventsFromUpdate(update(yesterday), SYDNEY_MORNING, SYDNEY);

    expect(result).toEqual([]);
  });

  /**
   * The agenda's last day is Sydney's sixth day ahead, Wednesday 11 November, which ends at 13:00
   * UTC. Counting the week on Toronto's clock would end it eight hours early and drop that evening.
   */
  test('ends the window on the last midnight of the phone week', () => {
    const lastEvening = event({ title: 'Wednesday', start: utc(11, 11, 12), end: utc(11, 11, 12, 30) });
    const pastIt = event({ title: 'Thursday', start: utc(11, 11, 13), end: utc(11, 11, 14) });

    const result = eventsFromUpdate(update(lastEvening, pastIt), SYDNEY_MORNING, SYDNEY);

    expect(result.map((item) => item.title)).toEqual(['Wednesday']);
  });
});

describe('eventsFromUpdate twelve hours from UTC', () => {
  // Wednesday 4 November 2026, 22:00 UTC
  const EVENING = utc(11, 4, 22);

  /**
   * At UTC+12 Thursday's UTC midnight is noon Thursday, the same distance from both of Thursday's
   * local midnights. The tie has to go to Thursday's own, or every all-day event reads a day late.
   * Both its midnights are 12:00 UTC the day before.
   */
  test.each([
    ['Android', utc(11, 6, 0)],
    ['iOS', utc(11, 5, 23, 59, 59)],
  ])('keeps a %s all-day event on its day at UTC+12', (label, end) => {
    const holiday = event({ allDay: true, start: utc(11, 5, 0), end });

    const result = eventsFromUpdate(update(holiday), EVENING, UTC_PLUS_12);

    expect(result[0]).toMatchObject({ startEpoch: utc(11, 4, 12), endEpoch: utc(11, 5, 12) });
  });

  /**
   * At UTC-12 Thursday's UTC midnight is noon Wednesday, so the tie is the other way round and has
   * to go to the later midnight. Thursday's local midnights are 12:00 UTC on the day itself.
   */
  test.each([
    ['Android', utc(11, 6, 0)],
    ['iOS', utc(11, 5, 23, 59, 59)],
  ])('keeps a %s all-day event on its day at UTC-12', (label, end) => {
    const holiday = event({ allDay: true, start: utc(11, 5, 0), end });

    const result = eventsFromUpdate(update(holiday), EVENING, UTC_MINUS_12);

    expect(result[0]).toMatchObject({ startEpoch: utc(11, 5, 12), endEpoch: utc(11, 6, 12) });
  });

  /** A plugin that already sends the local midnight sits on one, so no tie moves it at either end. */
  test.each([
    ['UTC+12', UTC_PLUS_12, utc(11, 4, 12)],
    ['UTC-12', UTC_MINUS_12, utc(11, 5, 12)],
  ])('keeps a local-midnight start where it is at %s', (label, offsetAt, start) => {
    const holiday = event({ allDay: true, start, end: start + 24 * HOUR });

    const result = eventsFromUpdate(update(holiday), EVENING, offsetAt);

    expect(result[0]).toMatchObject({ startEpoch: start, endEpoch: start + 24 * HOUR });
  });
});
