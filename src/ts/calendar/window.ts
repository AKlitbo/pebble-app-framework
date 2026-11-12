/**
 * The window the calendar agenda shows, the week unless a reader asks for another, shared by every
 * reader that fills it.
 *
 * The watch shows today plus the next six days, soonest first. Every reader that hands the watch
 * events runs them through here, so an event lands on the agenda the same way whichever calendar
 * it came from.
 */

import type { CalendarEvent } from './ical';
import { phoneDayNumber, phoneMidnight } from '../pkjs/phone-clock';
import type { PhoneOffset } from '../pkjs/phone-clock';

// one week, so the agenda's two-letter day codes never repeat a weekday (today plus the next six
// days). events past this are dropped. the face's readers keep to it
const LOOKAHEAD_DAYS = 6;

/** How far the window runs, and how its days are counted. */
export interface HorizonOptions {
  /** How many days the window holds, today counted, so `1` is today alone and `7` the week. Anything but a whole number from 1 up is the week, and the most is `MAX_WINDOW_DAYS`. */
  days?: number;
  /** Reads the phone's offset, as the second argument does when it is passed alone. */
  offsetAt?: PhoneOffset;
}

// the most days a window holds. a larger count holds 366, which keeps the date the window ends on a
// real one, and no wearer picks a window longer than this
export const MAX_WINDOW_DAYS = 366;

/**
 * The days past today a window holds. Anything that is not a whole number from 1 up is the week,
 * and a count past `MAX_WINDOW_DAYS` holds that many.
 */
function daysAhead(days: number | undefined): number {
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1) {
    return LOOKAHEAD_DAYS;
  }

  return Math.min(days, MAX_WINDOW_DAYS) - 1;
}

/**
 * The last second of the window the agenda shows, the week unless told otherwise.
 *
 * The window runs to the end of its last day on the phone's clock, the last second before that day's
 * midnight. The week is today and the next six days. With `days` it holds that many days, today
 * counted, so `{ days: 1 }` ends at today's last second. Six days on from now would cut the last day
 * at whatever time the calendar was read, keeping a morning event on it and dropping an evening one.
 * The day is counted on the calendar rather than in hours, so a clock change inside the window still
 * ends it on midnight.
 *
 * @param nowSeconds The moment to treat as now, as epoch seconds.
 * @param options How many days the window holds, and how its days are counted, or the offset reader
 *   alone. The offset reader is passed only by a spec that stands the phone in another zone. The
 *   days are then counted from the offset at each midnight, which ends the window an hour short in a
 *   zone whose clocks change at midnight, such as Chile's. Left out, the days are counted on the
 *   phone's own clock, which is what every reader does on a real phone.
 * @return The window's last second, as epoch seconds.
 */
export function horizonFor(nowSeconds: number, options?: PhoneOffset | HorizonOptions): number {
  const { days, offsetAt } = typeof options === 'function' ? { days: undefined, offsetAt: options } : options || {};
  const ahead = daysAhead(days);

  if (offsetAt) {
    return phoneMidnight(phoneDayNumber(nowSeconds, offsetAt) + ahead + 1, offsetAt) - 1;
  }

  const end = new Date(nowSeconds * 1000);

  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + ahead + 1);

  return Math.floor(end.getTime() / 1000) - 1;
}

/**
 * Keeps the events the agenda shows, soonest first.
 *
 * An event stays while it has not finished and its start is inside the window. Testing against its
 * end means a meeting in progress still counts as current.
 *
 * @param events The events to filter. The list is not changed.
 * @param nowSeconds The moment to treat as now, as epoch seconds.
 * @param horizon The window's last second, as horizonFor gives it for now. A reader that already
 *   worked it out passes the same value, so its walk and this filter stop at the same second.
 * @return A new list of the events in the window, sorted by start.
 */
export function upcomingWindow(events: CalendarEvent[], nowSeconds: number, horizon: number = horizonFor(nowSeconds)): CalendarEvent[] {
  const kept = events.filter((event) => event.endEpoch >= nowSeconds && event.startEpoch <= horizon);

  kept.sort((left, right) => left.startEpoch - right.startEpoch);

  return kept;
}

export default { horizonFor, upcomingWindow };
