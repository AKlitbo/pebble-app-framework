// @vitest-environment jsdom
/**
 * Specs for the page code that tells a face's builders which Data Sources are on the plugin.
 *
 * A builder cannot read the source selects itself, so this is the only way its warnings hear that a
 * stock panel's source is the plugin. Worth pinning are that every hooked builder hears the picked
 * sources once the page is built and again on each change, that a kind with no select on the page reads
 * as picked, which warns only for a kind the plugin source page left in the kinds row, that the select keys and the plugin value written out here match the build's, and
 * that the hook it calls is the one the warnings piece hangs. The test drives a stand-in page.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import builderPluginSources from './builder-plugin-sources-fn';
import { combineCustomFns } from './custom-fn';
import { createPluginWarnings } from './builder/ts/shared/plugin-warnings';
import type { PickedKinds, PluginKind, PluginSourcesHost } from './builder/ts/shared/plugin-warnings';
import { pluginSourcePage, PLUGIN_KINDS_TYPE, PLUGIN_VALUE } from '../plugin-sources/page';
import type { PluginSourceInputs } from '../plugin-sources/page';
import { PLUGIN_KINDS_CLASS } from '../plugin-sources/kinds-component';
import { CALENDAR_SOURCE_SELECT, CALENDAR_TEXTS } from '../plugin-sources/calendar';
import { CALENDAR_STANDARD, WEATHER_STANDARD } from '../plugin-sources/standard';
import buildConfig from '../pkjs/config-builder';
import type { ClayConfigItem } from './types';
import { PROVIDERS } from '../../tools/manifest/providers.ts';

/** A stand-in Clay row over an element, holding a value and calling its change handlers when the spec picks one. */
class FakeRow {
  readonly changeHandlers: Array<() => void> = [];

  constructor(readonly element: HTMLElement, public value: unknown) {}

  get $element(): HTMLElement[] {
    return [this.element];
  }

  get(): unknown {
    return this.value;
  }

  on(event: string, handler: () => void): void {
    if (event === 'change') {
      this.changeHandlers.push(handler);
    }
  }

  /** Picks a value, as the wearer does. */
  pick(value: unknown): void {
    this.value = value;
    this.changeHandlers.forEach((handler) => handler());
  }
}

/** A select row on its own element. */
function select(value: unknown): FakeRow {
  return new FakeRow(document.createElement('div'), value);
}

/** A builder row whose hook records every hand over. */
function builder(): { row: FakeRow; heard: PickedKinds[] } {
  const element = document.createElement('div') as PluginSourcesHost;
  const heard: PickedKinds[] = [];

  element._pfPluginSources = (picked) => {
    heard.push(picked);
  };

  return { row: new FakeRow(element, ''), heard };
}

/**
 * The warnings a builder shows for these panels, with the kinds row the plugin source page wrote for
 * these inputs, on a page holding only the builder.
 */
function warningsUnder(page: ClayConfigItem[], inputs: PluginSourceInputs, panelKinds: Record<string, PluginKind>): string[] {
  const kinds = document.createElement('input');
  const root = document.createElement('div') as PluginSourcesHost;
  const watch = document.createElement('div');
  const store = pluginSourcePage(page, inputs).find((item) => item.type === PLUGIN_KINDS_TYPE);

  kinds.className = PLUGIN_KINDS_CLASS;
  kinds.value = String(store ? store.defaultValue : '');
  document.body.appendChild(kinds);
  root.appendChild(watch);
  document.body.appendChild(root);
  createPluginWarnings({ root, after: watch, panelKinds }).update(Object.keys(panelKinds));
  makePage({ LAYOUT: new FakeRow(root, '') });

  return [...root.querySelectorAll('.pf-plugin-warning')].map((warning) => String(warning.textContent));
}

/** A stand-in page over rows keyed by message key, built once the given page code has run. Returns the keys it was asked for. */
function makePage(rows: Record<string, FakeRow>, code: typeof builderPluginSources = builderPluginSources): string[] {
  const asked: string[] = [];
  let afterBuild: (() => void) | null = null;
  const page = {
    EVENTS: { AFTER_BUILD: 'after_build' },
    on(event: string, handler: () => void) {
      if (event === 'after_build') {
        afterBuild = handler;
      }
    },
    getAllItems: () => Object.values(rows),
    getItemByMessageKey: (key: string) => {
      asked.push(key);
      return rows[key];
    },
  };

  code.call(page);
  afterBuild?.();

  return asked;
}

/** A subscription that has saved nothing yet. */
const NO_STATE = { pluginUuid: null, lastError: null, lastEmpty: false };

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('builder plugin sources page code', () => {
  /** A builder that never hears the sources treats every weather, stock, and calendar panel as fetched, so it never warns. */
  test('hands every hooked builder the picked sources once the page is built', () => {
    const first = builder();
    const second = builder();

    makePage({ LAYOUT: first.row, OPS: second.row, WEATHER_PROVIDER: select(PLUGIN_VALUE), STOCK_PROVIDER: select('finnhub'), CALENDAR_SOURCE: select(PLUGIN_VALUE) });
    const result = [first.heard, second.heard];

    expect(result).toEqual([[{ weather: true, stocks: false, calendar: true }], [{ weather: true, stocks: false, calendar: true }]]);
  });

  /** The wearer switches the source while looking at the builder, and the warning has to follow at once. */
  test('hands the sources over again when a select changes', () => {
    const hooked = builder();
    const stocks = select('finnhub');

    makePage({ LAYOUT: hooked.row, WEATHER_PROVIDER: select('openmeteo'), STOCK_PROVIDER: stocks, CALENDAR_SOURCE: select('ical') });
    stocks.pick(PLUGIN_VALUE);
    const result = hooked.heard[hooked.heard.length - 1];

    expect(result).toEqual({ weather: false, stocks: true, calendar: false });
  });

  /**
   * A face whose providers list is the plugin alone gets no select, and its panels read the plugin
   * whatever the page shows. Reading that kind as not picked kept its panels quiet while the kinds row
   * said the plugin was off or missing.
   */
  test('reads a kind with no select on the page as picked', () => {
    const hooked = builder();

    makePage({ LAYOUT: hooked.row });
    const result = hooked.heard;

    expect(result).toEqual([{ weather: true, stocks: true, calendar: true }]);
  });

  /**
   * The wearer of a face that only reads weather from the plugin has to hear that plugins are off, or
   * the weather panels sit empty with nothing said. That face has no Data Source select, and its kind
   * is in the kinds row the plugin source page wrote.
   */
  test('warns about the panels of a plugin only face with no select on the page', () => {
    const inputs: PluginSourceInputs = { category: 'weather', item: 'location', plugins: [], messageKeys: {}, state: NO_STATE, standard: WEATHER_STANDARD, texts: {} };

    const result = warningsUnder([{ type: 'submit', defaultValue: 'Save' }], inputs, { Temp: 'weather' });

    expect(result).toEqual([expect.stringContaining('Temp')]);
  });

  /**
   * With plugins off the calendar select drops to its one iCal option, and the face goes on reading its
   * iCal link. The builder warned that the agenda needed plugins turned on while the agenda was filling
   * from the link.
   */
  test('stays quiet for a face whose only select dropped while on its own source', () => {
    const inputs: PluginSourceInputs = {
      selectKey: 'CALENDAR_SOURCE',
      category: 'calendar',
      item: 'event',
      plugins: [],
      messageKeys: { CALENDAR_SOURCE: 1, CALENDAR_ICS_URL: 2 },
      state: NO_STATE,
      standard: CALENDAR_STANDARD,
      texts: CALENDAR_TEXTS,
      insert: { select: CALENDAR_SOURCE_SELECT, anchorKey: 'CALENDAR_ICS_URL' },
      saved: 'ical',
    };

    const result = warningsUnder(buildConfig({ calendar: {} }), inputs, { Agenda: 'calendar' });

    expect(result).toEqual([]);
  });

  /** A page with no builder on it has nothing to tell, so the selects are left alone. */
  test('does nothing on a page with no hooked row', () => {
    const stocks = select('finnhub');

    makePage({ STOCK_PROVIDER: stocks });
    const result = stocks.changeHandlers;

    expect(result).toEqual([]);
  });

  /**
   * The keys and the plugin value are written out here, since the page code reaches nothing outside
   * itself. A select key that drifted from the build's would read that kind as never picked.
   */
  test('reads the select each plugin kind in the build joins', () => {
    const asked = makePage({ LAYOUT: builder().row });

    const result = [...new Set(asked)].sort();

    expect(result).toEqual(PROVIDERS.filter((provider) => provider.plugin && provider.plugin.selectKey).map((provider) => provider.plugin.selectKey).sort());
  });

  /**
   * The app combines this with the framework's other page code and the face's customClay, and the
   * page runs the text Clay writes rather than the function. Losing it there would leave every chosen
   * kind unnamed.
   */
  test('runs from the text Clay writes when combined with a face\'s own page code', () => {
    const hooked = builder();
    const combined = combineCustomFns([
      { code: builderPluginSources, label: 'the builder plugin sources' },
      { code: function () {}, label: 'the face\'s own page code' },
    ]);
    const written = new Function('return ' + String(combined))() as typeof builderPluginSources;

    makePage({ LAYOUT: hooked.row, WEATHER_PROVIDER: select(PLUGIN_VALUE), STOCK_PROVIDER: select('finnhub'), CALENDAR_SOURCE: select('ical') }, written);
    const result = hooked.heard;

    expect(result).toEqual([{ weather: true, stocks: false, calendar: false }]);
  });

  /** The page code and the warnings meet only on the hook's name, so a rename on one side would leave every stock panel unnamed. */
  test('reaches the warnings piece through its hook', () => {
    const kinds = document.createElement('input');
    const root = document.createElement('div') as PluginSourcesHost;
    const watch = document.createElement('div');

    kinds.className = PLUGIN_KINDS_CLASS;
    kinds.value = '{"stocks":"missing"}';
    document.body.appendChild(kinds);
    root.appendChild(watch);
    document.body.appendChild(root);
    createPluginWarnings({ root, after: watch, panelKinds: { Stock: 'stocks' } }).update(['Stock']);

    makePage({ LAYOUT: new FakeRow(root, ''), STOCK_PROVIDER: select(PLUGIN_VALUE) });
    const result = root.querySelectorAll('.pf-plugin-warning').length;

    expect(result).toBe(1);
  });
});
