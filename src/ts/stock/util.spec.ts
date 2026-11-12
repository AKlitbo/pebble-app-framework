/**
 * Specs for the shared stock helpers.
 *
 * ok() and status() are the normalized shape every provider returns, and
 * requestJson() is the seam that decides whether a body reaches the provider or an error
 * returns immediately instead. A drift here breaks every provider at once.
 */

import { describe, test, expect } from 'vitest';
import util from './util';
import type { RequestFn } from './util';

describe('stock util ok', () => {
  /** A non-finite price would ship as a real reading of NaN and draw a garbage number. */
  test('rejects a non-finite price as No Data', () => {
    const result = util.ok('AAPL', 'not-a-number', 1, 1, '2026-07-01');

    expect(result.ok).toBe(false);
    expect(result.status).toBe('NO DATA');
  });

  /** The symbol must come back uppercased or the watch header shows a lowercase ticker. */
  test('echoes the symbol uppercased', () => {
    const result = util.ok('aapl', 261.74, 1.24, 0.47, '2026-07-01');

    expect(result.symbol).toBe('AAPL');
  });

  /** Raw prices must survive unrounded so the wire step owns the scale to cents. */
  test('keeps the price and change as their raw values', () => {
    const result = util.ok('AAPL', 261.74, 1.24, 0.4744, '2026-07-01');

    expect(result.price).toBe(261.74);
    expect(result.change).toBe(1.24);
    expect(result.changePercent).toBe(0.4744);
  });

  /** A missing change must settle to 0, not NaN, so a valid price still ships. */
  test('defaults a non-finite change to zero', () => {
    const result = util.ok('AAPL', 261.74, null, undefined, '');

    expect(result.change).toBe(0);
    expect(result.changePercent).toBe(0);
    expect(result.ok).toBe(true);
  });

  /** A plugin serves the name, currency, and quote time beside the price, so the ones a provider gives have to land. */
  test('keeps the name, currency, and quote time a provider gives', () => {
    const result = util.ok('AAPL', 261.74, 1.24, 0.47, '2026-07-01', { name: ' Apple Inc. ', currency: 'USD', asOfEpoch: 1719849600.9 });

    expect(result.name).toBe('Apple Inc.');
    expect(result.currency).toBe('USD');
    expect(result.asOfEpoch).toBe(1719849600);
  });

  /** A London price in pence comes as GBp, and reading it as GBP would show it 100 times too high in pounds. */
  test('keeps a currency in pence apart from pounds', () => {
    const result = util.ok('VOD.L', 7050, 12, 0.17, '', { currency: 'GBp' });

    expect(result.currency).toBe('GBp');
  });

  /** A face shows the ticker when there is no name, so a blank one must be left out rather than sent in its place. */
  test('leaves out a blank name, an odd currency, and a quote time of zero', () => {
    const result = util.ok('AAPL', 261.74, 1.24, 0.47, '', { name: '  ', currency: 'dollars', asOfEpoch: 0 });

    expect(result).not.toHaveProperty('name');
    expect(result).not.toHaveProperty('currency');
    expect(result).not.toHaveProperty('asOfEpoch');
  });
});

describe('stock util status', () => {
  /** The watch shows this text verbatim, so a lowercase message reads wrong. */
  test('uppercases the message', () => {
    const result = util.status('Rate Limit');

    expect(result.status).toBe('RATE LIMIT');
    expect(result.ok).toBe(false);
  });
});

describe('stock util begin', () => {
  /** A key-required provider must return immediately rather than build a URL, or it fires a keyless request that 401s. */
  test('reports No API Key when a key is required but missing', () => {
    const result = util.begin({ key: '', symbol: 'AAPL' }, true);

    expect(result.error.status).toBe('NO API KEY');
  });

  /** A keyless provider (Yahoo) must skip the key check, or it would refuse to run at all. */
  test('skips the key check when needsKey is false', () => {
    const result = util.begin({ symbol: 'AAPL' }, false);

    expect(result.error).toBeUndefined();
    expect(result.symbol).toBe('AAPL');
  });

  /** A missing symbol must return immediately, or the provider queries the API with an empty ticker. */
  test('reports No Symbol when the symbol is missing', () => {
    const result = util.begin({ key: 'k' }, true);

    expect(result.error.status).toBe('NO SYMBOL');
  });

  /** The symbol must come back uppercased and the key URL-encoded, or the request URL is malformed. */
  test('returns the uppercased symbol and the encoded key', () => {
    const result = util.begin({ key: 'a b/c', symbol: 'aapl' }, true);

    expect(result.symbol).toBe('AAPL');
    expect(result.encodedKey).toBe('a%20b%2Fc');
  });
});

describe('stock util isoDateFromUnix', () => {
  /** The trading day is the New York date, so a UTC-midnight time reads as the day before. */
  test('formats a unix time as the New York trading day', () => {
    const result = util.isoDateFromUnix(86400);

    expect(result).toBe('1970-01-01');
  });

  /** A zero or missing timestamp means no known day, so it must be blank not 1970. */
  test('returns blank for a zero timestamp', () => {
    const result = util.isoDateFromUnix(0);

    expect(result).toBe('');
  });
});

describe('stock util requestJson', () => {
  /** A bodyless http error (an empty or non-JSON 401/429) must still reach the provider so it can read the status, rather than return immediately with Net Error. */
  test('hands a bodyless http error to onJson with a null body', () => {
    let seenErr;
    let seenJson;
    const request: RequestFn = (url, callback) => callback('http 401', 'not json');

    util.requestJson('https://x', request, () => {}, (err, json) => {
      seenErr = err;
      seenJson = json;
    });

    expect(seenErr).toBe('http 401');
    expect(seenJson).toBeNull();
  });

  /** With neither a readable body nor an error there is nothing to act on, so it must map to Net Error. */
  test('reports Net Error when there is no body and no error', () => {
    let result;
    const request: RequestFn = (url, callback) => callback(null, '');

    util.requestJson('https://x', request, (status) => { result = status; }, () => {});

    expect(result.status).toBe('NET ERROR');
  });

  /** The provider needs both the HTTP error and the parsed body to tell a bad key from a bad symbol. */
  test('hands the error and parsed body to onJson together', () => {
    let seenErr;
    let seenJson;
    const request: RequestFn = (url, callback) => callback('http 401', '{"error":"bad"}');

    util.requestJson('https://x', request, () => {}, (err, json) => {
      seenErr = err;
      seenJson = json;
    });

    expect(seenErr).toBe('http 401');
    expect(seenJson).toEqual({ error: 'bad' });
  });

  /** Without a cachebust param a proxy can serve a stale quote forever. */
  test('appends a cachebust param to the url', () => {
    let requested;
    const request: RequestFn = (url, callback) => { requested = url; callback(null, '{}'); };

    util.requestJson('https://x?symbol=AAPL', request, () => {}, () => {});

    expect(requested).toMatch(/[?&]_=\d+/);
  });
});

describe('rateLimit', () => {
  /** Each limit resets on its own clock, so the wait depends on reading which one the provider named. */
  test.each([
    ['Thank you for using Alpha Vantage! Please consider spreading out your free API requests more sparingly (1 request per second).', 'second'],
    ['You have run out of API credits for the current minute. 9 API credits were used, with the current limit being 8.', 'minute'],
    ['You have run out of API credits for the day.', 'day'],
    ['Our standard API rate limit is 25 requests per day.', 'day'],
  ])('reads %s as a %s limit', (message, limit) => {
    const result = util.rateLimit(message);

    expect([result.status, result.limit]).toEqual(['RATE LIMIT', limit]);
  });

  /** A message naming no limit must still read as a rate limit, with no wait it cannot back up. */
  test('leaves the limit out when the message names none', () => {
    const result = util.rateLimit('Too Many Requests');

    expect([result.status, result.limit]).toEqual(['RATE LIMIT', undefined]);
  });
});

describe('rateLimit when a daily message mentions a minute', () => {
  /** Reading a daily refusal as the minute limit sent four refused calls every minute until midnight. */
  test('reads it as the daily limit', () => {
    const result = util.rateLimit('You have run out of API credits for the day. Upgrade for more credits per minute.');

    expect(result.limit).toBe('day');
  });
});

describe('rateLimit on Alpha Vantage burst reply', () => {
  /**
   * The burst reply names the free key's 25 a day too, and reading that as the daily limit lost the
   * five second retry. This is Alpha Vantage's reply word for word, from two calls sent together on
   * 10 November 2026.
   */
  test('reads the burst reply as the second limit despite its daily tail', () => {
    const result = util.rateLimit('Thank you for using Alpha Vantage! Please consider spreading out your free API requests more sparingly (1 request per second). You may subscribe to any of the premium plans at https://www.alphavantage.co/premium/ to lift the free key rate limit (25 requests per day), raise the per-second burst limit, and instantly unlock all premium endpoints');

    expect(result.limit).toBe('second');
  });
});

describe('bodyless', () => {
  /** A timed out call may have reached the provider, so it reads apart from one that never left the phone. */
  test.each([
    ['http 429', 'RATE LIMIT'],
    ['timeout', 'TIMEOUT'],
    ['network error', 'NET ERROR'],
  ])('reads %s as %s', (err, word) => {
    const result = util.bodyless(err);

    expect(result.status).toBe(word);
  });
});

describe('ok with a coin as the currency', () => {
  /** A crypto pair priced in a coin, such as USDT, lost its currency and went out with no code before the price. */
  test('keeps a four letter coin code as the currency', () => {
    const result = util.ok('BTC-USDT', 100, 0, 0, '', { currency: 'USDT' });

    expect(result.currency).toBe('USDT');
  });
});
