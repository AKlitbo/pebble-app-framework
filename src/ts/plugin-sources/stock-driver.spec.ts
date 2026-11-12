// @vitest-environment jsdom
/**
 * Specs for the stock feature's plugin mode.
 *
 * The provider rounds are covered with the stock feature's and the app's own specs. Plugin mode is
 * pinned here, driving the feature's hooks straight against the fake Pebble. What is worth pinning is
 * that a picked plugin spends no provider call, that a provider still runs its rounds when the plugin
 * is not picked, which save does what, what a watch ask resends, that an offline phone's empty update
 * leaves the watch its quotes, what the page gains and only with the define, what it says on a phone
 * with no stock plugin, where a plugin only face's notes land, and what the seed brings back after a
 * reset. A face built without the define that still has the plugin saved has to fetch through its
 * default provider's own gate.
 *
 * localStorage comes from jsdom, and the plugin code is swapped for null where a spec needs a face
 * without the define.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import stocks from '../stock/feature';
import buildConfig from '../pkjs/config-builder';
import { withFakePebble } from '../testing/pebble';
import type { FakePebble } from '../testing/pebble';
import { installFakeXhr } from '../testing/xhr';
import type { FakeXhr } from '../testing/xhr';
import type { FeatureContext, FeatureHooks, ProviderLists } from '../pkjs/feature';
import { stockInstance } from '../plugin-app/stocks';
import { PLUGIN_LABEL, PLUGINS_OFF_LABEL } from './page';
import { STOCK_TEXTS } from './stocks';
import { faceStart, foldFeatures } from '../pkjs/app';
import { faceProvidersFor } from '../face-providers/narrow';
import { escapeHtml } from './escape';
import stockUtil from '../stock/util';
import type { ClayConfigItem } from '../clay/types';

// the plugin code a face built with PLUGIN_STOCKS finds, which a spec turns off to stand for a face
// built without it. the build writes null into the index then, which is what the getter hands back
const pluginCode = vi.hoisted(() => ({ off: false }));

vi.mock('./index', async (importOriginal) => {
  const real = await importOriginal<typeof import('./index')>();

  return {
    ...real,
    get stockPlugins() {
      return pluginCode.off ? null : real.stockPlugins;
    },
  };
});

// the keys a stock face declares, each standing for its own number, so a send reads by name
const STOCK_FACE_KEYS = {
  STOCK_REQUEST: 'STOCK_REQUEST',
  STOCK_STRIP: 'STOCK_STRIP',
  STOCK_PROVIDER: 'STOCK_PROVIDER',
  STOCK_API_KEY: 'STOCK_API_KEY',
  STOCK_SYMBOLS: 'STOCK_SYMBOLS',
  STOCK_PAID_PLAN: 'STOCK_PAID_PLAN',
} as unknown as Record<string, number>;

// a plugin app serving finance/stock the way the framework's own does
const STOCK_PLUGIN = {
  uuid: 'stock-plugin-uuid',
  name: 'My Stocks',
  sources: [{ category: 'finance', items: ['stock'], properties: { ticker: ['shortText'], price: ['shortText', 'numericValue'] } }],
};

/** One update from the plugin, holding a good quote for each ticker. */
function update(...tickers: string[]) {
  return { pluginUuid: STOCK_PLUGIN.uuid, instances: tickers.map((ticker) => stockInstance(stockUtil.ok(ticker, 100, 1, 1), ticker)) };
}

/** Saves the wearer's settings the way Clay leaves them in localStorage. */
function saveSettings(settings: Record<string, unknown>): void {
  localStorage.setItem('clay-settings', JSON.stringify(settings));
}

/** A stock face with its sends recorded, each acked straight away, and with ready already run when asked. */
function startFace(options: { providers?: ProviderLists | null; defaults?: Record<string, unknown>; ready?: boolean } = {}) {
  const sends: Record<string, unknown>[] = [];
  const queueSend = vi.fn((dict: Record<string, unknown>, onOk?: () => void) => {
    sends.push(dict);
    onOk?.();
  });
  const hooks = stocks({
    messageKeys: STOCK_FACE_KEYS,
    defaults: options.defaults || {},
    queueSend: queueSend as unknown as FeatureContext['queueSend'],
    refetchDelayMs: 250,
    providers: options.providers === undefined ? null : options.providers,
  });

  if (options.ready) {
    hooks.ready?.();
  }

  return { hooks, sends };
}

/** How many quotes each strip sent to the watch held, which is the strip's first byte. */
function stripCounts(sends: Record<string, unknown>[]): number[] {
  return sends.map((dict) => (dict.STOCK_STRIP as number[])[0]);
}

/** Saves a page visit's new settings between the open and the close, as the phone does. */
function saveFromPage(hooks: FeatureHooks, settings: Record<string, unknown>): void {
  hooks.configOpened?.();
  saveSettings(settings);
  hooks.configSaved?.();
}

/** Every row on a page, sections and their rows included. */
function allRowsOf(page: ClayConfigItem[]): ClayConfigItem[] {
  return page.flatMap((item) => [item, ...allRowsOf(item.items || [])]);
}

/** The row on a page with a message key. */
function rowOf(page: ClayConfigItem[], messageKey: string): ClayConfigItem | undefined {
  return allRowsOf(page).find((row) => row.messageKey === messageKey);
}

/** The words of every note on a page, in the order they run down it. */
function notesOf(page: ClayConfigItem[]): string[] {
  return allRowsOf(page).filter((row) => row.type === 'pluginNote').map((row) => String(row.defaultValue));
}

/** The settings page a stock face opens, after the feature's page hook. */
function openedPage(hooks: FeatureHooks): ClayConfigItem[] {
  const page = buildConfig({ stocks: { paidPlan: true } });

  return hooks.page ? hooks.page(page) : page;
}

/** The ascii text a strip carries in its first slot, which is a status word on a failed slot. */
function firstLabel(strip: number[]): string {
  // [count][ok][price 4][pct 2][len][label]
  const length = strip[8];

  return String.fromCharCode(...strip.slice(9, 9 + length));
}

describe('stock plugin mode', () => {
  let pebble: FakePebble;
  let fetches: FakeXhr[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 10, 11, 17));
    localStorage.clear();
    pluginCode.off = false;
    pebble = withFakePebble();
    pebble.plugins = [STOCK_PLUGIN];
    fetches = installFakeXhr();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    pebble.restore();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** A wearer on the plugin whose hidden provider still fetched would spend a paid provider's quota for nothing. */
  test('subscribes rather than fetching on ready while the plugin is picked', () => {
    saveSettings({ STOCK_PROVIDER: 'plugin', STOCK_SYMBOLS: 'AAPL' });
    const { hooks } = startFace();

    hooks.ready?.();

    expect(pebble.live()).toHaveLength(1);
    expect(pebble.live()[0].request).toMatchObject({ category: 'finance', item: 'stock' });
    expect(fetches).toHaveLength(0);
  });

  /** The watch takes plugin quotes through the strip a round fills, so quotes sent anywhere else would never show. */
  test('sends an update to the watch as the stock strip', () => {
    saveSettings({ STOCK_PROVIDER: 'plugin' });
    const { sends } = startFace({ ready: true });

    pebble.live()[0].push(update('AAPL', 'MSFT'));

    expect(stripCounts(sends)).toEqual([2]);
  });

  /**
   * Pebble's Stocks drops every ticker it could not fetch, so an offline phone answers with none.
   * Sending that would clear the watch's list for as long as the phone has no signal.
   */
  test('keeps the watch\'s quotes through an empty update after one with quotes', () => {
    saveSettings({ STOCK_PROVIDER: 'plugin' });
    const { hooks, sends } = startFace({ ready: true });

    pebble.live()[0].push(update('AAPL', 'MSFT'));
    pebble.live()[0].push(update());
    hooks.message?.({ STOCK_REQUEST: 1 });

    expect(stripCounts(sends)).toEqual([2, 2]);
  });

  /**
   * After a trip to a provider and back the watch holds the provider's quotes. Holding the plugin's
   * first empty update kept those on the watch, and a watch ask then put back plugin quotes from
   * before the trip.
   */
  test('sends the first empty update after a switch to a provider and back', () => {
    saveSettings({ STOCK_PROVIDER: 'plugin' });
    const { hooks, sends } = startFace({ ready: true });

    pebble.live()[0].push(update('AAPL', 'MSFT'));
    saveFromPage(hooks, { STOCK_PROVIDER: 'yahoo', STOCK_SYMBOLS: 'TSLA' });
    vi.advanceTimersByTime(250);
    fetches.forEach((fetch) => fetch.respond(200, JSON.stringify({ chart: { result: [{ meta: { symbol: 'TSLA', regularMarketPrice: 5, chartPreviousClose: 4 } }] } })));
    saveFromPage(hooks, { STOCK_PROVIDER: 'plugin', STOCK_SYMBOLS: 'TSLA' });

    pebble.live()[0].push(update());
    hooks.message?.({ STOCK_REQUEST: 1 });

    expect(stripCounts(sends)).toEqual([2, 1, 0, 0]);
  });

  /**
   * After the phone ended the plugin and the watch showed NO PLUGIN, the plugin's first empty update
   * on its return was held, so the watch kept NO PLUGIN while the plugin answered, and a watch ask then
   * put back quotes from before the outage.
   */
  test('sends the first empty update after the phone ended the plugin and it came back', () => {
    saveSettings({ STOCK_PROVIDER: 'plugin' });
    const { hooks, sends } = startFace({ ready: true });

    pebble.live()[0].push(update('AAPL', 'MSFT'));
    pebble.live()[0].fail({ code: 'PLUGIN_UNAVAILABLE', message: 'plugins turned off' });
    hooks.refresh?.(true);
    pebble.live()[0].push(update());
    hooks.message?.({ STOCK_REQUEST: 1 });

    expect(stripCounts(sends)).toEqual([2, 1, 0, 0]);
  });

  /** A plugin with no tickers set up has to say so on the first update, or the watch waits on a list that never comes. */
  test('sends an empty strip for a first update with no tickers', () => {
    saveSettings({ STOCK_PROVIDER: 'plugin' });
    const { sends } = startFace({ ready: true });

    pebble.live()[0].push(update());

    expect(stripCounts(sends)).toEqual([0]);
  });

  /** A face with the define and a provider picked has to fetch as it always has, or its quotes never arrive. */
  test('runs a provider round and subscribes to nothing while a provider is picked', () => {
    saveSettings({ STOCK_PROVIDER: 'yahoo', STOCK_SYMBOLS: 'AAPL' });
    const { hooks } = startFace();

    hooks.ready?.();

    expect(fetches).toHaveLength(1);
    expect(pebble.subscriptions).toHaveLength(0);
  });

  /** A watch that rebooted asks with an empty strip, and the plugin only sends again on a change. */
  test('resends the kept quotes on a watch ask without calling a provider', () => {
    saveSettings({ STOCK_PROVIDER: 'plugin', STOCK_SYMBOLS: 'AAPL' });
    const { hooks, sends } = startFace({ ready: true });

    pebble.live()[0].push(update('AAPL'));

    hooks.message?.({ STOCK_REQUEST: 1 });

    expect(sends).toHaveLength(2);
    expect(sends[1]).toEqual(sends[0]);
    expect(fetches).toHaveLength(0);
  });

  /** With nothing kept the watch would sit on an old strip, so it hears why it has no quotes. */
  test('sends NO PLUGIN on a watch ask when no plugin serves the quotes', () => {
    saveSettings({ STOCK_PROVIDER: 'plugin' });
    pebble.plugins = [];
    const { hooks, sends } = startFace({ ready: true });

    hooks.message?.({ STOCK_REQUEST: 1 });

    const result = sends.map((dict) => firstLabel(dict.STOCK_STRIP as number[]));

    expect(result[result.length - 1]).toBe('NO PLUGIN');
    expect(fetches).toHaveLength(0);
  });

  /** A save onto the plugin that left the provider's round to land would cover the plugin's quotes with the provider's. */
  test('ends the provider round and subscribes on a save onto the plugin', () => {
    saveSettings({ STOCK_PROVIDER: 'yahoo', STOCK_SYMBOLS: 'AAPL' });
    const { hooks, sends } = startFace({ ready: true });

    saveFromPage(hooks, { STOCK_PROVIDER: 'plugin', STOCK_SYMBOLS: 'AAPL' });
    fetches[0].respond(200, JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 1, chartPreviousClose: 1 } }] } }));
    vi.advanceTimersByTime(1000);

    expect(pebble.live()).toHaveLength(1);
    expect(sends).toHaveLength(0);
    expect(fetches).toHaveLength(1);
  });

  /** A save back onto a provider has to fetch past the gate, or the watch keeps the plugin's quotes until the next poll. */
  test('stops the subscription and forces a provider round on a save off the plugin', () => {
    saveSettings({ STOCK_PROVIDER: 'plugin', STOCK_SYMBOLS: 'AAPL' });
    const { hooks } = startFace({ ready: true });

    saveFromPage(hooks, { STOCK_PROVIDER: 'yahoo', STOCK_SYMBOLS: 'AAPL' });
    vi.advanceTimersByTime(250);

    expect(pebble.live()).toHaveLength(0);
    expect(fetches).toHaveLength(1);
  });

  /** The tickers and the key only feed a provider, so a save of either while the plugin is picked must call nothing. */
  test('calls no provider for a save that changes only the tickers while the plugin is picked', () => {
    saveSettings({ STOCK_PROVIDER: 'plugin', STOCK_SYMBOLS: 'AAPL' });
    const { hooks } = startFace({ ready: true });

    saveFromPage(hooks, { STOCK_PROVIDER: 'plugin', STOCK_SYMBOLS: 'MSFT' });
    vi.advanceTimersByTime(1000);

    expect(fetches).toHaveLength(0);
  });

  /** A face that only offers the plugin has no choice to read, so it subscribes whatever is saved. */
  test('subscribes on a plugin only face whatever is saved', () => {
    saveSettings({ STOCK_PROVIDER: 'yahoo', STOCK_SYMBOLS: 'AAPL' });
    const { hooks } = startFace({ providers: { stocks: ['plugin'] } });

    hooks.ready?.();

    expect(pebble.live()).toHaveLength(1);
    expect(fetches).toHaveLength(0);
  });
});

describe('stock plugin page', () => {
  let pebble: FakePebble;

  beforeEach(() => {
    localStorage.clear();
    pluginCode.off = false;
    pebble = withFakePebble();
    pebble.plugins = [STOCK_PLUGIN];
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    pebble.restore();
    vi.restoreAllMocks();
  });

  /** A wearer with a stock plugin has to be able to pick it, or the define offers nothing. */
  test('adds Preferred Source to the Data Source on a face built with the define', () => {
    const { hooks } = startFace();

    const result = rowOf(openedPage(hooks), 'STOCK_PROVIDER')?.options?.find((option) => option.value === 'plugin');

    expect(result).toEqual({ label: PLUGIN_LABEL, value: 'plugin' });
  });

  /** A face built without the define has no plugin code, so a plugin choice on its page would save a source that never fills. */
  test('leaves the Data Source alone on a face built without the define', () => {
    pluginCode.off = true;
    const { hooks } = startFace();

    const result = rowOf(openedPage(hooks), 'STOCK_PROVIDER')?.options?.map((option) => option.value);

    expect(result).toEqual(['finnhub', 'yahoo', 'twelvedata', 'alphavantage']);
  });

  /** The key, the plan, and the tickers mean nothing to a plugin, so showing them would ask the wearer for a key nothing reads. */
  test.each([
    ['STOCK_API_KEY'],
    ['STOCK_PAID_PLAN'],
    ['STOCK_SYMBOLS'],
  ])('hides %s while the plugin is picked', (key) => {
    const { hooks } = startFace();

    const conditions = [rowOf(openedPage(hooks), key)?.visibleWhen].flat();

    const result = conditions.some((condition) => condition?.key === 'STOCK_PROVIDER' && 'in' in condition && !condition.in.includes('plugin'));

    expect(result).toBe(true);
  });
});

describe('stock plugin page with no stock plugin', () => {
  let pebble: FakePebble;

  // a phone with plugins on, which lists the Pebble app's own weather and no stock plugin
  const WEATHER_ONLY = { uuid: '00000000-0000-0000-0001-000000000002', name: 'Weather', sources: [{ category: 'weather', items: ['location'] }] };

  beforeEach(() => {
    localStorage.clear();
    pluginCode.off = false;
    pebble = withFakePebble();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    pebble.restore();
    vi.restoreAllMocks();
  });

  /**
   * The Pebble app has no stock plugin of its own, so plugins on and none installed is the usual
   * state. Telling that wearer to turn plugins on sends them looking for a switch that is already on.
   */
  test('names the missing stock plugin on a saved choice while plugins are on', () => {
    pebble.plugins = [WEATHER_ONLY];
    saveSettings({ STOCK_PROVIDER: 'plugin' });
    const { hooks } = startFace();
    const page = openedPage(hooks);

    const result = { label: rowOf(page, 'STOCK_PROVIDER')?.options?.find((option) => option.value === 'plugin')?.label, notes: notesOf(page) };

    expect(result.label).toBe(STOCK_TEXTS.notInstalledLabel);
    expect(result.notes).toContain(escapeHtml(STOCK_TEXTS.noPlugin as string));
  });

  /** With plugins off the option still has to say so, since turning them on is what brings the plugin back. */
  test('keeps Plugins Off on a saved choice while the phone lists nothing', () => {
    pebble.plugins = [];
    saveSettings({ STOCK_PROVIDER: 'plugin' });
    const { hooks } = startFace();

    const result = rowOf(openedPage(hooks), 'STOCK_PROVIDER')?.options?.find((option) => option.value === 'plugin')?.label;

    expect(result).toBe(PLUGINS_OFF_LABEL);
  });

  /**
   * A plugin only face lost its Stock Preferences card, since its notes looked for a row marked with
   * the category, finance, while the narrowed page marks it with the kind, stocks.
   */
  test('puts a plugin only face\'s notes in its Stock Preferences card', () => {
    pebble.plugins = [WEATHER_ONLY];
    const providers = faceProvidersFor({ stocks: { offered: ['plugin'], needsKey: false } });
    const start = faceStart({ clayConfig: buildConfig({ stocks: {} }), features: [stocks] }, providers);
    const messageKeys = { STOCK_STRIP: 'STOCK_STRIP', STOCK_REQUEST: 'STOCK_REQUEST' } as unknown as Record<string, number>;
    const hooks = stocks({ messageKeys, defaults: start.defaults, queueSend: vi.fn() as unknown as FeatureContext['queueSend'], refetchDelayMs: 250, providers: start.providers });
    const page = foldFeatures(start.options.clayConfig, [hooks, ...start.hooks]);
    const card = page.find((item) => (item.items || []).some((row) => row.type === 'heading' && row.defaultValue === 'Stock Preferences'));

    const result = (card?.items || []).map((row) => (row.type === 'pluginNote' ? String(row.defaultValue) : row.type));

    expect(result).toEqual(['heading', escapeHtml(STOCK_TEXTS.noPlugin as string)]);
  });
});

describe('a face built without the define', () => {
  let pebble: FakePebble;
  let fetches: FakeXhr[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 10, 11, 17));
    localStorage.clear();
    pluginCode.off = true;
    pebble = withFakePebble();
    fetches = installFakeXhr();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    pebble.restore();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /**
   * A plugin choice saved before the define came out fell through to the lookup's own fallback, so a
   * face that defaults to Yahoo asked Finnhub with no key and showed NO API KEY.
   */
  test('fetches a stale plugin choice from the face\'s default provider', () => {
    saveSettings({ STOCK_PROVIDER: 'plugin', STOCK_SYMBOLS: 'AAPL' });

    startFace({ defaults: { STOCK_PROVIDER: 'yahoo' }, ready: true });

    const result = fetches.map((fetch) => new URL(fetch.url).host);

    expect(result).toEqual(['query1.finance.yahoo.com']);
  });

  /** The cache keeps its stamps under the provider it names, so one kept under plugin would hold no provider's quota. */
  test('keeps the stale plugin choice\'s cache under the face\'s default provider', () => {
    saveSettings({ STOCK_PROVIDER: 'plugin', STOCK_SYMBOLS: 'AAPL' });
    startFace({ defaults: { STOCK_PROVIDER: 'yahoo' }, ready: true });

    fetches[0].respond(200, JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 101, chartPreviousClose: 100 } }] } }));

    const result = JSON.parse(localStorage.getItem('stock-cache') as string).provider;

    expect(result).toBe('yahoo');
  });
});

describe('stock plugin seed', () => {
  let pebble: FakePebble | null = null;

  beforeEach(() => {
    localStorage.clear();
    pluginCode.off = false;
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    pebble?.restore();
    vi.restoreAllMocks();
  });

  /** A reset of the Pebble app wipes the phone's settings, and the watch's kept pick is all that brings the plugin back. */
  test('keeps a plugin choice the watch brought back to a phone with the plugin calls', () => {
    pebble = withFakePebble();
    const { hooks } = startFace();
    const config: Record<string, unknown> = { STOCK_PROVIDER: 'plugin' };

    hooks.seeded?.(config, () => undefined);

    expect(config.STOCK_PROVIDER).toBe('plugin');
  });

  /** A Pebble app from before plugins can never answer, so a restored plugin would leave the strip empty for good. */
  test('drops a plugin choice the watch brought back to a phone without the plugin calls', () => {
    pebble = withFakePebble({ plugins: false });
    const { hooks } = startFace();
    const config: Record<string, unknown> = { STOCK_PROVIDER: 'plugin' };

    hooks.seeded?.(config, () => undefined);

    expect(config.STOCK_PROVIDER).toBeUndefined();
  });
});
