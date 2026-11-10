/**
 * The phone's clock, for the readers that match times against the phone's day.
 *
 * The watch keeps the phone's clock, so a weather day or a calendar day has to be the phone's. The
 * readers go through here rather than straight to Date, so a spec can stand the phone in another
 * zone by passing its own offset reader, or by spying on this one, whatever machine it runs on.
 */

/**
 * How far ahead of UTC the phone's clock is at a moment, in minutes.
 *
 * @param epochMs The moment, as epoch milliseconds.
 * @return The offset in minutes, negative west of UTC.
 */
export type PhoneOffset = (epochMs: number) => number;

const DAY_SECONDS = 24 * 60 * 60;

/**
 * How far ahead of UTC the phone's clock is at a moment, in minutes.
 *
 * @param epochMs The moment to read the phone's offset at.
 * @return The offset in minutes, negative west of UTC.
 */
export function phoneOffsetMinutes(epochMs: number): number {
  return -new Date(epochMs).getTimezoneOffset();
}

/**
 * The phone's calendar day at a moment, as YYYY-MM-DD.
 *
 * It is the one rule for which day counts as today, so every reader that matches its days against
 * the phone's reads it from here. The offset is passed in, so a reader can also ask for a place's
 * date by passing the place's offset.
 *
 * @param epochMs The moment to read the day at.
 * @param offsetMinutes The offset from UTC at that moment.
 * @return The day, such as "2026-07-05".
 */
export function phoneDayOf(epochMs: number, offsetMinutes: number): string {
  return new Date(epochMs + offsetMinutes * 60000).toISOString().slice(0, 10);
}

/**
 * Which day a moment falls on by the phone's calendar, counted in days from 1 January 1970.
 *
 * @param epochSeconds The moment, as epoch seconds.
 * @param offsetAt Reads the phone's offset, normally phoneOffsetMinutes.
 * @return The day's number.
 */
export function phoneDayNumber(epochSeconds: number, offsetAt: PhoneOffset = phoneOffsetMinutes): number {
  return Math.floor((epochSeconds + offsetAt(epochSeconds * 1000) * 60) / DAY_SECONDS);
}

/**
 * The phone's midnight starting a day, as epoch seconds.
 *
 * It is worked out from the date, with the offset read at the midnight itself, so a day 23 or 25
 * hours long across a clock change still starts on its own midnight. The first guess takes the
 * offset at UTC midnight, which is within a day of the answer, and the second takes it there.
 *
 * @param day The day's number, as phoneDayNumber gives it.
 * @param offsetAt Reads the phone's offset, normally phoneOffsetMinutes.
 * @return The midnight, as epoch seconds.
 */
export function phoneMidnight(day: number, offsetAt: PhoneOffset = phoneOffsetMinutes): number {
  const utcMidnight = day * DAY_SECONDS;
  const guess = utcMidnight - offsetAt(utcMidnight * 1000) * 60;

  return utcMidnight - offsetAt(guess * 1000) * 60;
}

export default { phoneOffsetMinutes, phoneDayOf, phoneDayNumber, phoneMidnight };
