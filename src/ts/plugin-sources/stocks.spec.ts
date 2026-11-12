/**
 * Specs for reading a stock plugin's `finance/stock` update into the strip's quotes.
 *
 * Pebble's own Stocks plugin sends text alone, so what is worth pinning is that the text reads to the
 * right number, sign, and thousands, since a misread shows a wrong price on the wrist with nothing to
 * say so. A framework plugin app sends a number beside the text, which has to win. A ticker with no
 * price has to keep its slot and say why, and the strip has to keep the plugin's order and stop at its
 * slots, or the watch drops the whole strip.
 */

import { describe, test, expect } from 'vitest';
import { stocksFromUpdate, stockErrorStatus } from './stocks';
import { stockInstance } from '../plugin-app/stocks';
import { NO_PLUGIN } from './subscription';
import stockUtil from '../stock/util';
import type { SourceInstance } from './types';

/** One ticker the way Pebble's Stocks sends it, every property as text alone. */
function pebbleQuote(ticker: string, price: string, change: string, percent: string): SourceInstance {
  return {
    instanceId: ticker,
    properties: {
      ticker: { shortText: { text: ticker } },
      name: { shortText: { text: `${ticker} Inc.` } },
      price: { shortText: { text: price }, longText: { text: `${price}  ${percent}` } },
      day_change: { shortText: { text: change }, longText: { text: change } },
      day_change_percent: { shortText: { text: percent }, longText: { text: percent } },
    },
  };
}

/** The numbers of the quotes an update reads to, which is what the strip packs. */
function numbers(instances: unknown[]): Array<[string, number, number]> {
  return stocksFromUpdate({ instances: instances as SourceInstance[] }).map((quote) => [quote.symbol, quote.price, quote.changePercent]);
}

describe('stocksFromUpdate on Pebble\'s text', () => {
  /** The strip packs the price and the percent, so a rise in dollars has to read to exactly those. */
  test('reads a dollar price and its percent off the text', () => {
    const result = stocksFromUpdate({ instances: [pebbleQuote('AAPL', '$187.42', '+$0.97', '+0.52%')] })[0];

    expect(result).toMatchObject({ ok: true, symbol: 'AAPL', name: 'AAPL Inc.', price: 187.42, change: 0.97, changePercent: 0.52 });
  });

  /** Pebble puts the minus before the currency sign, so a fall read as a rise would show green on a red day. */
  test('keeps a minus written before the currency as the sign', () => {
    const result = stocksFromUpdate({ instances: [pebbleQuote('VOD.L', '£70.50', '-£1.20', '-1.67%')] })[0];

    expect([result.change, result.changePercent]).toEqual([-1.2, -1.67]);
  });

  /** A currency with no sign comes as its code and a space, which must not stop the price reading. */
  test('reads a price written after a currency code', () => {
    const result = numbers([pebbleQuote('NESN.SW', 'CHF 98.10', '+CHF 0.40', '+0.41%')]);

    expect(result).toEqual([['NESN.SW', 98.1, 0.41]]);
  });

  /** A price over a thousand carries a comma, and reading only the part before it would show 1 for 1,234.56. */
  test('reads a thousands comma as part of the number', () => {
    const result = numbers([pebbleQuote('BRK.A', '$712,345.67', '-$1,234.50', '-0.17%')]);

    expect(result).toEqual([['BRK.A', 712345.67, -0.17]]);
  });

  /** A plugin that sends only the long price has the percent after it, which must not be read as the price. */
  test('reads only the first number of the long price', () => {
    const instance = { properties: { ticker: { shortText: { text: 'AAPL' } }, price: { longText: { text: '$187.42  +0.52%' } } } };

    const result = numbers([instance]);

    expect(result).toEqual([['AAPL', 187.42, 0]]);
  });

  /** The strip shows the percent, so a plugin sending only the change still needs one worked out from it. */
  test('works the percent out from the change when the plugin sends none', () => {
    const instance = { properties: { ticker: { shortText: { text: 'AAPL' } }, price: { shortText: { text: '$102.00' } }, day_change: { shortText: { text: '+$2.00' } } } };

    const result = stocksFromUpdate({ instances: [instance] })[0].changePercent;

    expect(result).toBeCloseTo(2, 10);
  });
});

describe('stocksFromUpdate on a framework plugin app', () => {
  /** The number is the plugin's own reading, so a text rounded to two places must not stand in for it. */
  test('reads the numbers beside the text before the text', () => {
    const quote = stockUtil.ok('AAPL', 187.4249, 0.9711, 0.5203, '', { name: 'Apple Inc.', currency: 'USD', asOfEpoch: 1794000000 });

    const result = stocksFromUpdate({ instances: [stockInstance(quote, 'AAPL')] })[0];

    expect(result).toMatchObject({ ok: true, symbol: 'AAPL', name: 'Apple Inc.', price: 187.4249, change: 0.9711, changePercent: 0.5203, currency: 'USD', asOfEpoch: 1794000000 });
  });

  /** A ticker the provider refused keeps its slot with the word for why, or the wearer sees the wrong ticker in its place. */
  test('reads a status instance as that status under its ticker', () => {
    const instance = stockInstance({ ...stockUtil.status('RATE LIMIT'), symbol: 'MSFT' }, 'MSFT');

    const result = stocksFromUpdate({ instances: [instance] })[0];

    expect(result).toMatchObject({ ok: false, symbol: 'MSFT', status: 'RATE LIMIT' });
  });
});

describe('stocksFromUpdate edges', () => {
  /** A slot with neither a price nor a status still has to say something, rather than show a price of 0. */
  test('reads a price that cannot be read as NO DATA', () => {
    const instance = { properties: { ticker: { shortText: { text: 'AAPL' } }, price: { shortText: { text: 'n/a' } } } };

    const result = stocksFromUpdate({ instances: [instance] })[0];

    expect(result).toMatchObject({ ok: false, symbol: 'AAPL', status: 'NO DATA' });
  });

  /** The strip holds four slots in the wearer's order, so a reshuffle or a fifth ticker would put quotes in the wrong slots. */
  test('keeps the update\'s order and stops at the strip\'s slots', () => {
    const tickers = ['TSLA', 'AAPL', 'NVDA', 'MSFT', 'AMZN'];

    const result = numbers(tickers.map((ticker) => pebbleQuote(ticker, '$1.00', '+$0.00', '+0.00%'))).map(([symbol]) => symbol);

    expect(result).toEqual(['TSLA', 'AAPL', 'NVDA', 'MSFT']);
  });

  /** Junk in the list must not take a slot, or a real ticker after it falls off the end. */
  test('leaves out an instance with no properties', () => {
    const result = numbers([null, 'junk', { instanceId: 'X' }, { instanceId: 'Y', properties: {} }, pebbleQuote('AAPL', '$1.00', '+$0.00', '+0.00%')]).map(([symbol]) => symbol);

    expect(result).toEqual(['AAPL']);
  });

  /** An update with no tickers is how the watch hears the plugin's list was emptied, so it has to read as an empty strip. */
  test('reads an update with no instances as no quotes', () => {
    const result = stocksFromUpdate({ instances: [] });

    expect(result).toEqual([]);
  });
});

describe('stockErrorStatus', () => {
  /** The watch shows the status in an 11 character slot, so a word that ran past it would be cut on the wrist. */
  test.each([
    [NO_PLUGIN, 'NO PLUGIN'],
    ['PLUGIN_UNAVAILABLE', 'NO PLUGIN'],
    ['PERMISSION_DENIED', 'NO ACCESS'],
  ])('gives %s a status that fits the slot', (code, expected) => {
    const result = stockErrorStatus(code);

    expect(result).toBe(expected);
    expect(result.length).toBeLessThanOrEqual(11);
  });

  /** An error with no status leaves the watch's strip as it is rather than clearing good quotes. */
  test('gives an unknown code no status', () => {
    const result = stockErrorStatus('SOMETHING_ELSE');

    expect(result).toBeUndefined();
  });
});
