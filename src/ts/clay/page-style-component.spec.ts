/**
 * Specs for the framework's rules for the whole settings page.
 *
 * Each spec builds the real page the phone builds, with Clay's own base sheet and component styles,
 * and opens it in jsdom, whose computed style weighs selectors the way a browser does. What is worth
 * pinning is that the rules match Clay's own, that they reach a page with no page code and land once,
 * that every row sits the same with the sheets in either order, and that in the usual order no row
 * moves. The location search and the theme picker borrow the classes of Clay's text box and select,
 * and the page brings Clay's own style for each with them wherever they are. A text row marked
 * `pf-footer` is centred in either order.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createClay, prepareSettingsPage } from '../pkjs/app';
import { stubModuleLoad } from '../testing/module-load';
import pageStyleComponent, { CLAY_ROW_PADDING } from './page-style-component';
import type { FeatureHooks } from '../pkjs/feature';
import type { ClayConfigItem } from './types';

/** A checkbox group, whose options Clay takes as plain words, which the page's types do not cover. */
const CHECKBOXES = { type: 'checkboxgroup', messageKey: 'SOME', label: 'Some', defaultValue: [true], options: ['A'] } as unknown as ClayConfigItem;

/** A section holding one row of each kind Clay draws, plus the framework's location search. */
const ROWS: ClayConfigItem[] = [
  {
    type: 'section',
    items: [
      { type: 'heading', defaultValue: 'Rows' },
      { type: 'text', defaultValue: 'One of each.' },
      { type: 'select', messageKey: 'PICK', label: 'Pick', defaultValue: 'a', options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] },
      { type: 'input', messageKey: 'WORDS', label: 'Words' },
      { type: 'toggle', messageKey: 'SWITCH', label: 'Switch', defaultValue: true },
      { type: 'slider', messageKey: 'LEVEL', label: 'Level', defaultValue: 2, attributes: { min: 0, max: 5 } },
      { type: 'color', messageKey: 'INK', label: 'Ink', defaultValue: '000000' },
      { type: 'radiogroup', messageKey: 'ONE', label: 'One', defaultValue: 'a', options: [{ label: 'A', value: 'a' }] },
      CHECKBOXES,
      { type: 'button', defaultValue: 'Press' },
      { type: 'locationsearch', messageKey: 'PLACE', label: 'Place' },
    ],
  },
  { type: 'submit', defaultValue: 'Save' },
  { type: 'footer', defaultValue: 'The end.' },
];

/** Every row kind ROWS puts in its card, top to bottom. */
const ROW_KINDS = ['component-heading', 'component-text', 'component-select', 'component-input', 'component-toggle', 'component-slider', 'component-color', 'component-radio', 'component-checkbox', 'component-button', 'component-input'];

/**
 * The rows whose Clay rule sets one side rather than the whole padding, such as a radio group's right.
 *
 * jsdom weighs a shorthand under its own name, so Clay's reset sheet's `padding: 0` on every div
 * beats a single side set by any rule ahead of it, whatever its weight. A browser weighs each side on
 * its own. So the Android order specs below leave these rows out, and the page check's android-head
 * scenarios check them in Chromium.
 */
const ONE_SIDE = Object.keys(CLAY_ROW_PADDING).filter((kind) => !CLAY_ROW_PADDING[kind].startsWith('padding:'));

/** The rows jsdom can weigh in the Android order. */
function wholePadding(rows: Array<{ kind: string; padding: string }>): Array<{ kind: string; padding: string }> {
  return rows.filter((row) => !ONE_SIDE.includes(row.kind));
}

/** A single row in a card, on a page with nothing else on it. */
function lonePage(item: ClayConfigItem): ClayConfigItem[] {
  return [{ type: 'section', items: [item] }];
}

/** The class that marks the framework's rule among the page's style rules. */
const RULE_MARK = '.component.component-select';

let restoreLoad: () => void;

beforeEach(() => {
  restoreLoad = stubModuleLoad((id) => (id === 'message_keys' ? {} : undefined));
  vi.stubGlobal('Pebble', {
    platform: 'emery',
    addEventListener() {},
    getAccountToken: () => '',
    getWatchToken: () => '',
    getActiveWatchInfo: () => ({ platform: 'emery', firmware: { major: 4, minor: 3, patch: 0 } }),
  });

  const store: Record<string, string> = {};

  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  });
});

afterEach(() => {
  restoreLoad();
  vi.unstubAllGlobals();
});

/** The page Clay writes, as the HTML inside its data url. */
function pageHtml(clay: InstanceType<ClayConstructor>): string {
  const url = clay.generateUrl();

  return decodeURIComponent(url.slice(url.indexOf(',') + 1));
}

/** Opens a page in jsdom with its scripts running, so Clay registers its components and draws the rows. */
function openPage(html: string): JSDOM {
  return new JSDOM(html, { runScripts: 'dangerously', virtualConsole: new VirtualConsole() });
}

/** Every element on the page a selector matches, in page order. */
function all(dom: JSDOM, selector: string): Element[] {
  return Array.from(dom.window.document.querySelectorAll(selector)) as Element[];
}

/** Clay's base sheet, the one style the page carries from the start, with its fonts in it. */
function baseSheet(dom: JSDOM): Element {
  return all(dom, 'style').find((style) => (style.textContent || '').includes('@font-face')) as Element;
}

/**
 * Builds the phone's page, leaving the framework's rules off when asked, and opens it in either order.
 *
 * The Android order is the Android app's, with every component's style ahead of Clay's base sheet.
 * jsdom weighs sheets in the order they were added rather than where they sit in the page, so the
 * two heads the Android app makes would change nothing here. Moving the base sheet behind the
 * component styles gives the cascade the same order, by where they sit and by when they were added.
 */
function buildPage(order: 'usual' | 'android', withRule = true, clayConfig: ClayConfigItem[] = ROWS): JSDOM {
  const clay = createClay({ clayConfig });

  if (!withRule) {
    delete clay.components[pageStyleComponent.name];
  }

  const dom = openPage(pageHtml(clay));

  if (order === 'android') {
    const base = baseSheet(dom);

    (base.parentNode as Element).appendChild(base);
  }

  return dom;
}

/** Every row in a section, by its kind, with its four paddings as the page computes them. */
function rowPaddings(dom: JSDOM): Array<{ kind: string; padding: string }> {
  return all(dom, '.section > .component').map((row) => {
    const style = dom.window.getComputedStyle(row);
    const kind = Array.from(row.classList).find((name) => name.startsWith('component-')) || row.className;

    return { kind, padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].join(' ') };
  });
}

/** Puts a rule's declarations in one agreed form, so spacing and a last semicolon cannot tell two apart. */
function declarations(text: string): string {
  return text.split(';').map((part) => part.trim().replace(/\s*:\s*/, ': ')).filter(Boolean).join('; ');
}

/** The style elements that hold the framework's rule. */
function ruleSheets(dom: JSDOM): Element[] {
  return all(dom, 'style').filter((style) => (style.textContent || '').includes(RULE_MARK));
}

describe('the page style', () => {
  /** A credit line under Save sat to the left on every page that brought no rule of its own to centre it. */
  test.each(['usual', 'android'] as const)('centres a pf-footer line in the %s order', (order) => {
    const dom = buildPage(order, true, [{ type: 'submit', defaultValue: 'Save' }, { type: 'text', defaultValue: '<div class="pf-footer">Data from somewhere.</div>' }]);

    const result = dom.window.getComputedStyle(all(dom, '.pf-footer')[0]).textAlign;

    expect(result).toBe('center');
  });

  /**
   * The rules copy Clay's own row padding. A Clay bump that changed one, or added one, would leave a
   * row the Android app pads again, or pad a row Clay no longer pads, with nothing else noticing.
   */
  test('matches every row rule Clay\'s own components carry', () => {
    const clay = createClay({ clayConfig: ROWS });
    const clayRules: Record<string, string> = {};

    Object.keys(clay.components).filter((name) => name !== pageStyleComponent.name).forEach((name) => {
      const style = String((clay.components[name] as { style?: unknown }).style || '');

      for (const match of style.matchAll(/\.section\s+\.(component-[a-z-]+)\s*\{([^}]*)\}/g)) {
        clayRules[match[1]] = declarations(match[2]);
      }
    });

    const result = Object.fromEntries(Object.entries(CLAY_ROW_PADDING).map(([kind, text]) => [kind, declarations(text)]));

    expect(Object.keys(clay.components)).toEqual(expect.arrayContaining(['button', 'checkboxgroup', 'color', 'footer', 'heading', 'input', 'radiogroup', 'select', 'slider', 'submit', 'text', 'toggle']));
    expect(result).toEqual(clayRules);
  });

  /**
   * The rules ride on a component rather than page code, so a face with no visibleWhen row, no
   * plugins, and no customClay gets them while its page keeps Clay's own do-nothing custom function.
   */
  test('reaches a page that carries no custom function', () => {
    const clay = createClay({ clayConfig: ROWS });

    const result = openPage(pageHtml(clay));

    expect(String(clay.customFn).replace(/\s/g, '')).toBe('function(){}');
    expect(ruleSheets(result)).toHaveLength(1);
  });

  /**
   * The phone opens the page again on every showConfiguration, and a fold that adds a row Clay has
   * no component for builds a second Clay to borrow from. Neither may put the rules on twice.
   */
  test('lands once after the page is prepared on two opens', () => {
    const clay = createClay({ clayConfig: [{ type: 'text', defaultValue: 'Intro' }] });
    const added: ClayConfigItem = { type: 'select', messageKey: 'PICK', label: 'Pick', defaultValue: 'a', options: [{ label: 'A', value: 'a' }] };
    const features: FeatureHooks[] = [{ page: (config) => [...config, { type: 'section', items: [added] }] }];
    const built = { config: clay.config, customFn: clay.customFn };

    prepareSettingsPage(clay, { clayConfig: [{ type: 'text', defaultValue: 'Intro' }] }, features, built);
    prepareSettingsPage(clay, { clayConfig: [{ type: 'text', defaultValue: 'Intro' }] }, features, built);
    const result = openPage(pageHtml(clay));

    expect(ruleSheets(result)).toHaveLength(1);
  });

  /**
   * The Android app with plugins on puts every component's style ahead of Clay's base sheet. Every row
   * has to sit there the way it sits in the usual order. The check that the rules' sheet really sits
   * ahead of the base sheet keeps this from passing on a page laid out the usual way.
   */
  test('sits every row jsdom can weigh the same with the component styles ahead of the base sheet', () => {
    const usual = wholePadding(rowPaddings(buildPage('usual')));
    const dom = buildPage('android');

    const result = wholePadding(rowPaddings(dom));

    expect(ruleSheets(dom)[0].compareDocumentPosition(baseSheet(dom)) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(result).toEqual(usual);
    expect(result.map((row) => row.kind)).toEqual(['component-heading', 'component-text', 'component-select', 'component-input', 'component-toggle', 'component-slider', 'component-color', 'component-input']);
  });

  /**
   * The bug the rules are for. Without them the base sheet's padding wins in the Android order, so
   * every row Clay takes padding off gets a second gap under it or beside it.
   */
  test('a page without the rules moves every row Clay takes padding off in the Android order', () => {
    const usual = wholePadding(rowPaddings(buildPage('usual')));
    const android = wholePadding(rowPaddings(buildPage('android', false)));

    const result = android.filter((row, index) => row.padding !== usual[index].padding).map((row) => row.kind);

    expect(result).toEqual(['component-select', 'component-input', 'component-toggle', 'component-slider', 'component-color', 'component-input']);
  });

  /** In the usual order the rules set what Clay's own rules already set, so no row of any kind moves. */
  test('leaves every row\'s padding as it was in the usual order', () => {
    const without = rowPaddings(buildPage('usual', false));

    const result = rowPaddings(buildPage('usual'));

    expect(result).toEqual(without);
    expect(result.map((row) => row.kind)).toEqual(ROW_KINDS);
  });

  /**
   * A location search draws Clay's text box markup, and Clay adds the text box's style only to a page
   * that registers it. On a page with no text box of its own, a search without that style shows its
   * name beside a plain white field and carries the base sheet's gap on top of its label's.
   */
  test('draws a location search on a page with no plain text box the way Clay draws a text box, in either order', () => {
    const page = lonePage({ type: 'locationsearch', messageKey: 'PLACE', label: 'Place' });
    const look = (dom: JSDOM) => {
      const row = all(dom, '.pf-loc-search')[0];
      const style = (selector: string) => dom.window.getComputedStyle(row.querySelector(selector) as Element);

      return { label: style('label').display, field: style('.pf-loc-query').display, background: style('.pf-loc-query').backgroundColor };
    };

    const result = [buildPage('usual', false, page), buildPage('usual', true, page), buildPage('android', true, page)].map((dom) => ({ look: look(dom), rows: rowPaddings(dom) }));

    expect(result).toEqual(Array(3).fill({
      look: { label: 'block', field: 'block', background: 'rgb(51, 51, 51)' },
      rows: [{ kind: 'component-input', padding: '0px 0px 0px 0px' }],
    }));
  });

  /**
   * The theme picker draws Clay's select markup, and Clay adds the select's style only to a page that
   * registers it. On a page with no select of its own, a picker without that style shows the bare
   * native dropdown over its own name and carries the base sheet's gap on top of its label's.
   */
  test('draws a theme picker on a page with no plain select the way Clay draws a select, in either order', () => {
    const page = lonePage({ type: 'themePreview', messageKey: 'APPEARANCE_THEME', label: 'Theme', defaultValue: 'a', options: [{ label: 'A', value: 'a' }], previews: {} });
    const look = (dom: JSDOM) => {
      const row = all(dom, '.pf-theme')[0];
      const style = (selector: string) => dom.window.getComputedStyle(row.querySelector(selector) as Element);

      return { value: style('.value').display, dropdown: style('.pf-theme-select').opacity, place: style('.pf-theme-select').position };
    };

    const result = [buildPage('usual', false, page), buildPage('usual', true, page), buildPage('android', true, page)].map((dom) => ({ look: look(dom), rows: rowPaddings(dom) }));

    expect(result).toEqual(Array(3).fill({
      look: { value: 'block', dropdown: '0', place: 'absolute' },
      rows: [{ kind: 'component-select', padding: '0px 0px 0px 0px' }],
    }));
  });
});
