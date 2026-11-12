/**
 * Specs for the page code that keeps an API key per provider.
 *
 * One key row serves every provider of its select, so what is worth pinning is that a switch shows
 * the new provider's key and a switch back shows the old one's, that a provider with no key gets a
 * blank row or the spare, that nothing is filed under a provider the row hides for or a blank select,
 * and that the hidden store the save carries holds every provider's key, with the row's own value
 * filed under the provider picked. The test drives a stand-in page. provider-keys-flow.spec.ts runs
 * the same code on a page Clay really wrote.
 */
import { describe, test, expect } from 'vitest';
import providerKeys from './provider-keys-fn';
import { PAGE_KEYS_FIELD } from '../pkjs/provider-keys';

/** A stand-in Clay row, holding a value and calling its change handlers when the spec changes it. */
class FakeRow {
  readonly changeHandlers: Array<() => void> = [];

  constructor(readonly config: Record<string, unknown>, public value: unknown) {}

  get(): unknown {
    return this.value;
  }

  set(value: unknown): void {
    this.value = value;
  }

  on(event: string, handler: () => void): void {
    if (event === 'change') {
      this.changeHandlers.push(handler);
    }
  }

  /** Picks or types a value, as the wearer does. */
  pick(value: unknown): void {
    this.value = value;
    this.changeHandlers.forEach((handler) => handler());
  }
}

/** A stand-in page over rows keyed by message key, built once the page code has run. */
function makePage(rows: Record<string, FakeRow>): void {
  let afterBuild: (() => void) | null = null;
  const page = {
    EVENTS: { AFTER_BUILD: 'after_build' },
    on(event: string, handler: () => void) {
      if (event === 'after_build') {
        afterBuild = handler;
      }
    },
    getAllItems: () => Object.values(rows),
    getItemByMessageKey: (key: string) => rows[key],
  };

  providerKeys.call(page);
  afterBuild?.();
}

/** A stock section whose key row hides for Yahoo, opens with the given provider's key, and holds the given keys and spare, and the page's store. */
function stockPage(provider: string, keys: Record<string, string>, spare = '') {
  const select = new FakeRow({}, provider);
  const written = encodeURIComponent(JSON.stringify({ keys, spare }));
  const key = new FakeRow({ providerKeys: { select: 'STOCK_PROVIDER', keys: written }, visibleWhen: { key: 'STOCK_PROVIDER', notIn: ['yahoo'] } }, keys[provider] || '');
  const store = new FakeRow({}, '');

  makePage({ STOCK_PROVIDER: select, STOCK_API_KEY: key, [PAGE_KEYS_FIELD]: store });

  return { select, key, store };
}

/** The keys and spare the hidden store holds for the save, decoded. */
function keysSaved(store: FakeRow): Record<string, { keys: Record<string, string>; spare: string }> {
  return JSON.parse(decodeURIComponent(String(store.get())));
}

describe('provider keys page code', () => {
  /** The bug this exists for. Finnhub and Twelve Data got the Alpha Vantage key and showed INVALID KEY. */
  test('shows the new provider\'s key on a switch and the old one\'s on a switch back', () => {
    const { select, key } = stockPage('alphavantage', { alphavantage: 'av-key', finnhub: 'fh-key' });

    select.pick('finnhub');
    const onFinnhub = key.get();

    select.pick('alphavantage');

    const result = [onFinnhub, key.get()];

    expect(result).toEqual(['fh-key', 'av-key']);
  });

  /** A provider with no key of its own would otherwise be handed the last one's, which it would turn away. */
  test('blanks the row for a provider with no key held', () => {
    const { select, key } = stockPage('alphavantage', { alphavantage: 'av-key' });

    select.pick('twelvedata');

    const result = key.get();

    expect(result).toBe('');
  });

  /** A key typed for one provider and switched away from has to be there on the switch back, saved or not. */
  test('keeps a key typed this visit through a switch away and back', () => {
    const { select, key } = stockPage('finnhub', {});

    key.pick('typed-key');
    select.pick('yahoo');
    select.pick('finnhub');

    const result = key.get();

    expect(result).toBe('typed-key');
  });

  /** The save has to file the row's value under the provider picked, and keep every other provider's key beside it. */
  test('keeps every provider\'s key in the store with the row\'s value under the provider picked', () => {
    const { select, key, store } = stockPage('alphavantage', { alphavantage: 'av-key' });

    select.pick('twelvedata');
    key.pick('td-key');

    const result = keysSaved(store);

    expect(result).toEqual({ STOCK_PROVIDER: { keys: { alphavantage: 'av-key', twelvedata: 'td-key' }, spare: '' } });
  });

  /** A save straight after the page opens has to carry the keys the phone held, or the merge has nothing to lay over. */
  test('fills the store as the page opens', () => {
    const { store } = stockPage('finnhub', { finnhub: 'fh-key', twelvedata: 'td-key' });

    const result = keysSaved(store);

    expect(result).toEqual({ STOCK_PROVIDER: { keys: { finnhub: 'fh-key', twelvedata: 'td-key' }, spare: '' } });
  });

  /** A key the phone kept apart, from a row saved under Yahoo, has to reach the first provider that needs one rather than stay lost. */
  test('hands the spare to the first provider picked that needs a key and has none', () => {
    const { select, key, store } = stockPage('yahoo', { twelvedata: 'td-key' }, 'leftover');

    select.pick('twelvedata');
    const onTwelveData = key.get();

    select.pick('finnhub');

    const result = [onTwelveData, key.get(), keysSaved(store).STOCK_PROVIDER.spare];

    expect(result).toEqual(['td-key', 'leftover', '']);
  });

  /** Yahoo never takes a key, so a key filed under it would sit behind a hidden row where nothing can reach it. */
  test('files nothing under a provider the row hides for', () => {
    const { select, store } = stockPage('finnhub', { finnhub: 'fh-key' });

    select.pick('yahoo');

    const result = keysSaved(store).STOCK_PROVIDER.keys;

    expect(result).toEqual({ finnhub: 'fh-key' });
  });

  /** A saved provider the select does not offer opens blank, and a key filed under a blank name could never be picked again. */
  test('files nothing under a blank select', () => {
    const { key, store } = stockPage('', { iex: 'iex-key' });

    key.pick('typed');

    const result = keysSaved(store).STOCK_PROVIDER.keys;

    expect(result).toEqual({ iex: 'iex-key' });
  });

  /** Keys that do not read, as from a damaged page, must not stop the row working. */
  test('reads keys that do not decode as none', () => {
    const select = new FakeRow({}, 'finnhub');
    const key = new FakeRow({ providerKeys: { select: 'STOCK_PROVIDER', keys: '%E0%A4%A' } }, 'fh-key');

    makePage({ STOCK_PROVIDER: select, STOCK_API_KEY: key });
    select.pick('twelvedata');

    const result = key.get();

    expect(result).toBe('');
  });
});

describe('what the page code leans on', () => {
  /** Clay pastes the page code in with a plain string replace, so a dollar sign in it could turn into some other text on the page. */
  test('holds no dollar sign', () => {
    const result = String(providerKeys);

    expect(result).not.toContain('$');
  });

  /** The page code reaches nothing outside itself, so it writes the store's key out, and the phone has to add and take out the same one. */
  test('names the store the phone adds and takes out of the save', () => {
    const result = String(providerKeys);

    expect(result).toContain(PAGE_KEYS_FIELD);
  });
});
