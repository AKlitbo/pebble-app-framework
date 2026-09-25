/**
 * Specs for the stock feature's decisions.
 *
 * The symbol list decides which quotes a metered provider gets asked for, and runStockRound is what
 * stops a stuck or doubled round from freezing the watchlist or spending the quota twice. Those are
 * the parts worth pinning. The wiring into the app's lifecycle is covered with the app's own specs.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseSymbols, runStockRound } from './feature';
import type { StockQuote } from './util';

describe('parseSymbols', () => {
  /** Whitespace and case sloppiness in the setting must clean up or the watch gets a bad symbol. */
  test('trims and uppercases each symbol', () => {
    const result = parseSymbols('aapl, msft ,  tsla');

    expect(result).toEqual(['AAPL', 'MSFT', 'TSLA']);
  });

  /** A junk entry (inner spaces, stray symbols, too long) must be dropped so it never reaches the provider. */
  test('drops entries that are not valid tickers', () => {
    const result = parseSymbols('AAPL, BRK B, ,TOOLONGSYMBOLXXXX, A$B, BRK.B');

    expect(result).toEqual(['AAPL', 'BRK.B']);
  });

  /**
   * The providers sell global coverage, but a letters-only filter left Tokyo, Hong Kong, index,
   * currency, and crypto symbols out, so their slot sat empty with nothing on the settings page to
   * say why.
   */
  test.each([
    ['7203.t', '7203.T'],
    ['0700.HK', '0700.HK'],
    ['^gspc', '^GSPC'],
    ['EURUSD=X', 'EURUSD=X'],
    ['btc/usd', 'BTC/USD'],
    ['BINANCE:BTCUSDT', 'BINANCE:BTCUSDT'],
  ])('keeps %s', (raw, expected) => {
    const result = parseSymbols(raw);

    expect(result).toEqual([expected]);
  });

  /** A punctuation-only entry has no letter, so it must be dropped before it wastes a provider call. */
  test('drops a punctuation-only entry', () => {
    const result = parseSymbols('AAPL, ., -, ...');

    expect(result).toEqual(['AAPL']);
  });

  /** More than the strip can hold must be capped so the wire never overruns the store. */
  test('caps the list at the strip size', () => {
    const result = parseSymbols('A,B,C,D,E,F');

    expect(result).toHaveLength(4);
  });
});

describe('runStockRound', () => {
  // a fresh cross-round state for each test. it is the object getStocks carries in the closure
  function freshState() {
    return { inFlight: false, round: 0, lastFetchMs: 0, lastAsOf: '' };
  }

  /** A symbol whose fetch throws right away must not leave the in-flight flag stuck, or the watchlist freezes for the whole JS session (the 0.10 freeze). */
  test('clears the in-flight flag when a symbol fetch throws right away', () => {
    const state = freshState();
    const sendStocks = vi.fn();
    const deps = {
      fetchQuote: () => { throw new Error('bad url'); },
      sendStocks, now: () => 100, timeoutMs: 1000,
    };

    runStockRound(state, ['AAPL', 'MSFT'], false, deps);

    expect(state.inFlight).toBe(false);
    expect(sendStocks).toHaveBeenCalledTimes(1);
  });

  /**
   * A mistyped ticker answers NO SYMBOL on every call, and each call still counts on a metered plan.
   * Leaving that round unrecorded let every watch poll through the gate, which spent Alpha
   * Vantage's whole day of calls on a symbol that could never answer.
   */
  test('records the time of a round the provider answered with nothing good', () => {
    const state = freshState();
    const noSymbol: StockQuote = { symbol: '', price: 0, change: 0, changePercent: 0, asOf: '', ok: false, status: 'NO SYMBOL' };
    const deps = { fetchQuote: (_symbol: string, done: (quote: StockQuote) => void) => done(noSymbol), sendStocks: vi.fn(), now: () => 500, timeoutMs: 1000 };

    runStockRound(state, ['APPL'], false, deps);

    expect(state.lastFetchMs).toBe(500);
  });

  /** A network blip never reached the provider and spent nothing, so the next poll must be free to retry. */
  test('leaves a round the provider never answered unrecorded', () => {
    const state = freshState();
    const netError: StockQuote = { symbol: '', price: 0, change: 0, changePercent: 0, asOf: '', ok: false, status: 'NET ERROR' };
    const deps = { fetchQuote: (_symbol: string, done: (quote: StockQuote) => void) => done(netError), sendStocks: vi.fn(), now: () => 500, timeoutMs: 1000 };

    runStockRound(state, ['AAPL'], false, deps);

    expect(state.lastFetchMs).toBe(0);
  });

  describe('while a round is in flight', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /** If a provider never calls back the watchdog must clear the in-flight flag, otherwise every future fetch is dropped at the in-flight guard. */
    test('clears the in-flight flag via the watchdog when a quote never calls back', () => {
      const state = freshState();
      const sendStocks = vi.fn();
      const deps = {
        fetchQuote: () => {}, // never invokes onQuote
        sendStocks, now: () => 100, timeoutMs: 1000,
      };

      runStockRound(state, ['AAPL'], false, deps);
      expect(state.inFlight).toBe(true);
      vi.advanceTimersByTime(1000);

      expect(state.inFlight).toBe(false);
      expect(sendStocks).toHaveBeenCalledTimes(1);
    });

    /** A second unforced trigger mid-round (ready plus the watch's STOCK_REQUEST) must be dropped, or the round double-spends the provider quota. */
    test('ignores a second unforced round while one is in flight', () => {
      const state = freshState();
      const started: Array<(q: StockQuote) => void> = [];
      const deps = {
        fetchQuote: (symbol: string, onQuote: (q: StockQuote) => void) => started.push(onQuote), // hold the callbacks open
        sendStocks: vi.fn(), now: () => 100, timeoutMs: 1000,
      };

      runStockRound(state, ['AAPL'], false, deps);
      runStockRound(state, ['AAPL'], false, deps);

      expect(started).toHaveLength(1);
    });

    /** A forced fetch after a settings change must take over a running round, and the old round's late callback must not send stale symbols to the watch. */
    test('lets a forced round take over one still running and ignores the stale callback', () => {
      const state = freshState();
      const sendStocks = vi.fn();
      const callbacks: Array<(q: StockQuote) => void> = [];
      const deps = {
        fetchQuote: (symbol: string, onQuote: (q: StockQuote) => void) => callbacks.push(onQuote),
        sendStocks, now: () => 100, timeoutMs: 1000,
      };

      runStockRound(state, ['AAPL'], false, deps);
      runStockRound(state, ['AAPL'], true, deps);
      callbacks[0]({ ok: true, symbol: 'AAPL', price: 1, change: 0, changePercent: 0, asOf: '' });
      const supersededSend = sendStocks.mock.calls.length;
      callbacks[1]({ ok: true, symbol: 'AAPL', price: 2, change: 0, changePercent: 0, asOf: '' });

      expect(supersededSend).toBe(0);
      expect(sendStocks).toHaveBeenCalledTimes(1);
      expect(state.inFlight).toBe(false);
    });

    /**
     * The watchdog of a round a forced round took over must not close the new round when it fires.
     *
     * The old round's timer is still armed when the forced round starts. If it closed the round
     * anyway, the watch would get a strip of ERR quotes straight away, the new round's quotes
     * would be thrown away, and the new round's own timer would send a second strip.
     */
    test('keeps the forced round open when the round it took over times out', () => {
      const state = freshState();
      const sendStocks = vi.fn();
      const deps = {
        fetchQuote: () => {}, // never invokes onQuote
        sendStocks, now: () => 100, timeoutMs: 1000,
      };
      runStockRound(state, ['AAPL'], false, deps);
      vi.advanceTimersByTime(500);
      runStockRound(state, ['AAPL'], true, deps);

      vi.advanceTimersByTime(500);

      expect(state.inFlight).toBe(true);
      expect(sendStocks).not.toHaveBeenCalled();
    });
  });

  /** The throttle time is set from the first good quote, so a later poll knows data was already captured and does not spend quota again. */
  test('records the throttle time from the first good quote', () => {
    const state = freshState();
    const deps = {
      fetchQuote: (symbol: string, onQuote: (q: StockQuote) => void) => onQuote({ ok: true, symbol: symbol, price: 1, change: 0, changePercent: 0, asOf: '2026-07-01' }),
      sendStocks: vi.fn(), now: () => 4242, timeoutMs: 1000,
    };

    runStockRound(state, ['AAPL'], false, deps);

    expect(state.lastFetchMs).toBe(4242);
    expect(state.lastAsOf).toBe('2026-07-01');
  });
});
