/**
 * Specs for parsing the ticker list a wearer types.
 *
 * The stock feature's own specs pin the rules for a face's four slots. What is worth pinning here is
 * that the cap belongs to the caller, so a plugin serving more tickers keeps them.
 */

import { describe, test, expect } from 'vitest';
import { parseSymbols } from './symbols';

describe('parseSymbols', () => {
  /** A plugin serves up to 8 tickers, so a cap of 8 must keep 8 rather than a face's 4. */
  test('keeps as many tickers as the caller asks for', () => {
    const result = parseSymbols('A,B,C,D,E,F,G,H,I', 8);

    expect(result).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  });

  /** Crypto from Yahoo is spelled with a dash, and has to get through as a ticker. */
  test('takes a crypto pair as Yahoo spells it', () => {
    const result = parseSymbols('btc-usd, eth-usd', 8);

    expect(result).toEqual(['BTC-USD', 'ETH-USD']);
  });
});
