/**
 * Pebble app plugin stock quotes, turned into the quotes the stock providers return.
 *
 * A stock plugin serves one instance per ticker under `finance/stock`, in the order the wearer set
 * them up in the plugin. Its update becomes the same `StockQuote` list a provider round gives, so the
 * watch reads it through the strip it already has. The mapping is plain logic and never reads the
 * clock.
 *
 * Pebble's own Stocks plugin sends each property as text, such as `$187.42`, `-$1.20`, `+0.52%`, or
 * `CHF 98.10`. A plugin app built on the framework sends the same text with a number beside it, plus
 * a few properties of its own, so the number is read first and the text only when there is none.
 */

import stockUtil from '../stock/util';
import type { StockQuote } from '../stock/util';
import wire from '../pkjs/wire';
import { instancesOf, numeric, propertiesOf, text, timestamp } from '../plugin-shapes/shapes';
import type { InstanceProperties } from '../plugin-shapes/shapes';
import { NO_PLUGIN } from './subscription';
import type { PluginSourceTexts } from './page';
import { createStockDriver } from './stock-driver';
import type { SourceEnvelope, SourceInstance, SourceProperty, StockPlugins } from './types';

/**
 * The properties the stock subscription asks for. The first five are Pebble's, and the rest are the
 * ones a framework plugin app adds that the mapping reads.
 */
export const STOCK_PROPERTIES = ['ticker', 'name', 'price', 'day_change', 'day_change_percent', 'currency', 'updated', 'status'];

// the first number in a text, thousands commas and all, such as 1,234.56 in `$1,234.56  +0.52%`
const FIRST_NUMBER = /\d[\d,]*(?:\.\d+)?|\.\d+/;

/**
 * The first number in a text, or undefined when it holds none.
 *
 * Only the first number counts, so the long price `$187.42  +0.52%` gives 187.42. A thousands comma
 * is part of the number. The sign can come before the currency, as in `-$1.20`, so a minus anywhere
 * ahead of the number makes it negative.
 */
function numberIn(written: string | undefined): number | undefined {
  const match = written === undefined ? null : FIRST_NUMBER.exec(written);

  if (!written || !match) {
    return undefined;
  }

  const value = Number(match[0].replace(/,/g, ''));

  if (!Number.isFinite(value)) {
    return undefined;
  }

  return /[-−]/.test(written.slice(0, match.index)) ? -value : value;
}

/** A property's number, from its `numericValue` when it has one, or else read off its text. */
function amount(property: SourceProperty | undefined): number | undefined {
  const reading = numeric(property);

  return reading ? reading.value : numberIn(text(property, 'short'));
}

/** The text of a property, trimmed, or undefined when it has none. */
function words(property: SourceProperty | undefined): string | undefined {
  const value = text(property, 'short');

  return value === undefined ? undefined : value.trim();
}

/**
 * The percent change, or the one worked out from the change and the price for a plugin that sends
 * only the change. The day opened at the price less the change, so a day that opened at 0 has none.
 */
function percentOf(properties: InstanceProperties, price: number, change: number | undefined): number | undefined {
  const percent = amount(properties.day_change_percent);

  if (percent !== undefined || change === undefined || price - change === 0) {
    return percent;
  }

  return (change / (price - change)) * 100;
}

/** One instance as a quote, under its ticker, or its plugin's id for it when it names none. */
function quoteFrom(instance: SourceInstance, properties: InstanceProperties): StockQuote {
  const id = typeof instance.instanceId === 'string' ? instance.instanceId.trim() : '';
  const ticker = (words(properties.ticker) || id || words(properties.name) || '').toUpperCase();
  const price = amount(properties.price);

  if (price === undefined) {
    // a ticker the plugin has no price for keeps its slot with the plugin's own word for why
    const status = words(properties.status);

    return { ...stockUtil.status(status || 'NO DATA'), symbol: ticker };
  }

  const change = amount(properties.day_change);
  const details = {
    name: words(properties.name),
    // a framework plugin app writes the currency as the price's unit too
    currency: words(properties.currency) || numeric(properties.price)?.unit,
    asOfEpoch: timestamp(properties.updated),
  };

  return stockUtil.ok(ticker, price, change, percentOf(properties, price, change), '', details);
}

/**
 * Turns one stock plugin update into the quotes the strip shows.
 *
 * The quotes keep the update's order and stop at the strip's slots. An instance that holds no
 * properties, or an empty set of them, is left out. One with no price becomes a status quote under its ticker, with the
 * plugin's status word when it sends one and `NO DATA` when it does not. An update with no instances
 * gives an empty list, which clears the strip on the watch.
 *
 * @param envelope The update, which may be missing or carry anything.
 * @return The quotes, at most `wire.STOCK_SLOTS_MAX` of them.
 */
export function stocksFromUpdate(envelope: SourceEnvelope | null | undefined): StockQuote[] {
  const quotes: StockQuote[] = [];

  for (const instance of instancesOf(envelope)) {
    const properties = propertiesOf(instance);

    if (properties && Object.keys(properties).length > 0) {
      quotes.push(quoteFrom(instance, properties));
    }

    if (quotes.length === wire.STOCK_SLOTS_MAX) {
      break;
    }
  }

  return quotes;
}

// the status the watch shows for each subscription error that leaves it with no quotes. the phone
// ends the subscription on PLUGIN_UNAVAILABLE, and the unit reports no plugin itself. each fits the
// strip's 11 character label
const ERROR_STATUSES: Record<string, string> = {
  [NO_PLUGIN]: 'NO PLUGIN',
  PLUGIN_UNAVAILABLE: 'NO PLUGIN',
  PERMISSION_DENIED: 'NO ACCESS',
};

/**
 * The status the strip shows for a subscription error.
 *
 * @param code The error code, as an error hands it over or the saved state keeps it.
 * @return The status words, or undefined for a code that has none, which leaves the watch as it is.
 */
export function stockErrorStatus(code: string | null | undefined): string | undefined {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(ERROR_STATUSES, code) ? ERROR_STATUSES[code] : undefined;
}

/**
 * The stock page hook's rows, which show only while the plugin is picked. On a face whose providers
 * list is the plugin alone they always show, and the one for no plugin joins them.
 *
 * The Pebble app has no stock plugin of its own, so a phone with plugins on and nothing serving the
 * quotes is missing one rather than switched off, and the rows for it say where to get one. A phone
 * with plugins off still gets the line saying to turn them on, from the page and the panel.
 */
export const STOCK_TEXTS: PluginSourceTexts = {
  notStandard: (pluginName) => `${pluginName} sends quotes this watchface cannot read. Pick another stock plugin under Preferred Sources in the Pebble app, or another data source here.`,
  notStandardNoSelect: (pluginName) => `${pluginName} sends quotes this watchface cannot read. Pick another stock plugin under Preferred Sources in the Pebble app.`,
  permissionDenied: 'The Pebble app is not letting this watchface read its stock plugin. Allow it for this watchface in the Pebble app.',
  empty: 'Your stock plugin sent no quotes last time. The phone may have been offline, or the plugin may have no tickers set up in its own settings in the Pebble app.',
  source: `Your watch shows the first ${wire.STOCK_SLOTS_MAX} tickers your stock plugin sends, the ones set up in that plugin's own settings in the Pebble app.`,
  noPlugin: 'This watchface needs a stock plugin, and the Pebble app has none built in. Get one from the Pebble app store, then pick it under Preferred Sources in the Pebble app.',
  notInstalledLabel: 'Pebble App: Preferred Source (No Stock Plugin)',
};

/**
 * Everything the stock feature reads plugin quotes with, which plugin-sources/index hands it on a face
 * built with `PLUGIN_STOCKS`. The stock plugins serve one instance per ticker under `finance/stock`.
 */
export const stockPlugins: StockPlugins = {
  driver: createStockDriver({ fromUpdate: stocksFromUpdate, properties: STOCK_PROPERTIES, errorStatus: stockErrorStatus, texts: STOCK_TEXTS }),
};

export default { stocksFromUpdate, stockErrorStatus, STOCK_PROPERTIES, STOCK_TEXTS };
