// what the page and the plugin's script share, the way a plugin app keeps its defaults in one place
// it reaches the framework's iCal reader, so the page's bundle meets ./icaljs as the script's does
import ical from '../../../../../ts/calendar/ical';
import type { CalendarEvent } from '../../../../../ts/calendar/ical';

export const REFRESH_DEFAULT = '30';

export function readFeed(text: string, now: number): CalendarEvent[] | null {
  return ical.parseIcal(text, now);
}
