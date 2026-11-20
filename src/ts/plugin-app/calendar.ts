/**
 * Calendar events, served from a plugin app as the standard `calendar/event` source.
 *
 * This is the reverse of ts/plugin-sources/calendar.ts, which reads a calendar plugin's update into
 * `CalendarEvent`s. Here a plugin app turns its `CalendarEvent`s into instances in the shapes the
 * Pebble app's built-in Calendar plugin serves, so every face that reads the built-in reads a plugin app
 * the same way. Each text goes out as both `shortText` and `longText`, as the built-in sends it, and the
 * start and end carry a time label beside their timestamp. The labels are the built-in's `HH:MM`
 * unless the caller asks for the short ones, which fit a `shortText` better for an event on another day.
 *
 * An all-day event goes out the way the built-in sends one on Android, from UTC midnight of its first
 * day to UTC midnight after its last. The framework's reader rounds that to the phone's own midnight.
 * On a phone at UTC+13 or further east UTC midnight is past local noon, so it rounds to the next day,
 * which is a known limit the built-in shares.
 */

import type { CalendarEvent } from '../calendar/ical';
import { plainDescription } from '../calendar/description';
import { phoneDayNumber, phoneMidnight, phoneOffsetMinutes } from '../pkjs/phone-clock';
import type { PhoneOffset } from '../pkjs/phone-clock';
import { dayNamesFor } from './day-names';
import type { ClockFormat } from './preferences';
import type { SourceDeclaration, SourceInstance, SourceProperty } from '../plugin-sources/types';

const DAY_SECONDS = 24 * 60 * 60;

/** The time label the built-in gives an all-day event's start and end. */
const ALL_DAY_LABEL = 'All day';

/** How many days past today the short labels name by weekday. A week out is the same weekday as today, so it gets a date. */
const WEEKDAY_DAYS = 6;

/**
 * The short labels, which name the day as well when it is not today, in a way that fits a `shortText`.
 * They count today from the moment given, on the wearer's clock and in their locale.
 */
export interface ShortLabelOptions {
  style: 'short';
  /** The moment to count today from, as epoch seconds. */
  nowSeconds: number;
  /** A 12-hour or a 24-hour clock, as `readPebbleAppPreferences` gives it. Anything but `12h`, in any case, is 24-hour. */
  clock?: ClockFormat | null;
  /**
   * The locale to name weekdays and months in, and to order the date in, such as `fr-FR` or `fr_FR`.
   * Null, left out, or one whose names cannot all be made to fit is English, as `Nov 27`.
   */
  locale?: string | null;
}

/**
 * How `eventInstance` labels an event's start and end. The built-in's style, the default, is the time
 * on the phone's clock as `HH:MM`, whatever the day.
 */
export type EventLabelOptions = { style?: 'builtIn' } | ShortLabelOptions;

/**
 * The `calendar/event` source as a plugin app declares it in its appinfo's plugin block.
 *
 * Its properties are the ones `eventInstance` sends, in the shapes it sends them. It asks `Calendar`
 * of its callers, since the Pebble app refuses a plugin's read of the built-in calendar unless every
 * source the plugin serves does. The refresh matches the built-in's.
 */
export const CALENDAR_EVENT_SOURCE = {
  category: 'calendar',
  items: ['event'],
  properties: {
    name: ['longText', 'shortText'],
    location: ['longText', 'shortText'],
    description: ['longText'],
    starts_at: ['shortText', 'longText', 'timestamp'],
    ends_at: ['shortText', 'timestamp'],
    all_day: ['boolean'],
    calendar: ['longText', 'shortText'],
  },
  supportsMultiple: true,
  callerPermissions: ['Calendar'],
  suggestedRefreshIntervalSec: 300,
} satisfies SourceDeclaration & { supportsMultiple: boolean; callerPermissions: string[]; suggestedRefreshIntervalSec: number };

/** A text in both the shapes the built-in sends it in. */
function textProperty(value: string): SourceProperty {
  return { shortText: { text: value }, longText: { text: value } };
}

/**
 * The UTC midnight of the phone's day nearest a moment. An all-day event's start and end are the
 * phone's midnights, but a day that starts with the clocks going forward has its midnight an hour early,
 * on the evening before, so the nearest day is taken rather than the one the moment falls in.
 */
function utcMidnightOf(epochSeconds: number, offsetAt: PhoneOffset): number {
  return Math.round((epochSeconds + offsetAt(epochSeconds * 1000) * 60) / DAY_SECONDS) * DAY_SECONDS;
}

/** A moment as the phone's clock reads it, in a Date whose UTC fields are the phone's own. */
function phoneWallClock(epochSeconds: number, offsetAt: PhoneOffset): Date {
  return new Date((epochSeconds + offsetAt(epochSeconds * 1000) * 60) * 1000);
}

/** A moment's time on the phone's clock, as HH:MM. */
function clockLabel(epochSeconds: number, offsetAt: PhoneOffset): string {
  return phoneWallClock(epochSeconds, offsetAt).toISOString().slice(11, 16);
}

/**
 * A moment's time on the phone's clock, as `2:30p` on a 12-hour clock or `14:30` on a 24-hour one.
 * Only `12h`, whatever its case, is the 12-hour clock, so a clock the Pebble app names some other way
 * reads like the built-in's.
 */
function timeLabel(epochSeconds: number, offsetAt: PhoneOffset, clock: ClockFormat | null | undefined): string {
  if (String(clock || '').trim().toLowerCase() !== '12h') {
    return clockLabel(epochSeconds, offsetAt);
  }

  const wall = phoneWallClock(epochSeconds, offsetAt);
  const hour = wall.getUTCHours();
  const minutes = String(wall.getUTCMinutes()).padStart(2, '0');

  return `${hour % 12 || 12}:${minutes}${hour < 12 ? 'a' : 'p'}`;
}

/**
 * A moment's short labels, the `shortText` and the `longText`.
 *
 * Today on the phone's clock is the time alone. One to six days ahead is the short weekday, such as
 * `Thu`, and any other day, past days included, is the day and the short month in the locale's own
 * order, such as `Nov 27`. The `longText` adds the time after the day, such as `Thu 14:30`.
 */
function shortLabels(epochSeconds: number, offsetAt: PhoneOffset, options: ShortLabelOptions): { short: string; long: string } {
  const time = timeLabel(epochSeconds, offsetAt, options.clock);
  const ahead = phoneDayNumber(epochSeconds, offsetAt) - phoneDayNumber(options.nowSeconds, offsetAt);

  if (ahead === 0) {
    return { short: time, long: time };
  }

  const wall = phoneWallClock(epochSeconds, offsetAt);
  const names = dayNamesFor(options.locale);
  const named = ahead >= 1 && ahead <= WEEKDAY_DAYS ? names.weekday(wall) : names.date(wall);

  return { short: named, long: `${named} ${time}` };
}

/**
 * Whether an end reads its time alone in the short style, counted from its start's phone day rather
 * than from now. An end on the start's day does, and so does one at the midnight that closes it, which
 * would otherwise name the next day for a meeting that never reaches it.
 */
function endsOnStartDay(start: number, end: number, offsetAt: PhoneOffset): boolean {
  const startDay = phoneDayNumber(start, offsetAt);

  return phoneDayNumber(end, offsetAt) === startDay || end === phoneMidnight(startDay + 1, offsetAt);
}

/**
 * An event's start and end labels in the style asked for. An all-day event's are `All day` in either
 * style. In the short style the start is counted from now and the end from the start's day, so a
 * meeting tomorrow from 14:00 to 15:00 reads `Thu` and `15:00`, and one ending at midnight reads
 * `00:00`. An end on a later day is named by the same rules as a start.
 */
function eventLabels(start: number, end: number, allDay: boolean, offsetAt: PhoneOffset, labels: EventLabelOptions): { start: { short: string; long: string }; end: string } {
  if (allDay) {
    return { start: { short: ALL_DAY_LABEL, long: ALL_DAY_LABEL }, end: ALL_DAY_LABEL };
  }

  if (labels.style === 'short') {
    return {
      start: shortLabels(start, offsetAt, labels),
      end: endsOnStartDay(start, end, offsetAt) ? timeLabel(end, offsetAt, labels.clock) : shortLabels(end, offsetAt, labels).short,
    };
  }

  const time = clockLabel(start, offsetAt);

  return { start: { short: time, long: time }, end: clockLabel(end, offsetAt) };
}

/**
 * One event as a `calendar/event` instance.
 *
 * The notes go out as a `longText` `description`, cleaned as the built-in cleans them, and are left out
 * when there are none.
 *
 * @param event The event, with an all-day one on the phone's midnights as the framework's readers give it.
 * @param instanceId The id the instance goes out under, which should stay the same for the same event from run to run.
 * @param offsetAt Reads the phone's offset, normally the phone's own. A spec stands the phone in another zone with it.
 * @param labels How the start and end are labelled. Left out, they read `HH:MM` as the built-in's do.
 * @return The instance.
 */
export function eventInstance(event: CalendarEvent, instanceId: string, offsetAt: PhoneOffset = phoneOffsetMinutes, labels: EventLabelOptions = {}): SourceInstance {
  // an all-day event is sent on UTC midnights, counted from the phone's own days
  const start = event.allDay ? utcMidnightOf(event.startEpoch, offsetAt) : event.startEpoch;
  const end = event.allDay ? utcMidnightOf(event.endEpoch, offsetAt) : event.endEpoch;
  const labelled = eventLabels(start, end, event.allDay, offsetAt, labels);
  const properties: Record<string, SourceProperty> = {
    name: textProperty(event.title),
    starts_at: { shortText: { text: labelled.start.short }, longText: { text: labelled.start.long }, timestamp: { value: start } },
    ends_at: { shortText: { text: labelled.end }, timestamp: { value: end } },
    all_day: { boolean: { value: event.allDay } },
  };
  const description = plainDescription(event.description);

  // the built-in leaves out a blank location, and a face would show one as a row of nothing
  if (event.location.trim()) {
    properties.location = textProperty(event.location);
  }

  // the built-in leaves out blank notes the same way
  if (description) {
    properties.description = { longText: { text: description } };
  }

  if (event.calendar && event.calendar.trim()) {
    properties.calendar = textProperty(event.calendar);
  }

  return { instanceId, properties };
}
