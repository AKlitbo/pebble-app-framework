/**
 * Twelve Data stock quote provider (requires an API key).
 *
 * The free tier allows 8 calls a minute and 800 a day, and covers US markets only. A paid plan
 * adds 20+ markets, and a ticker outside the plan answers 403, read as NO ACCESS.
 * Change and percent come back ready to use. One call per symbol.
 */

import util from '../util';
import type { RequestFn, DoneFn, StockOpts } from '../util';

const TWELVEDATA_QUOTE_API = 'https://api.twelvedata.com/quote';

/** The subset of a Twelve Data /quote response this provider reads. */
interface TwelveDataQuote {
  status?: string;
  code?: number;
  message?: string;
  close?: string;
  change?: string;
  percent_change?: string;
  symbol?: string;
  datetime?: string;
  name?: string;
  currency?: string;
  last_quote_at?: number;
}

/**
 * Fetches a quote from Twelve Data for the supplied symbol.
 *
 * @param opts The lookup options, must carry an API key.
 * @param request The HTTP GET function to use.
 * @param done Called once with the finished quote result.
 */
function fetch(opts: StockOpts, request: RequestFn, done: DoneFn): void {
  const start = util.begin(opts, true);

  if (start.error) {
    return done(start.error);
  }

  const symbol = start.symbol;
  const url = `${TWELVEDATA_QUOTE_API}?symbol=${encodeURIComponent(symbol)}&apikey=${start.encodedKey}`;

  util.requestJson<TwelveDataQuote>(url, request, done, (err, json) => {
    // nothing to read: a bodyless 429, a timeout, or a call that never reached the host
    if (!json) {
      return done(util.bodyless(err));
    }

    // Twelve Data answers 200 for a good read and puts the trouble in a
    // status:error body so check that before the quote. a hit cap wins over a
    // bad key so a throttled read never reads as a token problem
    if (json.status === 'error' || json.code) {
      const message = String(json.message || '').toLowerCase();
      const code = Number(json.code);

      if (code === 429 || message.indexOf('limit') !== -1 || message.indexOf('credits') !== -1) {
        return done(util.rateLimit(message));
      }

      // a server error says nothing about the key, so it reads as a round that was not answered and
      // the last good quotes stay
      if (code >= 500) {
        return done(util.status('Net Error'));
      }

      // a symbol the plan does not cover, the same as Finnhub's free plan outside the US
      if (code === 403) {
        return done(util.status('No Access'));
      }

      if (code === 404 || message.indexOf('not found') !== -1) {
        return done(util.status('No Symbol'));
      }

      return done(util.status('Invalid Key'));
    }

    // a good read always carries the close so its absence means there is no quote
    if (json.close === undefined) {
      return done(util.status('No Symbol'));
    }

    const price = parseFloat(json.close);
    const change = parseFloat(String(json.change));
    const changePercent = parseFloat(String(json.percent_change));
    // datetime is the bar date or a full timestamp intraday so keep the day part
    const asOf = String(json.datetime || '').slice(0, 10);

    done(util.ok(json.symbol || symbol, price, change, changePercent, asOf, { name: json.name, currency: json.currency, asOfEpoch: json.last_quote_at }));
  });
}

export default { fetch };
