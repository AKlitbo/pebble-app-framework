/**
 * Wire packing for the AppMessage strips.
 *
 * Turns the parsed weather forecast, stock, and calendar structures into the
 * byte layouts the watch decodes. The field order and widths here are a contract
 * with the C side: change one and the matching decoder has to change too.
 */

import type { HourlyStrip, DailyStrip } from '../weather/util';
import type { StockQuote } from '../stock/util';
import type { CalendarEvent } from '../calendar/ical';

/**
 * Every cap and marker value the two sides of a strip have to agree on.
 *
 * The watch reads these back out of `c/core/wire/wire_caps.g.h`, which `npm run build:conditions`
 * writes from this table. They are the numbers a decode is bounds-checked against, so a pair that
 * drifted would truncate a strip or refuse a whole message with nothing to show for it.
 *
 * A text cap here counts characters. The C side gets that plus one, because its buffer has to hold
 * a terminator as well.
 */
export const WIRE_CAPS = {
  /** How many columns a forecast strip can carry. The watch re-clamps the count anyway, so slicing
   *  here just keeps the count byte honest and the packer in step with the other two. */
  FORECAST_MAX_COLS: 8,
  /** How many tickers the watchlist strip can carry. */
  STOCK_MAX_SLOTS: 4,
  /** How wide a watchlist label is, in characters. */
  STOCK_LABEL_MAX: 11,
  /** How many events the agenda strip can carry. */
  CALENDAR_MAX_SLOTS: 6,
  /** How long an event title can be, in characters. */
  CALENDAR_TITLE_MAX: 24,
  /** How long an event location can be, in characters. */
  CALENDAR_LOC_MAX: 16,
  /** A forecast column with no reading ships this marker so the watch draws a placeholder. */
  FORECAST_NO_TEMP: -1000,
} as const;

const FORECAST_MAX_COLS = WIRE_CAPS.FORECAST_MAX_COLS;
const STOCK_MAX_SLOTS = WIRE_CAPS.STOCK_MAX_SLOTS;
const CALENDAR_MAX_SLOTS = WIRE_CAPS.CALENDAR_MAX_SLOTS;
const CALENDAR_TITLE_MAX = WIRE_CAPS.CALENDAR_TITLE_MAX;
const CALENDAR_LOC_MAX = WIRE_CAPS.CALENDAR_LOC_MAX;
const STOCK_LABEL_MAX = WIRE_CAPS.STOCK_LABEL_MAX;
const FORECAST_NO_TEMP = WIRE_CAPS.FORECAST_NO_TEMP;

/**
 * Clamps a number to the signed range of a little-endian field, rounded first.
 * A price or percent that overflows its field would wrap to a wild wrong value.
 */
function clampInt(value: number, bits: number): number {
  const limit = Math.pow(2, bits - 1);
  let rounded = Math.round(Number(value) || 0);
  if (rounded > limit - 1) {
    rounded = limit - 1;
  }
  if (rounded < -limit) {
    rounded = -limit;
  }
  return rounded;
}

/**
 * Encodes a signed value as two little-endian bytes. A missing reading rides as
 * the FORECAST_NO_TEMP marker so the watch draws a placeholder. The reading is clamped
 * because a provider handing back something wild would otherwise wrap to a plausible
 * looking wrong temperature rather than saturate.
 */
function int16Bytes(value: number | null | undefined): number[] {
  const reading = (value === null || value === undefined) ? FORECAST_NO_TEMP : clampInt(value, 16);
  const wrapped = reading < 0 ? reading + 0x10000 : reading;
  return [wrapped & 0xff, (wrapped >> 8) & 0xff];
}

/**
 * Flattens text to printable ASCII, which is all the watch fonts carry a glyph for.
 *
 * NFD splits a letter from its accent, so dropping the accent leaves the plain letter behind and
 * Reunion spelled with one goes over as Reunion. Anything else ASCII has no room for becomes a
 * question mark.
 *
 * The split can hand back more characters than it was given, as it does for Hangul, so the result
 * is measured against the field it is going into. Measuring it against the length it started with
 * would cut the tail off anything mixing those letters with ASCII, leaving a meeting called
 * "<Hangul> Standup" as "??? Stand".
 *
 * @param text The text to flatten.
 * @param max How many characters the field on the watch holds. Left out, the result runs on.
 * @return The flattened text, no longer than max.
 */
function toAscii(text: string, max?: number): string {
  const limit = max === undefined ? Infinity : max;
  const split = text.normalize('NFD');
  let out = '';

  for (let i = 0; i < split.length && out.length < limit; i++) {
    const code = split.charCodeAt(i);
    if (code >= 0x0300 && code <= 0x036f) {
      continue; // an accent on its own, and the letter it sat on is already in hand
    }

    out += (code >= 0x20 && code <= 0x7e) ? split.charAt(i) : '?';
  }

  return out;
}

/**
 * Pushes a length byte then the text as 7-bit ASCII, which is how every string field on the
 * wire is laid out.
 *
 * @param bytes The strip being built.
 * @param text The text for the field, at whatever length it arrives.
 * @param max How many characters the field on the watch holds.
 */
function pushAscii(bytes: number[], text: string, max: number): void {
  const ascii = toAscii(text, max);
  bytes.push(ascii.length);
  for (let i = 0; i < ascii.length; i++) {
    bytes.push(ascii.charCodeAt(i));
  }
}

/**
 * Encodes a signed integer as little-endian bytes. Uses division rather than bit
 * shifts so a 32-bit value does not trip JS's signed shift operators.
 */
function leBytes(value: number, byteCount: number): number[] {
  let wrapped = value < 0 ? value + Math.pow(2, byteCount * 8) : value;
  const out = [];
  for (let i = 0; i < byteCount; i++) {
    out.push(wrapped % 256);
    wrapped = Math.floor(wrapped / 256);
  }
  return out;
}

/**
 * Packs the hourly forecast strip into the wire bytes the watch decodes.
 * Layout: [count][baseHour][stepHours] then per column [code][tempLow][tempHigh].
 *
 * @param hourly The parsed hourly forecast, or null or undefined when there is none.
 * @return The packed wire bytes, or null when there is nothing to pack.
 */
function packForecastHourly(hourly: HourlyStrip | null | undefined): number[] | null {
  if (!hourly || !hourly.cols || !hourly.cols.length) {
    return null;
  }

  const cols = hourly.cols.slice(0, FORECAST_MAX_COLS);
  const bytes = [cols.length, hourly.baseHour & 0xff, hourly.stepHours & 0xff];
  cols.forEach((col) => {
    bytes.push(col.code & 0xff, ...int16Bytes(col.temp));
  });
  return bytes;
}

/**
 * Packs the 7-day forecast strip into the wire bytes the watch decodes.
 * Layout: [count][baseWeekday] then per column [code][maxLow][maxHigh][minLow][minHigh].
 *
 * @param daily The parsed daily forecast, or null or undefined when there is none.
 * @return The packed wire bytes, or null when there is nothing to pack.
 */
function packForecastDaily(daily: DailyStrip | null | undefined): number[] | null {
  if (!daily || !daily.cols || !daily.cols.length) {
    return null;
  }

  const cols = daily.cols.slice(0, FORECAST_MAX_COLS);
  const bytes = [cols.length, daily.baseWeekday & 0xff];
  cols.forEach((col) => {
    bytes.push(col.code & 0xff, ...int16Bytes(col.tempMax), ...int16Bytes(col.tempMin));
  });
  return bytes;
}

/**
 * Packs the watchlist quotes into the wire bytes the watch decodes.
 * Layout: [count] then per slot [ok][price int32 LE cents][pct int16 LE
 * hundredths][symLen][sym bytes]. A failed slot carries its short status text.
 *
 * An empty list packs to a zero count, which is how the watch learns its watchlist was cleared.
 *
 * @param results The quotes to pack, in slot order, or null when there is no list at all.
 * @return The packed wire bytes, or null when there is no list at all.
 */
function packStockStrip(results: Array<Pick<StockQuote, 'ok' | 'price' | 'changePercent' | 'symbol' | 'status'>> | null): number[] | null {
  if (!results) {
    return null;
  }

  const slots = results.slice(0, STOCK_MAX_SLOTS);
  const bytes = [slots.length];

  // the loop walks every index so an array hole still packs as a failed slot. a skipped slot
  // would leave the count byte above the number of records behind it and the watch bails out of
  // the whole strip and keeps its stale one
  for (let slot = 0; slot < slots.length; slot++) {
    const result = slots[slot];
    const ok = result && result.ok ? 1 : 0;
    // clampInt already rounds so pass the raw scaled value straight through
    const priceCents = clampInt((result && result.price || 0) * 100, 32);
    const pctHundredths = clampInt((result && result.changePercent || 0) * 100, 16);
    // a good slot carries its ticker while a failed one carries its status text so the
    // watch has something to show. cap to what the store's symbol buffer holds
    const label = String((result && (result.ok ? result.symbol : result.status)) || '').toUpperCase();

    bytes.push(ok);
    bytes.push(...leBytes(priceCents, 4));
    bytes.push(...leBytes(pctHundredths, 2));
    pushAscii(bytes, label, STOCK_LABEL_MAX);
  }

  return bytes;
}

/**
 * Packs upcoming calendar events into the wire bytes the watch decodes.
 * Layout: [count] then per event [startEpoch int32 LE][endEpoch int32 LE][flags bit0=allDay]
 * [titleLen][title bytes][locLen][loc bytes]. Absolute epochs so the watch keeps it fresh.
 *
 * An empty list packs to a zero count, which is how the watch learns its agenda was cleared.
 *
 * @param events The upcoming events to pack, in slot order, or null when there is no list at all.
 * @return The packed wire bytes, or null when there is no list at all.
 */
function packCalendarStrip(events: CalendarEvent[] | null): number[] | null {
  if (!events) {
    return null;
  }

  const slots = events.slice(0, CALENDAR_MAX_SLOTS);
  const bytes = [slots.length];

  slots.forEach((event) => {
    const title = String(event.title || '');
    const location = String(event.location || '');

    // clamp both epochs into the int32 the watch reads them back as. a feed can carry an
    // open-ended DTEND far past 2038, and the low four bytes of that land back in 1969, which
    // puts the end before the start and every duration it feeds goes negative
    bytes.push(...leBytes(clampInt(event.startEpoch, 32), 4));
    bytes.push(...leBytes(clampInt(event.endEpoch, 32), 4));
    bytes.push(event.allDay ? 1 : 0);

    pushAscii(bytes, title, CALENDAR_TITLE_MAX);
    pushAscii(bytes, location, CALENDAR_LOC_MAX);
  });

  return bytes;
}

/**
 * True when two packed strips are byte-for-byte identical, so a redundant push
 * to the watch can be skipped. Two nulls count as equal.
 *
 * @param left One packed strip, or null.
 * @param right The other packed strip, or null.
 * @return True when the two are the same length and hold the same bytes.
 */
function bytesEqual(left: number[] | null, right: number[] | null): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

export default { packForecastHourly, packForecastDaily, packStockStrip, packCalendarStrip, bytesEqual, toAscii, STOCK_MAX_SLOTS };
