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

describe('runStockRound for a provider with limits', () => {
  const good = (symbol: string): StockQuote => ({ symbol, price: 1, change: 0, changePercent: 0, asOf: '2026-11-10', ok: true });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Alpha Vantage refuses a second call within about a second, and four at once came back as one quote and three RATE LIMITs. */
  test('starts each call a spacing after the one before answers', () => {
    const state = { inFlight: false, round: 0, lastFetchMs: 0, lastAsOf: '' };
    const asked: string[] = [];
    const deps = {
      fetchQuote: (symbol: string, done: (quote: StockQuote) => void) => { asked.push(symbol); done(good(symbol)); },
      sendStocks: vi.fn(), now: () => 0, timeoutMs: 30000, spacingMs: 1100,
    };

    runStockRound(state, ['A', 'B', 'C'], false, deps);
    const counts = [asked.length];

    vi.advanceTimersByTime(1100);
    counts.push(asked.length);
    vi.advanceTimersByTime(1100);
    counts.push(asked.length);

    const result = counts;

    expect(result).toEqual([1, 2, 3]);
  });

  /** A slow answer followed by a fast call reached Alpha Vantage under a second apart, so the gap runs from the answer. */
  test('holds the next call until the one before has answered', () => {
    const state = { inFlight: false, round: 0, lastFetchMs: 0, lastAsOf: '' };
    const asked: string[] = [];
    const pendingDone: ((quote: StockQuote) => void)[] = [];
    const deps = {
      fetchQuote: (symbol: string, done: (quote: StockQuote) => void) => { asked.push(symbol); pendingDone.push(done); },
      sendStocks: vi.fn(), now: () => 0, timeoutMs: 30000, spacingMs: 1100,
    };

    runStockRound(state, ['A', 'B'], false, deps);
    vi.advanceTimersByTime(5000);
    const beforeAnswer = asked.length;

    pendingDone[0](good('A'));
    vi.advanceTimersByTime(1100);

    const result = [beforeAnswer, asked.length];

    expect(result).toEqual([1, 2]);
  });

  /** A save that only removed a ticker must spend no Alpha Vantage calls on the tickers it already holds. */
  test('fills a held ticker without calling the provider', () => {
    const state = { inFlight: false, round: 0, lastFetchMs: 0, lastAsOf: '' };
    const asked: string[] = [];
    const sendStocks = vi.fn();
    const deps = {
      fetchQuote: (symbol: string, done: (quote: StockQuote) => void) => { asked.push(symbol); done(good(symbol)); },
      sendStocks, now: () => 0, timeoutMs: 30000,
      reuse: (symbol: string) => (symbol === 'A' ? good('A') : null),
    };

    runStockRound(state, ['A', 'B'], true, deps);

    expect([asked, sendStocks.mock.calls[0][0].map((quote: StockQuote) => quote.symbol)]).toEqual([['B'], ['A', 'B']]);
  });

  /** A round refused for a rate limit has to leave its wait behind, or Yahoo is asked again on the next minute's poll. */
  test('leaves the wait a rate limit sets', () => {
    const state = { inFlight: false, round: 0, lastFetchMs: 0, lastAsOf: '', retryAtMs: 0, backoffMs: 0 };
    const limited: StockQuote = { symbol: '', price: 0, change: 0, changePercent: 0, asOf: '', ok: false, status: 'RATE LIMIT' };
    const deps = { fetchQuote: (_symbol: string, done: (quote: StockQuote) => void) => done(limited), sendStocks: vi.fn(), now: () => 1000, timeoutMs: 30000, provider: 'yahoo' };

    runStockRound(state, ['AAPL'], false, deps);

    expect([state.retryAtMs, state.backoffMs]).toEqual([1000 + 15 * 60 * 1000, 15 * 60 * 1000]);
  });

  /** A spaced call whose turn comes after a forced round took over must not go out, or the old list spends a call. */
  test('drops a spaced call once the round is taken over', () => {
    const state = { inFlight: false, round: 0, lastFetchMs: 0, lastAsOf: '' };
    const asked: string[] = [];
    const deps = {
      fetchQuote: (symbol: string, done: (quote: StockQuote) => void) => { asked.push(symbol); done(good(symbol)); },
      sendStocks: vi.fn(), now: () => 0, timeoutMs: 30000, spacingMs: 1100,
    };

    runStockRound(state, ['A', 'B'], false, deps);
    runStockRound(state, ['C'], true, deps);
    vi.advanceTimersByTime(5000);

    expect(asked).toEqual(['A', 'C']);
  });

  /** A blip during a rate limit's wait says nothing about the limit, and clearing the wait sent polls straight back into it. */
  test('leaves a rate limit wait alone after a round nothing answered', () => {
    const state = { inFlight: false, round: 0, lastFetchMs: 0, lastAsOf: '', retryAtMs: 9999999, backoffMs: 7200000 };
    const netError: StockQuote = { symbol: '', price: 0, change: 0, changePercent: 0, asOf: '', ok: false, status: 'NET ERROR' };
    const deps = { fetchQuote: (_symbol: string, done: (quote: StockQuote) => void) => done(netError), sendStocks: vi.fn(), now: () => 1000, timeoutMs: 30000, provider: 'yahoo' };

    runStockRound(state, ['AAPL'], true, deps);

    expect([state.retryAtMs, state.backoffMs]).toEqual([9999999, 7200000]);
  });

  /** A save that only reordered held tickers spent nothing, and moving the time cut that evening's tries for the close. */
  test('leaves the fetch time alone when every ticker was reused', () => {
    const state = { inFlight: false, round: 0, lastFetchMs: 77, lastAsOf: '' };
    const deps = { fetchQuote: vi.fn(), sendStocks: vi.fn(), now: () => 1000, timeoutMs: 30000, reuse: (symbol: string) => good(symbol) };

    runStockRound(state, ['A', 'B'], true, deps);

    expect([state.lastFetchMs, state.lastAsOf]).toEqual([77, '2026-11-10']);
  });

  /**
   * Three held closes beside one call lost to the network read as a good round, and the day moved to
   * today. The lost ticker then showed yesterday's close until the next evening. Now neither the time
   * nor the day moves, so the next ask tries the lost ticker again.
   */
  test('counts a lost call beside held quotes as a blip that keeps the day', () => {
    const state = { inFlight: false, round: 0, lastFetchMs: 0, lastAsOf: '2026-11-09', retryAtMs: 0, backoffMs: 0, shortRetries: 0 };
    const netError: StockQuote = { symbol: '', price: 0, change: 0, changePercent: 0, asOf: '', ok: false, status: 'NET ERROR' };
    const deps = {
      fetchQuote: (_symbol: string, done: (quote: StockQuote) => void) => done(netError),
      sendStocks: vi.fn(), now: () => 1000, timeoutMs: 30000, provider: 'alphavantage',
      reuse: (symbol: string) => (symbol === 'D' ? null : good(symbol)),
    };

    runStockRound(state, ['A', 'B', 'C', 'D'], false, deps);

    expect([state.lastFetchMs, state.lastAsOf]).toEqual([0, '2026-11-09']);
  });

  /** A phone clock that stepped back an hour made the first call wait an hour, and every ask meanwhile was dropped. */
  test('holds the first spaced call no longer than one gap', () => {
    const state = { inFlight: false, round: 0, lastFetchMs: 0, lastAsOf: '' };
    const asked: string[] = [];
    const deps = { fetchQuote: (symbol: string) => asked.push(symbol), sendStocks: vi.fn(), now: () => 0, timeoutMs: 30000, spacingMs: 1100, firstDelayMs: 60 * 60 * 1000 };

    runStockRound(state, ['A'], false, deps);
    vi.advanceTimersByTime(1100);

    expect(asked).toEqual(['A']);
  });


  /**
   * A 5xx or a broken answer reached the provider and was counted, but read as never answered, so
   * every poll spent another call. Twelve Data's 800 a day went in 200 minutes of a one minute poll.
   */
  test('waits 15 minutes, doubling, after a counted call that gave nothing usable', () => {
    const state = { inFlight: false, round: 0, lastFetchMs: 0, lastAsOf: '', retryAtMs: 0, backoffMs: 0 };
    const broken: StockQuote = { symbol: '', price: 0, change: 0, changePercent: 0, asOf: '', ok: false, status: 'NET ERROR', spent: true };
    const deps = { fetchQuote: (_symbol: string, done: (quote: StockQuote) => void) => done(broken), sendStocks: vi.fn(), now: () => 1000, timeoutMs: 30000, provider: 'twelvedata' };
    const waits: number[] = [];

    runStockRound(state, ['AAPL'], false, deps);
    waits.push(state.retryAtMs - 1000);
    runStockRound(state, ['AAPL'], false, deps);
    waits.push(state.retryAtMs - 1000);

    const result = waits;

    expect(result).toEqual([15 * 60 * 1000, 30 * 60 * 1000]);
  });

  /**
   * One ticker answering 500 doubled the wait for the whole list, so the three good tickers refreshed
   * every 2 hours rather than on the 15 minute floor.
   */
  test('sets no doubling wait when good quotes came back beside a broken one', () => {
    const state = { inFlight: false, round: 0, lastFetchMs: 0, lastAsOf: '', retryAtMs: 0, backoffMs: 0 };
    const broken: StockQuote = { symbol: '', price: 0, change: 0, changePercent: 0, asOf: '', ok: false, status: 'NET ERROR', spent: true };
    const deps = {
      fetchQuote: (symbol: string, done: (quote: StockQuote) => void) => done(symbol === 'D' ? broken : good(symbol)),
      sendStocks: vi.fn(), now: () => 1000, timeoutMs: 30000, provider: 'twelvedata',
    };

    runStockRound(state, ['A', 'B', 'C', 'D'], false, deps);

    expect([state.retryAtMs, state.backoffMs, state.lastFetchMs]).toEqual([0, 0, 1000]);
  });
});
