/**
 * Specs for the settings page check's own decisions.
 *
 * The browser part runs only under npm run check:pages. What can be checked here is how the check
 * reads a page against its scenario, how it reads a save and the custom function's text, and whether
 * the scenario table itself can run. A comparison that is wrong passes a broken page, and a table row naming a missing file or a
 * key the fixture never declares fails every run for a reason that is not the page.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { ANDROID_ONLY, BUILT_IN_TAG, OFF_TAG, CALENDAR_EMPTY_TEXT, CALENDAR_NOT_STANDARD_TEXT, CALENDAR_PERMISSION_TEXT, CALENDAR_SOURCE_TEXT, DOLLAR_NAME, DOLLAR_NOT_STANDARD_TEXT, INSTALLED_TAG, COORDS_TEXT, MET_NORWAY_LISTING, STOCKS_CRYPTO_LISTING, PEBBLE_STOCKS_LISTING, WEATHER_PLUS_LISTING, WEATHER_ENHANCED_LISTING, MUSIC_NO_PLUGIN_TEXT, MUSIC_NOT_STANDARD_TEXT, MUSIC_PERMISSION_TEXT, NOT_STANDARD_TEXT, STOCK_NO_PLUGIN_TEXT, STOCK_SOURCE_TEXT, PANEL_OFF_TEXT, PANEL_TITLE, PERMISSION_TEXT, PHONE_NO_PLUGIN_TEXT, PLUGINS_OFF_TEXT, PLUGIN_FILES, SCENARIOS, SETTINGS_FILES, SOURCE_TEXT, customFnProblems, expectationProblems, locationFieldProblems, paddingProblems, themePickerProblems, panelProblems, pickScenarios, saveProblems, savedPayload, scenarioFace, withAndroidHead, type LocationField, type Observed, type ThemePicker, type ObservedPadding, type ObservedPanel, type PaddingRow, type PanelExpectation, type Scenario } from './page-check.ts';
import { COORDS_TEXT as WEATHER_COORDS_TEXT, WEATHER_TEXTS } from '../../ts/plugin-sources/weather.ts';
import { CALENDAR_TEXTS } from '../../ts/plugin-sources/calendar.ts';
import { CALENDAR_ICAL_LISTING } from './page-check.ts';
import { MUSIC_TEXTS } from '../../ts/plugin-sources/music.ts';
import { PHONE_TEXTS } from '../../ts/plugin-sources/phone.ts';
import { STOCK_TEXTS } from '../../ts/plugin-sources/stocks.ts';
import { PAGE_KEYS_FIELD } from '../../ts/pkjs/provider-keys.ts';
import { PLUGINS_OFF_TEXT as PAGE_PLUGINS_OFF_TEXT } from '../../ts/plugin-sources/page.ts';
import panel from '../../ts/plugin-sources/panel.ts';
import { KNOWN_PLUGINS, storeListing } from '../../ts/plugin-sources/directory.ts';
import { readPluginsFile } from './clay-preview.ts';
import { checkMessageKeys } from '../../tools/manifest/build-manifests.ts';
import { NO_START, fillAppinfo } from '../../tools/manifest/feature-keys.ts';
import { readProviders } from '../../tools/manifest/providers.ts';

/** A page where the API key row is drawn but hidden, and the Data Source select offers two sources. */
const observed: Observed = {
  keys: { WEATHER_API_KEY: { exists: true, visible: false }, LOCATION_NAME: { exists: false, visible: false } },
  texts: { 'Location Settings': false },
  notes: { 'Allow Location.': { visible: true, badged: false }, 'From the Pebble app.': { visible: false, badged: false } },
  options: { WEATHER_PROVIDER: ['openmeteo', 'plugin'], CALENDAR_SOURCE: null },
  order: ['WEATHER_PROVIDER', 'LOCATION_USE_GPS'],
  places: { 'Add a Calendar panel.': { CALENDAR_SOURCE: 'above', CALENDAR_POLL: null } },
};

describe('expectationProblems', () => {
  /** A marked row that stays hidden once a plugin is unpicked is the bug a wearer would see as a lost setting. */
  test('names a row that is hidden but should show', () => {
    const result = expectationProblems(observed, { visible: ['WEATHER_API_KEY'] }, 'on load');

    expect(result).toEqual(['on load, WEATHER_API_KEY is hidden but should show']);
  });

  /** A row the page dropped is not a row that shows, so a check for it showing has to fail. */
  test('names a row that is not on the page at all', () => {
    const result = expectationProblems(observed, { visible: ['LOCATION_NAME'] }, 'on load');

    expect(result).toEqual(['on load, LOCATION_NAME is not on the page']);
  });

  /** A row the page dropped cannot show, so a check for it hiding passes. */
  test('counts a row that is not on the page as hidden', () => {
    const result = expectationProblems(observed, { hidden: ['LOCATION_NAME', 'WEATHER_API_KEY'] }, 'on load');

    expect(result).toEqual([]);
  });

  /** Every listed text has to show, so one showing does not cover another that never appears. */
  test('names each listed text that does not show, even beside one that does', () => {
    const page: Observed = { ...observed, texts: { 'Location Settings': true, 'Allow the plugin.': false } };

    const result = expectationProblems(page, { textsVisible: ['Location Settings', 'Allow the plugin.'] }, 'on load');

    expect(result).toEqual(['on load, no row showing "Allow the plugin."']);
  });

  /** A heading that never shows again leaves the wearer with a section of rows and nothing saying what they are. */
  test('names a text row that should show and does not', () => {
    const result = expectationProblems(observed, { textsVisible: ['Location Settings'] }, 'after picking openmeteo for WEATHER_PROVIDER');

    expect(result).toEqual(['after picking openmeteo for WEATHER_PROVIDER, no row showing "Location Settings"']);
  });

  /** A Preferred Source offered with no plugin on the phone saves a source that can never answer. */
  test('names an option that should be left out', () => {
    const result = expectationProblems(observed, { options: [{ key: 'WEATHER_PROVIDER', has: ['openmeteo'], lacks: ['plugin'] }] }, 'on load');

    expect(result).toEqual(['on load, WEATHER_PROVIDER offers plugin but should not']);
  });

  /** A note found only as a plain text row would mean the component never drew it, so a note has to be found as a note. */
  test('names a note that should show and does not', () => {
    const result = expectationProblems(observed, { notesVisible: ['From the Pebble app.', 'Never drawn.'] }, 'on load');

    expect(result).toEqual(['on load, no note showing "From the Pebble app."', 'on load, no note showing "Never drawn."']);
  });

  /** A warning note shown while no plugin is picked tells the wearer about a source they are not using. */
  test('names a note that shows but should be hidden', () => {
    const result = expectationProblems(observed, { notesHidden: ['Allow Location.', 'From the Pebble app.'] }, 'on load');

    expect(result).toEqual(['on load, a note shows "Allow Location." but should be hidden']);
  });

  /** A warning without its badge reads as a plain line the wearer skims past. */
  test('names a warning note drawn without its badge', () => {
    const result = expectationProblems(observed, { badged: ['Allow Location.'] }, 'on load');

    expect(result).toEqual(['on load, the note "Allow Location." carries no badge']);
  });

  /** An empty week drawn as a warning reads as something broken the wearer has to fix. */
  test('names a calm note drawn with the warning badge', () => {
    const page: Observed = { ...observed, notes: { 'Events may be missing.': { visible: true, badged: true } } };

    const result = expectationProblems(page, { unbadged: ['Events may be missing.'] }, 'on load');

    expect(result).toEqual(['on load, the note "Events may be missing." carries the warning badge but should not']);
  });

  /** A calm note that never shows is missing, not calm, so the check has to say so rather than pass it. */
  test('names a calm note that does not show', () => {
    const result = expectationProblems(observed, { unbadged: ['From the Pebble app.'] }, 'on load');

    expect(result).toEqual(['on load, no note showing "From the Pebble app."']);
  });

  /** A select landing above the section's lead line puts the line about the panel under a choice it has nothing to do with. */
  test('names a text row on the wrong side of a row', () => {
    const result = expectationProblems(observed, { textsBelow: [{ text: 'Add a Calendar panel.', key: 'CALENDAR_SOURCE' }] }, 'on load');

    expect(result).toEqual(['on load, the row "Add a Calendar panel." sits above CALENDAR_SOURCE, not below it']);
  });

  /** A row that is not on the page has no side to be on, which is a problem of its own rather than a pass. */
  test('names a text row placed against a row that is not on the page', () => {
    const result = expectationProblems(observed, { textsAbove: [{ text: 'Add a Calendar panel.', key: 'CALENDAR_POLL' }] }, 'on load');

    expect(result).toEqual(['on load, the row "Add a Calendar panel." or CALENDAR_POLL is not on the page to place']);
  });

  /** Rows hiding above the select the wearer just changed make the page jump under their finger. */
  test('names rows that run in another order than expected', () => {
    const result = expectationProblems(observed, { order: ['LOCATION_USE_GPS', 'WEATHER_PROVIDER'] }, 'on load');

    expect(result).toEqual(['on load, the rows run WEATHER_PROVIDER then LOCATION_USE_GPS, not LOCATION_USE_GPS then WEATHER_PROVIDER']);
  });

  /** A select the page dropped cannot offer anything, which is a problem of its own rather than a missing option. */
  test('names a select that is not on the page', () => {
    const result = expectationProblems(observed, { options: [{ key: 'CALENDAR_SOURCE', has: ['plugin'] }] }, 'on load');

    expect(result).toEqual(['on load, the CALENDAR_SOURCE select is not on the page']);
  });
});

describe('savedPayload', () => {
  /** Clay sends the settings as URI-encoded JSON after the #, each key holding its value in an object. */
  test('reads the settings out of the close address', () => {
    const url = 'pebblejs://close#' + encodeURIComponent(JSON.stringify({ WEATHER_PROVIDER: { value: 'plugin' } }));

    const result = savedPayload(url);

    expect(result).toEqual({ WEATHER_PROVIDER: { value: 'plugin' } });
  });

  /** Chromium also navigates to about:blank once pebblejs:// fails, and that is not a save. */
  test('reads any other address as no save', () => {
    const result = savedPayload('about:blank');

    expect(result).toBeNull();
  });

  /** A save cut short is not a save, rather than a crash that hides the page's own problems. */
  test('reads settings that do not parse as no save', () => {
    const result = savedPayload('pebblejs://close#%7B%22WEATHER');

    expect(result).toBeNull();
  });
});

describe('saveProblems', () => {
  /** A select the page dropped saves nothing, and the watch keeps a source the wearer thinks they changed. */
  test('names a key the save leaves out', () => {
    const result = saveProblems({}, { WEATHER_PROVIDER: 'plugin' });

    expect(result).toEqual(['the save carries no WEATHER_PROVIDER']);
  });

  /** Clay saves a select's value as text, so a number where text belongs is a different value on the watch. */
  test('tells a number from the same number as text', () => {
    const result = saveProblems({ CALENDAR_POLL: { value: '1' } }, { CALENDAR_POLL: 1 });

    expect(result).toEqual(['the save carries CALENDAR_POLL as "1", not 1']);
  });
});

describe('saveProblems with values the save must not carry', () => {
  /** A save carrying plugin with no plugin on offer puts the face on a source the phone cannot serve. */
  test('names a value the save must not carry', () => {
    const result = saveProblems({ WEATHER_PROVIDER: { value: 'plugin' } }, {}, { WEATHER_PROVIDER: ['plugin'] });

    expect(result).toEqual(['the save carries WEATHER_PROVIDER as "plugin", which it must not']);
  });

  /** A key the save leaves out carries nothing, so it carries none of the values it must not. */
  test('passes a save that leaves the key out', () => {
    const result = saveProblems({}, {}, { WEATHER_PROVIDER: ['plugin'] });

    expect(result).toEqual([]);
  });
});

describe('customFnProblems', () => {
  /** The page as Clay writes it around a custom function's text. */
  function pageWith(source: string): string {
    return `<script>window.customFn=${source},window.clayComponents={}</script>`;
  }

  /** A replacement pattern in the text is read by Clay's string replace, and the page script breaks. */
  test.each(['$$', '$&', '$`', '$\''])('names %s in the text', (pattern) => {
    const source = `function () { var text = '${pattern}'; }`;

    const result = customFnProblems(pageWith(source), source);

    expect(result).toEqual([`the custom function's text holds ${pattern}, which Clay's string replace reads as a pattern`]);
  });

  /** A page whose custom function was changed on the way in runs code nobody wrote. */
  test('names text the page does not carry whole', () => {
    const source = 'function () { var price = 1; }';

    const result = customFnProblems(pageWith('function () { var price = 2; }'), source);

    expect(result).toEqual(['the page does not carry the custom function text exactly as Clay was handed it']);
  });

  /** A lone dollar sign before a letter is no pattern, and a row element named with one is everywhere in Clay code. */
  test('passes text carried whole with a plain dollar sign in it', () => {
    const source = 'function () { this.$element = null; }';

    const result = customFnProblems(pageWith(source), source);

    expect(result).toEqual([]);
  });
});

describe('pickScenarios', () => {
  /** With no names the check runs everything, which is what npm run check:pages does. */
  test('runs every scenario when none is named', () => {
    const result = pickScenarios([], SCENARIOS);

    expect(result).toBe(SCENARIOS);
  });

  /** A typo would otherwise run nothing and report every scenario passed. */
  test('refuses a scenario name it does not know', () => {
    const result = () => pickScenarios(['no-defiens'], SCENARIOS);

    expect(result).toThrow('no scenario called no-defiens');
  });
});

describe('the words the scenarios look for', () => {
  /** A copy that drifted from the feature's own words would have the check look for a row that never shows. */
  test('match the weather feature\'s own rows', () => {
    const result = [NOT_STANDARD_TEXT, PERMISSION_TEXT, SOURCE_TEXT, PLUGINS_OFF_TEXT, COORDS_TEXT];

    expect(result).toEqual([WEATHER_TEXTS.notStandard?.('<img src=x onerror=alert(1)>'), WEATHER_TEXTS.permissionDenied, WEATHER_TEXTS.source, PAGE_PLUGINS_OFF_TEXT, WEATHER_COORDS_TEXT]);
  });

  /** The dollar sign scenario's note is the weather feature's own row with the name as written. */
  test('match the weather feature\'s row for a name with dollar signs', () => {
    const result = DOLLAR_NOT_STANDARD_TEXT;

    expect(result).toBe(WEATHER_TEXTS.notStandard?.(DOLLAR_NAME));
  });

  /** The same drift on the calendar's rows would have the check look for calendar notes that never show. */
  test('match the calendar feature\'s own rows', () => {
    const result = [CALENDAR_NOT_STANDARD_TEXT, CALENDAR_PERMISSION_TEXT, CALENDAR_EMPTY_TEXT, CALENDAR_SOURCE_TEXT];

    expect(result).toEqual([CALENDAR_TEXTS.notStandard?.('Odd Calendar'), CALENDAR_TEXTS.permissionDenied, CALENDAR_TEXTS.empty, CALENDAR_TEXTS.source]);
  });

  /** The same drift on the now playing and phone battery notes would have the check look for notes that never show. */
  test('match the now playing and phone battery notes', () => {
    const result = [MUSIC_NO_PLUGIN_TEXT, MUSIC_PERMISSION_TEXT, MUSIC_NOT_STANDARD_TEXT, PHONE_NO_PLUGIN_TEXT];

    expect(result).toEqual([MUSIC_TEXTS.noPlugin, MUSIC_TEXTS.permissionDenied, MUSIC_TEXTS.notStandard?.('Odd Music'), PHONE_TEXTS.noPlugin]);
  });
});

describe('the stock words the scenarios look for', () => {
  /** The same drift on the stock notes would have the check look for stock notes that never show. */
  test('match the stock feature\'s own rows', () => {
    const result = [STOCK_SOURCE_TEXT, STOCK_NO_PLUGIN_TEXT];

    expect(result).toEqual([STOCK_TEXTS.source, STOCK_TEXTS.noPlugin]);
  });
});

describe('the words and addresses the panel scenarios look for', () => {
  /** A copy that drifted from the panel's own words would have the check fail a panel that is right. */
  test('match the panel\'s own words', () => {
    const result = [PANEL_TITLE, PANEL_OFF_TEXT, BUILT_IN_TAG, OFF_TAG, INSTALLED_TAG];

    expect(result).toEqual([panel.PANEL_TITLE, panel.PANEL_OFF_TEXT, panel.BUILT_IN_TAG, panel.OFF_TAG, panel.INSTALLED_TAG]);
  });

  /** A copy that drifted from the directory would have the check fail the music entry the panel draws. */
  test('match where the directory says the music plugin runs', () => {
    const result = KNOWN_PLUGINS.find((plugin) => plugin.name === 'Music')?.where;

    expect(result).toBe(ANDROID_ONLY);
  });

  /** A copy that drifted from the directory would have the check pass links to a listing the panel no longer opens. */
  test.each([
    ['MET Norway Weather', MET_NORWAY_LISTING],
    ['Weather+', WEATHER_PLUS_LISTING],
    ['Weather Enhanced', WEATHER_ENHANCED_LISTING],
    ['Stocks', PEBBLE_STOCKS_LISTING],
    ['Stocks + Crypto', STOCKS_CRYPTO_LISTING],
    ['Calendar + iCal', CALENDAR_ICAL_LISTING],
  ])('match the directory\'s listing for %s', (name, listing) => {
    const result = storeListing(KNOWN_PLUGINS.find((plugin) => plugin.name === name) as (typeof KNOWN_PLUGINS)[number]);

    expect(result).toBe(listing);
  });
});

describe('panelProblems', () => {
  // a weather panel listing the built-in plugin and MET Norway Weather
  const EXPECTED: PanelExpectation = { kinds: [{ label: 'Weather', plugins: [{ name: 'Weather', tag: BUILT_IN_TAG }, { name: 'MET Norway Weather', listing: MET_NORWAY_LISTING }] }], off: false };

  /** The open panel as the browser would read it, linked or not. */
  function observedPanel(linked: boolean, overrides: Partial<ObservedPanel> = {}): ObservedPanel {
    return {
      count: 1,
      open: true,
      bodyShows: true,
      title: PANEL_TITLE,
      off: false,
      kinds: [{
        label: 'Weather',
        plugins: [
          { name: 'Weather', tag: BUILT_IN_TAG, href: null, address: '' },
          { name: 'MET Norway Weather', tag: '', href: linked ? MET_NORWAY_LISTING : null, address: linked ? '' : 'apps.repebble.com/met-norway-weather_6972cb1f33e343d69e5b788e' },
        ],
      }],
      ...overrides,
    };
  }

  /** A right panel that failed would teach everyone to ignore the check. */
  test('passes a panel that lists what it should, linked and plain', () => {
    const result = [...panelProblems(observedPanel(true), EXPECTED, true), ...panelProblems(observedPanel(false), EXPECTED, false)];

    expect(result).toEqual([]);
  });

  /** A link on a page with no openUrl loads the listing inside the settings page and loses the wearer's changes. */
  test('names a store plugin linked where the page has no openUrl', () => {
    const result = panelProblems(observedPanel(true), EXPECTED, false);

    expect(result).toContain(`the panel links MET Norway Weather to ${MET_NORWAY_LISTING}, but should not link it`);
  });

  /** A link to the wrong listing sends the wearer to a store page for some other plugin, or none. */
  test('names a link to the wrong listing', () => {
    const wrong = observedPanel(true);

    wrong.kinds[0].plugins[1].href = 'https://apps.repebble.com/other_0';

    const result = panelProblems(wrong, EXPECTED, true);

    expect(result).toEqual([`the panel links MET Norway Weather to https://apps.repebble.com/other_0, not ${MET_NORWAY_LISTING}`]);
  });

  /** A wearer with plugins off who is never told to turn them on cannot reach any plugin the panel lists. */
  test('names a missing line to turn plugins on', () => {
    const result = panelProblems(observedPanel(true), { ...EXPECTED, off: true }, true);

    expect(result).toEqual(['the panel does not open on the line to turn plugins on']);
  });

  /** A kind missing from the panel hides from the wearer that its plugins work with the face. */
  test('names the kinds when they differ', () => {
    const result = panelProblems(observedPanel(true), { kinds: [...EXPECTED.kinds, { label: 'Calendar', plugins: [] }], off: false }, true);

    expect(result).toEqual(['the panel lists Weather, not Weather, Calendar']);
  });
});

describe('paddingProblems', () => {
  // what the base sheet gives a row in a card, as Chromium computes it
  const PADDED = '0px 12px 11.2px 12px';
  const HEADING = '11.2px 12px 11.2px 12px';
  const RADIO = '11.2px 6px 11.2px 12px';
  const NONE = '0px 0px 0px 0px';

  /** One row as the browser reads it, with no class of its own beyond its kind. */
  function row(kind: string, padding: string, without: string, usual: string, classes: string[] = []): PaddingRow {
    return { kind, classes: ['component', kind, ...classes], padding, without, usual };
  }

  /** A page laid out the usual way, where the rules set what Clay's own rules already set. */
  function usualPage(overrides: Partial<ObservedPadding> = {}): ObservedPadding {
    return {
      ruleSheets: 1,
      baseFound: true,
      baseFirst: true,
      rows: [
        row('component-heading', HEADING, HEADING, HEADING),
        row('component-select', NONE, NONE, NONE),
        row('component-radio', RADIO, RADIO, RADIO),
      ],
      ...overrides,
    };
  }

  /** The same page laid out the way the Android app leaves it, where the rules are what keep the rows where they belong. */
  function androidPage(overrides: Partial<ObservedPadding> = {}): ObservedPadding {
    return {
      ruleSheets: 1,
      baseFound: true,
      baseFirst: false,
      rows: [
        row('component-heading', HEADING, HEADING, HEADING),
        row('component-select', NONE, PADDED, NONE),
        row('component-radio', RADIO, HEADING, RADIO),
      ],
      ...overrides,
    };
  }

  /** A right page that failed would teach everyone to ignore the check. */
  test('passes a page in either order whose rows sit as they should', () => {
    const result = [...paddingProblems(usualPage(), false), ...paddingProblems(androidPage(), true)];

    expect(result).toEqual([]);
  });

  /** A rule that moved a row in the usual order would change the look of every face on every phone. */
  test('names a row the rules move in the usual order', () => {
    const moved = usualPage();

    moved.rows[0].padding = NONE;

    const result = paddingProblems(moved, false);

    expect(result).toEqual([`the row rules move a component-heading row's padding from ${HEADING} to ${NONE}`]);
  });

  /**
   * Clay's own text box and select come with every location search and theme picker, so Clay's zero
   * is always there for them. The rules moving one means Clay's component went missing, and the row
   * sits a gap lower than it should.
   */
  test.each([
    ['component-input', 'pf-loc-search'],
    ['component-select', 'pf-theme'],
  ])('names a %s row of class %s the rules unpad', (kind, own) => {
    const page = usualPage();

    page.rows.push(row(kind, NONE, PADDED, NONE, [own]));

    const result = paddingProblems(page, false);

    expect(result).toEqual([`the row rules move a ${kind} row's padding from ${PADDED} to ${NONE}`]);
  });

  /** A page without the rules shows the Android gaps again, and a page holding them twice is carrying them from somewhere it should not. */
  test('names a page holding the rules other than once', () => {
    const result = [...paddingProblems(usualPage({ ruleSheets: 0 }), false), ...paddingProblems(usualPage({ ruleSheets: 2 }), false)];

    expect(result).toEqual([
      'the page holds the framework\'s row rules in 0 style sheets, which should be one',
      'the page holds the framework\'s row rules in 2 style sheets, which should be one',
    ]);
  });

  /** A Clay that wrote its base sheet another way would leave every order check reading nothing. */
  test('names a page whose base sheet the check cannot find', () => {
    const result = paddingProblems(usualPage({ baseFound: false }), false);

    expect(result).toEqual(['the check finds no style sheet holding Clay\'s .section > .component rule, so it cannot tell where Clay\'s base sheet sits']);
  });

  /** The bug itself. A row that sits differently in the Android order is the gap the wearer sees under or beside it. */
  test('names a row that sits differently in the Android order', () => {
    const padded = androidPage();

    padded.rows[2].padding = HEADING;

    const result = paddingProblems(padded, true);

    expect(result).toEqual([`a component-radio row has ${HEADING} of padding with the component styles ahead of Clay's base sheet, and ${RADIO} in the usual order`]);
  });

  /** A page that still opens with the base sheet first is the usual order, so it passing would prove nothing about the Android app. */
  test('names an Android page whose base sheet still comes first', () => {
    const result = paddingProblems(androidPage({ baseFirst: true }), true);

    expect(result).toEqual(['the component styles sit behind Clay\'s base sheet, so the page is not laid out the way the Android app leaves it']);
  });

  /** Rows that sit the same with the rules off never showed the bug, so the rules being on proves nothing either. */
  test('names an Android page whose rows never moved', () => {
    const result = paddingProblems(usualPage({ baseFirst: false }), true);

    expect(result).toEqual(['with the row rules off no row Clay takes padding off picks up the base sheet\'s padding, so the page shows nothing']);
  });
});

describe('locationFieldProblems', () => {
  /** What Clay's text box style gives the search's label and field. */
  const STYLED: LocationField = { label: 'block', field: 'block' };

  /** A styled search that failed would teach everyone to ignore the check. */
  test('passes a location search laid out the way Clay\'s text box style lays it out', () => {
    const result = locationFieldProblems([STYLED, STYLED]);

    expect(result).toEqual([]);
  });

  /** Without the style the wearer sees the name beside a plain white field rather than over a dark one. */
  test('names a location search whose label is laid out as a row', () => {
    const result = locationFieldProblems([STYLED, { label: 'flex', field: 'block' }]);

    expect(result).toEqual(['a location search draws without Clay\'s text box style, with its label laid out as flex and its field as block']);
  });

  /** A field that lost the style sits inline at the end of its label rather than across the row under it. */
  test('names a location search whose field is not laid out as a block', () => {
    const result = locationFieldProblems([{ label: 'block', field: 'inline-block' }]);

    expect(result).toEqual(['a location search draws without Clay\'s text box style, with its label laid out as block and its field as inline-block']);
  });
});

describe('themePickerProblems', () => {
  /** What Clay's select style gives the picker's name and its native dropdown. */
  const STYLED: ThemePicker = { value: 'block', dropdown: '0' };

  /** A styled picker that failed would teach everyone to ignore the check. */
  test('passes a theme picker laid out the way Clay\'s select style lays it out', () => {
    const result = themePickerProblems([STYLED]);

    expect(result).toEqual([]);
  });

  /** Without the style the wearer sees the bare native dropdown on top of the theme's name. */
  test('names a theme picker whose native dropdown shows', () => {
    const result = themePickerProblems([STYLED, { value: 'inline', dropdown: '1' }]);

    expect(result).toEqual(['a theme picker draws without Clay\'s select style, with its name laid out as inline and its dropdown at opacity 1']);
  });
});

describe('withAndroidHead', () => {
  /** The script has to run ahead of the base sheet, or the empty head lands after the page's own and nothing moves. */
  test('puts the script just inside the page\'s own head', () => {
    const result = withAndroidHead('<html><head><style>.base{}</style></head><body></body></html>');

    expect(result).toBe('<html><head><script>document.documentElement.insertBefore(document.createElement(\'head\'), document.head);</script><style>.base{}</style></head><body></body></html>');
  });
});

describe('the scenario table', () => {
  const named = SCENARIOS.map((scenario): [string, Scenario] => [scenario.name, scenario]);

  /** The appinfo of the fixture face a scenario previews. */
  function appinfoOf(scenario: Scenario): { messageKeys: string[] } {
    return JSON.parse(fs.readFileSync(path.join(scenarioFace(scenario), 'pebble.appinfo.json'), 'utf8'));
  }

  /**
   * Every message key one scenario asks the page about, on load and after each change. The store the
   * phone adds for each provider's API key is no face's, so a save asked about it counts for none.
   */
  function keysAskedAbout(scenario: Scenario): string[] {
    return [scenario.load, ...(scenario.changes || [])].flatMap((expected) => [
      ...(expected.visible || []),
      ...(expected.hidden || []),
      ...(expected.options || []).map((option) => option.key),
      ...(expected.order || []),
      ...Object.keys(expected.values || {}),
      ...[...(expected.textsAbove || []), ...(expected.textsBelow || [])].map((place) => place.key),
    ]).concat((scenario.changes || []).map((change) => change.key), Object.keys(scenario.save || {}), Object.keys(scenario.saveNot || {})).filter((key) => key !== PAGE_KEYS_FIELD);
  }

  /** Each scenario builds into a folder named after it, so two with one name would check one page twice. */
  test('names every scenario once', () => {
    const names = SCENARIOS.map((scenario) => scenario.name);

    const result = names.filter((name, index) => names.indexOf(name) !== index);

    expect(result).toEqual([]);
  });

  /** A plugins file that is missing or misspelt stops that scenario before its page is ever opened. */
  test.each(named)('%s names a plugins file that loads', (_name, scenario) => {
    const result = () => (scenario.plugins === null ? null : readPluginsFile(path.join(PLUGIN_FILES, scenario.plugins)));

    expect(result).not.toThrow();
  });

  /** A settings file that is missing stops the preview before its page is ever opened. */
  test.each(named)('%s names a settings file that is there, if any', (_name, scenario) => {
    const result = scenario.settings === undefined || fs.existsSync(path.join(SETTINGS_FILES, scenario.settings));

    expect(result).toBe(true);
  });

  /** A provider keys file that is missing stops the preview before its page is ever opened. */
  test.each(named)('%s names a provider keys file that is there, if any', (_name, scenario) => {
    const result = scenario.providerKeys === undefined || fs.existsSync(path.join(SETTINGS_FILES, scenario.providerKeys));

    expect(result).toBe(true);
  });

  /** A face that is not there stops the whole check before any page is built. */
  test.each(named)('%s names a fixture face that is there', (_name, scenario) => {
    const result = fs.existsSync(path.join(scenarioFace(scenario), 'src', 'pkjs', 'index.ts'));

    expect(result).toBe(true);
  });

  /** A key the fixture never declares is a row the page can never show, so the scenario fails for the wrong reason. */
  test.each(named)('%s asks only about keys the fixture declares', (_name, scenario) => {
    const declared = appinfoOf(scenario).messageKeys;

    const result = keysAskedAbout(scenario).filter((key) => !declared.includes(key));

    expect(result).toEqual([]);
  });

  /**
   * A providers list or a define the fixture's keys cannot back is one the real build refuses, so the
   * scenario could never be built, and a page built anyway would show something no face ships. The
   * keys get the defines' keys added, as the build adds them. No phone code is read here, so the
   * features' keys count only where the fixture lists them.
   */
  test.each(named)('%s sets providers and defines the fixture can build with', (_name, scenario) => {
    const providers = readProviders({ providers: scenario.providers }, 'page-check', scenario.defines);
    const keys = fillAppinfo({ messageKeys: appinfoOf(scenario).messageKeys }, 'page-check', NO_START, scenario.defines, providers).messageKeys;

    const result = () => checkMessageKeys(keys, 'page-check', scenario.defines, providers);

    expect(result).not.toThrow();
  });
});
