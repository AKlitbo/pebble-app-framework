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
// Twelve Data honours the watch's interval while the market is open, floored at 15 minutes. when
// the market is shut its price is frozen, so it drops to one poll every three hours, which still
// catches the next open. a weekday tops out at 34 polls, 27 across the open session
// and 7 while shut, so 4 symbols spend at most 136 of its 800 calls a day
const TD_OPEN_FLOOR_MS = 15 * MINUTE_MS;
const TD_CLOSED_FLOOR_MS = 3 * 60 * MINUTE_MS;
// Alpha Vantage publishes the day's close at no fixed time after the 16:00 ET bell so once the
// market shuts we poll every couple of hours until its trading day catches up then idle till
// tomorrow. it only allows 25 calls a day and spends one per symbol so the whole six hour window
// has to fit 4 symbols with room to spare. two hours gives three tries for 12 calls
const AV_POLL_FLOOR_MS = 120 * MINUTE_MS;

/**
 * The shortest gap between two rounds for Finnhub and Yahoo. A launch asks twice within a few
 * seconds, once on ready and once when the watch tries its ask again, and this holds the second
 * one back without getting in the way of a watch polling every minute.
 */
export const REALTIME_MIN_GAP_MS = 45 * 1000;

/** The first wait after Yahoo or Finnhub answers RATE LIMIT. Each one after it doubles, up to the cap. */
export const BACKOFF_FIRST_MS = 15 * MINUTE_MS;

/** The longest wait after a run of RATE LIMIT answers from Yahoo or Finnhub. */
export const BACKOFF_CAP_MS = 120 * MINUTE_MS;

/** How long to wait after Alpha Vantage's one call a second burst limit, which clears within seconds. */
const AV_BURST_WAIT_MS = 5 * 1000;

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
 * @param retryAtMs When a rate limit said to try again, as epoch milliseconds, or 0 for none. It
 *   decides on its own while it is set, ahead of the floors.
 * @param paid True when the wearer's key is on a paid plan, which leaves the free plan's floors out.
 *   The short gap and a rate limit's wait still hold.
 * @return True if the poll should be skipped.
 */
function shouldThrottleStockFetch(provider: string, force: boolean, lastFetchMs: number, lastAsOf: string, now: number, retryAtMs = 0, paid = false): boolean {
  if (force) {
    return false;
  }

  // a wait from a rate limit is the provider's own word on when a call can land, so it beats the
  // floors both ways. a wait more than a day out means the phone's clock went back, and is let go
  if (retryAtMs > 0 && retryAtMs - now < 24 * 60 * MINUTE_MS) {
    return now < retryAtMs;
  }

  const sinceLast = now - lastFetchMs;

  // a stamp in the future means the phone's clock went back after it was saved. counting it as due
  // costs one fetch, where holding it would shut the gate until the clock caught up
  if (sinceLast < 0) {
    return false;
  }

  if (paid) {
    return sinceLast < REALTIME_MIN_GAP_MS;
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

  // finnhub and yahoo and anything unknown are real-time so honour the watch's interval, past a
  // short gap that keeps a launch's two asks to one round
  return sinceLast < REALTIME_MIN_GAP_MS;
}

/**
 * The trading day whose close is the newest Alpha Vantage can have, as "YYYY-MM-DD" on New York's
 * clock. That is today after the 16:00 bell on a weekday, and the weekday before otherwise. A quote
 * from this day or later is current. Holidays are not known, so on the day after one a quote reads as
 * a day behind and is fetched again, which the evening tries already allow for.
 *
 * @param now The instant to check, as epoch milliseconds.
 * @return The trading day, or an empty string when New York's clock cannot be read.
 */
function currentTradingDay(now: number): string {
  const et = etParts(now);

  if (!et.date) {
    return '';
  }

  if (et.weekday >= 1 && et.weekday <= 5 && et.hour >= 16) {
    return et.date;
  }

  const [year, month, day] = et.date.split('-').map(Number);
  const back = et.weekday === 0 ? 2 : et.weekday === 1 ? 3 : 1;

  return new Date(Date.UTC(year, month - 1, day - back)).toISOString().slice(0, 10);
}

/** When to try again after a round answered RATE LIMIT, and the backoff to carry to the next one. */
export interface RateLimitWait {
  retryAtMs: number;
  backoffMs: number;
}

/**
 * Works out when a provider is worth asking again after a round's answers.
 *
 * A round with no RATE LIMIT clears both. Twelve Data's minute limit resets on the clock minute and
 * its daily one at midnight UTC, so it waits for whichever its message names. Alpha Vantage's burst
 * limit clears in seconds, and its daily one is left to its own evening window. Yahoo and Finnhub
 * publish nothing, and asking again while Yahoo is blocking can stretch the block, so they wait 15
 * minutes and double each time after, up to two hours.
 *
 * @param provider The stock provider's id.
 * @param results The round's quotes.
 * @param backoffMs The backoff the last rate limited round left, or 0.
 * @param now When the round finished, as epoch milliseconds.
 * @param paid True on a paid plan, where Alpha Vantage has no evening window to fall back on, so a
 *   limit other than its burst one backs off as Yahoo's does.
 * @return When to try again, 0 for no wait, and the backoff to carry forward.
 */
function rateLimitWait(provider: string, results: { status?: string; limit?: string }[], backoffMs: number, now: number, paid = false): RateLimitWait {
  const limited = results.filter((quote) => quote && quote.status === 'RATE LIMIT');

  if (!limited.length) {
    return { retryAtMs: 0, backoffMs: 0 };
  }

  const limits = limited.map((quote) => quote.limit);

  if (provider === 'twelvedata') {
    // a daily limit answered in the first minutes after midnight UTC is the old day's count still
    // being settled, or the phone's clock running a little fast. reading it as the minute limit tries
    // again a minute later rather than waiting a whole day
    const sinceMidnight = now % (24 * 60 * MINUTE_MS);

    if (limits.includes('day') && sinceMidnight >= 5 * MINUTE_MS) {
      const next = new Date(now);

      return { retryAtMs: Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate() + 1, 0, 1), backoffMs: 0 };
    }

    if (limits.includes('day') || limits.includes('minute')) {
      // a second past the next clock minute, so the clocks on both ends can be a little apart
      return { retryAtMs: (Math.floor(now / MINUTE_MS) + 1) * MINUTE_MS + 1000, backoffMs: 0 };
    }

    return { retryAtMs: 0, backoffMs: 0 };
  }

  if (provider === 'alphavantage' && limits.every((limit) => limit === 'second')) {
    return { retryAtMs: now + AV_BURST_WAIT_MS, backoffMs: 0 };
  }

  if (provider === 'alphavantage' && !paid) {
    return { retryAtMs: 0, backoffMs: 0 };
  }

  const wait = backoffMs > 0 ? Math.min(backoffMs * 2, BACKOFF_CAP_MS) : BACKOFF_FIRST_MS;

  return { retryAtMs: now + wait, backoffMs: wait };
}

/** The answers a round's calls gave, as `roundWait` reads them. */
export interface RoundCall {
  ok: boolean;
  status?: string;
  limit?: string;
  /** True when the call reached the provider and was counted against its free plan. */
  spent?: boolean;
}

/** The answers that say a provider is not well right now, rather than something the wearer can fix. */
const TRANSIENT = ['NET ERROR', 'TIMEOUT'];

/**
 * Works out the wait a finished round leaves behind, from the answers its calls gave.
 *
 * A round nothing answered, and nothing spent, says nothing about a limit, so the wait already set
 * stands and this answers null. Otherwise a rate limit sets the wait `rateLimitWait` gives. A call
 * that was spent but gave nothing usable, a `TIMEOUT` or a broken answer, sets a wait of its own, or
 * every ask would spend another call on a provider that is not well. With nothing good in the round
 * that wait is 15 minutes, doubling up to two hours. With good quotes beside it the floor already
 * spaces the next fetch, so there is no wait, unless the fetch time was left alone for the next try
 * to ask for the troubled ticker alone, and then the wait stays at 15 minutes.
 *
 * @param provider The stock provider's id.
 * @param calls The answers from the calls the round made, leaving out any slot filled from a held quote.
 * @param answered True when the provider answered at least one call, so the round counts as a fetch.
 * @param timeLeftAlone True when the round left the fetch time alone so the next try asks only for the tickers it lost.
 * @param backoffMs The backoff the last round left, or 0.
 * @param now When the round finished, as epoch milliseconds.
 * @param paid True on a paid plan.
 * @return The wait to set and the backoff to carry, or null to leave both as they are.
 */
function roundWait(provider: string, calls: RoundCall[], answered: boolean, timeLeftAlone: boolean, backoffMs: number, now: number, paid = false): RateLimitWait | null {
  const troubled = calls.some((quote) => !quote.ok && quote.spent && TRANSIENT.includes(quote.status || ''));

  if (!answered && !troubled) {
    return null;
  }

  const wait = rateLimitWait(provider, calls, backoffMs, now, paid);

  if (wait.retryAtMs || !troubled) {
    return wait;
  }

  if (!calls.some((quote) => quote.ok)) {
    const next = backoffMs > 0 ? Math.min(backoffMs * 2, BACKOFF_CAP_MS) : BACKOFF_FIRST_MS;

    return { retryAtMs: now + next, backoffMs: next };
  }

  return timeLeftAlone ? { retryAtMs: now + BACKOFF_FIRST_MS, backoffMs } : wait;
}

export default { marketPhase, shouldThrottleStockFetch, rateLimitWait, roundWait, currentTradingDay };
