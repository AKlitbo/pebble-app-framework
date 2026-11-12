/**
 * Specs for serving stock quotes from a plugin app as `finance/stock`.
 *
 * A face written against Pebble's own Stocks plugin reads its five properties as text, so what is
 * worth pinning is that a quote served here comes out in exactly Pebble's text, for a dollar price, a
 * pound price, a currency with no sign, and a fall. A ticker with no price has to say why
 * rather than vanish, and the declaration has to cover every property an instance sends, since the
 * Pebble app drops any it does not declare.
 *
 * Vitest runs every spec on a Toronto phone, on standard time at UTC-5 from 1 November 2026.
 */

import { describe, test, expect } from 'vitest';
import { STOCK_SOURCE, stockInstance } from './stocks';
import stockUtil from '../stock/util';
import type { SourceInstance } from '../plugin-sources/types';

/** The text of one shape of an instance's property. */
function text(instance: SourceInstance, property: string, shape: 'shortText' | 'longText' = 'shortText'): string | undefined {
  return instance.properties[property]?.[shape]?.text;
}

// Tuesday 10 November 2026, 16:00 in New York, which is 21:00 UTC
const CLOSE = Date.UTC(2026, 10, 10, 21) / 1000;
const TORONTO = (): number => -5 * 60;

describe('stockInstance', () => {
  /** A face reading Pebble's Stocks reads these five texts, so a dollar quote has to match Pebble's to the character. */
  test('writes a rise in dollars the way Pebble\'s Stocks does', () => {
    const quote = stockUtil.ok('AAPL', 187.42, 0.97, 0.5203, '', { name: 'Apple Inc.', currency: 'USD' });

    const result = stockInstance(quote, 'AAPL');

    expect([text(result, 'ticker'), text(result, 'name'), text(result, 'price'), text(result, 'price', 'longText'), text(result, 'day_change'), text(result, 'day_change_percent')])
      .toEqual(['AAPL', 'Apple Inc.', '$187.42', '$187.42  +0.52%', '+$0.97', '+0.52%']);
  });

  /** A fall puts the minus before the currency sign, as Pebble's does, or a face shows $-1.20. */
  test('writes a fall in pounds with the sign before the currency', () => {
    const quote = stockUtil.ok('VOD.L', 70.5, -1.2, -1.6736, '', { currency: 'GBP' });

    const result = stockInstance(quote, 'VOD.L');

    expect([text(result, 'price'), text(result, 'day_change'), text(result, 'day_change_percent')]).toEqual(['£70.50', '-£1.20', '-1.67%']);
  });

  /** A London price in pence is GBp, not GBP, and a pound sign would make it read 100 times too high. */
  test('writes a price in pence as its code, not a pound sign', () => {
    const quote = stockUtil.ok('VOD.L', 7050, 12, 0.17, '', { currency: 'GBp' });

    const result = stockInstance(quote, 'VOD.L');

    expect([text(result, 'price'), text(result, 'day_change')]).toEqual(['GBp 7050.00', '+GBp 12.00']);
  });

  /** A currency Pebble's has no sign for is written out as its code and a space. */
  test('writes a currency with no sign as its code', () => {
    const quote = stockUtil.ok('NESN.SW', 98.1, 0, 0, '', { currency: 'CHF' });

    const result = stockInstance(quote, 'NESN.SW');

    expect(text(result, 'price')).toBe('CHF 98.10');
  });

  /** A face that wants to colour or chart a quote reads the numbers, so they have to ride beside the text. */
  test('sends the price and changes as numbers in the quote\'s currency', () => {
    const quote = stockUtil.ok('AAPL', 187.42, 0.97, 0.52, '', { currency: 'USD' });

    const result = stockInstance(quote, 'AAPL');

    expect([result.properties.price.numericValue, result.properties.day_change_percent.numericValue]).toEqual([{ value: 187.42, unit: 'USD' }, { value: 0.52, unit: '%' }]);
  });

  /** A face says how old a price is from the quote time, on the wearer's own clock. */
  test('sends the quote time with its time on the phone\'s clock', () => {
    const quote = stockUtil.ok('AAPL', 1, 0, 0, '', { asOfEpoch: CLOSE });

    const result = stockInstance(quote, 'AAPL', { source: 'Yahoo', market: 'closed' }, TORONTO);

    expect([result.properties.updated, text(result, 'source'), text(result, 'market')]).toEqual([{ timestamp: { value: CLOSE }, shortText: { text: '16:00' } }, 'Yahoo', 'closed']);
  });

  /** Pebble's drops a ticker that fails, which leaves a face with a gap and no reason. Ours says why, with no price to draw. */
  test('sends a ticker with no price as its status word, with no price', () => {
    const quote = { ...stockUtil.status('NO ACCESS'), symbol: '^GSPC' };

    const result = stockInstance(quote, '^GSPC');

    expect([text(result, 'ticker'), text(result, 'status'), result.properties.price]).toEqual(['^GSPC', 'NO ACCESS', undefined]);
  });

  /** The Pebble app drops a property the plugin block does not declare, so a face would never see it. */
  test('sends only properties and shapes the declaration declares', () => {
    const good = stockInstance(stockUtil.ok('AAPL', 1, 1, 1, '', { name: 'Apple', currency: 'USD', asOfEpoch: CLOSE }), 'AAPL', { source: 'Yahoo', market: 'open' });
    const failed = stockInstance({ ...stockUtil.status('RATE LIMIT'), symbol: 'MSFT' }, 'MSFT');
    const declared: Record<string, string[]> = STOCK_SOURCE.properties;

    const result = [good, failed].flatMap((instance) => Object.entries(instance.properties).flatMap(([name, shapes]) =>
      Object.keys(shapes).filter((shape) => !(declared[name] || []).includes(shape)).map((shape) => `${name}.${shape}`)));

    expect(result).toEqual([]);
  });
});

describe('the source', () => {
  /** The Pebble app warns on a shortText over seven characters, and Alpha Vantage and Twelve Data both ran past it. */
  test.each([
    ['Alpha Vantage', 'AlphaV'],
    ['Twelve Data', '12Data'],
    ['Finnhub', 'Finnhub'],
    ['Yahoo', 'Yahoo'],
    ['A Provider Not Known Yet', 'A Provi'],
    // a name that is also a property of every object, which a plain lookup read as a short form
    ['constructor', 'constru'],
  ])('serves %s as %s in its short text and whole in its long text', (source, short) => {
    const instance = stockInstance(stockUtil.ok('AAPL', 1, 1, 1, '', { currency: 'USD' }), 'AAPL', { source });

    const result = [instance.properties.source?.shortText?.text, instance.properties.source?.longText?.text];

    expect(result).toEqual([short, source]);
  });
});
