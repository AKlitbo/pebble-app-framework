/**
 * Calendar events, served from a plugin app as the standard `calendar/event` source.
 *
 * This is the reverse of ts/plugin-sources/calendar.ts, which reads a calendar plugin's update into
 * `CalendarEvent`s. Here a plugin app turns its `CalendarEvent`s into instances in the shapes the
 * Pebble app's built-in Calendar plugin serves, so every face that reads the built-in reads a plugin app
 * the same way. Each text goes out as both `shortText` and `longText`, as the built-in sends it, and the
 * start and end carry a time label beside their timestamp.
 *
 * An all-day event goes out the way the built-in sends one on Android, from UTC midnight of its first
 * day to UTC midnight after its last. The framework's reader rounds that to the phone's own midnight.
 * On a phone at UTC+13 or further east UTC midnight is past local noon, so it rounds to the next day,
 * which is a known limit the built-in shares.
 */

import type { CalendarEvent } from '../calendar/ical';
import { phoneOffsetMinutes } from '../pkjs/phone-clock';
import type { PhoneOffset } from '../pkjs/phone-clock';
import type { SourceDeclaration, SourceInstance, SourceProperty } from '../plugin-sources/types';

const DAY_SECONDS = 24 * 60 * 60;

/** The time label the built-in gives an all-day event's start and end. */
const ALL_DAY_LABEL = 'All day';

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

/** A moment's time on the phone's clock, as HH:MM. */
function clockLabel(epochSeconds: number, offsetAt: PhoneOffset): string {
  return new Date((epochSeconds + offsetAt(epochSeconds * 1000) * 60) * 1000).toISOString().slice(11, 16);
}

/**
 * One event as a `calendar/event` instance.
 *
 * @param event The event, with an all-day one on the phone's midnights as the framework's readers give it.
 * @param instanceId The id the instance goes out under, which should stay the same for the same event from run to run.
 * @param offsetAt Reads the phone's offset, normally the phone's own. A spec stands the phone in another zone with it.
 * @return The instance.
 */
export function eventInstance(event: CalendarEvent, instanceId: string, offsetAt: PhoneOffset = phoneOffsetMinutes): SourceInstance {
  // an all-day event is sent on UTC midnights, counted from the phone's own days
  const start = event.allDay ? utcMidnightOf(event.startEpoch, offsetAt) : event.startEpoch;
  const end = event.allDay ? utcMidnightOf(event.endEpoch, offsetAt) : event.endEpoch;
  const properties: Record<string, SourceProperty> = {
    name: textProperty(event.title),
    starts_at: { ...textProperty(event.allDay ? ALL_DAY_LABEL : clockLabel(start, offsetAt)), timestamp: { value: start } },
    ends_at: { shortText: { text: event.allDay ? ALL_DAY_LABEL : clockLabel(end, offsetAt) }, timestamp: { value: end } },
    all_day: { boolean: { value: event.allDay } },
  };

  // the built-in leaves out a blank location, and a face would show one as a row of nothing
  if (event.location.trim()) {
    properties.location = textProperty(event.location);
  }

  if (event.calendar && event.calendar.trim()) {
    properties.calendar = textProperty(event.calendar);
  }

  return { instanceId, properties };
}
