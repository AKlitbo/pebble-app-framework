/**
 * US-market-hours throttling for the stock providers.
 *
 * Works out the trading phase of the US market and, from it, whether a given
 * provider is worth polling right now. Real-time feeds always fetch, while the
 * quota-limited ones ease off when the market is shut or their data can't have
 * moved yet. Kept next to the stock layer it governs rather than in the pkjs
 * bootstrap.
 */

import { zoneParts } from '../pkjs/timezone';

/** US markets quote in New York, so every reading here is that zone's clock. */
const ET_ZONE = 'America/New_York';

const MINUTE_MS = 60 * 1000;
// Twelve Data honours the watch's interval while the market is open floored so 4 symbols
// stay under its 800/day cap (~384/day at 15 min). when the market is shut its price is
// frozen so it drops to an occasional refresh that still catches the next open
const TD_OPEN_FLOOR_MS = 15 * MINUTE_MS;
const TD_CLOSED_FLOOR_MS = 3 * 60 * MINUTE_MS;
// Alpha Vantage publishes the day's close at no fixed time after the 16:00 ET bell so once the
// market shuts we poll every couple of hours until its trading day catches up then idle till
// tomorrow. it only allows 25 calls a day and spends one per symbol so the whole six hour window
// has to fit 4 symbols with room to spare. two hours gives three tries for 12 calls
const AV_POLL_FLOOR_MS = 120 * MINUTE_MS;

/**
 * Breaks an instant into its US Eastern wall-clock parts, the zone US markets keep.
 * weekday is 0=Sunday..6=Saturday, and date is the ET calendar day as "YYYY-MM-DD".
 */
function etParts(now: number): { weekday: number; hour: number; minute: number; date: string } {
  const parts = zoneParts(ET_ZONE, now);
  if (!parts) {
    // a runtime that cannot read the zone must not read as a weekday inside market hours, or a
    // metered provider gets polled through the weekend. Sunday with a shut clock is the safe answer
    return { weekday: 0, hour: 0, minute: 0, date: '' };
  }

  // work out the weekday from the ET calendar day itself not a locale short-name string
  // (some engines spell it differently and a bad match would read undefined and let a
  // weekend fall through as an open trading day and over-poll paid providers)
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();

  return {
    weekday: weekday,
    hour: parts.hour,
    minute: parts.minute,
    date: parts.date,
  };
}

/** The three states the US market can be in, so a misspelled comparison stops compiling. */
export type MarketPhase = 'open' | 'postclose' | 'closed';

/**
 * The trading phase of the US market at the given instant: 'open' (Mon-Fri
 * 09:30-16:00 ET), 'postclose' (Mon-Fri 16:00-22:00 ET), or 'closed'.
 *
 * @param now The instant to check, as epoch milliseconds.
 * @return The trading phase, 'open', 'postclose', or 'closed'.
 */
function marketPhase(now: number): MarketPhase {
  return phaseOf(etParts(now));
}

/**
 * The trading phase for a clock reading already taken, so a caller that needs both the phase and
 * the calendar day reads the zone once rather than twice.
 *
 * @param et The ET wall clock to judge.
 * @return The trading phase.
 */
function phaseOf(et: { weekday: number; hour: number; minute: number }): MarketPhase {
  if (et.weekday === 0 || et.weekday === 6) {
    return 'closed';
  }

  const minutes = et.hour * 60 + et.minute;
  if (minutes >= 9 * 60 + 30 && minutes < 16 * 60) {
    return 'open';
  }
  if (minutes >= 16 * 60 && minutes < 22 * 60) {
    return 'postclose';
  }
  return 'closed';
}

/**
 * Whether a stock poll should be skipped, so a provider only fetches when its data
 * could actually have moved. Finnhub and Yahoo are real-time and always fetch.
 * Twelve Data honours the interval while open and eases off when shut. Alpha
 * Vantage only polls after the close and stops once it has today's trading day.
 *
 * The two Alpha Vantage stamps only bound anything if they outlive a restart, so they are read
 * back off the phone (see cache.ts) rather than starting empty on every run.
 *
 * @param provider The stock provider's id, such as 'alphavantage' or 'finnhub'.
 * @param force True to skip the throttle and always allow the fetch.
 * @param lastFetchMs When the provider was last polled, as epoch milliseconds.
 * @param lastAsOf The trading day of the last Alpha Vantage close held, as "YYYY-MM-DD".
 * @param now The instant to check, as epoch milliseconds.
 * @return True if the poll should be skipped.
 */
function shouldThrottleStockFetch(provider: string, force: boolean, lastFetchMs: number, lastAsOf: string, now: number): boolean {
  if (force) {
    return false;
  }

  const sinceLast = now - lastFetchMs;

  // a stamp in the future means the phone's clock went back after it was saved. counting it as due
  // costs one fetch, where holding it would shut the gate until the clock caught up
  if (sinceLast < 0) {
    return false;
  }

  if (provider === 'twelvedata') {
    const floor = marketPhase(now) === 'open' ? TD_OPEN_FLOOR_MS : TD_CLOSED_FLOOR_MS;
    return sinceLast < floor;
  }

  if (provider === 'alphavantage') {
    const et = etParts(now);

    // already holding today's close so nothing new lands until tomorrow
    if (lastAsOf && lastAsOf === et.date) {
      return true;
    }
    // no stamp means this phone has never fetched, such as after its storage was cleared. the last
    // close is worth one call at any hour, where holding it would leave the strip blank until an evening
    if (!lastFetchMs) {
      return false;
    }
    // the close only publishes after the bell so only chase it in the evening window
    if (phaseOf(et) === 'postclose') {
      return sinceLast < AV_POLL_FLOOR_MS;
    }
    return true;
  }

  // finnhub and yahoo and anything unknown are real-time so honour the watch's interval
  return false;
}

export default { marketPhase, shouldThrottleStockFetch };
