// @vitest-environment jsdom
/**
 * Specs for which placed panels a builder warns about.
 *
 * The warning is the wearer's one chance to hear a panel will sit empty before saving. Worth pinning
 * are the rules a reader cannot check by eye: a panel that only reads a plugin warns whatever else is
 * picked, a weather, stock, or calendar panel only warns while its source is the plugin, a served
 * kind and a face with no plugin kinds never warn, and plugins off folds every kind into one warning.
 * The kinds with a choice and the kinds with words are written out here, so they are checked against
 * the build's own tables, and the box reads the framework's plugin kinds row and redraws on the hook
 * the page code calls.
 */

import { describe, test, expect, expectTypeOf, beforeEach } from 'vitest';
import { CHOSEN_KINDS, KINDS_ROW_CLASS, KIND_NEEDS, createPluginWarnings, pluginWarnings, warningText } from './plugin-warnings';
import type { KindState, PluginKind, PluginSourcesHost } from './plugin-warnings';
import type { PluginKindState } from '../../../../plugin-sources/page';
import { PLUGIN_KINDS_CLASS } from '../../../../plugin-sources/kinds-component';
import { PROVIDERS, PROVIDER_KINDS } from '../../../../../tools/manifest/providers.ts';

/** A face's panels and the kind each reads. Battery reads none, so it is left out. */
const PANEL_KINDS: Record<string, PluginKind> = {
  'Phone Battery': 'phone',
  'Battery Battery': 'phone',
  'Now Playing': 'music',
  'Weather': 'weather',
  'Humidity': 'weather',
  'Stock': 'stocks',
  'Watchlist': 'stocks',
  'Agenda': 'calendar',
};

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('pluginWarnings', () => {
  /** With plugins off the phone and music panels sit empty, so both are named in the one warning. */
  test('folds every panel into one warning while plugins are off', () => {
    const states = { phone: 'off', music: 'off', weather: 'off' } as const;

    const result = pluginWarnings(['Phone Battery', 'Now Playing', 'Battery Battery'], PANEL_KINDS, states, {});

    expect(result).toEqual([{ state: 'off', kind: null, panels: ['Phone Battery', 'Now Playing', 'Battery Battery'] }]);
  });

  /** A weather panel on a fetched source fills with plugins off, so warning there would send the wearer looking for nothing. */
  test('leaves out a weather panel whose source is not the plugin', () => {
    const states = { weather: 'off' } as const;

    const result = pluginWarnings(['Weather', 'Humidity'], PANEL_KINDS, states, { weather: false });

    expect(result).toEqual([]);
  });

  /** A stock source left on the plugin with no stock plugin installed shows NO PLUGIN on the watch. */
  test('warns about a stock panel set to the plugin when the phone has none', () => {
    const states = { stocks: 'missing', weather: 'served' } as const;

    const result = pluginWarnings(['Weather', 'Stock', 'Watchlist', 'Stock'], PANEL_KINDS, states, { stocks: true, weather: true });

    expect(result).toEqual([{ state: 'missing', kind: 'stocks', panels: ['Stock', 'Watchlist'] }]);
  });

  /** Each missing kind needs its own plugin, so each gets its own warning, in the same order every time. */
  test('gives each missing kind its own warning in the kinds order', () => {
    const states = { calendar: 'missing', phone: 'missing' } as const;

    const result = pluginWarnings(['Agenda', 'Phone Battery'], PANEL_KINDS, states, { calendar: true });

    expect(result.map((warning) => warning.kind)).toEqual(['phone', 'calendar']);
  });

  /** A served kind fills its panels, so naming them would be a false alarm. */
  test('says nothing about a kind a plugin serves', () => {
    const states = { phone: 'served', music: 'served', calendar: 'served' } as const;

    const result = pluginWarnings(['Phone Battery', 'Now Playing', 'Agenda'], PANEL_KINDS, states, { calendar: true });

    expect(result).toEqual([]);
  });

  /** A face that reads no plugin has no kinds row on its page, so it must show no warning at all. */
  test('says nothing on a page with no plugin kinds', () => {
    const result = pluginWarnings(['Weather', 'Phone Battery'], PANEL_KINDS, {}, { weather: true });

    expect(result).toEqual([]);
  });

  /** The watch's own battery reads no plugin, so naming it under plugins off would send the wearer looking for nothing. */
  test('says nothing about a panel the face gives no kind', () => {
    const states = { phone: 'off' } as const;

    const result = pluginWarnings(['Battery'], PANEL_KINDS, states, {});

    expect(result).toEqual([]);
  });
});

describe('the kinds tables', () => {
  /**
   * A kind given a source select in the build without a place here would warn even while the
   * wearer picked a fetched source for it, and one here with no select would never warn at all.
   */
  test('the chosen kinds are the kinds whose plugin has a source select', () => {
    const result = PROVIDERS.filter((provider) => provider.plugin && provider.plugin.selectKey).map((provider) => provider.kind);

    expect([...CHOSEN_KINDS]).toEqual(result);
  });

  /** A class that drifted from the row's would find no row, and every warning would go quiet. */
  test('finds the plugin kinds row by the class the row carries', () => {
    const result = KINDS_ROW_CLASS;

    expect(result).toBe(PLUGIN_KINDS_CLASS);
  });

  /** A state the plugin page records that this does not know would never warn, and npm run typecheck fails on the drift. */
  test('knows every state the plugin page records', () => {
    expectTypeOf<KindState>().toEqualTypeOf<PluginKindState>();
  });

  /** A kind with no words here would tell the wearer only that the panel needs "a plugin". */
  test('every kind in the providers list has its own words', () => {
    const result = KIND_NEEDS.map((entry) => entry[0]).sort();

    expect(result).toEqual([...PROVIDER_KINDS].sort());
  });
});

describe('warningText', () => {
  /** Plugins off is one switch in the Pebble app, so the words say where it is. */
  test('says where to turn plugins on', () => {
    const result = warningText({ state: 'off', kind: null, panels: ['Now Playing'] });

    expect(result).toBe('Now Playing needs plugins turned on in the Pebble app, under Settings, Plugins.');
  });

  /** Three or more panels read as a list, and the verb agrees with more than one. */
  test('names the kind\'s plugin and lists three panels with a serial comma', () => {
    const result = warningText({ state: 'missing', kind: 'weather', panels: ['Weather', 'Humidity', 'UV'] });

    expect(result).toBe('Weather, Humidity, and UV need a weather plugin in the Pebble app, and your phone has none yet.');
  });
});

describe('createPluginWarnings', () => {
  /** Builds a page holding the framework's kinds row with the given value, and a builder with its watch in it. */
  function mountBuilder(kindsValue: string | null) {
    if (kindsValue !== null) {
      const store = document.createElement('input');

      store.type = 'hidden';
      store.className = PLUGIN_KINDS_CLASS;
      store.value = kindsValue;
      document.body.appendChild(store);
    }

    const root = document.createElement('div') as PluginSourcesHost;
    const watch = document.createElement('div');
    const palette = document.createElement('div');

    root.appendChild(watch);
    root.appendChild(palette);
    document.body.appendChild(root);

    const view = createPluginWarnings({ root, after: watch, panelKinds: PANEL_KINDS });

    return { root, watch, view };
  }

  /** The words on show, one per warning. */
  function shown(): string[] {
    return Array.from(document.querySelectorAll('.pf-plugin-warning')).map((note) => note.lastChild.textContent);
  }

  /** The warnings belong under the watch and above the palette, where the wearer is looking as they drag. */
  test('puts the box straight after the watch', () => {
    const { watch } = mountBuilder('{"music":"off"}');

    const result = (watch.nextSibling as HTMLElement).className;

    expect(result).toBe('pf-plugin-warnings');
  });

  /** The page code finds a builder by this hook, so a builder that never hung it would never hear the sources. */
  test('redraws when the page code hands the picked sources to the hook', () => {
    const { root, view } = mountBuilder('{"stocks":"missing"}');

    view.update(['Stock']);
    root._pfPluginSources({ stocks: true });
    const result = shown();

    expect(result).toEqual(['Stock needs a stock plugin in the Pebble app, and your phone has none yet.']);
  });

  /** Until the page code says otherwise, a stock panel's source is not known to be the plugin, so it is not named. */
  test('names no chosen kind before the picked sources arrive', () => {
    const { view } = mountBuilder('{"stocks":"missing","music":"missing"}');

    view.update(['Stock', 'Now Playing']);
    const result = shown();

    expect(result).toEqual(['Now Playing needs a music plugin in the Pebble app, and your phone has none yet.']);
  });

  /** An empty box would still take up room between the watch and the palette. */
  test('hides the box while every placed panel can fill', () => {
    mountBuilder('{"music":"served"}').view.update(['Now Playing']);

    const result = document.querySelector<HTMLElement>('.pf-plugin-warnings').hidden;

    expect(result).toBe(true);
  });

  /** A kinds row that does not hold an object of states must leave the builder working, with nothing to warn about. */
  test.each([['not json'], ['["off"]'], ['null']])('reads a kinds row holding %s as no kinds', (value) => {
    mountBuilder(value).view.update(['Now Playing', 'Phone Battery']);

    const result = shown();

    expect(result).toEqual([]);
  });
});
