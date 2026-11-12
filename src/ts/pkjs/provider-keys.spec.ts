/**
 * Specs for the API key the phone keeps for each weather and stock provider.
 *
 * What is worth pinning is that the save's keys come out before Clay sends the save to the watch,
 * since Clay would send them under a key the face never declared and break the whole save, and how a
 * saved key row is filed. It goes under the provider saved beside it, under the provider it belongs
 * to when a face update moved the saved provider, and never under a provider its row hides for or a
 * blank one. The rows a keyless provider or the plugin hides have to keep hiding, and a list that
 * narrows the key row away has to leave nothing to fill. The round trip on a real Clay page is in
 * provider-keys-flow.spec.ts.
 */
import { describe, test, expect } from 'vitest';
import { addProviderKeys, dropSelectKeys, fileSavedRows, forgetOwners, hasKeyRows, keysForOpen, loadProviderKeys, mergeProviderKeys, moveKeyRow, rowHidesFor, takePageKeys, PAGE_KEYS_FIELD, PROVIDER_KEYS_STORE } from './provider-keys';
import type { ProviderKeys } from './provider-keys';
import buildConfig, { stocksSection } from './config-builder';
import dependentVisibility from '../clay/dependent-visibility';
import { faceProvidersFor } from '../face-providers/narrow';
import type { ClayConfigItem } from '../clay/types';

/** A stand-in localStorage holding one value under the keys store. */
function storageWith(value: string | null) {
  return { getItem: (key: string) => (key === PROVIDER_KEYS_STORE ? value : null), setItem: () => {} };
}

/** Nothing kept for either select, as a phone that never saved keys reads. */
function none(): ProviderKeys {
  return loadProviderKeys(storageWith(null));
}

/** The builder's stock section alone, its key row hiding for Yahoo. */
function stockPage(): ClayConfigItem[] {
  return [stocksSection({ stocks: {} }) as ClayConfigItem];
}

/** Whether the page's show and hide in dependent-visibility.ts shows a row with this condition while the select holds this value. */
function pageShows(condition: unknown, value: string): boolean {
  const classes = new Set<string>();
  const row = { config: { visibleWhen: condition }, $element: [{ classList: { add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name), contains: (name: string) => classes.has(name) } }], get: () => '', on: () => {} };
  const select = { config: {}, $element: [], get: () => value, on: () => {} };
  let afterBuild: (() => void) | null = null;
  const page = {
    EVENTS: { AFTER_BUILD: 'after_build' },
    on: (_event: string, handler: () => void) => {
      afterBuild = handler;
    },
    getAllItems: () => [row, select],
    getItemByMessageKey: (key: string) => (key === 'STOCK_PROVIDER' ? select : undefined),
  };

  dependentVisibility.call(page as never);
  afterBuild?.();

  return !classes.has('hide');
}

/** A row on a page by its message key. */
function rowOf(page: ClayConfigItem[], key: string): ClayConfigItem | undefined {
  const rows = (items: ClayConfigItem[]): ClayConfigItem[] => items.flatMap((item) => [item, ...rows(item.items || [])]);

  return rows(page).find((row) => row.messageKey === key);
}

/** The keys and spare a key row opens with, decoded. */
function keysOn(row: ClayConfigItem | undefined): { keys: Record<string, string>; spare: string; owner: string } {
  return JSON.parse(decodeURIComponent(String(row?.providerKeys?.keys)));
}

describe('takePageKeys', () => {
  /** Clay sends every setting it reads to the watch, and this field under an undeclared key breaks the whole save. */
  test('takes the keys out of the save and leaves the settings', () => {
    const keys = encodeURIComponent(JSON.stringify({ STOCK_PROVIDER: { keys: { finnhub: 'fh-key' }, spare: '' } }));
    const save = { STOCK_PROVIDER: { value: 'finnhub' }, STOCK_API_KEY: { value: 'fh-key' }, [PAGE_KEYS_FIELD]: { value: keys } };

    const result = takePageKeys(encodeURIComponent(JSON.stringify(save)));

    expect(JSON.parse(result.response)).toEqual({ STOCK_PROVIDER: { value: 'finnhub' }, STOCK_API_KEY: { value: 'fh-key' } });
    expect(result.keys).toEqual({ STOCK_PROVIDER: { keys: { finnhub: 'fh-key' }, spare: '' } });
  });

  /** A close that is not a save, such as CANCELLED, has to reach Clay as it came, so it is turned away as it always was. */
  test('leaves a response that is not a save as it came', () => {
    const result = takePageKeys('CANCELLED');

    expect(result).toEqual({ response: 'CANCELLED', keys: null });
  });
});

describe('fileSavedRows', () => {
  /** The migration. A phone that saved one key before keeping one per provider has to keep it as the key of the provider it was for. */
  test('files a saved key with no entry of its own under the provider saved beside it', () => {
    const settings = { STOCK_PROVIDER: 'alphavantage', STOCK_API_KEY: 'av-key' };

    const result = fileSavedRows(none(), settings, {}, stockPage()).STOCK_PROVIDER;

    expect(result).toEqual({ keys: { alphavantage: 'av-key' }, spare: '', owner: 'alphavantage' });
  });

  /** A face that never saved its provider fetches with the page's default, so the key it saved is that provider's. */
  test('files a key under the default provider when the select was never saved', () => {
    const settings = { STOCK_API_KEY: 'fh-key' };

    const result = fileSavedRows(none(), settings, { STOCK_PROVIDER: 'finnhub' }, stockPage()).STOCK_PROVIDER.keys;

    expect(result).toEqual({ finnhub: 'fh-key' });
  });

  /** A select saved blank, as one whose saved provider the page does not offer, is no provider, and a key filed under a blank name could never be picked. */
  test('files nothing under a select saved blank', () => {
    const settings = { STOCK_PROVIDER: '', STOCK_API_KEY: 'some-key' };

    const result = fileSavedRows(none(), settings, { STOCK_PROVIDER: 'finnhub' }, stockPage()).STOCK_PROVIDER;

    expect(result).toEqual({ keys: {}, spare: 'some-key', owner: '' });
  });

  /** Yahoo never takes a key, so filing one there lost it behind a hidden row. It is kept apart for the next provider that needs one. */
  test('keeps a key saved under a provider its row hides for as the spare', () => {
    const settings = { STOCK_PROVIDER: 'yahoo', STOCK_API_KEY: 'leftover' };

    const result = fileSavedRows(none(), settings, {}, stockPage()).STOCK_PROVIDER;

    expect(result).toEqual({ keys: {}, spare: 'leftover', owner: '' });
  });

  /** The key row is the picked provider's key as the features read it, so it wins over an older copy. */
  test('lets the saved key row win over the key held for the provider picked', () => {
    const held = { STOCK_PROVIDER: { keys: { finnhub: 'old-key', twelvedata: 'td-key' }, spare: '' }, WEATHER_PROVIDER: { keys: {}, spare: '' } };

    const result = fileSavedRows(held, { STOCK_PROVIDER: { value: 'finnhub' }, STOCK_API_KEY: { value: 'new-key' } }, {}, stockPage()).STOCK_PROVIDER.keys;

    expect(result).toEqual({ finnhub: 'new-key', twelvedata: 'td-key' });
  });
});

describe('keysForOpen', () => {
  /**
   * A provider moved with no page save, such as by a face update, leaves the old provider's key on
   * the row. Filed under the new provider, it was sent to a provider that turned it away.
   */
  test('files the row under the provider it belongs to when the saved provider moved', () => {
    const held = { STOCK_PROVIDER: { keys: { twelvedata: 'td-key' }, spare: '', owner: 'finnhub' }, WEATHER_PROVIDER: { keys: {}, spare: '' } };

    const result = keysForOpen(held, { STOCK_PROVIDER: 'twelvedata', STOCK_API_KEY: 'fh-key' }, {}, stockPage()).STOCK_PROVIDER.keys;

    expect(result).toEqual({ twelvedata: 'td-key', finnhub: 'fh-key' });
  });
});

describe('moveKeyRow', () => {
  /** The settle that moves a dropped provider has to hand the row the new provider's own key, or the feature fetches with the old one. */
  test('files the row under the old provider and takes the new one\'s key', () => {
    const held = { STOCK_PROVIDER: { keys: { twelvedata: 'td-key' }, spare: '' }, WEATHER_PROVIDER: { keys: {}, spare: '' } };
    const saved: Record<string, unknown> = { STOCK_PROVIDER: 'twelvedata', STOCK_API_KEY: 'fh-key' };

    const result = moveKeyRow(held, saved, 'STOCK_PROVIDER', 'finnhub', 'twelvedata', stockPage()).STOCK_PROVIDER;

    expect(result).toEqual({ keys: { twelvedata: 'td-key', finnhub: 'fh-key' }, spare: '', owner: 'twelvedata' });
    expect(saved.STOCK_API_KEY).toBe('td-key');
  });

  /** With no key held for the new provider, an empty row asks for one, where the old provider's key would fail as INVALID KEY. */
  test('takes the row out of the settings when the new provider has no key', () => {
    const saved: Record<string, unknown> = { STOCK_PROVIDER: 'twelvedata', STOCK_API_KEY: 'fh-key' };

    moveKeyRow(none(), saved, 'STOCK_PROVIDER', 'finnhub', 'twelvedata', stockPage());

    const result = 'STOCK_API_KEY' in saved;

    expect(result).toBe(false);
  });
});

describe('forgetOwners', () => {
  /** A restore from the watch brings the key row and its provider together, so an owner the phone recorded earlier would file the watch's key under the wrong provider. */
  test('forgets every recorded owner and keeps the keys', () => {
    const held = { STOCK_PROVIDER: { keys: { alphavantage: 'av' }, spare: '', owner: 'alphavantage' }, WEATHER_PROVIDER: { keys: {}, spare: '', owner: 'owm' } };

    const result = forgetOwners(held);

    expect(result).toEqual({ STOCK_PROVIDER: { keys: { alphavantage: 'av' }, spare: '' }, WEATHER_PROVIDER: { keys: {}, spare: '' } });
  });
});

describe('fileSavedRows on a page without the key row', () => {
  /** A select whose key row is not on the page has no row to file, and an owner recorded for it would move a key on the next launch for nothing. */
  test('leaves a select with no key row on the page as it was', () => {
    const held = { STOCK_PROVIDER: { keys: { finnhub: 'fh' }, spare: '', owner: 'finnhub' }, WEATHER_PROVIDER: { keys: {}, spare: '' } };
    const page = [{ type: 'select', messageKey: 'STOCK_PROVIDER', options: [{ label: 'Yahoo', value: 'yahoo' }] }] as ClayConfigItem[];

    const result = fileSavedRows(held, { STOCK_PROVIDER: 'yahoo' }, {}, page);

    expect(result).toEqual(held);
  });
});

describe('mergeProviderKeys', () => {
  /** A save from a page that only knew some providers must not wipe the keys of the others. */
  test('keeps a provider\'s key the page sent nothing for', () => {
    const held = { STOCK_PROVIDER: { keys: { finnhub: 'fh-key', alphavantage: 'av-key' }, spare: '' }, WEATHER_PROVIDER: { keys: { owm: 'owm-key' }, spare: 'w-spare' } };

    const result = mergeProviderKeys(held, { STOCK_PROVIDER: { keys: { alphavantage: 'new-av' }, spare: '' } });

    expect(result).toEqual({ STOCK_PROVIDER: { keys: { finnhub: 'fh-key', alphavantage: 'new-av' }, spare: '' }, WEATHER_PROVIDER: { keys: { owm: 'owm-key' }, spare: 'w-spare' } });
  });

  /** A damaged store reads as no keys rather than stopping the page from opening. */
  test('reads a store that does not parse as no keys', () => {
    const result = loadProviderKeys(storageWith('{not json'));

    expect(result).toEqual({ WEATHER_PROVIDER: { keys: {}, spare: '' }, STOCK_PROVIDER: { keys: {}, spare: '' } });
  });

  /** A key filed under a blank name could never be picked, so one read back from anywhere is left out. */
  test('leaves out a key held under a blank provider', () => {
    const result = loadProviderKeys(storageWith(JSON.stringify({ STOCK_PROVIDER: { keys: { '': 'lost', finnhub: 'fh' }, spare: '' } }))).STOCK_PROVIDER.keys;

    expect(result).toEqual({ finnhub: 'fh' });
  });
});

describe('rowHidesFor', () => {
  /**
   * The keys code has to count a row hidden exactly when the page hides it. A blank select shows a
   * notIn row, so counting it hidden blanked a row the wearer could see, and the next save wiped the key.
   */
  test.each([
    ['a notIn row on a blank select', { key: 'STOCK_PROVIDER', notIn: ['yahoo'] }, '', false],
    ['a notIn row on a value it names', { key: 'STOCK_PROVIDER', notIn: ['yahoo'] }, 'yahoo', true],
    ['a notIn row on a value named in another case', { key: 'STOCK_PROVIDER', notIn: ['Yahoo'] }, 'yahoo', false],
    ['a row with both in and notIn, by its notIn', { key: 'STOCK_PROVIDER', in: ['finnhub'], notIn: ['yahoo'] }, 'twelvedata', false],
    ['an in row on a value it leaves out', { key: 'STOCK_PROVIDER', in: ['finnhub'] }, 'twelvedata', true],
  ])('reads %s as the page does', (_label, condition, value, expected) => {
    const page = [{ type: 'select', messageKey: 'STOCK_PROVIDER' }, { type: 'input', messageKey: 'STOCK_API_KEY', visibleWhen: condition }] as ClayConfigItem[];
    const shown = pageShows(condition, value);

    const result = rowHidesFor(page, 'STOCK_PROVIDER', 'STOCK_API_KEY')(value);

    expect(result).toBe(expected);
    expect(result).toBe(!shown);
  });
});

describe('dropSelectKeys', () => {
  /** A list that takes the key row away left its keys on the phone for good, with nothing on the page to change them. */
  test('empties the keys of the select whose row went', () => {
    const held = { STOCK_PROVIDER: { keys: { finnhub: 'fh' }, spare: 'x', owner: 'finnhub' }, WEATHER_PROVIDER: { keys: { owm: 'owm' }, spare: '' } };

    const result = dropSelectKeys(held, 'STOCK_PROVIDER');

    expect(result).toEqual({ STOCK_PROVIDER: { keys: {}, spare: '' }, WEATHER_PROVIDER: { keys: { owm: 'owm' }, spare: '' } });
  });
});

describe('addProviderKeys', () => {
  /** The page code swaps the row from these, so a row opened without them would hand the old key to the new provider. */
  test('gives the key row the keys, the spare, and the owner held for its select', () => {
    const page = buildConfig({ stocks: {} });

    addProviderKeys(page, { STOCK_PROVIDER: { keys: { finnhub: 'fh-key' }, spare: 'spare-key', owner: 'finnhub' }, WEATHER_PROVIDER: { keys: {}, spare: '' } });

    expect(rowOf(page, 'STOCK_API_KEY')?.providerKeys?.select).toBe('STOCK_PROVIDER');
    expect(keysOn(rowOf(page, 'STOCK_API_KEY'))).toEqual({ keys: { finnhub: 'fh-key' }, spare: 'spare-key', owner: 'finnhub' });
  });

  /** Yahoo needs no key and the plugin hides the row, so the keys must leave the row's own hiding as it was. */
  test('leaves the key row hiding for a keyless provider and the plugin', () => {
    const page = stockPage();
    const before = { visibleWhen: rowOf(page, 'STOCK_API_KEY')?.visibleWhen, pluginSourceHides: rowOf(page, 'STOCK_API_KEY')?.pluginSourceHides };

    addProviderKeys(page, none());

    const result = { visibleWhen: rowOf(page, 'STOCK_API_KEY')?.visibleWhen, pluginSourceHides: rowOf(page, 'STOCK_API_KEY')?.pluginSourceHides };

    expect(result).toEqual(before);
    expect(result.visibleWhen).toEqual({ key: 'STOCK_PROVIDER', notIn: ['yahoo'] });
  });

  /** A list of Yahoo alone narrows the key row away, so the page has nothing to swap and needs no page code. */
  test('finds no key row on a page narrowed to a keyless provider', () => {
    const page = faceProvidersFor({ stocks: { offered: ['yahoo'], needsKey: false } }).narrow(buildConfig({ stocks: {} }));

    const result = hasKeyRows(page);

    expect(result).toBe(false);
  });

  /** The page brings every provider's key back only in the hidden store, so a page without it would keep the picked one's alone. */
  test('adds the hidden store the save brings the keys back in, outside any section', () => {
    const page = buildConfig({ stocks: {} });

    addProviderKeys(page, none());

    const result = page[page.length - 1];

    expect(result).toEqual({ type: 'hiddenStore', messageKey: PAGE_KEYS_FIELD, storeClass: 'pf-provider-keys', defaultValue: '' });
  });

  /** A key row with no select above it, such as one left by a face's own page, has nothing to switch on. */
  test('gives nothing to a key row whose select is not on the page', () => {
    const page: ClayConfigItem[] = [{ type: 'input', messageKey: 'STOCK_API_KEY' }];

    const result = addProviderKeys(page, none());

    expect(result).toBe(false);
    expect(page).toEqual([{ type: 'input', messageKey: 'STOCK_API_KEY' }]);
  });
});
