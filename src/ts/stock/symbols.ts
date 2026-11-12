/**
 * Turns the comma list of tickers a wearer types on a settings page into clean symbols a provider
 * takes. The caller sets how many to keep.
 */

/**
 * A ticker as the providers spell one. Upper letters and digits plus the punctuation the providers
 * use, up to 15 long, which covers 7203.T and 0700.HK, ^GSPC, EURUSD=X, BTC-USD, BTC/USD, and
 * BINANCE:BTCUSDT. The lookahead wants at least one letter or digit, so a punctuation-only entry,
 * a "." or a "-", can't spend a provider call on a ticker that cannot exist.
 */
export const STOCK_SYMBOL_RE = /^(?=.*[A-Z0-9])[A-Z0-9.^=/:_-]{1,15}$/;

/**
 * Splits a comma list of tickers into clean uppercase symbols. A junk or over-long entry is dropped,
 * and the list is capped.
 *
 * @param raw The comma-separated symbols as saved on the settings page, or anything else that landed there.
 * @param max The most tickers to keep, in the order given.
 * @return The cleaned, capped list of symbols.
 */
export function parseSymbols(raw: unknown, max: number): string[] {
  return String(raw || '')
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => STOCK_SYMBOL_RE.test(symbol))
    .slice(0, max);
}
