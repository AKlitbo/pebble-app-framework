/**
 * Yahoo Finance stock quote provider (no API key).
 *
 * Uses the unofficial v8 chart endpoint, which is keyless and covers US and
 * international markets, ETFs, indices, and crypto. It has no change field, so
 * the change is worked out from the previous close. One call per symbol.
 */

import util from '../util';
import type { RequestFn, DoneFn, StockOpts } from '../util';

const YAHOO_CHART_API = 'https://query1.finance.yahoo.com/v8/finance/chart';

interface YahooMeta {
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  symbol?: string;
  regularMarketTime?: number;
  shortName?: string;
  longName?: string;
  currency?: string;
}

interface YahooChartInner {
  error?: unknown;
  result?: Array<{ meta?: YahooMeta }>;
}

/** The subset of a Yahoo v8 chart response this provider reads. */
interface YahooResponse {
  chart?: YahooChartInner;
}

/**
 * Fetches a quote from Yahoo for the supplied symbol. The key is ignored, Yahoo needs none.
 *
 * @param opts The lookup options. Any key is ignored.
 * @param request The HTTP GET function to use.
 * @param done Called once with the finished quote result.
 */
function fetch(opts: StockOpts, request: RequestFn, done: DoneFn): void {
  const start = util.begin(opts, false);

  if (start.error) {
    return done(start.error);
  }

  const symbol = start.symbol;
  const url = `${YAHOO_CHART_API}/${encodeURIComponent(symbol)}?range=1d&interval=1d`;

  util.requestJson<YahooResponse>(url, request, done, (err, json) => {
    // Yahoo puts rate faults in the HTTP status with a non-JSON body so a null
    // json plus an error is all there is to branch on
    if (!json) {
      return done(util.bodyless(err));
    }

    // an unknown or delisted symbol comes back with result null and an error block
    const chart: YahooChartInner = json.chart || {};

    if (chart.error || !chart.result || !chart.result[0]) {
      return done(util.status('No Symbol'));
    }

    const meta: YahooMeta = chart.result[0].meta || {};
    const price = Number(meta.regularMarketPrice);
    const prevClose = Number(meta.chartPreviousClose);

    // Yahoo has no change field so work it out from the previous close
    const derived = util.deriveChange(price, prevClose);

    // the name falls back from the short one to the long one, as Pebble's own Stocks plugin reads it
    const details = { name: meta.shortName || meta.longName, currency: meta.currency, asOfEpoch: meta.regularMarketTime };

    done(util.ok(meta.symbol || symbol, price, derived.change, derived.changePercent, util.isoDateFromUnix(meta.regularMarketTime), details));
  });
}

export default { fetch };
