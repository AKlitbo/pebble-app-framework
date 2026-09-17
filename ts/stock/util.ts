/**
 * Shared helpers for the stock provider modules.
 *
 * Provides the HTTP wrapper and the result builders so finnhub and alphavantage
 * both return the same normalized shape. Kept separate from the weather util on
 * purpose so the two data layers stay decoupled.
 */

import { zoneParts } from '../pkjs/timezone';

/** One normalized quote result (or a status/error when ok is false). */
export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  asOf: string;
  ok: boolean;
  status?: string;
}

/** The lookup options a face hands the dispatcher and each provider. */
export interface StockOpts {
  provider?: string;
  key?: string;
  symbol?: string;
}

/** An HTTP GET the caller supplies, so the specs can swap in a fake. */
export type RequestFn = (url: string, callback: (err: string | null, body?: string) => void) => void;

/** Called once with the finished quote result. */
export type DoneFn = (result: StockQuote) => void;

/** The ready pieces from begin(), or an error status the caller returns as-is. */
export type BeginResult =
  | { symbol: string; encodedKey: string; error?: undefined }
  | { error: StockQuote; symbol?: undefined; encodedKey?: undefined };

/**
 * Parses a JSON string, returning null on failure. The result is the raw unknown JSON, so a
 * provider casts it to its own quote shape.
 *
 * @param body The raw HTTP response body to parse.
 * @return The parsed JSON, or null if the body was not valid JSON.
 */
function safeParse(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch (error) {
    return null;
  }
}

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
  // cachebust so a proxy can't hand us a stale quote
  const separator = url.indexOf('?') === -1 ? '?' : '&';
  const freshUrl = `${url}${separator}_=${Date.now()}`;

  request(freshUrl, (err, body) => {
    const json = body ? safeParse(body) : null;
    if (json) {
      return onJson(err, json as T);
    }

    // no readable body. an http status still lets a provider read a bodyless
    // 401/429 so pass it through. no status at all is a genuine network fault
    if (err) {
      return onJson(err, null);
    }

    return done(status('NET ERROR'));
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
 * @return The finished quote, or a "NO DATA" status result when price does not parse to a real number.
 */
// the numbers arrive straight off a parsed provider payload, so they are untrusted until
// the Number()/isFinite guards below run. saying `number` here would be a lie
function ok(symbol: string, price: unknown, change: unknown, changePercent: unknown, asOf?: string): StockQuote {
  const value = Number(price);
  if (!Number.isFinite(value)) {
    // a missing price would otherwise ship as a real reading of NaN
    return status('NO DATA');
  }

  const abs = Number(change);
  const pct = Number(changePercent);

  return {
    symbol: String(symbol || '').toUpperCase(),
    price: value,
    change: Number.isFinite(abs) ? abs : 0,
    changePercent: Number.isFinite(pct) ? pct : 0,
    asOf: asOf ? String(asOf) : '',
    ok: true,
  };
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
  safeParse,
  requestJson,
  begin,
  isoDateFromUnix,
  deriveChange,
  ok,
  status,
};
