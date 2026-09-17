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

/** A zone's wall clock at one moment, broken into the pieces every caller here wants. */
export interface ZoneParts {
  year: number;
  month: number;   // 1 to 12, as people write it rather than as Date numbers it
  day: number;
  hour: number;
  minute: number;
  date: string;    // the calendar day as "YYYY-MM-DD"
}

// building a formatter resolves locale and zone data, which costs far more than formatting with
// one, so each zone keeps the formatter it already built
const formatters: Record<string, Intl.DateTimeFormat> = {};

/** The formatter for a zone, built once and kept. Throws for a zone the runtime cannot read. */
function formatterFor(zone: string): Intl.DateTimeFormat {
  if (!formatters[zone]) {
    formatters[zone] = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  return formatters[zone];
}

/**
 * What a zone's own clock reads at a given moment.
 *
 * One formatter carries both the clock and the calendar day so the two can never disagree across a
 * zone boundary, and en-CA is what gives the date its YYYY-MM-DD shape.
 *
 * @param zone An IANA zone name, such as Europe/London.
 * @param nowMs The moment to read the zone at, as epoch milliseconds.
 * @return The zone's wall clock, or null when the runtime cannot read that zone.
 */
export function zoneParts(zone: string, nowMs: number): ZoneParts | null {
  if (!zone) {
    return null;
  }

  try {
    const parts = formatterFor(zone).formatToParts(new Date(nowMs));

    const lookup: Record<string, string> = {};
    parts.forEach((part) => { lookup[part.type] = part.value; });

    const year = Number(lookup.year);
    const month = Number(lookup.month);
    const day = Number(lookup.day);
    if (!isFinite(year) || !isFinite(month) || !isFinite(day)) {
      return null;
    }

    return {
      year: year,
      month: month,
      day: day,
      // midnight comes back as hour 24 in some engines, so fold it onto the day it belongs to
      hour: Number(lookup.hour) % 24,
      minute: Number(lookup.minute),
      date: `${lookup.year}-${lookup.month}-${lookup.day}`,
    };
  } catch (error) {
    return null;
  }
}

/**
 * How far ahead of UTC a zone is at a given moment, in minutes.
 *
 * Measures the zone's own wall clock against UTC, which covers the half-hour and
 * three-quarter-hour zones as well as the whole-hour ones.
 *
 * @param zone An IANA zone name, such as Europe/London.
 * @param nowMs The moment to read the zone at, as epoch milliseconds.
 * @return The offset in minutes, negative west of UTC, or null when the runtime cannot read the zone.
 */
export function offsetMinutes(zone: string, nowMs: number): number | null {
  const parts = zoneParts(zone, nowMs);
  if (!parts) {
    return null;
  }

  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  if (!isFinite(wall)) {
    return null;
  }

  // the zone's clock is read to the minute, so the moment it is measured against is floored to
  // the same minute and what is left over is the offset exactly
  return Math.round((wall - Math.floor(nowMs / 60000) * 60000) / 60000);
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

export default { zoneParts, offsetMinutes, toWire };
