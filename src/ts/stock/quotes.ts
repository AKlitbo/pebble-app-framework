/**
 * Quotes for a list of tickers, and the rule for which answers count against a provider's quota.
 *
 * `fetchQuotes` fetches a round as a promise, with no timer of its own. `roundStamps` decides when a
 * finished round moves the quota stamps, `UNANSWERED` lists the statuses that carry no answer, and
 * `PROBE_STOPS` the ones that end a round sent one ticker first.
 */

import stock from './stock';
import stockUtil from './util';
import type { RequestFn, StockOpts, StockQuote } from './util';

/**
 * The statuses a quote carries when the provider gave no answer to read. A round of only these moves
 * no stamp unless a call among them is marked `spent`, since one that may have reached the provider
 * keeps its ledger stamp and counts as a fetch the way a timeout does.
 */
export const UNANSWERED = ['ERR', 'NET ERROR'];

/**
 * The statuses that end a round sent one ticker first, after a round that left a backoff. The other
 * tickers would only get the same answer, so they carry it unspent and the try costs one call.
 */
export const PROBE_STOPS = ['NET ERROR', 'TIMEOUT', 'RATE LIMIT'];

/** What a finished round moves: when the fetch was, and the trading day of its first good quote. */
export interface RoundStamps {
  lastFetchMs?: number;
  lastAsOf?: string;
}

/**
 * Works out which quota stamps a finished round moves.
 *
 * A good quote moves both, the time and the trading day, so Alpha Vantage knows once it holds today.
 * A round with a good quote where another ticker answered RATE LIMIT, timed out, or was lost to the
 * network moves only the time, since the day is not held for that
 * ticker and Alpha Vantage would otherwise wait until tomorrow to ask for it. A round the provider
 * answered with nothing good, such as NO SYMBOL for a mistyped ticker or RATE LIMIT, still moves the
 * time, since each of those answers spent a call on a metered plan. So does a round whose calls were
 * lost to the network but kept their stamps, marked `spent`. A round that spent nothing moves nothing,
 * so it tries again on the next poll.
 *
 * @param results The round's quotes.
 * @param nowMs When the round finished, in epoch milliseconds.
 * @return The stamps to move, empty when the round spent nothing.
 */
export function roundStamps(results: StockQuote[], nowMs: number): RoundStamps {
  const firstGood = results.find((quote) => quote && quote.ok);
  // a ticker refused or lost to the network has not got the day's close, so the day stays put and
  // the next try asks for it again
  const limited = results.some((quote) => quote && ['RATE LIMIT', 'TIMEOUT', ...UNANSWERED].includes(quote.status || ''));

  // the oldest trading day among the good quotes, so a round mixing a quote kept from yesterday with
  // one fetched today still reads as not holding today
  if (firstGood && !limited) {
    const days = results.filter((quote) => quote && quote.ok).map((quote) => quote.asOf || '');

    return { lastFetchMs: nowMs, lastAsOf: days.reduce((oldest, day) => (day < oldest ? day : oldest)) };
  }

  if (firstGood) {
    return { lastFetchMs: nowMs };
  }

  const answered = results.some((quote) => quote && (quote.ok || quote.spent === true || !UNANSWERED.includes(quote.status || '')));

  return answered ? { lastFetchMs: nowMs } : {};
}

/**
 * Fetches a quote for each ticker from one provider, all at once, and answers them in order.
 *
 * A ticker whose fetch throws, such as a bad URL from odd input or a provider tripping over an odd
 * answer, comes back as ERR rather than ending the round, so every other ticker still answers. The
 * round has no watchdog of its own, so the request it is given has to end every fetch with a
 * timeout of its own.
 *
 * Every ticker starts at once, so for a provider that refuses calls close together, as Alpha
 * Vantage's free key does about a second apart, ask for one ticker at a time.
 *
 * @param symbols The tickers, in the order to answer them.
 * @param opts The provider and its key.
 * @param request The HTTP GET to fetch with.
 * @return One quote per ticker, in the order given.
 */
export function fetchQuotes(symbols: string[], opts: StockOpts, request: RequestFn): Promise<StockQuote[]> {
  return Promise.all(symbols.map((symbol) => new Promise<StockQuote>((resolve) => {
    // a provider that throws while reading the body never calls back, so the throw answers ERR for
    // it. the first answer wins, so a later one cannot change a ticker already settled
    const guarded: RequestFn = (url, callback) => request(url, (err, body) => {
      try {
        callback(err, body);
      } catch {
        resolve(stockUtil.status('ERR'));
      }
    });

    try {
      stock.fetchQuote({ ...opts, symbol }, guarded, resolve);
    } catch {
      resolve(stockUtil.status('ERR'));
    }
  })));
}
