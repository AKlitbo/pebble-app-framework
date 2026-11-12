/**
 * Specs for keeping an API key per provider through real Clay pages, opened and saved the way the
 * phone does.
 *
 * The page code and the phone's filing each have specs of their own. What these pin is the round
 * trip on the page Clay really writes: a launch whose providers list drops the provider picked, a
 * keyless provider saved with a key left on its row, a list that takes the key row away, and a saved
 * provider the select does not offer. Each is a way the old provider's key reached the new one, or a
 * key was kept where nothing could change it.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createClay, faceStart, prepareSettingsPage, seedConfigFromWatch } from './app';
import { stubModuleLoad } from '../testing/module-load';
import { getConfig } from './settings-store';
import { fileSavedRows, forgetOwners, hasKeyRows, loadProviderKeys, mergeProviderKeys, recordOwners, saveProviderKeys, takePageKeys } from './provider-keys';
import { faceProvidersFor } from '../face-providers/narrow';
import type { WrittenProviders } from '../face-providers/narrow';
import type { ClayConfigItem } from '../clay/types';
import type { StartOptions } from './app';

const MESSAGE_KEYS: Record<string, number> = { STOCK_PROVIDER: 1, STOCK_API_KEY: 2, STOCK_SYMBOLS: 3 };

/** The stock providers the select offers unless a spec gives its own. */
const PROVIDERS: ClayConfigItem['options'] = [
  { label: 'Finnhub', value: 'finnhub' },
  { label: 'Yahoo', value: 'yahoo' },
  { label: 'Twelve Data', value: 'twelvedata' },
  { label: 'Alpha Vantage', value: 'alphavantage' },
];

/** A stock section the way the builder lays one out, its key row hiding for Yahoo, with the select's options and default given or the usual ones. */
function stockPage(options: unknown = PROVIDERS, defaultValue: string | null = 'finnhub'): ClayConfigItem[] {
  return [
    {
      type: 'section',
      items: [
        { type: 'heading', defaultValue: 'Stocks' },
        {
          type: 'select',
          messageKey: 'STOCK_PROVIDER',
          label: 'Data Source',
          defaultValue: defaultValue ?? undefined,
          options: options as ClayConfigItem['options'],
        },
        { type: 'input', messageKey: 'STOCK_API_KEY', label: 'API Key', visibleWhen: { key: 'STOCK_PROVIDER', notIn: ['yahoo'] } },
        { type: 'input', messageKey: 'STOCK_SYMBOLS', label: 'Tickers', defaultValue: 'AAPL' },
      ],
    },
    { type: 'submit', defaultValue: 'Save' },
  ];
}

let restore: (() => void) | null = null;

/** A phone with the given localStorage, and the Pebble bridge Clay reads as it builds the page. */
function phoneWith(initial: Record<string, string>) {
  const store: Record<string, string> = { ...initial };
  const writes: string[] = [];
  const restoreLoad = stubModuleLoad((id) => (id === 'message_keys' ? MESSAGE_KEYS : undefined));

  vi.stubGlobal('Pebble', { platform: 'emery', addEventListener() {}, getAccountToken: () => '', getWatchToken: () => '', getActiveWatchInfo: () => ({ platform: 'emery', firmware: { major: 4, minor: 3, patch: 0 } }) });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      writes.push(key);
      store[key] = String(value);
    },
    removeItem: (key: string) => { delete store[key]; },
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  restore = () => {
    restoreLoad();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  };

  return {
    settings: () => JSON.parse(store['clay-settings'] || '{}'),
    keys: () => JSON.parse(store['pf-provider-keys'] || 'null'),
    writes,
  };
}

/** One launch of the phone code, as startPebbleApp sets it up, with the open and close it runs. */
function launch(written: WrittenProviders | null = null, page: ClayConfigItem[] = stockPage()) {
  const start = faceStart({ clayConfig: page } as StartOptions, written ? faceProvidersFor(written) : null);
  const clay = createClay(start.options);
  const built = { config: start.fallbackPage(start.options.clayConfig), customFn: clay.customFn };

  // the launch's own lines, which record whose a saved key row is when nothing says
  const owners = hasKeyRows(start.options.clayConfig) ? recordOwners(loadProviderKeys(localStorage), getConfig(), start.defaults, start.options.clayConfig) : null;

  if (owners) {
    saveProviderKeys(localStorage, owners);
  }

  return {
    open() {
      prepareSettingsPage(clay, start.options, [...start.hooks], built);

      const url = clay.generateUrl();

      return openPage(decodeURIComponent(url.slice(url.indexOf(',') + 1)));
    },
    close(response: string) {
      const taken = takePageKeys(response);

      clay.getSettings(taken.response);

      if (hasKeyRows(start.options.clayConfig)) {
        saveProviderKeys(localStorage, fileSavedRows(mergeProviderKeys(loadProviderKeys(localStorage), taken.keys), getConfig(), start.defaults, start.options.clayConfig));
      }
    },
    // the restore's own lines, with the watch's reply keyed by number
    seed(payload: Record<string, unknown>) {
      saveProviderKeys(localStorage, forgetOwners(loadProviderKeys(localStorage)));
      seedConfigFromWatch(MESSAGE_KEYS, payload, start.options.clayConfig, [...start.hooks]);
      saveProviderKeys(localStorage, fileSavedRows(loadProviderKeys(localStorage), getConfig(), start.defaults, start.options.clayConfig));
    },
  };
}

/** The page Clay wrote, running in a DOM, with the select and the key row by their place on the page. */
function openPage(html: string) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://page.invalid/',
    beforeParse(window) {
      Object.defineProperty(window, 'returnTo', { get: () => '#', set: () => {} });
    },
  });
  const document = dom.window.document;
  const select = () => document.querySelector('.component-select select') as HTMLSelectElement;
  // the key row is the first input, the one before the tickers
  const keyRow = () => document.querySelector('.component-input input') as HTMLInputElement;
  const fire = (element: Element, name: string) => element.dispatchEvent(new dom.window.Event(name, { bubbles: true }));

  return {
    select,
    keyRow,
    pick(value: string) {
      select().value = value;
      fire(select(), 'change');
    },
    type(value: string) {
      keyRow().value = value;
      fire(keyRow(), 'input');
      fire(keyRow(), 'change');
    },
    typeAt(index: number, value: string) {
      const input = document.querySelectorAll('.component-input input')[index] as HTMLInputElement;

      input.value = value;
      fire(input, 'input');
      fire(input, 'change');
    },
    save(): string {
      fire(document.querySelector('#main-form') as Element, 'submit');
      return dom.window.location.hash.slice(1);
    },
  };
}

afterEach(() => {
  restore?.();
  restore = null;
});

describe('a key for each provider on a real Clay page', () => {
  /** The case the feature exists for, switched, typed, saved, and opened again on a page Clay really wrote. */
  test('brings each provider\'s key back after a save and a reopen', () => {
    const phone = phoneWith({ 'clay-settings': JSON.stringify({ STOCK_PROVIDER: 'finnhub', STOCK_API_KEY: 'FH-KEY' }) });
    const app = launch();
    const page = app.open();

    page.pick('twelvedata');
    page.type('TD-KEY');
    app.close(page.save());

    const again = app.open();
    const onTwelveData = again.keyRow().value;

    again.pick('finnhub');

    const result = [onTwelveData, again.keyRow().value, phone.settings().STOCK_API_KEY];

    expect(result).toEqual(['TD-KEY', 'FH-KEY', 'TD-KEY']);
  });

  /**
   * A face update whose list dropped Finnhub moved the saved provider to Twelve Data with Finnhub's
   * key still on the row, so Twelve Data was asked with Finnhub's key and the wearer's own Twelve
   * Data key was written over on the next save.
   */
  test('gives the new provider its own key when a list drops the one picked', () => {
    const phone = phoneWith({
      'clay-settings': JSON.stringify({ STOCK_PROVIDER: 'finnhub', STOCK_API_KEY: 'FH-KEY' }),
      'pf-provider-keys': JSON.stringify({ STOCK_PROVIDER: { keys: { finnhub: 'FH-KEY', twelvedata: 'TD-KEY' }, spare: '', owner: 'finnhub' } }),
    });
    const app = launch({ stocks: { offered: ['twelvedata', 'alphavantage'], needsKey: true } });
    const settled = phone.settings().STOCK_API_KEY;

    const page = app.open();
    const opened = page.keyRow().value;

    app.close(page.save());

    const result = [settled, opened, phone.keys().STOCK_PROVIDER.keys];

    expect(result).toEqual(['TD-KEY', 'TD-KEY', { finnhub: 'FH-KEY', twelvedata: 'TD-KEY' }]);
  });

  /** The same update on a phone that kept one key, which has to stay Finnhub's rather than become Twelve Data's. */
  test('keeps a single saved key with its provider when a list drops it', () => {
    const phone = phoneWith({ 'clay-settings': JSON.stringify({ STOCK_PROVIDER: 'finnhub', STOCK_API_KEY: 'FH-KEY' }) });
    const app = launch({ stocks: { offered: ['twelvedata', 'alphavantage'], needsKey: true } });

    const page = app.open();
    const opened = page.keyRow().value;

    app.close(page.save());

    const result = [opened, phone.keys().STOCK_PROVIDER.keys];

    expect(result).toEqual(['', { finnhub: 'FH-KEY', twelvedata: '' }]);
  });

  /**
   * A wearer on Yahoo with a key left on the hidden row lost it, since it was filed under Yahoo, which
   * never takes one. It goes to the first provider picked that needs a key and has none.
   */
  test('hands a key saved under a keyless provider to the first keyed provider picked', () => {
    const phone = phoneWith({ 'clay-settings': JSON.stringify({ STOCK_PROVIDER: 'yahoo', STOCK_API_KEY: 'LEFTOVER' }) });
    const app = launch();
    const page = app.open();

    page.pick('finnhub');
    const onFinnhub = page.keyRow().value;

    app.close(page.save());

    const result = [onFinnhub, phone.keys().STOCK_PROVIDER];

    expect(result).toEqual(['LEFTOVER', { keys: { finnhub: 'LEFTOVER' }, spare: '', owner: 'finnhub' }]);
  });

  /** A list that takes the key row away left its keys on the phone for good, with nothing on the page to clear them. */
  test('lets go of the keys when a list takes the key row away', () => {
    const phone = phoneWith({
      'clay-settings': JSON.stringify({ STOCK_PROVIDER: 'finnhub', STOCK_API_KEY: 'FH-KEY' }),
      'pf-provider-keys': JSON.stringify({ STOCK_PROVIDER: { keys: { finnhub: 'FH-KEY' }, spare: '', owner: 'finnhub' } }),
    });

    launch({ stocks: { offered: ['yahoo'], needsKey: false } });

    const result = phone.keys().STOCK_PROVIDER;

    expect(result).toEqual({ keys: {}, spare: '' });
  });

  /**
   * A saved provider the select does not offer, such as `Finnhub` against `finnhub`, opens on a blank
   * select with the key row showing. The row opened blank and a save that touched nothing wrote a blank
   * key, so stocks lost their key. It keeps the key, files it under the provider it was saved with
   * rather than a blank name, and brings it back when that provider is picked.
   */
  test('keeps the key on a blank select through a save that touches nothing', () => {
    const phone = phoneWith({ 'clay-settings': JSON.stringify({ STOCK_PROVIDER: 'Finnhub', STOCK_API_KEY: 'CAP-KEY' }) });
    const app = launch();
    const page = app.open();
    const opened = [page.select().value, page.keyRow().value];

    app.close(page.save());

    const again = app.open();

    again.pick('finnhub');

    const result = [opened, phone.settings().STOCK_API_KEY, phone.keys().STOCK_PROVIDER.keys, again.keyRow().value];

    expect(result).toEqual([['', 'CAP-KEY'], 'CAP-KEY', { finnhub: 'CAP-KEY' }, 'CAP-KEY']);
  });

  /**
   * A page that offered Finnhub alone had no select, so its save left the provider out. A list that
   * then put Twelve Data first moved the face with Finnhub's key still on the row, and Twelve Data was
   * asked with it until the next save.
   */
  test('moves the key row with the default when a page with no select saved none', () => {
    const phone = phoneWith({});
    const before = launch({ stocks: { offered: ['finnhub'], needsKey: true } });
    const page = before.open();

    page.typeAt(0, 'FH-ONLY');
    before.close(page.save());

    const after = launch({ stocks: { offered: ['twelvedata'], needsKey: true } });
    const settled = phone.settings().STOCK_API_KEY;
    const opened = after.open().keyRow().value;

    const result = [settled, opened, phone.keys().STOCK_PROVIDER.keys];

    expect(result).toEqual([undefined, '', { finnhub: 'FH-ONLY' }]);
  });

  /** A restore from the watch sends the key row and its provider together, so the watch's provider owns the row whatever the phone recorded before. */
  test('files a restored key under the provider the watch sent', () => {
    const phone = phoneWith({ 'pf-provider-keys': JSON.stringify({ STOCK_PROVIDER: { keys: { alphavantage: 'AV-OWN' }, spare: '', owner: 'alphavantage' } }) });
    const app = launch({ stocks: { offered: ['twelvedata', 'alphavantage'], needsKey: true } });

    app.seed({ [MESSAGE_KEYS.STOCK_PROVIDER]: 'finnhub', [MESSAGE_KEYS.STOCK_API_KEY]: 'FH-WATCH' });

    const result = phone.keys().STOCK_PROVIDER.keys;

    expect(result).toEqual({ alphavantage: 'AV-OWN', finnhub: 'FH-WATCH' });
  });

  /** A face with no key row keeps no keys, so its saves have nothing to write and leave the store alone. */
  test('writes no keys on a save from a page with no key row', () => {
    const phone = phoneWith({});
    const app = launch({ stocks: { offered: ['yahoo'], needsKey: false } });

    app.close(app.open().save());

    const result = phone.keys();

    expect(result).toBe(null);
  });

  /**
   * A select that no longer offers the saved provider opens blank. The owner's key went to the spare,
   * and the first provider picked was handed it, so Twelve Data was asked with Alpha Vantage's key.
   */
  test.each([
    ['a provider the select dropped', { STOCK_PROVIDER: 'alphavantage', STOCK_API_KEY: 'AV' }, { keys: { alphavantage: 'AV' }, spare: '', owner: 'alphavantage' }, [{ label: 'Finnhub', value: 'finnhub' }, { label: 'Yahoo', value: 'yahoo' }, { label: 'Twelve Data', value: 'twelvedata' }]],
    ['a provider saved in another case', { STOCK_PROVIDER: 'Finnhub', STOCK_API_KEY: 'CAP' }, { keys: { finnhub: 'CAP' }, spare: '', owner: 'Finnhub' }, PROVIDERS],
  ])('keeps the owner\'s key from the next provider picked on %s', (_label, settings, held, options) => {
    phoneWith({ 'clay-settings': JSON.stringify(settings), 'pf-provider-keys': JSON.stringify({ STOCK_PROVIDER: held }) });
    const page = launch(null, stockPage(options)).open();

    page.pick('twelvedata');

    const result = page.keyRow().value;

    expect(result).toBe('');
  });

  /** On a blank select the row is the spare, so emptying it and saving has to clear the key rather than bring it back on the next open. */
  test('clears the kept key when the row on a blank select is emptied', () => {
    const phone = phoneWith({});
    const options = [{ label: 'Pick One', value: '' }, { label: 'Finnhub', value: 'finnhub' }, { label: 'Yahoo', value: 'yahoo' }];
    const app = launch(null, stockPage(options, null));
    const typed = app.open();

    typed.type('TYPED');
    app.close(typed.save());

    const cleared = app.open();

    cleared.type('');
    app.close(cleared.save());

    const again = app.open();
    const opened = again.keyRow().value;

    again.pick('finnhub');

    const result = [opened, again.keyRow().value, phone.keys().STOCK_PROVIDER.spare];

    expect(result).toEqual(['', '', '']);
  });

  /** Clay draws an option whose value is a list as a group. Read as one blank option, the picked provider's key went to the spare and on to the next provider picked. */
  test('reads a provider select with option groups', () => {
    phoneWith({ 'clay-settings': JSON.stringify({ STOCK_PROVIDER: 'finnhub', STOCK_API_KEY: 'FH' }), 'pf-provider-keys': JSON.stringify({ STOCK_PROVIDER: { keys: { finnhub: 'FH' }, spare: '', owner: 'finnhub' } }) });
    const grouped = [{ label: 'Free', value: [{ label: 'Finnhub', value: 'finnhub' }, { label: 'Yahoo', value: 'yahoo' }] }, { label: 'Paid', value: [{ label: 'Twelve Data', value: 'twelvedata' }] }];
    const page = launch(null, stockPage(grouped)).open();
    const opened = page.keyRow().value;

    page.pick('twelvedata');

    const result = [opened, page.keyRow().value];

    expect(result).toEqual(['FH', '']);
  });

  /**
   * A phone that kept one key on a page with no select recorded no owner, so a list that later moved
   * the default had nothing to move the row from, and Twelve Data was asked with the Finnhub key.
   */
  test('moves a key saved with no owner when a later list moves the default', () => {
    const phone = phoneWith({ 'clay-settings': JSON.stringify({ STOCK_API_KEY: 'FH-LEGACY', STOCK_SYMBOLS: 'AAPL' }) });

    launch({ stocks: { offered: ['finnhub'], needsKey: true } });
    launch({ stocks: { offered: ['twelvedata', 'alphavantage'], needsKey: true } });

    const result = [phone.settings().STOCK_API_KEY, phone.keys().STOCK_PROVIDER.keys];

    expect(result).toEqual([undefined, { finnhub: 'FH-LEGACY' }]);
  });

  /** A default that moved to Yahoo and back to Finnhub left the row blank for good, with Finnhub's key still held. */
  test('gives the row its key back when the default returns to a provider that takes one', () => {
    const phone = phoneWith({});
    const first = launch({ stocks: { offered: ['finnhub'], needsKey: true } });
    const page = first.open();

    page.typeAt(0, 'FH-ONLY');
    first.close(page.save());
    launch({ stocks: { offered: ['yahoo', 'twelvedata'], needsKey: true } });
    launch({ stocks: { offered: ['finnhub'], needsKey: true } });

    const result = phone.settings().STOCK_API_KEY;

    expect(result).toBe('FH-ONLY');
  });

  /** A page with a key row and no select files nothing, so the key saved there has to win over an older held one when the select comes back. */
  test('opens on the key saved by a page with no select', () => {
    phoneWith({ 'clay-settings': JSON.stringify({ STOCK_PROVIDER: 'yahoo', STOCK_API_KEY: '' }), 'pf-provider-keys': JSON.stringify({ STOCK_PROVIDER: { keys: { finnhub: 'OLD-FH' }, spare: '', owner: '' } }) });
    const keyOnly = launch(null, [{ type: 'section', items: [{ type: 'input', messageKey: 'STOCK_API_KEY', label: 'API Key' }] }, { type: 'submit', defaultValue: 'Save' }]);
    const page = keyOnly.open();

    page.type('NEW-FH');
    keyOnly.close(page.save());

    const result = launch().open().keyRow().value;

    expect(result).toBe('NEW-FH');
  });

  /**
   * A default that moved to Yahoo left a blank owner, and each later launch moved the row again,
   * rewriting the settings and sending the watch a restore it did not need.
   */
  test('writes nothing on a second launch with nothing changed', () => {
    const phone = phoneWith({});
    const first = launch({ stocks: { offered: ['finnhub'], needsKey: true } });
    const page = first.open();

    page.typeAt(0, 'FH-ONLY');
    first.close(page.save());
    launch({ stocks: { offered: ['yahoo', 'twelvedata'], needsKey: true } });
    phone.writes.length = 0;

    launch({ stocks: { offered: ['yahoo', 'twelvedata'], needsKey: true } });

    const result = phone.writes;

    expect(result).toEqual([]);
  });
});
