// @vitest-environment jsdom
/**
 * Specs for the supported plugins panel Clay component.
 *
 * It is registered on the settings page, so Clay serializes it by writing each function's toString,
 * and a shorthand method stops the whole page parsing. Past that, what matters is where a tap on a
 * store plugin takes the wearer. With `Pebble.openUrl` it has to go through that call and never load
 * the listing inside the settings page, which would lose every unsaved change. Without the call the
 * name must not be a link at all. The words a plugin names itself with have to show as text.
 */
import { describe, test, expect, afterEach, vi } from 'vitest';
import component from './panel-component';
import { escapeHtml } from './escape';
import * as harness from '../clay/builder/ts/testing/harness';
import type { ClayComponentDefinition } from '../clay/builder/ts/testing/harness';
import type { PluginPanelContent } from '../clay/types';

// where MET Norway Weather's listing is on the store
const LISTING = 'https://apps.repebble.com/met-norway-weather_6972cb1f33e343d69e5b788e';

/** A panel listing the built-in weather plugin and one store plugin, escaped as the page carries it. */
function content(overrides: Partial<PluginPanelContent> = {}): PluginPanelContent {
  return {
    title: 'Plugins This Watchface Supports',
    intro: 'Intro.',
    off: '',
    kinds: [{
      category: 'weather',
      item: 'location',
      label: 'Weather',
      entries: [
        { name: 'Weather', tag: 'Built Into the Pebble App', listing: '' },
        { name: 'MET Norway Weather', tag: '', listing: LISTING },
      ],
    }],
    ...overrides,
  };
}

/** Mounts the panel the way Clay does and runs initialize. */
function showPanel(panel: PluginPanelContent) {
  const { ctx, root } = harness.mount(component as unknown as ClayComponentDefinition, { panel });

  ctx.initialize();

  return root;
}

/** Gives the page the Pebble app's openUrl, recording what it was asked to open. */
function withOpenUrl() {
  const openUrl = vi.fn(() => Promise.resolve(true));

  (window as unknown as { Pebble?: unknown }).Pebble = { openUrl };

  return openUrl;
}

afterEach(() => {
  delete (window as unknown as { Pebble?: unknown }).Pebble;
});

describe('Clay serialization safety', () => {
  /** Shorthand method syntax is written out as `set:set(value) {`, and the config page never opens. */
  test.each([
    ['initialize', component.initialize],
    ['set', component.manipulator.set],
    ['get', component.manipulator.get],
  ])('declares %s as a function expression', (_name, method) => {
    const result = String(method);

    expect(result.startsWith('function')).toBe(true);
  });
});

describe('opening and closing', () => {
  /** A panel that opened by itself would push the rest of the page down under the wearer's finger. */
  test('starts closed, under its title', () => {
    const root = showPanel(content());

    const result = root.querySelector('details');

    expect(result?.open).toBe(false);
    expect(result?.querySelector('summary')?.textContent).toBe('Plugins This Watchface Supports');
  });
});

describe('links', () => {
  /** A plain link loads the listing inside the settings page, and the wearer loses every change they had not saved. */
  test('opens a listing through Pebble.openUrl and keeps the page where it is', () => {
    const openUrl = withOpenUrl();
    const root = showPanel(content());
    const link = root.querySelector('.pf-plugins-link') as HTMLAnchorElement;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });

    link.dispatchEvent(click);

    const result = openUrl.mock.calls;

    expect(result).toEqual([[LISTING]]);
    expect(click.defaultPrevented).toBe(true);
  });

  /** Without the call, a tap on a link would load the listing inside the settings page. */
  test('shows names as plain text with the listing address under them when there is no openUrl', () => {
    const root = showPanel(content());

    const result = { links: root.querySelectorAll('a').length, address: root.querySelector('.pf-plugins-address')?.textContent };

    expect(result).toEqual({ links: 0, address: 'apps.repebble.com/met-norway-weather_6972cb1f33e343d69e5b788e' });
  });

  /** Only the store's own listings are ever opened, whatever address a row comes to hold. */
  test('never links an address off the store', () => {
    withOpenUrl();
    const panel = content();

    panel.kinds[0].entries[1].listing = 'https://example.com/plugin';

    const result = showPanel(panel).querySelectorAll('a').length;

    expect(result).toBe(0);
  });

  /** A refused or broken call must not throw out of the click and stop the page answering. */
  test('keeps an openUrl that throws inside the click', () => {
    (window as unknown as { Pebble?: unknown }).Pebble = {
      openUrl: () => {
        throw new Error('bridge broke');
      },
    };
    const link = showPanel(content()).querySelector('.pf-plugins-link') as HTMLAnchorElement;

    const result = () => link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(result).not.toThrow();
  });
});

describe('the words', () => {
  /** A name that became markup would run its script inside the settings page, and one that kept its escapes would read as garbage. */
  test('shows an escaped plugin name as the text it stands for', () => {
    const panel = content();

    panel.kinds[0].entries.push({ name: escapeHtml('<img src=x onerror=alert(1)>'), tag: 'Installed', listing: '' });

    const root = showPanel(panel);
    const result = Array.from(root.querySelectorAll('.pf-plugins-name')).map((name) => name.textContent);

    expect(result).toEqual(['Weather', 'MET Norway Weather', '<img src=x onerror=alert(1)>']);
    expect(root.querySelectorAll('img')).toHaveLength(0);
  });

  /** A name holding a dollar sign arrives escaped so Clay's replace cannot read it as a pattern, and one that kept the escape would read as garbage. */
  test('shows a plugin name with dollar signs as written', () => {
    const panel = content();

    panel.kinds[0].entries.push({ name: escapeHtml('Rain$\'Check $$SETTINGS$$'), tag: 'Installed', listing: '' });

    const root = showPanel(panel);
    const result = Array.from(root.querySelectorAll('.pf-plugins-name')).map((name) => name.textContent);

    expect(result).toEqual(['Weather', 'MET Norway Weather', 'Rain$\'Check $$SETTINGS$$']);
  });

  /** Clay pastes the panel's methods into the page with a plain string replace, so a dollar sign in them would be read as a pattern. */
  test('carries no dollar sign pattern in its methods', () => {
    const result = [component.initialize, component.manipulator.set, component.manipulator.get].map(String).join('\n');

    expect(result).not.toMatch(/\$[$&'`]/);
  });

  /** With plugins off the panel must open on how to turn them on, or the plugins it lists stay out of reach. */
  test('opens on the line to turn plugins on when there is one', () => {
    const root = showPanel(content({ off: 'Turn on plugins.' }));

    const result = root.querySelector('.pf-plugins-body')?.firstElementChild;

    expect(result?.className).toBe('pf-plugins-off');
    expect(result?.textContent).toBe('Turn on plugins.');
  });

  /** A phone with plugins on must not be told to turn them on. */
  test('draws no line to turn plugins on when there is none', () => {
    const root = showPanel(content());

    const result = root.querySelector('.pf-plugins-off');

    expect(result).toBeNull();
  });
});
