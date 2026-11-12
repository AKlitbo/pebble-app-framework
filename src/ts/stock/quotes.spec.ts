/**
 * Specs for fetching a round of quotes as a promise, and for the rule on which rounds count against a
 * provider's quota.
 *
 * A plugin app awaits the round inside its run, so it has to answer every ticker in order even when
 * one throws. The quota rule is what keeps a metered plan such as Alpha Vantage's 25 calls a day to the
 * same count in a plugin as in a face, so each kind of round is pinned.
 */

import { describe, test, expect, vi } from 'vitest';
import stock from './stock';
import { fetchQuotes, roundStamps } from './quotes';
import stockUtil from './util';
import type { RequestFn } from './util';

/** A Yahoo answer for one ticker at a price. */
function yahooBody(symbol: string, price: number): string {
  return JSON.stringify({ chart: { result: [{ meta: { symbol, regularMarketPrice: price, chartPreviousClose: price } }], error: null } });
}

/** A request that answers Yahoo for each ticker in the URL, and throws for one named ticker. */
function yahooRequest(prices: Record<string, number>, throwsFor = ''): RequestFn {
  return (url, callback) => {
    const symbol = decodeURIComponent(url.split('/chart/')[1].split('?')[0]);

    if (symbol === throwsFor) {
      throw new Error('bad url');
    }

    callback(null, yahooBody(symbol, prices[symbol]));
  };
}

describe('fetchQuotes', () => {
  /** A face shows the tickers in the order the wearer typed them, whichever answers first. */
  test('answers every ticker in the order given', async () => {
    const result = await fetchQuotes(['MSFT', 'AAPL'], { provider: 'yahoo' }, yahooRequest({ MSFT: 400, AAPL: 200 }));

    expect(result.map((quote) => [quote.symbol, quote.price])).toEqual([['MSFT', 400], ['AAPL', 200]]);
  });

  /** One bad ticker throwing must not end the round, or the plugin answers nothing for the good ones. */
  test('answers a ticker whose fetch throws as ERR and still answers the rest', async () => {
    const result = await fetchQuotes(['MSFT', 'BAD'], { provider: 'yahoo' }, yahooRequest({ MSFT: 400 }, 'BAD'));

    expect(result.map((quote) => quote.ok ? quote.symbol : quote.status)).toEqual(['MSFT', 'ERR']);
  });
});

describe('fetchQuotes when a provider trips', () => {
  /** A provider throwing on an odd answer never called back, which left the whole plugin run waiting with nothing served. */
  test('answers ERR for a ticker whose provider throws reading the answer', async () => {
    const real = stock.fetchQuote;
    const spy = vi.spyOn(stock, 'fetchQuote').mockImplementation((opts, request, done) => {
      if (opts.symbol !== 'BAD') {
        return real(opts, request, done);
      }

      request('https://example.com/BAD', () => {
        throw new Error('provider bug');
      });
    });
    const answer = Promise.resolve();
    const request: RequestFn = (url, callback) => {
      answer.then(() => callback(null, yahooBody('MSFT', 400)));
    };

    const result = await fetchQuotes(['MSFT', 'BAD'], { provider: 'yahoo' }, request);

    spy.mockRestore();
    expect(result.map((quote) => (quote.ok ? quote.symbol : quote.status))).toEqual(['MSFT', 'ERR']);
  });
});

describe('roundStamps', () => {
  const NOW = 1_700_000_000_000;

  /** A good quote moves the time and the trading day, which Alpha Vantage reads to know it holds today. */
  test('moves the time and the trading day on a good quote', () => {
    const result = roundStamps([stockUtil.status('NO SYMBOL'), stockUtil.ok('AAPL', 1, 0, 0, '2026-11-10')], NOW);

    expect(result).toEqual({ lastFetchMs: NOW, lastAsOf: '2026-11-10' });
  });

  /** A mistyped ticker or a rate limit still spent a call on a metered plan, so the time has to move. */
  test('moves only the time when the provider answered with nothing good', () => {
    const result = roundStamps([stockUtil.status('NO SYMBOL'), stockUtil.status('RATE LIMIT')], NOW);

    expect(result).toEqual({ lastFetchMs: NOW });
  });

  /** A network blip spent nothing, so the next poll has to be free to try again. */
  test('moves nothing when the provider was never reached', () => {
    const result = roundStamps([stockUtil.status('NET ERROR'), stockUtil.status('ERR')], NOW);

    expect(result).toEqual({});
  });
});

describe('roundStamps with a rate limit or a held quote', () => {
  const NOW = 1_700_000_000_000;

  /**
   * Alpha Vantage gave one quote and three RATE LIMITs, and moving the day then held the other three
   * tickers at RATE LIMIT until the next evening. The day stays put, so the evening tries ask again.
   */
  test('moves only the time when a good quote comes with a rate limit', () => {
    const result = roundStamps([stockUtil.ok('AAPL', 1, 0, 0, '2026-11-10'), stockUtil.status('RATE LIMIT')], NOW);

    expect(result).toEqual({ lastFetchMs: NOW });
  });

  /** A quote kept from yesterday beside one fetched today has to read as yesterday, or the kept one is never refreshed. */
  test('takes the oldest trading day among the good quotes', () => {
    const result = roundStamps([stockUtil.ok('AAPL', 1, 0, 0, '2026-11-10'), stockUtil.ok('MSFT', 1, 0, 0, '2026-11-09')], NOW);

    expect(result.lastAsOf).toBe('2026-11-09');
  });
});
