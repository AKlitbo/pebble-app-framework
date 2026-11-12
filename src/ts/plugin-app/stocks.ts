/**
 * Stock quotes, served from a plugin app as `finance/stock`.
 *
 * Modelled on Pebble's own Stocks plugin. A plugin app serves its five properties in the same text,
 * so a face written against Pebble's reads it with no change, and adds numbers and a few properties
 * of our own that a face can ask for. A ticker with no price goes out with its status word rather
 * than being left out, so a face can say why.
 */

import { shortName } from './short-text';
import { phoneOffsetMinutes } from '../pkjs/phone-clock';
import type { PhoneOffset } from '../pkjs/phone-clock';
import type { StockQuote } from '../stock/util';
import type { SourceDeclaration, SourceInstance, SourceProperty } from '../plugin-sources/types';

/**
 * The `finance/stock` source as a plugin app declares it in its appinfo's plugin block.
 *
 * The first five properties are Pebble's, in its shapes, with a number added beside the price and the
 * two changes. The rest are the framework's: the currency code, when the quote is from, the provider it
 * came from, New York's market state, and a status word on a ticker with no price.
 */
export const STOCK_SOURCE = {
  category: 'finance',
  items: ['stock'],
  properties: {
    ticker: ['shortText'],
    name: ['shortText'],
    price: ['shortText', 'longText', 'numericValue'],
    day_change: ['shortText', 'longText', 'numericValue'],
    day_change_percent: ['shortText', 'longText', 'numericValue'],
    currency: ['shortText'],
    updated: ['timestamp', 'shortText'],
    source: ['shortText', 'longText'],
    market: ['shortText'],
    status: ['shortText'],
  },
  supportsMultiple: true,
  suggestedRefreshIntervalSec: 300,
} satisfies SourceDeclaration & { supportsMultiple: boolean; suggestedRefreshIntervalSec: number };

/** Each provider's short name for a `shortText`, by its full name. */
const SOURCE_SHORT_NAMES: Record<string, string> = { 'Alpha Vantage': 'AlphaV', 'Twelve Data': '12Data' };

/** The signs Pebble's Stocks writes before a price. Any other currency is written out as its code and a space. */
const CURRENCY_SIGNS: Record<string, string> = { USD: '$', GBP: '£', EUR: '€', JPY: '¥' };

/** What a plugin app knows about a quote beyond the quote itself. */
export interface StockExtras {
  /** The provider's name, to credit beside the price, such as Yahoo. It goes out whole in `longText` and cut to fit in `shortText`. */
  source?: string;
  /** New York's market state, `open`, `postclose`, or `closed`. */
  market?: string;
}

/**
 * The sign or code Pebble's Stocks writes before a price in this currency. Pebble's always has a
 * currency from Yahoo. A quote from a provider that sends none, such as Finnhub, gets no prefix
 * rather than the lone space Pebble's would write.
 */
function currencyPrefix(currency: string | undefined): string {
  if (!currency) {
    return '';
  }

  return CURRENCY_SIGNS[currency] ?? `${currency} `;
}

/** A value to two places with its sign first, as Pebble's Stocks writes a change, such as `+$0.97` or `-1.20%`. */
function signed(value: number, prefix: string): string {
  return `${value < 0 ? '-' : '+'}${prefix}${Math.abs(value).toFixed(2)}`;
}

/** A text in both the shapes Pebble's Stocks sends it in. */
function textProperty(value: string): SourceProperty {
  return { shortText: { text: value }, longText: { text: value } };
}

/** A moment's time on the phone's clock, as HH:MM. */
function clockLabel(epochSeconds: number, offsetAt: PhoneOffset): string {
  return new Date((epochSeconds + offsetAt(epochSeconds * 1000) * 60) * 1000).toISOString().slice(11, 16);
}

/**
 * One quote as a `finance/stock` instance.
 *
 * A good quote carries Pebble's five properties in Pebble's text, the same values as numbers, and the
 * framework's extras it has. A quote with no price carries the ticker, its name, and its status word,
 * and no price, so a face shows its dash and a framework face shows the word.
 *
 * @param quote The quote, good or a status.
 * @param instanceId The id the instance goes out under, normally the ticker as the wearer typed it, so it stays the same from run to run.
 * @param extras The provider's name and the market state, when the plugin has them.
 * @param offsetAt Reads the phone's offset, for the quote time's label. A spec stands the phone in another zone with it.
 * @return The instance.
 */
export function stockInstance(quote: StockQuote, instanceId: string, extras: StockExtras = {}, offsetAt: PhoneOffset = phoneOffsetMinutes): SourceInstance {
  const ticker = quote.symbol || instanceId;
  const properties: Record<string, SourceProperty> = {
    ticker: { shortText: { text: ticker } },
    // Pebble's Stocks falls back to the ticker for a name, and a face reading it expects a name to be there
    name: { shortText: { text: quote.name || ticker } },
  };

  if (quote.ok) {
    const prefix = currencyPrefix(quote.currency);
    const price = `${prefix}${quote.price.toFixed(2)}`;
    const percent = `${signed(quote.changePercent, '')}%`;

    properties.price = { shortText: { text: price }, longText: { text: `${price}  ${percent}` }, numericValue: { value: quote.price, ...(quote.currency ? { unit: quote.currency } : {}) } };
    properties.day_change = { ...textProperty(signed(quote.change, prefix)), numericValue: { value: quote.change, ...(quote.currency ? { unit: quote.currency } : {}) } };
    properties.day_change_percent = { ...textProperty(percent), numericValue: { value: quote.changePercent, unit: '%' } };
  } else {
    // the status words run past SHORT_TEXT_MAX, such as RATE LIMIT and INVALID KEY. they go out whole,
    // since a face matches on the word, and a cut one would read as no status at all. the Pebble app
    // warns on them, which costs a log line on a ticker that has no price
    properties.status = { shortText: { text: quote.status || 'ERR' } };
  }

  if (quote.currency) {
    properties.currency = { shortText: { text: quote.currency } };
  }

  if (quote.ok && quote.asOfEpoch) {
    properties.updated = { timestamp: { value: quote.asOfEpoch }, shortText: { text: clockLabel(quote.asOfEpoch, offsetAt) } };
  }

  if (extras.source) {
    properties.source = { shortText: { text: shortName(extras.source, SOURCE_SHORT_NAMES) }, longText: { text: extras.source } };
  }

  // postclose runs past SHORT_TEXT_MAX too, and goes out whole for the same reason as the status
  if (extras.market) {
    properties.market = { shortText: { text: extras.market } };
  }

  return { instanceId, properties };
}
