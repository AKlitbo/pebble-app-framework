/**
 * The week the calendar agenda shows, shared by every reader that fills it.
 *
 * The watch shows today plus the next six days, soonest first. Every reader that hands the watch
 * events runs them through here, so an event lands on the agenda the same way whichever calendar
 * it came from.
 */

import type { CalendarEvent } from './ical';
import { phoneDayNumber, phoneMidnight } from '../pkjs/phone-clock';
import type { PhoneOffset } from '../pkjs/phone-clock';

// one week, so the agenda's two-letter day codes never repeat a weekday (today plus the next six
// days). events past this are dropped
const LOOKAHEAD_DAYS = 6;

/**
 * The last second of the week the agenda shows.
 *
 * The window runs to the end of the sixth day ahead on the phone's clock, the last second before
 * that day's midnight. Six days on from now would cut the last day at whatever time the calendar
 * was read, keeping a morning event on it and dropping an evening one. The day is counted on the
 * calendar rather than in hours, so a clock change inside the week still ends it on midnight.
 *
 * @param nowSeconds The moment to treat as now, as epoch seconds.
 * @param offsetAt Reads the phone's offset, passed only by a spec that stands the phone in another
 *   zone. The days are then counted from the offset at each midnight, which ends the week an hour
 *   short in a zone whose clocks change at midnight, such as Chile's. Left out, the days are counted
 *   on the phone's own clock, which is what every reader does on a real phone.
 * @return The window's last second, as epoch seconds.
 */
export function horizonFor(nowSeconds: number, offsetAt?: PhoneOffset): number {
  if (offsetAt) {
    return phoneMidnight(phoneDayNumber(nowSeconds, offsetAt) + LOOKAHEAD_DAYS + 1, offsetAt) - 1;
  }

  const end = new Date(nowSeconds * 1000);

  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + LOOKAHEAD_DAYS + 1);

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
