/**
 * Shared helpers for the stock provider modules.
 *
 * Provides the HTTP wrapper and the result builders so every stock provider returns
 * the same normalized shape. Kept separate from the weather util so the two data
 * layers stay decoupled.
 */

import { zoneParts } from '../pkjs/timezone';
import { requestJson as sharedRequestJson } from '../pkjs/request';
import type { RequestFn } from '../pkjs/request';

/** One normalized quote result (or a status/error when ok is false). */
export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  asOf: string;
  ok: boolean;
  status?: string;
  /** The instrument's name as the provider gives it, such as Apple Inc., when it gives one. */
  name?: string;
  /** The currency the price is in, as its code, such as USD or GBp for pence, when the provider says. */
  currency?: string;
  /** When the provider's price is from, in epoch seconds, when it says. */
  asOfEpoch?: number;
  /** On a RATE LIMIT, the limit the provider says was hit, when it says. */
  limit?: RateLimitKind;
  /** When the phone got this quote, in epoch milliseconds, kept on a held quote only. */
  fetchedAtMs?: number;
  /** True on a failed quote whose call reached the provider and was counted against its free plan. */
  spent?: boolean;
}

/** Which of a provider's limits a refused call hit: its calls a second, a minute, or a day. */
export type RateLimitKind = 'second' | 'minute' | 'day';

/** What a provider knows about a quote beyond its numbers, each left out when the provider does not say. */
export interface QuoteDetails {
  name?: unknown;
  currency?: unknown;
  asOfEpoch?: unknown;
}

/** The lookup options a face hands the dispatcher and each provider. */
export interface StockOpts {
  provider?: string;
  key?: string;
  symbol?: string;
}

export type { RequestFn } from '../pkjs/request';

/** Called once with the finished quote result. */
export type DoneFn = (result: StockQuote) => void;

/** The ready pieces from begin(), or an error status the caller returns as-is. */
export type BeginResult =
  | { symbol: string; encodedKey: string; error?: undefined }
  | { error: StockQuote; symbol?: undefined; encodedKey?: undefined };

/**
 * Performs an HTTP GET and shared response handling.
 *
 * A parseable body goes to onJson together with the request error, so a provider
 * can read both the HTTP status (a 401 key error) and its own error JSON. A
 * bodyless error (an empty or non-JSON 401/429 page) still hands the status to
 * onJson with a null body, so the provider can tell an auth or rate error from a
 * plain network fault. Only a response with neither a readable body nor an error
 * has nothing to act on, so it finishes with 'NET ERROR'.
 *
 * @param url The URL to fetch. A cachebusting query param is added before the request goes out.
 * @param request The HTTP GET function to use.
 * @param done Called with a status result when there is nothing for onJson to read.
 * @param onJson Called with the request error and the parsed JSON, or a null body, whenever there is something to read.
 */
function requestJson<T = unknown>(url: string, request: RequestFn, done: DoneFn, onJson: (err: string | null, json: T | null) => void): void {
  sharedRequestJson<T>(url, request, (err, json) => {
    // an http status with no readable body still lets a provider read a bodyless 401 or 429
    // no body and no status at all is a genuine network fault
    if (json || err) {
      return onJson(err, json);
    }

    done(status('NET ERROR'));
  });
}

/**
 * Builds a successful quote result.
 *
 * The numbers are kept as the provider's raw values. Rounding and the scale to
 * integer cents happens at the wire step, not here.
 *
 * @param symbol The ticker symbol, upper cased.
 * @param price The raw price value from the provider, not yet checked.
 * @param change The raw change value from the provider, not yet checked.
 * @param changePercent The raw change percent value from the provider, not yet checked.
 * @param asOf The trading day or timestamp the quote is as of, when the provider sends one.
 * @param details The name, currency, and quote time, when the provider sends them.
 * @return The finished quote, or a "NO DATA" status result when price does not parse to a real number.
 */
// the numbers arrive straight off a parsed provider payload, so they are untrusted until
// the Number()/isFinite guards below run. saying `number` here would be a lie
function ok(symbol: string, price: unknown, change: unknown, changePercent: unknown, asOf?: string, details: QuoteDetails = {}): StockQuote {
  const value = Number(price);

  if (!Number.isFinite(value)) {
    // a missing price would otherwise ship as a real reading of NaN
    return status('NO DATA');
  }

  const abs = Number(change);
  const pct = Number(changePercent);

  const quote: StockQuote = {
    symbol: String(symbol || '').toUpperCase(),
    price: value,
    change: Number.isFinite(abs) ? abs : 0,
    changePercent: Number.isFinite(pct) ? pct : 0,
    asOf: asOf ? String(asOf) : '',
    ok: true,
  };

  // each detail goes on only when the provider gave a usable one, so a quote with no name never
  // carries the ticker a second time in its place
  const name = typeof details.name === 'string' ? details.name.trim() : '';
  // the case stays as the provider gives it, since GBp (pence) and ZAc (cents) are not GBP and ZAC
  const currency = typeof details.currency === 'string' ? details.currency.trim() : '';
  const asOfEpoch = Number(details.asOfEpoch);

  if (name) {
    quote.name = name;
  }

  // three letters for a currency, or up to five for a coin a crypto pair is priced in, such as USDT
  if (/^[A-Za-z]{3,5}$/.test(currency)) {
    quote.currency = currency;
  }

  if (details.asOfEpoch !== undefined && details.asOfEpoch !== null && Number.isFinite(asOfEpoch) && asOfEpoch > 0) {
    quote.asOfEpoch = Math.floor(asOfEpoch);
  }

  return quote;
}

/**
 * Works the change and its percent out from a price and the previous close, for the providers
 * that send no change field of their own. Either one missing leaves both NaN, which ok() maps
 * to a zero change. A previous close of 0 has no meaningful percent so that stays NaN too.
 *
 * @param price The latest price.
 * @param prevClose The previous close to compare against.
 * @return The change and change percent, both NaN when they cannot be worked out.
 */
function deriveChange(price: number, prevClose: number): { change: number; changePercent: number } {
  if (!Number.isFinite(price) || !Number.isFinite(prevClose)) {
    return { change: NaN, changePercent: NaN };
  }

  return {
    change: price - prevClose,
    changePercent: prevClose !== 0 ? (price - prevClose) / prevClose * 100 : NaN,
  };
}

/**
 * Runs the shared provider preamble: an optional API-key check, the symbol
 * uppercase and presence check, and URL-encoding the key. Returns the ready
 * pieces, or { error } carrying a status result the caller should return as-is.
 *
 * @param opts The lookup options a face handed the dispatcher.
 * @param needsKey Whether this provider requires an API key.
 * @return The uppercased symbol and encoded key, or an error result to return as-is.
 */
function begin(opts: StockOpts, needsKey: boolean): BeginResult {
  if (needsKey && !opts.key) {
    return { error: status('No API Key') };
  }

  const symbol = String(opts.symbol || '').toUpperCase();

  if (!symbol) {
    return { error: status('No Symbol') };
  }

  return { symbol: symbol, encodedKey: opts.key ? encodeURIComponent(opts.key) : '' };
}

/**
 * Turns a unix timestamp in seconds into the US market trading day as "YYYY-MM-DD".
 *
 * US markets quote in New York, so the trading day is the New York date. Reading it in
 * another zone would roll a late after-hours print past 20:00 ET onto the next day.
 *
 * @param unixSeconds The unix timestamp in seconds.
 * @return The trading day as "YYYY-MM-DD", or an empty string when the timestamp is not usable.
 */
function isoDateFromUnix(unixSeconds: unknown): string {
  const unix = Number(unixSeconds);

  if (!Number.isFinite(unix) || unix <= 0) {
    return '';
  }

  // zoneParts answers null rather than throwing, so the fallback hangs off that
  const ms = unix * 1000;
  const parts = zoneParts('America/New_York', ms);

  if (parts) {
    return parts.date;
  }

  // older engines without IANA time zone data fall back to the plain UTC date
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Builds a RATE LIMIT result, with the limit the provider's message names when it names one.
 *
 * @param message The provider's own words, read for `second`, `minute`, or `day`.
 * @return The RATE LIMIT status, with `limit` set when the message says which.
 */
function rateLimit(message: unknown): StockQuote {
  const text = String(message || '').toLowerCase();
  const quote = status('Rate Limit');

  // the exact phrases go first. Alpha Vantage's burst reply asks for "1 request per second" and then
  // names the free key's "25 requests per day", and a Twelve Data daily reply can mention its plans'
  // credits per minute, so a loose match on day or minute alone would read either one wrong
  if (text.indexOf('per second') !== -1) {
    quote.limit = 'second';
  } else if (text.indexOf('current minute') !== -1) {
    quote.limit = 'minute';
  } else if (text.indexOf('per day') !== -1 || text.indexOf('for the day') !== -1 || text.indexOf('daily') !== -1) {
    quote.limit = 'day';
  } else if (text.indexOf('minute') !== -1) {
    quote.limit = 'minute';
  }

  return quote;
}

/**
 * The status for a request that left nothing to read: RATE LIMIT for a bodyless 429, TIMEOUT for a
 * request given up after its timeout, which may have reached the provider and spent a call, and NET
 * ERROR for one that never reached it.
 *
 * @param err The request's error.
 * @return The status result.
 */
function bodyless(err: string | null): StockQuote {
  const text = String(err || '');

  if (text.indexOf('429') !== -1) {
    return rateLimit('');
  }

  return status(text === 'timeout' ? 'Timeout' : 'Net Error');
}

/**
 * Builds a status/error result that carries no live reading.
 *
 * @param text The status text to show, upper cased.
 * @return A quote result with ok false and the status set.
 */
function status(text: string): StockQuote {
  return {
    symbol: '',
    price: 0,
    change: 0,
    changePercent: 0,
    asOf: '',
    ok: false,
    status: (text || '').toUpperCase(),
  };
}

export default {
  requestJson,
  begin,
  isoDateFromUnix,
  deriveChange,
  ok,
  status,
  rateLimit,
  bodyless,
};
