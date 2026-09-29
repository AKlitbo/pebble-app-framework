/**
 * The place a location field saves, read back the one way every part of the phone agrees on.
 *
 * The config page saves JSON holding the coordinates and the label, plus the zone and its minutes
 * ahead of UTC for a time zone field. A time zone field saved before the zone was kept holds
 * "offset,label" instead, and Clay can hand a value back already parsed. The picker on the config
 * page reads the same value in its own copy, since it runs inside Clay's webview and cannot import.
 */

/** A saved place, with each part present only when the saved value held a usable one. */
export interface SavedPlace {
  /** The name the user picked, or empty. */
  label: string;
  /** The coordinates, set together and only when both are in range. */
  lat?: number;
  lon?: number;
  /** How far ahead of UTC the zone was when it was picked, in minutes. */
  offset?: number;
  /** The IANA zone, such as Europe/London. */
  tz?: string;
  /** A plain offset with no zone behind it on purpose. */
  fixed?: boolean;
}

/**
 * Reports whether a coordinate pair is within the valid geographic range.
 *
 * @param lat The latitude to check.
 * @param lon The longitude to check.
 * @return True when both values are numbers within range.
 */
export function validCoord(lat: unknown, lon: unknown): boolean {
  return typeof lat === 'number' && lat >= -90 && lat <= 90 &&
    typeof lon === 'number' && lon >= -180 && lon <= 180;
}

/** The "offset,label" a time zone field held before the zone was kept, or null when it is not one. */
function readOffsetLabel(text: string): SavedPlace | null {
  const comma = text.indexOf(',');
  if (comma <= 0) {
    return null;
  }

  const offset = Number(text.substring(0, comma));
  if (!isFinite(offset)) {
    return null;
  }

  return { label: text.substring(comma + 1), offset: Math.round(offset) };
}

/**
 * Reads a saved place from whatever a location field holds.
 *
 * Nothing in it is trusted. A coordinate pair out of range is dropped rather than sent on to a
 * weather provider, and a value that is not a place at all reads as null.
 *
 * @param saved What the field holds: the place as JSON, the place already parsed, or "offset,label".
 * @return The place, or null when there is nothing usable saved.
 */
export function readPlace(saved: unknown): SavedPlace | null {
  let value = saved;

  if (typeof value === 'string') {
    if (!value) {
      return null;
    }

    try {
      value = JSON.parse(value);
    } catch (error) {
      return readOffsetLabel(value as string);
    }
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const blob = value as Record<string, unknown>;
  const place: SavedPlace = { label: typeof blob.label === 'string' ? blob.label : '' };

  if (validCoord(blob.lat, blob.lon)) {
    place.lat = blob.lat as number;
    place.lon = blob.lon as number;
  }

  const offset = Number(blob.offset);
  if (blob.offset !== undefined && blob.offset !== null && isFinite(offset)) {
    place.offset = Math.round(offset);
  }

  if (typeof blob.tz === 'string' && blob.tz) {
    place.tz = blob.tz;
  }

  if (blob.fixed) {
    place.fixed = true;
  }

  return place;
}

export default { readPlace, validCoord };
