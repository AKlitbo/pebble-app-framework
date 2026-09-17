/**
 * Turns a saved place into the "offset,label" string a timezone field sends the watch.
 *
 * The config page saves the zone the geocoder named, such as Europe/London, alongside the minutes
 * that zone was ahead of UTC on the day the place was picked. Those minutes move twice a year, so
 * the number that goes to the watch is read off the zone every time rather than taken from what
 * was saved. A London picked in January then keeps the right hour once British Summer Time starts.
 */

import wire from './wire';

/** What a location field holds once a place has been picked on the config page. */
interface SavedPlace {
  label?: string;
  offset?: number;
  tz?: string;
}

/**
 * How far ahead of UTC a zone is at a given moment, in minutes.
 *
 * Works it out by asking for the zone's own wall clock and measuring it against UTC, which covers
 * the half-hour and three-quarter-hour zones as well as the whole-hour ones.
 *
 * @param zone An IANA zone name, such as Europe/London.
 * @param nowMs The moment to read the zone at, as epoch milliseconds.
 * @return The offset in minutes, negative west of UTC, or null when the runtime cannot read the zone.
 */
export function offsetMinutes(zone: string, nowMs: number): number | null {
  if (!zone) {
    return null;
  }

  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(nowMs));

    const lookup: Record<string, string> = {};
    parts.forEach((part) => { lookup[part.type] = part.value; });

    // midnight comes back as hour 24 in some engines, so fold it onto the day it belongs to
    const hour = Number(lookup.hour) % 24;
    const wall = Date.UTC(Number(lookup.year), Number(lookup.month) - 1, Number(lookup.day), hour, Number(lookup.minute));
    if (!isFinite(wall)) {
      return null;
    }

    // the zone's clock is read to the minute, so the moment it is measured against is floored to
    // the same minute and what is left over is the offset exactly
    return Math.round((wall - Math.floor(nowMs / 60000) * 60000) / 60000);
  } catch (error) {
    return null;
  }
}

/**
 * The "offset,label" a timezone field sends the watch, with the offset read off the saved zone.
 *
 * A value saved before the zone was kept is passed straight through, since its offset is all there
 * is to go on. The label is flattened to ASCII because the watch header fonts carry no glyph for
 * an accented letter and draw it as a box.
 *
 * @param saved What Clay persisted for the field, normally the place as JSON.
 * @param nowMs The moment to read the zone at, as epoch milliseconds.
 * @return The string for the watch, or an empty string when nothing is saved yet.
 */
export function toWire(saved: unknown, nowMs: number): string {
  if (typeof saved !== 'string' || !saved) {
    return '';
  }

  let place: SavedPlace;
  try {
    place = JSON.parse(saved);
  } catch (error) {
    return saved;
  }

  if (!place || typeof place !== 'object') {
    return saved;
  }

  const live = place.tz ? offsetMinutes(place.tz, nowMs) : null;
  const offset = live === null ? Math.round(Number(place.offset)) || 0 : live;

  return offset + ',' + wire.toAscii(String(place.label || ''));
}

export default { offsetMinutes, toWire };
