/**
 * The stock watchlist, as a feature a face opts into.
 *
 * Fetches a quote for each configured symbol through the chosen provider, packs the strip and sends it
 * to the watch. The provider's quota gate and the strip kept for when it is shut both outlive a
 * restart, since PebbleKit JS is killed whenever the phone likes. A face without the STOCK_STRIP key
 * gets nothing from it, even when it opts in.
 *
 * A face built with `PLUGIN_STOCKS` can also take its quotes from a Pebble app plugin serving
 * `finance/stock`. The saved `STOCK_PROVIDER` picks the mode, and `plugin` subscribes rather than
 * running provider rounds, so it spends no quota. Each update goes through the same deduped sender a
 * round uses. The page hook adds the plugin to the Data Source select, and the seeded hook checks a
 * plugin choice the watch kept through a reset. All of that lives behind plugin-sources/index, so a
 * face built without the define reads null there, carries none of it, and fetches exactly as it
 * always has.
 */
import stock from './stock';
import schedule from './schedule';
import stockCache from './cache';
import stockUtil from './util';
import { parseSymbols as parseSymbolList } from './symbols';
import { roundStamps, UNANSWERED } from './quotes';
import { ONE_A_SECOND_GAP_MS, onPaidPlan } from './limits';
import { allowance, COUNTED, keepSent, keyPrint, loadLedger, saveLedger } from './ledger';
import type { StockQuote } from './util';
import wire from '../pkjs/wire';
import { createDedupedSender } from '../pkjs/send-queue';
import { request } from '../pkjs/request';
import { getConfig, readBool, readText, readValue, watchSettings } from '../pkjs/settings-store';
import { STOCK_FALLBACK } from '../pkjs/providers';
import type { Feature } from '../pkjs/feature';
import { askShouldFetch, createAsks, refetchAfterSave, slowTickShouldFetch } from '../pkjs/asks';
import { finishRound, roundIsCurrent, shutOutRound, startRound } from '../pkjs/round';
import type { RoundState } from '../pkjs/round';
import { stockPlugins } from '../plugin-sources/index';

/** Fetch state carried across stock rounds, mutated in place by runStockRound. */
export interface StockState extends RoundState {
  lastFetchMs: number;
  lastAsOf: string;
  /** When a rate limit said to try again, as epoch milliseconds, or 0 for none. */
  retryAtMs?: number;
  /** The wait the last rate limit left, which the next one doubles. */
  backoffMs?: number;
}

/** The helpers runStockRound needs, passed in so the specs can swap them. */
export interface StockDeps {
  fetchQuote: (symbol: string, onQuote: (result: StockQuote) => void) => void;
  sendStocks: (results: StockQuote[]) => void;
  now: () => number;
  timeoutMs: number;
  /** The provider, so a rate limit sets the right wait. Left out, a rate limit sets none. */
  provider?: string;
  /** The gap between one call answering and the next starting, for a provider that refuses calls close together. Spaced calls go one at a time. */
  spacingMs?: number;
  /** How long to wait before the first call, so it keeps the gap from a call in the round before. */
  firstDelayMs?: number;
  /** A quote already held for a ticker, which then fills its slot with no call. */
  reuse?: (symbol: string) => StockQuote | null;
  /** True on a paid plan, where Alpha Vantage backs off after a limit as Yahoo does. */
  paid?: boolean;
  /**
   * True when the next round asks again only for tickers it holds no current quote for, as Alpha
   * Vantage does. A ticker lost to the network then leaves the time alone, so the next ask tries it
   * again rather than waiting out the floor, and spends a call on it alone.
   */
  retriesLost?: boolean;
}

/** The stock settings that mean a refetch is worth it after the config closes. */
export const STOCK_KEYS = ['STOCK_PROVIDER', 'STOCK_API_KEY', 'STOCK_SYMBOLS', 'STOCK_PAID_PLAN'];

// backstop for a stock round whose last quote never calls back: without it the in-flight
// flag would stay stuck and block every future fetch. set above the 15s per-request timeout
// so normal timeouts resolve on their own first
const STOCK_ROUND_TIMEOUT_MS = 30 * 1000;

/**
 * Splits the comma list of tickers into clean uppercase symbols, capped at the strip size.
 *
 * @param raw The comma-separated symbols as saved in Clay, or anything else that landed there.
 * @return The cleaned, capped list of symbols.
 */
export function parseSymbols(raw: unknown): string[] {
  return parseSymbolList(raw, wire.STOCK_SLOTS_MAX);
}

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
  const started = startRound(state, force);

  if (started === null) {
    return;
  }

  const round = started;

  // every slot starts as a failed quote so the array is never sparse. when the watchdog closes a
  // round early the symbols that never answered still pack as one record each, so the count the
  // watch reads always matches the records behind it
  const results: StockQuote[] = symbols.map(() => stockUtil.status('ERR'));
  let pending = symbols.length;

  // a ticker with a quote already held fills its slot and spends nothing
  const reused = symbols.map((symbol) => (deps.reuse ? deps.reuse(symbol) : null));
  const toFetch = symbols.map((_symbol, index) => index).filter((index) => !reused[index]);
  const spacingMs = deps.spacingMs || 0;
  // never more than one gap, so a phone clock that stepped back cannot hold the round for an hour
  const firstDelayMs = Math.min(spacingMs, Math.max(0, deps.firstDelayMs || 0));

  // closes the round exactly once. finishRound shuts out a late watchdog or a straggling reply,
  // then this records when the fetch finished and sends whatever quotes arrived
  function closeRound() {
    if (!finishRound(state, round)) {
      return; // a newer forced round took over, or this one already closed
    }

    clearTimeout(watchdog);

    const now = deps.now();

    // roundStamps decides which stamps move. whether the provider answered is read from the calls
    // alone, so held quotes beside a call lost to the network still count as a blip. a round that
    // only reused held quotes spent nothing, so it moves the trading day and not the time
    const stamps = roundStamps(results, now);
    const answered = toFetch.length > 0 && roundStamps(toFetch.map((index) => results[index]), now).lastFetchMs !== undefined;
    const lostOne = toFetch.some((index) => !results[index].ok && UNANSWERED.includes(results[index].status || ''));

    if (answered && !(deps.retriesLost && lostOne)) {
      state.lastFetchMs = now;
    }

    if (stamps.lastAsOf !== undefined) {
      state.lastAsOf = stamps.lastAsOf;
    }

    // roundWait in schedule.ts sets the wait the round's answers call for, the same rule a plugin
    // app keeps
    if (deps.provider !== undefined) {
      const wait = schedule.roundWait(deps.provider, toFetch.map((index) => results[index]), answered, Boolean(deps.retriesLost && lostOne), state.backoffMs || 0, now, Boolean(deps.paid));

      if (wait) {
        state.retryAtMs = wait.retryAtMs;
        state.backoffMs = wait.backoffMs;
      }
    }

    deps.sendStocks(results);
  }

  // if a provider never calls back (a hung request the xhr timeout somehow misses) the
  // in-flight flag would stay stuck and block every future fetch so force the round closed
  // after a cap. packing tolerates the missing slots as failed quotes. spaced calls go one after
  // another, so the cap gives each its full time and its gap
  const watchdogMs = spacingMs > 0 ? firstDelayMs + (deps.timeoutMs + spacingMs) * Math.max(1, toFetch.length) : deps.timeoutMs;
  const watchdog = setTimeout(closeRound, watchdogMs);

  /** Takes a ticker's answer into its slot, and closes the round once the last is in. */
  function answer(index: number, result: StockQuote) {
    if (!roundIsCurrent(state, round)) {
      return; // taken over or already closed
    }

    results[index] = result;

    if (--pending === 0) {
      closeRound();
    }
  }

  /**
   * Asks for one ticker. A symbol that throws right away, say a bad URL from odd input, counts as
   * a failed quote, so pending still reaches zero and the other symbols finish. Every provider
   * returns straight after it calls back, so a throw only ever comes before an answer.
   */
  function ask(index: number, then: () => void) {
    if (!roundIsCurrent(state, round)) {
      return; // taken over or closed before this call's turn came up
    }

    let answered = false;

    function onQuote(result: StockQuote) {
      if (answered) {
        return;
      }

      answered = true;
      answer(index, result);
      then();
    }

    try {
      deps.fetchQuote(symbols[index], onQuote);
    } catch (err) {
      onQuote(stockUtil.status('ERR'));
    }
  }

  reused.forEach((quote, index) => {
    if (quote) {
      answer(index, quote);
    }
  });

  if (!toFetch.length) {
    return;
  }

  if (spacingMs <= 0) {
    toFetch.forEach((index) => ask(index, () => {}));
    return;
  }

  // Alpha Vantage's free key refuses a call within about a second of the last one reaching it, and
  // four at once came back as one quote and three RATE LIMITs. each call waits for the one before
  // it to answer and then for the gap, so a slow answer can never bunch two calls together
  function askFrom(position: number) {
    if (position >= toFetch.length) {
      return;
    }

    ask(toFetch[position], () => {
      setTimeout(() => askFrom(position + 1), spacingMs);
    });
  }

  if (firstDelayMs > 0) {
    setTimeout(() => askFrom(0), firstDelayMs);
  } else {
    askFrom(0);
  }
}

// a held Alpha Vantage quote fetched this recently is reused whatever its day. well under the two
// hours between the evening tries, so each try still asks again for a close that was not out yet
const REUSE_RECENT_MS = 20 * 60 * 1000;

// a slot whose ticker got no answer worth showing, so it keeps the last good quote for its ticker
const KEEPS_HELD = [...UNANSWERED, 'TIMEOUT', 'RATE LIMIT'];

/**
 * Starts the stock feature for a face.
 *
 * @param context What the app shares: the face's message keys, its config defaults, the send queue,
 *   the refetch delay after a settings save, and the providers the face lists.
 * @return The hooks the app calls on ready, on a watch message, on each refresh tick, and around the
 *   settings page.
 */
const stocks: Feature = (context) => {
  const { messageKeys, defaults, queueSend, refetchDelayMs } = context;
  const stockSettings = watchSettings(STOCK_KEYS, defaults);

  /**
   * The provider some settings pick, lowercased once, since the provider lookup ignores case and the
   * quota gate has to agree with it.
   *
   * A face built without PLUGIN_STOCKS has no plugin to read, so a plugin choice still saved from a
   * build with it reads as the face's default. Taken as it is, the lookup would fall back to Finnhub
   * whatever the face's default, and the cache and the ledger would keep its stamps under plugin.
   */
  function providerIn(config: Record<string, unknown>): string {
    const fallback = String(defaults.STOCK_PROVIDER || STOCK_FALLBACK).toLowerCase();
    const picked = String(readValue(config.STOCK_PROVIDER, fallback)).toLowerCase();

    return picked === 'plugin' && !stockPlugins ? fallback : picked;
  }

  // fetch state carried across stock rounds and mutated in place by runStockRound. the two
  // throttle stamps come back off the phone because this JS is killed and restarted at will and
  // a gate that forgets when it last fetched is no gate at all. a cache another provider saved
  // reads as empty, since its stamps say nothing about this provider's quota
  const savedStock = stockCache.load(localStorage, providerIn(getConfig()));
  const stockState: StockState = {
    inFlight: false,
    round: 0,
    lastFetchMs: savedStock.lastFetchMs,
    lastAsOf: savedStock.lastAsOf,
    retryAtMs: savedStock.retryAtMs || 0,
    backoffMs: savedStock.backoffMs || 0,
  };

  // the last good quote for each ticker, so Alpha Vantage asks only for tickers without a current
  // one, and a slot refused for a rate limit can keep its last price
  let heldQuotes: StockQuote[] = savedStock.quotes || [];

  // the key the held quotes were fetched with, so a changed key is tried on a real call before held
  // quotes stand in. it starts as the saved key. a key changes through a save or a restore, and both
  // run while this code does, apart from a restart in the moment between a save and its refetch, which
  // leaves a new key untried until a ticker next needs a call
  let lastKey: string | null = readText(getConfig().STOCK_API_KEY, String(defaults.STOCK_API_KEY || '')).trim().slice(0, 64);

  // when Alpha Vantage last had a call out or answered, so the next round's first call keeps the gap too
  let lastSpacedMs = 0;

  // when each call to a counted provider went out, for the key in use, read back off the phone so a
  // restart cannot forget what was spent. see ledger.ts
  let ledger = { provider: '', print: '', sentMs: [] as number[] };

  // the one timer that brings a short wait's retry, or a save the ledger held, back on time, and
  // whether it brings it back as a save
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryForced = false;

  // the time of the last fetch before a save forgot it. a save whose tickers are all held spends
  // nothing, so it puts this back, or the gate would read the list as never fetched and ask again
  let fetchBeforeForget = 0;

  // the tickers a round left out for want of room, so the round that comes back asks for those alone
  // and reuses the quotes just fetched for the rest
  let leftOut = new Set<string>();

  // the wait the ledger last set on the gate, so working it out again after the round can replace it
  // without touching a wait a rate limit set
  let ledgerWaitMs = 0;

  // whose quotes the stamps and the kept strip are, checked on every round
  let cacheProvider = savedStock.provider;

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

  /** Writes the stamps, the wait, the strip, and the held quotes to the phone, under the provider they belong to. */
  function saveCache(provider: string) {
    stockCache.save(localStorage, {
      lastAsOf: stockState.lastAsOf,
      lastFetchMs: stockState.lastFetchMs,
      strip: savedStrip,
      provider,
      retryAtMs: stockState.retryAtMs || 0,
      backoffMs: stockState.backoffMs || 0,
      quotes: heldQuotes,
    });
  }

  /** The ledger for a provider and key, read back off the phone when either changed, with stamps over a day old let go. */
  function ledgerFor(provider: string, key: string, now: number) {
    const print = keyPrint(key);

    if (ledger.provider !== provider || ledger.print !== print) {
      const saved = loadLedger(localStorage, provider, print, now);

      ledger = { provider, print, sentMs: saved };

      // loadLedger clamps a stamp from a clock that ran ahead, and saving it keeps the clamp, or each
      // launch would clamp it again to its own later now
      saveLedgerNow(now);
    } else {
      ledger.sentMs = keepSent(ledger.sentMs, now);
    }

    return ledger;
  }

  /** Writes the ledger in use to the phone. */
  function saveLedgerNow(now = Date.now()) {
    saveLedger(localStorage, ledger.provider, { keyPrint: ledger.print, sentMs: ledger.sentMs }, now);
  }

  /**
   * Brings a fetch back at a moment, replacing any retry already set. A routine retry never replaces
   * a save's, or the save would come back as a routine fetch and go through the gate.
   */
  function retryAt(atMs: number, force: boolean) {
    if (retryTimer && retryForced && !force) {
      return;
    }

    if (retryTimer) {
      clearTimeout(retryTimer);
    }

    retryForced = force;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      retryForced = false;
      getStocks(force);
    }, Math.max(0, atMs - Date.now()));
  }

  /** Sends already-packed watchlist bytes to the watch, unless the watch holds them already. */
  function pushStockBytes(bytes: number[] | null) {
    // a face that lists the feature but not the strip key has nowhere to put a strip, and a send
    // under an undefined key would hold the outbox through its retries at cold boot
    if (!bytes || messageKeys.STOCK_STRIP === undefined) {
      return;
    }

    lastStockBytes = bytes;
    sender.push({ [messageKeys.STOCK_STRIP]: bytes });
  }

  /** Sends the packed watchlist strip to the watch, and keeps it for the next run under the provider that fetched it. */
  function sendStocks(answers: StockQuote[], provider: string, symbols: string[], forced: boolean) {
    // a slot refused for a rate limit, lost to the network, or timed out keeps the last good quote
    // for its ticker, so a round that is only partly refused does not put RATE LIMIT in the kept strip
    const results = answers.map((quote, index) => {
      if (quote && !quote.ok && KEEPS_HELD.includes(quote.status || '')) {
        return heldQuotes.find((held) => held.symbol === symbols[index]) || quote;
      }

      return quote;
    });
    const bytes = wire.packStockStrip(results);

    // a round the provider never answered, a network blip, says nothing about the quotes, so the
    // watch keeps the last good strip rather than NET ERROR in every slot. a round refused for a
    // rate limit is the same, since the wait it set brings a real answer soon. an answer the wearer
    // has to act on, such as INVALID KEY, still goes out, and so do errors when nothing good is kept
    const unanswered = results.every((quote) => !quote || (!quote.ok && KEEPS_HELD.includes(quote.status || '')));

    pushStockBytes(unanswered && savedStrip ? savedStrip : bytes);

    // a good quote replaces the one held for its ticker, and a ticker no longer listed is let go
    heldQuotes = symbols.map((symbol, index) => {
      const quote = answers[index];

      return quote && quote.ok ? { ...quote, symbol } : heldQuotes.find((held) => held.symbol === symbol);
    }).filter((quote): quote is StockQuote => Boolean(quote));

    // a round where every quote failed would cache a strip of ERRs and show them tomorrow, so
    // only a real reading is kept as the strip. the stamps are kept whenever runStockRound moved
    // them, which it does for a provider's answer with nothing good in it too, or a restart would
    // forget that the call was spent and the gate would let the next one through
    if (bytes && results.some((quote) => quote && quote.ok)) {
      savedStrip = bytes;
    }

    // tickers left out for want of room wait for the ledger, worked out again from the stamps as they
    // stand now, so a call lost to the network that took its stamp back off frees its room at once.
    // the round's own close clears a wait it did not set, so this comes after it
    if (leftOut.size && ledger.provider === provider && COUNTED.includes(provider)) {
      const room = allowance(provider, keepSent(ledger.sentMs, Date.now()), leftOut.size, forced, false, Date.now());

      if (ledgerWaitMs && stockState.retryAtMs === ledgerWaitMs) {
        stockState.retryAtMs = room.retryAtMs;
      } else if (room.retryAtMs > (stockState.retryAtMs || 0)) {
        stockState.retryAtMs = room.retryAtMs;
      }

      ledgerWaitMs = room.retryAtMs;
    }

    saveCache(provider);

    // a wait of a minute or so would otherwise last until the watch next polls, which can be 15
    // minutes off, or an hour with the watch out of range
    const waitMs = (stockState.retryAtMs || 0) - Date.now();

    if (stockState.retryAtMs && waitMs > 0 && waitMs <= 2 * 60 * 1000) {
      retryAt(stockState.retryAtMs, forced);
    }
  }

  /**
   * Forgets the strip kept for a shut quota gate and the throttle stamps that go with it.
   *
   * Both describe quotes for the old symbols, provider, or key. So a forced fetch that fails after
   * a change leaves nothing of the old list to push back to the watch, and the gate opens on the new
   * list's own quotes. The quotes held per ticker and a rate limit's wait stay when the provider
   * does, since a ticker's price and the provider's quota are the same whatever else changed.
   */
  function forgetStrip(provider: string) {
    // a round still out for the old list would land in the moment before the forced refetch and put
    // the old strip and stamps back. shutting it out drops its late answers and its own close with them
    shutOutRound(stockState);
    savedStrip = null;
    leftOut = new Set();
    ledgerWaitMs = 0;
    fetchBeforeForget = stockState.lastFetchMs;
    stockState.lastFetchMs = 0;
    stockState.lastAsOf = '';

    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
      retryForced = false;
    }

    // a provider's waits and its ledger both belong to the key, so a new key, or a new provider,
    // starts without the old one's
    const key = readText(getConfig().STOCK_API_KEY, String(defaults.STOCK_API_KEY || '')).trim().slice(0, 64);

    if (provider !== cacheProvider || key !== lastKey) {
      stockState.retryAtMs = 0;
      stockState.backoffMs = 0;
    }

    if (provider !== cacheProvider) {
      heldQuotes = [];
      fetchBeforeForget = 0;
    }

    cacheProvider = provider;
    saveCache(provider);
  }

  /**
   * Tells the watch its watchlist is empty, and forgets the strip kept for a shut quota gate.
   *
   * Both halves matter. The watch keeps its list in flash until it is told otherwise, and a kept
   * strip would go back to the watch the next time a fetch was held back.
   */
  function clearStocks(provider: string) {
    if (savedStrip) {
      savedStrip = null;
      saveCache(provider);
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
    const provider = providerIn(config);

    // the provider can move with no save from the page, as when a settings restore from the watch
    // brings back another one. the stamps and the strip are the old provider's, so they go
    if (provider !== cacheProvider) {
      forgetStrip(provider);
    }

    const key = readText(config.STOCK_API_KEY, String(defaults.STOCK_API_KEY || '')).trim().slice(0, 64);
    const symbols = parseSymbols(readText(config.STOCK_SYMBOLS, String(defaults.STOCK_SYMBOLS || '')));

    if (!symbols.length) {
      clearStocks(provider);
      return true;
    }

    const now = Date.now();

    // a key on a paid plan leaves the free plan's floors, its minute count, and its one a second gap
    // out. the provider's own RATE LIMIT answers still set every wait
    const paid = onPaidPlan(provider, readBool(config.STOCK_PAID_PLAN, false));

    // keep the last strip when a poll lands before the provider's data could have moved, or
    // before a rate limit's wait is up
    if (schedule.shouldThrottleStockFetch(provider, force || false, stockState.lastFetchMs, stockState.lastAsOf, now, stockState.retryAtMs || 0, paid)) {
      return false;
    }

    // Alpha Vantage asks only for tickers without a quote from the newest close it can have, so a
    // save that adds one ticker spends one call, and a try that was refused one ticker asks for that
    // ticker alone. a changed key asks for every ticker, so the new key is tried on a real call.
    // a quote fetched in the last 20 minutes is reused too, so a retry after the burst limit asks
    // only for the tickers it refused even before the day's close is out. a paid plan fetches every
    // ticker on every ask, since its key gets the price through the day
    const tradingDay = provider === 'alphavantage' && !paid && lastKey === key ? schedule.currentTradingDay(now) : '';
    const recent = (quote: StockQuote) => quote.fetchedAtMs !== undefined && now - quote.fetchedAtMs >= 0 && now - quote.fetchedAtMs < REUSE_RECENT_MS;
    const current = (symbol: string) => {
      if (tradingDay) {
        return heldQuotes.find((quote) => quote.symbol === symbol && (quote.asOf >= tradingDay || recent(quote))) || null;
      }

      // a round coming back for tickers the ledger left out reuses what it fetched for the others
      if (leftOut.size && !leftOut.has(symbol) && lastKey === key) {
        return heldQuotes.find((quote) => quote.symbol === symbol && recent(quote)) || null;
      }

      return null;
    };

    // a round already running answers this ask, unless a save takes it over
    if (stockState.inFlight && !force) {
      return true;
    }

    // a wait that has passed is let go before the calls, so a launch stopped partway through cannot
    // leave it to open the gate on the next
    if (stockState.retryAtMs && stockState.retryAtMs <= now) {
      stockState.retryAtMs = 0;
      saveCache(provider);
    }

    // the ledger says how many calls fit inside the free plan now. a routine fetch that fits none is
    // held. a save, or a routine fetch with room for some, asks for what fits, the rest of its slots
    // keep their last price or read RATE LIMIT, and the fetch comes back when there is room for all
    const counted = COUNTED.includes(provider) && !paid;
    const needCall = symbols.filter((symbol) => !current(symbol));
    const room = counted ? allowance(provider, ledgerFor(provider, key, now).sentMs, needCall.length, Boolean(force), paid, now) : { room: needCall.length, retryAtMs: 0 };

    if (room.room < needCall.length) {
      if (!force && room.room === 0) {
        return false;
      }

      // kept as the gate's wait too, so it outlives a restart and comes back past the floors
      leftOut = new Set(needCall.slice(room.room));
      stockState.retryAtMs = Math.max(stockState.retryAtMs || 0, room.retryAtMs);
      ledgerWaitMs = stockState.retryAtMs === room.retryAtMs ? room.retryAtMs : 0;
      saveCache(provider);
      retryAt(room.retryAtMs, Boolean(force));
    }

    if (room.room >= needCall.length) {
      leftOut = new Set();
      ledgerWaitMs = 0;
    }

    if (!needCall.length && fetchBeforeForget) {
      stockState.lastFetchMs = fetchBeforeForget;
    }

    fetchBeforeForget = 0;

    const asked = new Set(needCall.slice(0, room.room));
    const reuse = (symbol: string): StockQuote | null => {
      const held = current(symbol);

      if (held || asked.has(symbol)) {
        return held;
      }

      return heldQuotes.find((quote) => quote.symbol === symbol) || { ...stockUtil.status('Rate Limit'), symbol };
    };

    lastKey = key;

    // fetch every symbol and keep the results in the configured order so the watchlist
    // rows stay put. runStockRound stops a fetch from spending the quota twice and recovers
    // on its own if a round gets stuck
    const spacingMs = provider === 'alphavantage' && !paid ? ONE_A_SECOND_GAP_MS : 0;

    runStockRound(stockState, symbols, Boolean(force), {
      fetchQuote: (symbol, onQuote) => {
        lastSpacedMs = provider === 'alphavantage' ? Date.now() : lastSpacedMs;

        // each call to a counted provider is stamped and saved as its request goes out, so a round
        // the phone kills partway through still counts what it sent, and an answer the provider code
        // gives with no request, such as NO API KEY, counts nothing. a call that never reached the
        // host spent nothing either, so its stamp comes back off
        let stamp = 0;
        let reached = false;

        const stampedRequest: typeof request = (url, callback) => {
          stamp = Date.now();

          if (counted) {
            ledgerFor(provider, key, stamp).sentMs.push(stamp);
            saveLedgerNow(stamp);
          }

          request(url, (err, body) => {
            reached = err !== 'network error';

            if (counted && err === 'network error') {
              const index = ledger.sentMs.indexOf(stamp);

              if (index !== -1) {
                ledger.sentMs.splice(index, 1);
                saveLedgerNow();
              }
            }

            callback(err, body);
          });
        };

        stock.fetchQuote({ provider, key, symbol }, stampedRequest, (quote) => {
          lastSpacedMs = provider === 'alphavantage' ? Date.now() : lastSpacedMs;
          onQuote(quote.ok ? { ...quote, fetchedAtMs: Date.now() } : { ...quote, ...(counted && reached ? { spent: true } : {}) });
        });
      },
      sendStocks: (results) => sendStocks(results, provider, symbols, Boolean(force)),
      now: Date.now,
      timeoutMs: STOCK_ROUND_TIMEOUT_MS,
      provider,
      spacingMs,
      // the last call the ledger saw counts too, so a relaunch while a call was out still keeps the gap
      firstDelayMs: spacingMs ? Math.max(lastSpacedMs, ...(counted ? ledger.sentMs : [])) + spacingMs - now : 0,
      reuse,
      paid,
      retriesLost: Boolean(tradingDay),
    });
    return true;
  }

  // a face built with PLUGIN_STOCKS runs its plugin mode, which runs the rounds above whenever the
  // plugin is not picked. a face that does not declare the strip key has nowhere to show its quotes.
  // a launch with the plugin picked loads the cache under plugin, which reads as empty, so the first
  // save back onto a provider starts with no held quotes and no rate limit wait. that save's refetch
  // goes past the gate anyway, and the ledger that keeps a counted provider inside its free plan is
  // kept apart from the cache, so the cost is one round with no held quotes to reuse
  if (stockPlugins && messageKeys.STOCK_STRIP !== undefined) {
    const stripKey = messageKeys.STOCK_STRIP;

    return stockPlugins.driver(context, {
      // the plugin's strip goes straight to the sender. the strip kept for a shut gate and the one
      // last pushed hold only a round's, so a gate held after a switch back never hands the watch the
      // plugin's quotes
      send: (quotes) => {
        const bytes = wire.packStockStrip(quotes);

        if (bytes) {
          sender.push({ [stripKey]: bytes });
        }
      },
      forget: () => sender.forget(),
      shutOut: () => {
        shutOutRound(stockState);

        // a retry the last round set would fetch over the plugin's strip once its time came
        if (retryTimer) {
          clearTimeout(retryTimer);
          retryTimer = null;
          retryForced = false;
        }
      },
      fetch: (force) => {
        getStocks(force);
      },
      askFetch: () => {
        if (askShouldFetch(asks) && !getStocks()) {
          pushStockBytes(savedStrip || lastStockBytes);
        }
      },
      slowFetch: () => {
        if (slowTickShouldFetch(asks)) {
          getStocks();
        }
      },
      afterSave: (run) => refetchAfterSave(asks, refetchDelayMs, run),
      settingKeys: STOCK_KEYS,
      forgetFetched: () => forgetStrip(providerIn(getConfig())),
    });
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
        forgetStrip(providerIn(getConfig()));
        refetchAfterSave(asks, refetchDelayMs, () => getStocks(true));
      }
    },
  };
};

// the strip has to have somewhere to land and the watch a way to ask, so the build adds both
stocks.messageKeys = ['STOCK_REQUEST', 'STOCK_STRIP'];

export default stocks;
