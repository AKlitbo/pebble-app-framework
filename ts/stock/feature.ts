/**
 * The stock watchlist, as a feature a face opts into.
 *
 * Fetches a quote for each configured symbol through the chosen provider, packs the strip and sends it
 * to the watch. The provider's quota gate and the strip kept for when it is shut both outlive a
 * restart, since PebbleKit JS is killed whenever the phone likes. A face without the STOCK_STRIP key
 * gets nothing from it, even when it opts in.
 */
import stock from './stock';
import schedule from './schedule';
import stockCache from './cache';
import stockUtil from './util';
import type { StockQuote } from './util';
import wire from '../pkjs/wire';
import { createDedupedSender } from '../pkjs/send-queue';
import { request } from '../pkjs/request';
import { getConfig, readValue, watchSettings } from '../pkjs/settings-store';
import type { Feature } from '../pkjs/feature';
import { askShouldFetch, createAsks, refetchAfterSave, slowTickShouldFetch } from '../pkjs/asks';

/** Fetch state carried across stock rounds, mutated in place by runStockRound. */
export interface StockState {
  inFlight: boolean;
  round: number;
  lastFetchMs: number;
  lastAsOf: string;
}

/** The helpers runStockRound needs, passed in so the specs can swap them. */
export interface StockDeps {
  fetchQuote: (symbol: string, onQuote: (result: StockQuote) => void) => void;
  sendStocks: (results: StockQuote[]) => void;
  now: () => number;
  timeoutMs: number;
}

/** The stock settings that mean a refetch is worth it after the config closes. */
export const STOCK_KEYS = ['STOCK_PROVIDER', 'STOCK_API_KEY', 'STOCK_SYMBOLS'];

// a ticker is upper letters and digits plus the punctuation the providers use, up to 15 long.
// that covers 7203.T and 0700.HK, ^GSPC, EURUSD=X, BTC/USD, and BINANCE:BTCUSDT. the lookahead
// wants at least one letter or digit, so a punctuation-only entry (a "." or "-") can't burn a
// provider call on a bogus symbol. the watch shows the first 11 characters of a longer one
const STOCK_SYMBOL_RE = /^(?=.*[A-Z0-9])[A-Z0-9.^=/:_-]{1,15}$/;

// backstop for a stock round whose last quote never calls back: without it the in-flight
// flag would stay stuck and block every future fetch. set above the 15s per-request timeout
// so normal timeouts resolve on their own first
const STOCK_ROUND_TIMEOUT_MS = 30 * 1000;

/**
 * Splits the comma list of tickers into clean uppercase symbols. A junk or
 * over-long entry is dropped, and the list is capped at the strip size.
 *
 * @param raw The comma-separated symbols as saved in Clay, or anything else that landed there.
 * @return The cleaned, capped list of symbols.
 */
export function parseSymbols(raw: unknown): string[] {
  return String(raw || '')
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => STOCK_SYMBOL_RE.test(symbol))
    .slice(0, wire.STOCK_MAX_SLOTS);
}

// the statuses a quote carries when the provider was never reached, so no call was spent
const UNANSWERED = ['ERR', 'NET ERROR'];

/**
 * Runs one stock-fetch round: fires a quote per symbol, collects them in display
 * order, and sends the packed strip once the last lands.
 *
 * Built so an unfinished fetch can never get stuck and block every fetch after it. A
 * symbol that throws right away counts as a failed quote, a watchdog force-closes a
 * round whose callback never arrives, and a forced round takes over from one that is
 * still running so the old round's late replies can't reopen it or send twice.
 *
 * @param state The fetch state to read and update in place.
 * @param symbols The symbols to fetch, in display order.
 * @param force Whether to start a new round even when one is already in flight.
 * @param deps The fetch, send, clock, and timeout helpers to use.
 */
export function runStockRound(state: StockState, symbols: string[], force: boolean, deps: StockDeps): void {
  // nothing to fetch: never start a round or an empty list would leave the in-flight
  // flag stuck until the watchdog since no per-symbol callback ever fires
  if (!symbols.length) {
    return;
  }

  // a round already running would spend the quota twice if a second trigger (the ready
  // event plus the watch's own STOCK_REQUEST) landed before it finished. a forced fetch (a
  // settings change that may have swapped symbols) takes over instead of being dropped
  if (state.inFlight && !force) {
    return;
  }

  // every slot starts as a failed quote so the array is never sparse. when the watchdog closes a
  // round early the symbols that never answered still pack as one record each, so the count the
  // watch reads always matches the records behind it
  const results: StockQuote[] = symbols.map(() => stockUtil.status('ERR'));
  let pending = symbols.length;
  const round = ++state.round; // a new round number tells any round still running to stop
  state.inFlight = true;

  // closes the round exactly once: bumping the round number again shuts out a late watchdog
  // or a straggling reply then records when the fetch finished and sends whatever quotes arrived
  function finishRound() {
    if (round !== state.round) {
      return; // a newer forced round took over, or this one already closed
    }
    state.round++;
    clearTimeout(watchdog);
    state.inFlight = false;

    // a good quote records when the fetch finished, and the trading day so Alpha Vantage knows once
    // it holds today. a round where the provider answered with nothing good, such as NO SYMBOL for a
    // mistyped ticker or RATE LIMIT, still records the time, since every one of those answers spent
    // a call on a metered plan. only a round the provider never answered, a network blip, goes
    // unrecorded, so it retries on the next poll
    const firstGood = results.find((quote) => quote && quote.ok);
    const answered = results.some((quote) => quote && (quote.ok || !UNANSWERED.includes(quote.status || '')));
    if (firstGood) {
      state.lastFetchMs = deps.now();
      state.lastAsOf = firstGood.asOf || '';
    } else if (answered) {
      state.lastFetchMs = deps.now();
    }
    deps.sendStocks(results);
  }

  // if a provider never calls back (a hung request the xhr timeout somehow misses) the
  // in-flight flag would stay stuck and block every future fetch so force the round closed
  // after a cap. packing tolerates the missing slots as failed quotes
  const watchdog = setTimeout(finishRound, deps.timeoutMs);

  symbols.forEach((symbol, index) => {
    function onQuote(result: StockQuote) {
      if (round !== state.round) {
        return; // taken over or already closed
      }
      results[index] = result;
      if (--pending === 0) {
        finishRound();
      }
    }

    // a single symbol that throws right away (say a bad URL from odd input) must not
    // strand the whole round with pending stuck above zero so treat it as a failed quote
    // and let the other symbols finish
    try {
      deps.fetchQuote(symbol, onQuote);
    } catch (err) {
      onQuote(stockUtil.status('ERR'));
    }
  });
}

/**
 * Starts the stock feature for a face.
 *
 * @param context What the app shares: the face's message keys, its config defaults, the send queue,
 *   and the refetch delay after a settings save.
 * @return The hooks the app calls on ready, on a watch message, on each refresh tick, and around the
 *   settings page.
 */
const stocks: Feature = ({ messageKeys, defaults, queueSend, refetchDelayMs }) => {
  const stockSettings = watchSettings(STOCK_KEYS);

  // fetch state carried across stock rounds and mutated in place by runStockRound. the two
  // throttle stamps come back off the phone because this JS is killed and restarted at will and
  // a gate that forgets when it last fetched is no gate at all
  const savedStock = stockCache.load(localStorage);
  const stockState: StockState = { inFlight: false, round: 0, lastFetchMs: savedStock.lastFetchMs, lastAsOf: savedStock.lastAsOf };

  // the last strip worth showing kept across restarts so a watch with an empty store still has
  // something while the gate is shut. this is not the dedupe cache below and must never be one:
  // it says what the watch could show not what it already has
  let savedStrip: number[] | null = savedStock.strip;

  // the strip the watch holds, so an unchanged refresh skips the redundant BLE wake. forgotten on
  // ready and on a watch-initiated request so the watch always gets a fresh answer
  const sender = createDedupedSender(queueSend, 'Stocks');

  // what the watch was last handed, so a held fetch can push it again rather than leave it blank
  let lastStockBytes: number[] | null = null;

  // who asked lately, so a slow tick or a watch ask does not fetch what another just did
  const asks = createAsks();

  /** Sends already-packed watchlist bytes to the watch, unless the watch holds them already. */
  function pushStockBytes(bytes: number[] | null) {
    if (!bytes) {
      return;
    }

    lastStockBytes = bytes;
    sender.push({ [messageKeys.STOCK_STRIP]: bytes });
  }

  /** Sends the packed watchlist strip to the watch, and keeps it for the next run. */
  function sendStocks(results: StockQuote[]) {
    const bytes = wire.packStockStrip(results);
    pushStockBytes(bytes);

    // a round where every quote failed would cache a strip of ERRs and show them tomorrow, so
    // only a real reading is worth keeping. runStockRound stamps the throttle from the same first
    // good quote just before it calls this, so the stamps below are already the new ones
    if (bytes && results.some((quote) => quote && quote.ok)) {
      savedStrip = bytes;
      stockCache.save(localStorage, {
        lastAsOf: stockState.lastAsOf,
        lastFetchMs: stockState.lastFetchMs,
        strip: bytes,
      });
    }
  }

  /**
   * Forgets the strip kept for a shut quota gate and the throttle stamps that go with it.
   *
   * Both describe quotes for the old symbols, provider, or key. Keeping them meant a forced fetch
   * that failed after a symbol change left the old strip to go back to the watch on the next held
   * request, and the stamps holding the gate shut on quotes nobody asked for any more.
   */
  function forgetStrip() {
    savedStrip = null;
    stockState.lastFetchMs = 0;
    stockState.lastAsOf = '';
    stockCache.save(localStorage, { lastAsOf: '', lastFetchMs: 0, strip: null });
  }

  /**
   * Tells the watch its watchlist is empty, and forgets the strip kept for a shut quota gate.
   *
   * Both halves matter. The watch keeps its list in flash until it is told otherwise, and a kept
   * strip would go back to the watch the next time a fetch was held back.
   */
  function clearStocks() {
    if (savedStrip) {
      savedStrip = null;
      stockCache.save(localStorage, { lastAsOf: stockState.lastAsOf, lastFetchMs: stockState.lastFetchMs, strip: null });
    }
    pushStockBytes(wire.packStockStrip([]));
  }

  /**
   * Fetches a quote for each configured symbol, then forwards the packed strip
   * to the watch. Skipped entirely for faces that do not show stocks.
   *
   * Returns true when a strip is on its way, which includes the empty one sent when no symbols
   * are set. Returns false when the face shows no stocks or the provider's quota gate held the
   * fetch back, so the caller knows to push the strip it already has.
   */
  function getStocks(force?: boolean): boolean {
    // a face that does not declare the strip key never shows stocks so skip the fetch
    if (messageKeys.STOCK_STRIP === undefined) {
      return false;
    }

    const config = getConfig();
    const provider = String(readValue(config.STOCK_PROVIDER, defaults.STOCK_PROVIDER || 'finnhub'));
    const key = String(readValue(config.STOCK_API_KEY, defaults.STOCK_API_KEY || '')).trim().slice(0, 64);
    const symbols = parseSymbols(readValue(config.STOCK_SYMBOLS, defaults.STOCK_SYMBOLS || ''));

    if (!symbols.length) {
      clearStocks();
      return true;
    }

    // keep the last strip when a poll lands before the provider's data could have moved
    if (schedule.shouldThrottleStockFetch(provider, force || false, stockState.lastFetchMs, stockState.lastAsOf, Date.now())) {
      return false;
    }

    // fetch every symbol and keep the results in the configured order so the watchlist
    // rows stay put. runStockRound stops a fetch from spending the quota twice and recovers
    // on its own if a round gets stuck
    runStockRound(stockState, symbols, Boolean(force), {
      fetchQuote: (symbol, onQuote) => stock.fetchQuote({ provider, key, symbol }, request, onQuote),
      sendStocks: sendStocks,
      now: Date.now,
      timeoutMs: STOCK_ROUND_TIMEOUT_MS,
    });
    return true;
  }

  return {
    requests: ['STOCK_REQUEST'],

    ready() {
      // clear the dedupe cache so a watch that just rebooted with an empty store gets a fresh send
      sender.forget();

      if (!askShouldFetch(asks)) {
        return;
      }

      // the gate outlives a restart so it can hold on the very first fetch of a run. a watch that
      // just rebooted with an empty store would sit blank till the gate opened, which for Alpha
      // Vantage is tomorrow, so hand it the strip off the phone instead
      if (!getStocks()) {
        pushStockBytes(savedStrip);
      }
    },

    message(payload) {
      if (!payload[messageKeys.STOCK_REQUEST]) {
        return;
      }

      // the watch drives this on every interval it asks for, so it goes through the provider
      // quota gate like any other routine fetch. only a settings change forces past it
      const held = lastStockBytes;
      sender.forget();

      // a save's forced refetch is about to answer, so this ask waits for it
      if (!askShouldFetch(asks)) {
        return;
      }

      if (!getStocks()) {
        // the gate held the fetch back, so the watch gets the last strip worth showing rather than
        // sitting blank until the gate opens. the phone only saves a strip with a real quote in it,
        // so its copy goes first and the one last pushed stands in before anything is saved
        pushStockBytes(savedStrip || held);
      }
    },

    // quotes move slowly, so stocks only refresh on the slow ticks nothing else has covered
    refresh(slow) {
      if (slow && slowTickShouldFetch(asks)) {
        getStocks();
      }
    },

    configOpened() {
      stockSettings.opened();
    },

    configSaved() {
      // forced, since a changed provider, key or symbol list is worth a fetch past the quota gate
      if (stockSettings.changed()) {
        forgetStrip();
        refetchAfterSave(asks, refetchDelayMs, () => getStocks(true));
      }
    },
  };
};

export default stocks;
