/**
 * Pebble app plugin calendar events, turned into the list the iCal reader returns.
 *
 * A calendar plugin serves one instance per event. Its update becomes the same `CalendarEvent` list
 * an iCal feed gives, run through the same window, so the agenda reads the same from either source.
 * The mapping is plain logic that takes "now" as an argument and never reads the clock.
 *
 * All-day events need the most care. The watch reads an all-day time as the phone's local midnight,
 * as the iCal reader sends it. The built-in plugin sends UTC midnight instead, and the two phones
 * disagree on the end. Android ends a one day event at the next UTC midnight, and iOS at the last
 * second of the day in UTC. So every all-day time is rounded to the nearest local midnight, which
 * lands both shapes, and a plugin already sending local midnight, on the right days.
 *
 * The Calendar Source select the calendar page hook adds, and the hook's wording, live here too, so
 * a face built without `PLUGIN_CALENDAR` carries none of them.
 */

import { horizonFor, upcomingWindow } from '../calendar/window';
import type { CalendarEvent } from '../calendar/ical';
import { phoneDayNumber, phoneMidnight, phoneOffsetMinutes } from '../pkjs/phone-clock';
import type { PhoneOffset } from '../pkjs/phone-clock';
import { flag, instancesOf, propertiesOf, text, timestamp } from './shapes';
import { PLUGINS_OFF_TEXT } from './page';
import type { PluginSourceTexts } from './page';
import { createCalendarDriver } from './calendar-driver';
import type { CalendarPlugins, SourceEnvelope, SourceProperty } from './types';
import type { ClayConfigItem } from '../clay/types';

/** The properties the calendar subscription asks for, all the mapping reads. */
export const CALENDAR_PROPERTIES = ['name', 'location', 'starts_at', 'ends_at', 'all_day'];

const HOUR_SECONDS = 60 * 60;
const DAY_SECONDS = 24 * HOUR_SECONDS;

/**
 * Rounds a moment to the nearest of the phone's midnights.
 *
 * The candidates are the midnights starting the phone's day before the moment's, its own, and the
 * one after. Android's UTC midnight, iOS's last second of the day in UTC, and a plugin's local
 * midnight all land on the midnight they mean for a phone from UTC-12 to UTC+12. At either end UTC
 * midnight sits exactly between two local midnights, and the tie goes to the one whose date is the
 * moment's UTC date, which is the day the plugin meant. Further east, as in New Zealand's summer at
 * UTC+13, UTC midnight is 13:00 and rounds to the next day. Nothing in the plugin's data can tell
 * those apart, so the event reads a day late there.
 */
function nearestMidnight(epochSeconds: number, offsetAt: PhoneOffset): number {
  const day = phoneDayNumber(epochSeconds, offsetAt);
  const utcDay = Math.floor(epochSeconds / DAY_SECONDS);
  let nearest = phoneMidnight(day - 1, offsetAt);

  for (const candidateDay of [day, day + 1]) {
    const candidate = phoneMidnight(candidateDay, offsetAt);
    const gap = Math.abs(candidate - epochSeconds);
    const best = Math.abs(nearest - epochSeconds);

    if (gap < best || (gap === best && candidateDay === utcDay)) {
      nearest = candidate;
    }
  }

  return nearest;
}

/**
 * Turns one instance into an event, or null when it has no start to place it by.
 *
 * The title and the location prefer the `longText`, since the plugin guide sizes a `shortText` at
 * about 7 characters and the strip holds 24. A timed event with no end, or one that ends at or
 * before its start, gets an hour, as the iCal reader gives one. An all-day event whose end is
 * missing, or rounds to its start or before, gets one day.
 */
function toEvent(properties: Record<string, SourceProperty | undefined>, offsetAt: PhoneOffset): CalendarEvent | null {
  const start = timestamp(properties.starts_at);

  if (start === undefined) {
    return null;
  }

  const end = timestamp(properties.ends_at);
  const allDay = flag(properties.all_day) === true;
  let startEpoch = start;
  let endEpoch = end !== undefined && end > start ? end : start + HOUR_SECONDS;

  if (allDay) {
    startEpoch = nearestMidnight(start, offsetAt);
    endEpoch = end === undefined ? startEpoch : nearestMidnight(end, offsetAt);

    if (endEpoch <= startEpoch) {
      endEpoch = phoneMidnight(phoneDayNumber(startEpoch, offsetAt) + 1, offsetAt);
    }
  }

  return {
    startEpoch,
    endEpoch,
    allDay,
    title: text(properties.name, 'long') ?? '(no title)',
    location: text(properties.location, 'long') ?? '',
  };
}

/**
 * Turns one calendar plugin update into the events the agenda shows.
 *
 * Every instance with a start becomes an event, and the list then goes through the window the iCal
 * reader uses. That keeps an event until it ends and up to the end of the sixth day ahead, soonest
 * first, whatever order the plugin sent. The window runs after the rounding, which is what drops
 * yesterday's all-day event on a phone east of UTC, where its UTC end is still hours off.
 *
 * @param envelope The update, which may be missing or carry anything.
 * @param nowSeconds The moment to treat as now, as epoch seconds.
 * @param offsetAt Reads the phone's offset from UTC, passed only by a spec that stands the phone in
 *   another zone. The rounding and the window's last day both go by it. Left out, the rounding reads
 *   the phone's clock and the window counts its week exactly as the iCal reader does.
 * @return The events in the window, sorted by start. Empty for an update with none.
 */
export function eventsFromUpdate(envelope: SourceEnvelope | null | undefined, nowSeconds: number, offsetAt?: PhoneOffset): CalendarEvent[] {
  const clock = offsetAt || phoneOffsetMinutes;
  const events: CalendarEvent[] = [];

  for (const instance of instancesOf(envelope)) {
    const properties = propertiesOf(instance);
    const event = properties ? toEvent(properties, clock) : null;

    if (event) {
      events.push(event);
    }
  }

  // a reader passed in counts the week from it, and none leaves the week to the phone's clock
  return upcomingWindow(events, nowSeconds, horizonFor(nowSeconds, offsetAt));
}

/** The value the Calendar Source select saves for the iCal link, the choice every calendar face has. */
export const ICAL_VALUE = 'ical';

/**
 * The Calendar Source select the page hook adds to the section holding the iCal link.
 *
 * A face's own page has no such row, since without plugins it would offer "iCal Link" alone. The
 * page hook adds Preferred Source beside it when a plugin serves the events, and drops the select
 * again when nothing does.
 */
export const CALENDAR_SOURCE_SELECT: ClayConfigItem = {
  type: 'select',
  messageKey: 'CALENDAR_SOURCE',
  label: 'Calendar Source',
  defaultValue: ICAL_VALUE,
  options: [{ label: 'iCal Link', value: ICAL_VALUE }],
  pluginSource: { category: 'calendar', item: 'event' },
};

/**
 * The calendar page hook's rows, which show only while the plugin is picked. On a face whose
 * providers list is the plugin alone they always show, and the one for no plugin joins them.
 */
export const CALENDAR_TEXTS: PluginSourceTexts = {
  notStandard: (pluginName) => `${pluginName} sends events this watchface cannot read. Pick another calendar plugin under Preferred Sources in the Pebble app, or use an iCal link here.`,
  notStandardNoSelect: (pluginName) => `${pluginName} sends events this watchface cannot read. Pick another calendar plugin under Preferred Sources in the Pebble app.`,
  permissionDenied: 'This watchface needs Calendar to read the Pebble app\'s events. Allow it for this watchface in the Pebble app.',
  empty: 'If events are missing, the Pebble app may need permission to read your phone\'s calendars, or those calendars may be switched off in the Pebble app\'s calendar settings.',
  source: 'Your watch shows the events from the calendars on your phone, the ones switched on in the Pebble app\'s calendar settings.',
  noPlugin: PLUGINS_OFF_TEXT,
};

/**
 * Everything the calendar feature reads plugin events with, which plugin-sources/index hands it on a
 * face built with `PLUGIN_CALENDAR`. The calendar plugins serve one instance per event under
 * `calendar/event`.
 */
export const calendarPlugins: CalendarPlugins = {
  driver: createCalendarDriver({ fromUpdate: eventsFromUpdate, properties: CALENDAR_PROPERTIES, texts: CALENDAR_TEXTS, select: CALENDAR_SOURCE_SELECT }),
};

export default { eventsFromUpdate, CALENDAR_PROPERTIES, CALENDAR_TEXTS, CALENDAR_SOURCE_SELECT, ICAL_VALUE };
