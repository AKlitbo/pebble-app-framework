/**
 * Checks the real Clay settings page in a headless browser.
 *
 * The specs check each piece of the settings page on its own. This is the one check that builds the
 * whole page the way the phone does, with the face's features started and their page hooks run, and
 * then opens it in Chromium through Playwright. A page hook mistake that every spec misses shows here
 * as a page that throws, a row that never hides, or a save that loses a value.
 *
 * It builds each fixture face under fixtures/ once, then gives each scenario in SCENARIOS its own
 * copy of its face's build with the scenario's defines and providers list, and previews it through
 * clay-preview with the scenario's --plugins and --settings files. The providers list goes through
 * the build's own check, so a scenario the build would refuse stops before its page is built. Each
 * page fails on:
 *
 *   - any uncaught error, console.error, or dialog, which on a phone is a settings screen that never
 *     opens or a plugin's name running as code
 *   - Clay leaving any row of the page undrawn
 *   - a location search drawn without the look of Clay's text box, or a theme picker drawn without
 *     the look of Clay's select
 *   - the framework's row rules missing or there twice, Clay's base sheet not found, the rules moving
 *     a row's padding in the usual order, or a row sitting differently on a page laid out the way the
 *     Pebble Android app leaves it
 *   - a card that shows holding nothing but headings, on load and after each select change
 *   - a row expected to show that is hidden, or the other way round, on load and after each select change
 *   - rows that run down the page in another order than expected, or a text row on the wrong side of one
 *   - a plugin note, found by the note component's class and read by its text, that shows when it
 *     should not, a warning note drawn without its badge, or a calm note drawn with one
 *   - an element the scenario says must not exist, such as an img a plugin's name tried to make, or
 *     one it says must exist that is not there, such as the mark a face's own customClay leaves
 *   - a supported plugins panel that is missing or there twice, that opens by itself or will not open
 *     and close, that lists the wrong kinds or plugins, or whose store links open the wrong listing or
 *     load it inside the page
 *   - a save whose pebblejs://close# payload lacks a value or holds the wrong one
 *   - a custom function whose text holds a pattern Clay's string replace would read, checked on the
 *     tsc output the phone runs, or that the page does not carry whole
 *
 * npm run check:pages runs every scenario from the framework repo's root, and naming scenarios after
 * it runs just those. It needs Playwright's Chromium, which the frame plugin installs, so it stays out
 * of npm test. It is offline and waits only for the page to load and answer.
 *
 * The pages and their builds land in build/page-check/ beside this file, so a failing page can be
 * opened in a browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Browser, Page } from 'playwright';
import { cleanEmit, compile, facePaths, writeTsconfig, type FacePaths, type FacePlace } from '../../tools/pkjs/build-pkjs.ts';
import { checkMessageKeys } from '../../tools/manifest/build-manifests.ts';
import { NO_START, fillAppinfo } from '../../tools/manifest/feature-keys.ts';
import { readProviders } from '../../tools/manifest/providers.ts';
import { ENGINE } from '../../tools/shared/paths.ts';
import { stubModuleLoad } from '../../ts/testing/module-load.ts';
import { ToolError, reportFailure } from '../../tools/shared/tool-error.ts';
import { isMainScript } from '../../tools/shared/entry.ts';
import { forgetCompiled, installHost, messageKeysOf, startFacts } from '../../tools/pkjs/settings-page.ts';
import { fillPreviewEmit, readPluginsFile, renderPage, hasPluginDefines } from './clay-preview.ts';
import { CLAY_ROW_PADDING } from '../../ts/clay/page-style-component.ts';

/** The folder holding the fixture faces, the plugins files, and the settings files. */
export const FIXTURES = path.join(import.meta.dirname, 'fixtures');

/** The fixture face a scenario previews unless it names another. */
export const FIXTURE_FACE = path.join(FIXTURES, 'face');

/** The --plugins files the scenarios name. */
export const PLUGIN_FILES = path.join(import.meta.dirname, 'fixtures', 'plugins');

/** The --settings files the scenarios name, each a returning wearer's saved values. */
export const SETTINGS_FILES = path.join(import.meta.dirname, 'fixtures', 'settings');

/** Where the builds and the pages go. */
const OUT_DIR = path.join(import.meta.dirname, 'build', 'page-check');

/** The fixture face's name, which the preview and the key check use. */
const FACE = 'page-check';

/** How long the page gets to load, answer, or navigate, in milliseconds. */
const PAGE_WAIT_MS = 10_000;

/** What a page has to show at one moment, by message key and by the words of a text or heading row. */
export interface Expectation {
  /** Rows, by message key, that have to show. */
  visible?: string[];
  /** Rows, by message key, that must not show. A row that is not on the page counts as not showing. */
  hidden?: string[];
  /** Text or heading rows, by their exact words. Every one listed has to show. */
  textsVisible?: string[];
  /** Text or heading rows, by their exact words, none of which may show. */
  textsHidden?: string[];
  /** Notes the pluginNote component draws, by their exact words as text. Every one listed has to show. */
  notesVisible?: string[];
  /** Notes, by their exact words, none of which may show. */
  notesHidden?: string[];
  /** Notes, by their exact words, that have to show with the warning's "!" badge. */
  badged?: string[];
  /** Notes, by their exact words, that have to show without the badge, in the calmer info look. */
  unbadged?: string[];
  /** Text rows, by their exact words, that have to sit above a row, by message key. */
  textsAbove?: Array<{ text: string; key: string }>;
  /** Text rows, by their exact words, that have to sit below a row, by message key. */
  textsBelow?: Array<{ text: string; key: string }>;
  /** Selects, by message key, and the option values each has to offer or leave out. */
  options?: Array<{ key: string; has?: string[]; lacks?: string[] }>;
  /** Rows, by message key, in the order they have to run down the page. Each has to be on the page. */
  order?: string[];
}

/** A select the wearer changes, and what the page has to show after it. */
export interface Change extends Expectation {
  /** The select's message key. */
  key: string;
  /** The option value picked. */
  value: string;
}

/** One plugin the supported plugins panel has to list. */
export interface PanelPlugin {
  /** Its name as the wearer reads it. */
  name: string;
  /** The word after its name, such as `Installed`. Left out, none. */
  tag?: string;
  /** Its store listing's address, for a store plugin. With `openUrl` its name has to link there. */
  listing?: string;
}

/** What the supported plugins panel has to list once it is opened. */
export interface PanelExpectation {
  /** Each kind's heading and the plugins under it, in the order they run down the panel. */
  kinds: Array<{ label: string; plugins: PanelPlugin[] }>;
  /** Whether the panel opens on the line saying to turn plugins on. */
  off: boolean;
}

/** One page to check: how the face is built, what the phone has, and what the page does. */
export interface Scenario {
  /** A short name, which the output and the build folder use. */
  name: string;
  /** The fixture face under fixtures/ the page comes from, `face` when left out. */
  face?: string;
  /** The face's defines for this build, such as `{ PLUGIN_WEATHER: 1 }`. */
  defines: Record<string, number>;
  /**
   * The providers list the face's appinfo holds for this build, such as `{ weather: ['plugin'] }`.
   * The build writes it into the phone bundle, so the page is narrowed to it and the features read it.
   * Left out, the face lists none.
   */
  providers?: Record<string, string[]>;
  /** The --plugins file in fixtures/plugins, or null for a phone that lists no plugins. */
  plugins: string | null;
  /**
   * The --settings file in fixtures/settings, for a returning wearer, such as `plugin-picked.json`
   * holding `{ "WEATHER_PROVIDER": "plugin" }`. Left out, a fresh install.
   */
  settings?: string;
  /**
   * Whether starting the features and running their hooks, as the phone does on every open, must give
   * byte for byte the page the face builds with no features started.
   */
  unchanged?: boolean;
  /** What the page shows once it has loaded. */
  load: Expectation;
  /** Select changes, made in order, and what the page shows after each. */
  changes?: Change[];
  /** CSS selectors no element on the page may match, checked after the changes. */
  absent?: string[];
  /** CSS selectors some element on the page has to match, checked after the changes. */
  present?: string[];
  /**
   * Whether the settings page gets `Pebble.openUrl`, as the Pebble app hands it while plugins are on.
   * The check's stand-in records each address it is asked to open and opens nothing.
   */
  openUrl?: boolean;
  /** What the supported plugins panel lists, checked once on load by opening and closing it. */
  panel?: PanelExpectation;
  /**
   * Whether the page opens laid out the way the Pebble Android app leaves it while plugins are on,
   * with a head of its own ahead of the page's, so every component's style lands ahead of Clay's base
   * sheet. The phone's plugins list has nothing to do with it, since the app does this on any face.
   */
  androidHead?: boolean;
  /** The values the save has to carry, by message key, after the changes. With neither this nor saveNot, nothing is saved. */
  save?: Record<string, unknown>;
  /** Values the save must not carry, by message key, checked on the same save. */
  saveNot?: Record<string, unknown[]>;
}

// the location rows, which the location section marks to hide while the weather comes from a plugin
const LOCATION_MARKED = ['LOCATION_USE_GPS', 'LOCATION_GPS_FALLBACK', 'LOCATION_NAME'];

// the rows the location and weather sections mark to hide while the weather comes from a plugin. the
// key row also hides for a provider that needs no key, such as Open-Meteo
const WEATHER_MARKED = ['WEATHER_API_KEY', ...LOCATION_MARKED];

// rows the weather hook never hides, which every weather scenario on the fixture face expects on the page
const ALWAYS_SHOWN = ['WEATHER_PROVIDER', 'WEATHER_TEMPERATURE_UNIT', 'CALENDAR_ICS_URL', 'CALENDAR_POLL'];

// what shows while Open-Meteo is picked on the fixture face, every row but the key row
const OPEN_METEO_ROWS = { visible: [...ALWAYS_SHOWN, ...LOCATION_MARKED], hidden: ['WEATHER_API_KEY'] };

// the builder's lead line, the select's own lead line above it, which stays showing while the plugin
// is picked so the select never moves under the wearer's finger
const LEAD_LINE = 'Choose where your watch pulls its weather data. Open-Meteo works right out of the box with no setup required.';

// the order the builder lays its rows in, and the order the weather hook puts them in while a plugin
// choice is on offer. the select comes first in its section with the key row it hides under it and
// the unit after, and the location section moves below
const BUILDER_ORDER = ['LOCATION_USE_GPS', 'WEATHER_TEMPERATURE_UNIT', 'WEATHER_PROVIDER', 'WEATHER_API_KEY'];
const SELECT_FIRST = ['WEATHER_PROVIDER', 'WEATHER_API_KEY', 'WEATHER_TEMPERATURE_UNIT', 'LOCATION_USE_GPS'];

// the page and the save on a phone with no plugin to offer, which plugins off and an older Pebble app
// both are. with no plugin choice only the key row hides, for Open-Meteo, so the sections keep the
// order the face gave them
const NO_PLUGIN_PAGE = {
  load: {
    ...OPEN_METEO_ROWS,
    textsVisible: ['Location Settings', LEAD_LINE],
    options: [{ key: 'WEATHER_PROVIDER', has: ['openmeteo', 'owm', 'weatherapi'], lacks: ['plugin'] }],
    order: BUILDER_ORDER,
  },
  save: { WEATHER_PROVIDER: 'openmeteo' },
};

// options found by their value, which show whether a provider select is on the page and what it offers
const DATA_SOURCE_OPTION = 'option[value="openmeteo"]';
const OWM_OPTION = 'option[value="owm"]';
const FINNHUB_OPTION = 'option[value="finnhub"]';
const ICAL_OPTION = 'option[value="ical"]';

// the stock fixture's lead line, which carries no mark and stays whatever the providers list says
const STOCK_LEAD = 'Pick where your quotes come from.';

// the one-source fixture's line shown only for Open-Meteo, which no option on its select offers
const OPEN_METEO_LINE = 'Open-Meteo needs no key, so this face asks for none.';

// the weather feature's own words for its rows, from WEATHER_TEXTS in ts/plugin-sources/weather.ts
// and PLUGINS_OFF_TEXT in ts/plugin-sources/page.ts. the check runs under plain node, which cannot
// load those files, so they are copied here and the spec beside this file checks the copies match
export const NOT_STANDARD_TEXT = '<img src=x onerror=alert(1)> sends weather this watchface cannot read. Pick another weather plugin under Preferred Sources in the Pebble app, or another data source here.';

// a plugin name holding the dollar sign patterns Clay's plain string replace reads, and the
// not-standard note it gets
export const DOLLAR_NAME = 'Rain$\'Check $$SETTINGS$$';
export const DOLLAR_NOT_STANDARD_TEXT = 'Rain$\'Check $$SETTINGS$$ sends weather this watchface cannot read. Pick another weather plugin under Preferred Sources in the Pebble app, or another data source here.';
export const PERMISSION_TEXT = 'This watchface needs Location to read the Pebble app\'s weather. Allow it for this watchface in the Pebble app.';
export const SOURCE_TEXT = 'Your watch shows the weather for the first location in the Pebble app\'s weather settings.';
export const PLUGINS_OFF_TEXT = 'The Pebble app is not offering this source right now. Turn on plugins in the Pebble app under Settings, Plugins, or update the Pebble app.';

// the supported plugins panel's own words, from ts/plugin-sources/panel.ts, copied for the same
// reason and checked by the same spec
export const PANEL_TITLE = 'Plugins This Watchface Supports';
export const PANEL_OFF_TEXT = 'The Pebble app is not offering any plugins right now. Turn on plugins in the Pebble app under Settings, Plugins, or update the Pebble app.';
export const BUILT_IN_TAG = 'Built Into the Pebble App';
export const INSTALLED_TAG = 'Installed';
export const OFF_TAG = 'Off';

// MET Norway Weather's store listing, from the plugin directory in ts/plugin-sources/directory.ts
export const MET_NORWAY_LISTING = 'https://apps.repebble.com/met-norway-weather_6972cb1f33e343d69e5b788e';

// the panel's weather plugins on a phone that lists the built-in ones, and its calendar plugins
const PANEL_WEATHER = { label: 'Weather', plugins: [{ name: 'Weather', tag: BUILT_IN_TAG }, { name: 'MET Norway Weather', listing: MET_NORWAY_LISTING }] };
const PANEL_CALENDAR = { label: 'Calendar', plugins: [{ name: 'Calendar', tag: BUILT_IN_TAG }] };

// the same on a phone whose list leaves the built-in ones out, which the panel marks off
const BUILT_IN_OFF = `${BUILT_IN_TAG}, ${OFF_TAG}`;
const PANEL_WEATHER_OFF = { label: 'Weather', plugins: [{ name: 'Weather', tag: BUILT_IN_OFF }, { name: 'MET Norway Weather', listing: MET_NORWAY_LISTING }] };
const PANEL_CALENDAR_OFF = { label: 'Calendar', plugins: [{ name: 'Calendar', tag: BUILT_IN_OFF }] };

// what marks the supported plugins panel on the page
const PANEL_SELECTOR = '.pf-plugins';

// the mark the custom-clay fixture face's own customClay leaves on the page once Clay has built it,
// saying the framework's show and hide had already hidden the weather key row when it ran
export const FACE_CODE_MARK = 'body[data-face-page-code="after"]';

// the calendar feature's own words for its rows, from CALENDAR_TEXTS in ts/plugin-sources/calendar.ts,
// copied for the same reason and checked by the same spec
export const CALENDAR_NOT_STANDARD_TEXT = 'Odd Calendar sends events this watchface cannot read. Pick another calendar plugin under Preferred Sources in the Pebble app, or use an iCal link here.';
export const CALENDAR_PERMISSION_TEXT = 'This watchface needs Calendar to read the Pebble app\'s events. Allow it for this watchface in the Pebble app.';
export const CALENDAR_EMPTY_TEXT = 'If events are missing, the Pebble app may need permission to read your phone\'s calendars, or those calendars may be switched off in the Pebble app\'s calendar settings.';
export const CALENDAR_SOURCE_TEXT = 'Your watch shows the events from the calendars on your phone, the ones switched on in the Pebble app\'s calendar settings.';

// the fixture's calendar section, laid out as a face with calendar controls of its own builds it.
// its lead line has no mark and stays above the select. the iCal sentence, the link, and the refresh
// interval are marked, and hide while the events come from a plugin
const CALENDAR_LEAD = 'Add a Calendar panel to your layout to see your next events.';
const ICAL_LINE = 'Paste your private iCal link below.';
const CALENDAR_MARKED = ['CALENDAR_ICS_URL', 'CALENDAR_POLL'];

// where the calendar hook puts its select, under the section's heading and lead line and above the
// rows it hides
const SELECT_PLACE = { textsAbove: [{ text: CALENDAR_LEAD, key: 'CALENDAR_SOURCE' }], textsBelow: [{ text: ICAL_LINE, key: 'CALENDAR_SOURCE' }], order: ['CALENDAR_SOURCE', 'CALENDAR_ICS_URL', 'CALENDAR_POLL'] };

// the now playing and phone battery notes, from MUSIC_TEXTS in ts/plugin-sources/music.ts and
// PHONE_TEXTS in ts/plugin-sources/phone.ts, copied for the same reason and checked by the same spec
export const MUSIC_NO_PLUGIN_TEXT = 'Now playing needs a music plugin. The Pebble app has one built in on Android. Turn on plugins in the Pebble app under Settings, Plugins, or update the Pebble app.';
export const MUSIC_PERMISSION_TEXT = 'This watchface needs Music to show what your phone is playing. Allow it for this watchface in the Pebble app.';
export const MUSIC_NOT_STANDARD_TEXT = 'Odd Music sends music this watchface cannot read. Pick another music plugin under Preferred Sources in the Pebble app.';
export const PHONE_NO_PLUGIN_TEXT = 'Phone battery comes from the Phone plugin built into the Pebble app. Turn on plugins in the Pebble app under Settings, Plugins, or update the Pebble app.';

// where the Pebble app's music plugin runs, from the plugin directory in ts/plugin-sources/directory.ts
export const ANDROID_ONLY = 'Android Only';

// the panel's now playing and phone battery plugins on an Android phone that lists the built-in ones,
// and the same on a phone whose list leaves them out
const PANEL_MUSIC = { label: 'Now Playing', plugins: [{ name: 'Music', tag: `${BUILT_IN_TAG}, ${ANDROID_ONLY}` }] };
const PANEL_PHONE = { label: 'Phone Battery', plugins: [{ name: 'Phone', tag: BUILT_IN_TAG }] };
const PANEL_MUSIC_OFF = { label: 'Now Playing', plugins: [{ name: 'Music', tag: `${BUILT_IN_TAG}, ${ANDROID_ONLY}, ${OFF_TAG}` }] };
const PANEL_PHONE_OFF = { label: 'Phone Battery', plugins: [{ name: 'Phone', tag: BUILT_IN_OFF }] };

// every note the now playing and phone battery hooks can add
const MUSIC_PHONE_NOTES = [MUSIC_NO_PLUGIN_TEXT, MUSIC_PERMISSION_TEXT, MUSIC_NOT_STANDARD_TEXT, PHONE_NO_PLUGIN_TEXT];

/** The music and phone notes a scenario expects to show, and every other one hidden. */
function musicPhoneNotes(shown: string[]): Expectation {
  return { notesVisible: shown, badged: shown, notesHidden: MUSIC_PHONE_NOTES.filter((note) => !shown.includes(note)) };
}

// the rows of rows-face that carry a key, one of every kind Clay draws in a card that saves a value
const EVERY_ROW = ['ROW_PICK', 'ROW_WORDS', 'ROW_SWITCH', 'ROW_LEVEL', 'ROW_INK', 'ROW_ONE', 'ROW_SOME'];

/**
 * Every scenario the check runs, in order. Adding a scenario is adding a row: a plugins file in
 * fixtures/plugins when the phone needs one, and what the page has to show.
 */
export const SCENARIOS: Scenario[] = [
  {
    name: 'no-defines',
    defines: {},
    plugins: null,
    unchanged: true,
    load: {
      ...OPEN_METEO_ROWS,
      textsVisible: ['Location Settings', LEAD_LINE],
      options: [{ key: 'WEATHER_PROVIDER', has: ['openmeteo', 'owm', 'weatherapi'], lacks: ['plugin'] }],
      order: BUILDER_ORDER,
    },
    // the key row shows only for a provider that needs a key
    changes: [
      { key: 'WEATHER_PROVIDER', value: 'owm', visible: [...ALWAYS_SHOWN, ...WEATHER_MARKED] },
      { key: 'WEATHER_PROVIDER', value: 'openmeteo', ...OPEN_METEO_ROWS },
    ],
    absent: [PANEL_SELECTOR],
    save: { WEATHER_PROVIDER: 'openmeteo' },
  },
  {
    // a wearer who saved the plugin on a build that offered it, on a build without the define. the
    // select has no option for the saved value and opens blank, and the key row hides only for a
    // provider known to need no key, so it shows rather than hiding the box a keyed pick needs
    name: 'saved-plugin-no-defines',
    defines: {},
    plugins: null,
    settings: 'plugin-picked.json',
    load: {
      visible: [...ALWAYS_SHOWN, ...WEATHER_MARKED],
      options: [{ key: 'WEATHER_PROVIDER', has: ['openmeteo', 'owm', 'weatherapi'], lacks: ['plugin'] }],
    },
  },
  {
    name: 'built-in-weather',
    defines: { PLUGIN_WEATHER: 1 },
    plugins: 'built-in.json',
    // the location section moves below the weather one, so picking the plugin folds rows away under
    // the select rather than above it
    load: {
      ...OPEN_METEO_ROWS,
      textsVisible: ['Location Settings', LEAD_LINE],
      notesHidden: [SOURCE_TEXT],
      options: [{ key: 'WEATHER_PROVIDER', has: ['openmeteo', 'owm', 'weatherapi', 'plugin'] }],
      order: SELECT_FIRST,
    },
    // the key row's own condition for the keyed providers and the plugin's both have to hold, so it
    // shows for OpenWeatherMap and hides again for the plugin
    changes: [
      { key: 'WEATHER_PROVIDER', value: 'plugin', visible: ALWAYS_SHOWN, hidden: WEATHER_MARKED, textsVisible: [LEAD_LINE], textsHidden: ['Location Settings'], notesVisible: [SOURCE_TEXT] },
      { key: 'WEATHER_PROVIDER', value: 'openmeteo', ...OPEN_METEO_ROWS, textsVisible: ['Location Settings', LEAD_LINE], notesHidden: [SOURCE_TEXT] },
      { key: 'WEATHER_PROVIDER', value: 'owm', visible: [...ALWAYS_SHOWN, ...WEATHER_MARKED], notesHidden: [SOURCE_TEXT] },
      { key: 'WEATHER_PROVIDER', value: 'plugin', hidden: WEATHER_MARKED, notesVisible: [SOURCE_TEXT] },
    ],
    save: { WEATHER_PROVIDER: 'plugin' },
  },
  {
    name: 'html-name',
    defines: { PLUGIN_WEATHER: 1 },
    plugins: 'html-name.json',
    load: {
      notesHidden: [NOT_STANDARD_TEXT],
      options: [{ key: 'WEATHER_PROVIDER', has: ['plugin'] }],
    },
    changes: [
      { key: 'WEATHER_PROVIDER', value: 'plugin', notesVisible: [NOT_STANDARD_TEXT], badged: [NOT_STANDARD_TEXT] },
    ],
    // the panel lists the plugin by its own name, as text. the phone lists no built-in plugin, so the
    // panel marks it off
    panel: {
      kinds: [{ label: 'Weather', plugins: [...PANEL_WEATHER_OFF.plugins, { name: '<img src=x onerror=alert(1)>', tag: INSTALLED_TAG }] }],
      off: false,
    },
    absent: ['img'],
  },
  {
    // Clay puts the page in with a plain string replace, so a name holding $' or $$ has to reach the
    // page escaped, or the page script breaks and the settings never open. the note and the panel
    // show the name as written, and the page still saves
    name: 'dollar-name',
    defines: { PLUGIN_WEATHER: 1 },
    plugins: 'dollar-name.json',
    load: {
      notesHidden: [DOLLAR_NOT_STANDARD_TEXT],
      options: [{ key: 'WEATHER_PROVIDER', has: ['plugin'] }],
    },
    changes: [
      { key: 'WEATHER_PROVIDER', value: 'plugin', notesVisible: [DOLLAR_NOT_STANDARD_TEXT], badged: [DOLLAR_NOT_STANDARD_TEXT] },
    ],
    panel: {
      kinds: [{ label: 'Weather', plugins: [...PANEL_WEATHER_OFF.plugins, { name: DOLLAR_NAME, tag: INSTALLED_TAG }] }],
      off: false,
    },
    save: { WEATHER_PROVIDER: 'plugin' },
  },
  {
    name: 'empty-plugin-list',
    defines: { PLUGIN_WEATHER: 1 },
    plugins: 'empty.json',
    load: {
      ...OPEN_METEO_ROWS,
      options: [{ key: 'WEATHER_PROVIDER', has: ['openmeteo', 'owm', 'weatherapi'], lacks: ['plugin'] }],
    },
    changes: [
      { key: 'WEATHER_PROVIDER', value: 'owm', visible: [...ALWAYS_SHOWN, ...WEATHER_MARKED], textsVisible: ['Location Settings'] },
    ],
    save: { WEATHER_PROVIDER: 'owm' },
  },
  {
    name: 'permission-denied',
    defines: { PLUGIN_WEATHER: 1 },
    plugins: 'permission-denied.json',
    load: {
      notesHidden: [PERMISSION_TEXT],
    },
    changes: [
      { key: 'WEATHER_PROVIDER', value: 'plugin', notesVisible: [PERMISSION_TEXT], badged: [PERMISSION_TEXT] },
      { key: 'WEATHER_PROVIDER', value: 'openmeteo', notesHidden: [PERMISSION_TEXT] },
    ],
  },
  {
    name: 'plugins-off',
    defines: { PLUGIN_WEATHER: 1 },
    plugins: 'plugins-off.json',
    ...NO_PLUGIN_PAGE,
  },
  {
    // a Pebble app from before plugins has no plugin calls at all, and the page opens as it does with
    // plugins off
    name: 'older-app',
    defines: { PLUGIN_WEATHER: 1 },
    plugins: 'older-app.json',
    ...NO_PLUGIN_PAGE,
  },
  {
    name: 'saved-plugin-plugins-off',
    defines: { PLUGIN_WEATHER: 1 },
    plugins: 'plugins-off.json',
    settings: 'plugin-picked.json',
    // the saved plugin keeps its option, labelled as plugins off, so the page opens on it and a save
    // keeps it
    load: {
      visible: ALWAYS_SHOWN,
      hidden: WEATHER_MARKED,
      notesVisible: [PLUGINS_OFF_TEXT, SOURCE_TEXT],
      badged: [PLUGINS_OFF_TEXT],
      textsVisible: [LEAD_LINE],
      textsHidden: ['Location Settings'],
      options: [{ key: 'WEATHER_PROVIDER', has: ['openmeteo', 'owm', 'weatherapi', 'plugin'] }],
      order: SELECT_FIRST,
    },
    changes: [
      { key: 'WEATHER_PROVIDER', value: 'openmeteo', ...OPEN_METEO_ROWS, textsVisible: ['Location Settings'], notesHidden: [PLUGINS_OFF_TEXT] },
      { key: 'WEATHER_PROVIDER', value: 'plugin', hidden: WEATHER_MARKED, notesVisible: [PLUGINS_OFF_TEXT] },
    ],
    save: { WEATHER_PROVIDER: 'plugin' },
  },
  {
    // a weather section laid out the way a family core builds it, whose select carries no mark. the
    // weather hook finds it by its key, and the builder's location rows still hide under it
    name: 'core-select',
    face: 'core-face',
    defines: { PLUGIN_WEATHER: 1 },
    plugins: 'built-in.json',
    // the select comes up to sit under its heading, ahead of the two unit selects, and the core's
    // unmarked key row, which sat under it, stays next to it
    load: {
      visible: ['WEATHER_PROVIDER', 'WEATHER_API_KEY', ...WEATHER_MARKED],
      options: [{ key: 'WEATHER_PROVIDER', has: ['openmeteo', 'owm', 'weatherapi', 'plugin'] }],
      order: ['WEATHER_PROVIDER', 'WEATHER_API_KEY', 'WEATHER_TEMPERATURE_UNIT', 'WEATHER_WIND_UNIT', 'LOCATION_USE_GPS'],
    },
    changes: [
      // the core's key row carries no mark, so it stays as the face wrote it
      { key: 'WEATHER_PROVIDER', value: 'plugin', visible: ['WEATHER_API_KEY'], hidden: ['LOCATION_USE_GPS', 'LOCATION_GPS_FALLBACK', 'LOCATION_NAME'], notesVisible: [SOURCE_TEXT] },
    ],
    save: { WEATHER_PROVIDER: 'plugin' },
  },
  {
    // a face's own select offering one keyed provider. with plugins off it drops to its one option,
    // so the face's key row, shown for keyed providers, shows, and its Open-Meteo line stays hidden
    name: 'one-source-dropped',
    face: 'one-source-face',
    defines: { PLUGIN_WEATHER: 1 },
    plugins: 'plugins-off.json',
    load: {
      visible: ['WEATHER_API_KEY'],
      hidden: ['WEATHER_PROVIDER'],
      textsHidden: [OPEN_METEO_LINE],
    },
  },
  {
    // the same face with Open-Meteo saved. the feature fetches with the saved provider, so the face's
    // conditions settle against it rather than the one option left, and the key row stays hidden
    name: 'one-source-dropped-saved',
    face: 'one-source-face',
    defines: { PLUGIN_WEATHER: 1 },
    plugins: 'plugins-off.json',
    settings: 'openmeteo-picked.json',
    load: {
      hidden: ['WEATHER_PROVIDER', 'WEATHER_API_KEY'],
      textsVisible: [OPEN_METEO_LINE],
    },
  },
  {
    // the same face with a plugin on the phone keeps its select, and its own key row hides by its
    // own condition once the plugin is picked
    name: 'one-source-with-plugin',
    face: 'one-source-face',
    defines: { PLUGIN_WEATHER: 1 },
    plugins: 'built-in.json',
    load: {
      visible: ['WEATHER_PROVIDER', 'WEATHER_API_KEY'],
      textsHidden: [OPEN_METEO_LINE],
      options: [{ key: 'WEATHER_PROVIDER', has: ['owm', 'plugin'] }],
    },
    changes: [
      { key: 'WEATHER_PROVIDER', value: 'plugin', hidden: ['WEATHER_API_KEY'], textsHidden: [OPEN_METEO_LINE] },
    ],
    save: { WEATHER_PROVIDER: 'plugin' },
  },
  {
    // a phone whose plugin list cannot be read may still route to a plugin, so a saved plugin keeps
    // the plain choice, with no plugins off note, rather than reading as plugins off
    name: 'plugins-unreadable',
    defines: { PLUGIN_WEATHER: 1 },
    plugins: 'unreadable.json',
    settings: 'plugin-picked.json',
    load: {
      visible: ALWAYS_SHOWN,
      hidden: WEATHER_MARKED,
      notesVisible: [SOURCE_TEXT],
      notesHidden: [PLUGINS_OFF_TEXT],
      options: [{ key: 'WEATHER_PROVIDER', has: ['openmeteo', 'owm', 'weatherapi', 'plugin'] }],
      order: SELECT_FIRST,
    },
    save: { WEATHER_PROVIDER: 'plugin' },
  },
  {
    // a face listing the plugin alone runs its weather from it whatever is saved, and offers no
    // choice on the page. the Data Source select, its lead line, the key row, and the location rows
    // are gone. the page says where the weather comes from, a plugin serves it so no other note
    // shows, and the panel lists the weather plugins
    name: 'plugin-only-weather',
    face: 'plugin-weather-face',
    defines: { PLUGIN_WEATHER: 1 },
    providers: { weather: ['plugin'] },
    plugins: 'built-in.json',
    openUrl: true,
    load: {
      visible: ['WEATHER_TEMPERATURE_UNIT', 'CALENDAR_ICS_URL'],
      hidden: WEATHER_MARKED,
      textsHidden: [LEAD_LINE, 'Location Settings'],
      notesVisible: [SOURCE_TEXT],
      unbadged: [SOURCE_TEXT],
      notesHidden: [PLUGINS_OFF_TEXT],
    },
    absent: [DATA_SOURCE_OPTION],
    panel: { kinds: [PANEL_WEATHER], off: false },
  },
  {
    // the same face with plugins off. the panel opens on the line to turn them on, so the page does
    // not say it a second time, and with nothing serving the weather it says nothing on where it comes from
    name: 'plugin-only-weather-plugins-off',
    face: 'plugin-weather-face',
    defines: { PLUGIN_WEATHER: 1 },
    providers: { weather: ['plugin'] },
    plugins: 'plugins-off.json',
    load: {
      hidden: WEATHER_MARKED,
      notesHidden: [SOURCE_TEXT, PLUGINS_OFF_TEXT],
    },
    absent: [DATA_SOURCE_OPTION],
    panel: { kinds: [PANEL_WEATHER_OFF], off: true },
  },
  {
    // the same face on a phone whose plugins are on but serve no weather. the panel has no line about
    // plugins being off, so the note to turn plugins on, or update the Pebble app, shows alone
    name: 'plugin-only-weather-no-weather-plugin',
    face: 'plugin-weather-face',
    defines: { PLUGIN_WEATHER: 1 },
    providers: { weather: ['plugin'] },
    plugins: 'phone-only.json',
    load: {
      hidden: WEATHER_MARKED,
      notesVisible: [PLUGINS_OFF_TEXT],
      badged: [PLUGINS_OFF_TEXT],
      notesHidden: [SOURCE_TEXT],
    },
    panel: { kinds: [PANEL_WEATHER_OFF], off: false },
  },
  {
    // the fixture's own calendar section, laid out as a face with calendar controls of its own builds
    // it. the calendar hook adds its select under the heading and the unmarked lead line, and picking
    // the plugin hides the iCal sentence, the link, and the refresh interval under it
    name: 'built-in-calendar',
    defines: { PLUGIN_CALENDAR: 1 },
    plugins: 'built-in.json',
    load: {
      ...SELECT_PLACE,
      visible: ['CALENDAR_SOURCE', ...CALENDAR_MARKED],
      textsVisible: [CALENDAR_LEAD, ICAL_LINE],
      notesHidden: [CALENDAR_SOURCE_TEXT],
      options: [{ key: 'CALENDAR_SOURCE', has: ['ical', 'plugin'] }, { key: 'WEATHER_PROVIDER', lacks: ['plugin'] }],
    },
    changes: [
      { key: 'CALENDAR_SOURCE', value: 'plugin', visible: ['CALENDAR_SOURCE'], hidden: CALENDAR_MARKED, textsVisible: [CALENDAR_LEAD], textsHidden: [ICAL_LINE], unbadged: [CALENDAR_SOURCE_TEXT] },
      { key: 'CALENDAR_SOURCE', value: 'ical', visible: CALENDAR_MARKED, textsVisible: [CALENDAR_LEAD, ICAL_LINE], notesHidden: [CALENDAR_SOURCE_TEXT] },
      { key: 'CALENDAR_SOURCE', value: 'plugin', hidden: CALENDAR_MARKED, notesVisible: [CALENDAR_SOURCE_TEXT] },
    ],
    save: { CALENDAR_SOURCE: 'plugin' },
  },
  {
    // a calendar plugin whose manifest names its readings its own way, so the face cannot read it
    name: 'calendar-not-standard',
    defines: { PLUGIN_CALENDAR: 1 },
    plugins: 'calendar-not-standard.json',
    load: {
      notesHidden: [CALENDAR_NOT_STANDARD_TEXT],
      options: [{ key: 'CALENDAR_SOURCE', has: ['ical', 'plugin'] }],
    },
    changes: [
      { key: 'CALENDAR_SOURCE', value: 'plugin', notesVisible: [CALENDAR_NOT_STANDARD_TEXT], badged: [CALENDAR_NOT_STANDARD_TEXT] },
    ],
  },
  {
    // the calendar has no status line on the watch, so the page is the only place a denied permission shows
    name: 'calendar-permission-denied',
    defines: { PLUGIN_CALENDAR: 1 },
    plugins: 'calendar-permission-denied.json',
    load: {
      notesHidden: [CALENDAR_PERMISSION_TEXT],
    },
    changes: [
      { key: 'CALENDAR_SOURCE', value: 'plugin', notesVisible: [CALENDAR_PERMISSION_TEXT], badged: [CALENDAR_PERMISSION_TEXT] },
      { key: 'CALENDAR_SOURCE', value: 'ical', notesHidden: [CALENDAR_PERMISSION_TEXT] },
    ],
  },
  {
    // an empty week and a missing permission look the same from the phone, so the empty update gets
    // the calmer note that says what may be wrong
    name: 'calendar-empty',
    defines: { PLUGIN_CALENDAR: 1 },
    plugins: 'calendar-empty.json',
    load: {
      notesHidden: [CALENDAR_EMPTY_TEXT],
    },
    changes: [
      { key: 'CALENDAR_SOURCE', value: 'plugin', unbadged: [CALENDAR_EMPTY_TEXT, CALENDAR_SOURCE_TEXT] },
    ],
  },
  {
    // with plugins off the select would offer iCal Link alone, so it is dropped and the iCal rows show
    // as they do on a face without the define
    name: 'calendar-plugins-off',
    defines: { PLUGIN_CALENDAR: 1 },
    plugins: 'plugins-off.json',
    load: {
      visible: CALENDAR_MARKED,
      hidden: ['CALENDAR_SOURCE'],
      textsVisible: [CALENDAR_LEAD, ICAL_LINE],
      notesHidden: [CALENDAR_SOURCE_TEXT],
    },
    saveNot: { CALENDAR_SOURCE: ['plugin', 'ical'] },
  },
  {
    // the saved plugin keeps its option, labelled as plugins off, so the select stays, the page opens
    // on it, and a save keeps it rather than dropping to iCal and clearing the agenda
    name: 'calendar-saved-plugin-plugins-off',
    defines: { PLUGIN_CALENDAR: 1 },
    plugins: 'plugins-off.json',
    settings: 'calendar-plugin-picked.json',
    load: {
      ...SELECT_PLACE,
      visible: ['CALENDAR_SOURCE'],
      hidden: CALENDAR_MARKED,
      textsVisible: [CALENDAR_LEAD],
      textsHidden: [ICAL_LINE],
      notesVisible: [PLUGINS_OFF_TEXT, CALENDAR_SOURCE_TEXT],
      badged: [PLUGINS_OFF_TEXT],
      options: [{ key: 'CALENDAR_SOURCE', has: ['ical', 'plugin'] }],
    },
    changes: [
      { key: 'CALENDAR_SOURCE', value: 'ical', visible: CALENDAR_MARKED, textsVisible: [ICAL_LINE], notesHidden: [PLUGINS_OFF_TEXT] },
      { key: 'CALENDAR_SOURCE', value: 'plugin', hidden: CALENDAR_MARKED, notesVisible: [PLUGINS_OFF_TEXT] },
    ],
    save: { CALENDAR_SOURCE: 'plugin' },
  },
  {
    // a phone whose plugin list cannot be read may still route to a plugin, so a saved plugin keeps
    // the plain choice, with no plugins off note
    name: 'calendar-unreadable',
    defines: { PLUGIN_CALENDAR: 1 },
    plugins: 'unreadable.json',
    settings: 'calendar-plugin-picked.json',
    load: {
      visible: ['CALENDAR_SOURCE'],
      hidden: CALENDAR_MARKED,
      notesVisible: [CALENDAR_SOURCE_TEXT],
      notesHidden: [PLUGINS_OFF_TEXT],
      options: [{ key: 'CALENDAR_SOURCE', has: ['ical', 'plugin'] }],
    },
    save: { CALENDAR_SOURCE: 'plugin' },
  },
  {
    // both kinds on, so the weather and calendar hooks fold one page between them and neither undoes
    // the other's rows
    name: 'built-in-weather-and-calendar',
    defines: { PLUGIN_WEATHER: 1, PLUGIN_CALENDAR: 1 },
    plugins: 'built-in.json',
    load: {
      ...SELECT_PLACE,
      visible: ['WEATHER_PROVIDER', 'CALENDAR_SOURCE', ...LOCATION_MARKED, ...CALENDAR_MARKED],
      hidden: ['WEATHER_API_KEY'],
      options: [{ key: 'WEATHER_PROVIDER', has: ['openmeteo', 'plugin'] }, { key: 'CALENDAR_SOURCE', has: ['ical', 'plugin'] }],
    },
    changes: [
      { key: 'WEATHER_PROVIDER', value: 'plugin', hidden: WEATHER_MARKED, visible: CALENDAR_MARKED, notesVisible: [SOURCE_TEXT], notesHidden: [CALENDAR_SOURCE_TEXT] },
      { key: 'CALENDAR_SOURCE', value: 'plugin', hidden: [...WEATHER_MARKED, ...CALENDAR_MARKED], notesVisible: [SOURCE_TEXT, CALENDAR_SOURCE_TEXT] },
    ],
    save: { WEATHER_PROVIDER: 'plugin', CALENDAR_SOURCE: 'plugin' },
  },
  {
    // a face listing the plugin alone for the calendar runs its events from it whatever is saved, and
    // offers no choice on the page. the iCal sentence, the link, and the refresh interval are gone,
    // and the face's unmarked lead line stays. the page says where the events come from, and a
    // plugin serves them, so no other note shows
    name: 'plugin-only-calendar',
    face: 'plugin-calendar-face',
    defines: { PLUGIN_CALENDAR: 1 },
    providers: { calendar: ['plugin'] },
    plugins: 'built-in.json',
    load: {
      visible: ['WEATHER_PROVIDER'],
      hidden: CALENDAR_MARKED,
      textsVisible: [CALENDAR_LEAD],
      textsHidden: [ICAL_LINE],
      notesVisible: [CALENDAR_SOURCE_TEXT],
      unbadged: [CALENDAR_SOURCE_TEXT],
      notesHidden: [PLUGINS_OFF_TEXT],
    },
    absent: [ICAL_OPTION],
    panel: { kinds: [PANEL_CALENDAR], off: false },
  },
  {
    // the same face with plugins off, where the panel's own line says to turn them on, once, and the
    // page says nothing on where the events come from while nothing serves them
    name: 'plugin-only-calendar-plugins-off',
    face: 'plugin-calendar-face',
    defines: { PLUGIN_CALENDAR: 1 },
    providers: { calendar: ['plugin'] },
    plugins: 'plugins-off.json',
    load: {
      hidden: CALENDAR_MARKED,
      notesHidden: [CALENDAR_SOURCE_TEXT, PLUGINS_OFF_TEXT],
    },
    absent: [ICAL_OPTION],
    panel: { kinds: [PANEL_CALENDAR_OFF], off: true },
  },
  {
    // a face listing two weather providers and no plugin. the Data Source select offers those two,
    // the key row stays since OpenWeatherMap needs a key, and the page is otherwise the builder's
    name: 'narrowed-weather',
    defines: {},
    providers: { weather: ['openmeteo', 'owm'] },
    plugins: null,
    load: {
      ...OPEN_METEO_ROWS,
      textsVisible: [LEAD_LINE],
      options: [{ key: 'WEATHER_PROVIDER', has: ['openmeteo', 'owm'], lacks: ['weatherapi', 'plugin'] }],
      order: BUILDER_ORDER,
    },
    // the key row stays on the page, since OpenWeatherMap needs a key, and shows once it is picked
    changes: [
      { key: 'WEATHER_PROVIDER', value: 'owm', visible: ['WEATHER_API_KEY'] },
    ],
    save: { WEATHER_PROVIDER: 'owm' },
  },
  {
    // a face listing Open-Meteo alone. a dropdown with one provider is no choice, so it goes with its
    // lead line, and Open-Meteo needs no key, so the key row goes too. the location rows stay
    name: 'one-provider-weather',
    defines: {},
    providers: { weather: ['openmeteo'] },
    plugins: null,
    load: {
      visible: ['WEATHER_TEMPERATURE_UNIT', 'LOCATION_USE_GPS', 'LOCATION_GPS_FALLBACK', 'LOCATION_NAME'],
      hidden: ['WEATHER_PROVIDER', 'WEATHER_API_KEY'],
      textsVisible: ['Location Settings'],
      textsHidden: [LEAD_LINE],
    },
    absent: [OWM_OPTION],
    saveNot: { WEATHER_PROVIDER: ['owm', 'weatherapi'] },
  },
  {
    // a returning wearer who picked OpenWeatherMap, on a face that no longer offers it. the phone
    // moves the saved provider to the face's first, so the select shows it rather than a blank, and
    // a save carries it
    name: 'saved-provider-dropped',
    defines: {},
    providers: { weather: ['openmeteo', 'weatherapi'] },
    plugins: null,
    settings: 'owm-picked.json',
    load: {
      visible: ['WEATHER_PROVIDER'],
      hidden: ['WEATHER_API_KEY'],
      options: [{ key: 'WEATHER_PROVIDER', has: ['openmeteo', 'weatherapi'], lacks: ['owm'] }],
    },
    save: { WEATHER_PROVIDER: 'openmeteo' },
  },
  {
    // a face offering Open-Meteo and the Pebble app's weather. the select offers the two, with no key
    // row, since Open-Meteo needs none, and picking the plugin hides the location rows
    name: 'mixed-weather',
    defines: { PLUGIN_WEATHER: 1 },
    providers: { weather: ['plugin', 'openmeteo'] },
    plugins: 'built-in.json',
    load: {
      visible: ['WEATHER_PROVIDER', 'LOCATION_USE_GPS', 'LOCATION_GPS_FALLBACK', 'LOCATION_NAME'],
      hidden: ['WEATHER_API_KEY'],
      options: [{ key: 'WEATHER_PROVIDER', has: ['openmeteo', 'plugin'], lacks: ['owm', 'weatherapi'] }],
    },
    changes: [
      { key: 'WEATHER_PROVIDER', value: 'plugin', hidden: ['LOCATION_USE_GPS', 'LOCATION_GPS_FALLBACK', 'LOCATION_NAME'], notesVisible: [SOURCE_TEXT] },
    ],
    save: { WEATHER_PROVIDER: 'plugin' },
  },
  {
    // the same face with plugins off. Open-Meteo is the one choice left, so the select and its lead
    // line go, and the location rows show for it
    name: 'mixed-weather-plugins-off',
    defines: { PLUGIN_WEATHER: 1 },
    providers: { weather: ['plugin', 'openmeteo'] },
    plugins: 'plugins-off.json',
    load: {
      visible: ['WEATHER_TEMPERATURE_UNIT', 'LOCATION_USE_GPS', 'LOCATION_GPS_FALLBACK', 'LOCATION_NAME'],
      hidden: ['WEATHER_PROVIDER', 'WEATHER_API_KEY'],
      textsVisible: ['Location Settings'],
      textsHidden: [LEAD_LINE],
    },
    saveNot: { WEATHER_PROVIDER: ['plugin', 'owm', 'weatherapi'] },
  },
  {
    // a face with no temperature unit listing Open-Meteo alone. the select and its lead line go, and
    // the key row with them, which leaves the Weather card nothing to hold, so it goes too
    name: 'one-provider-weather-no-unit',
    face: 'no-unit-face',
    defines: {},
    providers: { weather: ['openmeteo'] },
    plugins: null,
    load: {
      visible: ['LOCATION_USE_GPS', 'LOCATION_GPS_FALLBACK', 'LOCATION_NAME'],
      hidden: ['WEATHER_PROVIDER', 'WEATHER_API_KEY'],
      textsVisible: ['Location Settings'],
      textsHidden: [LEAD_LINE, 'Weather'],
    },
  },
  {
    // the same page the way the Pebble Android app leaves it. the location search, with no text box
    // of Clay's own on the page, has to sit as it does in the usual order and keep the text box look
    name: 'one-provider-weather-no-unit-android-head',
    face: 'no-unit-face',
    defines: {},
    providers: { weather: ['openmeteo'] },
    plugins: null,
    androidHead: true,
    load: {
      visible: ['LOCATION_USE_GPS', 'LOCATION_GPS_FALLBACK', 'LOCATION_NAME'],
      hidden: ['WEATHER_PROVIDER', 'WEATHER_API_KEY'],
    },
  },
  {
    // the same page on a face offering Open-Meteo and the Pebble app's weather, on a phone whose
    // plugins serve no weather. the plugin hook drops the select to Open-Meteo alone with its lead
    // line, and the Weather card goes with them
    name: 'mixed-weather-no-unit-no-weather-plugin',
    face: 'no-unit-face',
    defines: { PLUGIN_WEATHER: 1 },
    providers: { weather: ['plugin', 'openmeteo'] },
    plugins: 'phone-only.json',
    load: {
      visible: ['LOCATION_USE_GPS', 'LOCATION_GPS_FALLBACK', 'LOCATION_NAME'],
      hidden: ['WEATHER_PROVIDER', 'WEATHER_API_KEY'],
      textsVisible: ['Location Settings'],
      textsHidden: [LEAD_LINE, 'Weather'],
    },
    panel: { kinds: [PANEL_WEATHER_OFF], off: false },
  },
  {
    // the same page on a face taking its weather from a plugin alone, with plugins off. the panel
    // says to turn them on, so no note follows the anchor the first pass left, and the Weather card
    // that held it goes with it
    name: 'plugin-only-weather-no-unit-plugins-off',
    face: 'plugin-no-unit-face',
    defines: { PLUGIN_WEATHER: 1 },
    providers: { weather: ['plugin'] },
    plugins: 'plugins-off.json',
    load: {
      hidden: WEATHER_MARKED,
      textsHidden: [LEAD_LINE, 'Weather', 'Location Settings'],
      notesHidden: [SOURCE_TEXT, PLUGINS_OFF_TEXT],
    },
    panel: { kinds: [PANEL_WEATHER_OFF], off: true },
  },
  {
    // a face of its own stock section listing Yahoo alone. the select goes, with one provider left,
    // and so does the key row, since Yahoo needs no key. the tickers stay
    name: 'one-provider-stocks',
    face: 'stock-face',
    defines: {},
    providers: { stocks: ['yahoo'] },
    plugins: null,
    load: {
      visible: ['STOCK_SYMBOLS'],
      hidden: ['STOCK_PROVIDER', 'STOCK_API_KEY'],
      textsVisible: [STOCK_LEAD],
    },
    absent: [FINNHUB_OPTION],
  },
  {
    // the same face listing Finnhub alone. the select goes, and the face's own condition on its key
    // row is settled against Finnhub, which needs a key, so the row shows
    name: 'one-keyed-provider-stocks',
    face: 'stock-face',
    defines: {},
    providers: { stocks: ['finnhub'] },
    plugins: null,
    load: {
      visible: ['STOCK_API_KEY', 'STOCK_SYMBOLS'],
      hidden: ['STOCK_PROVIDER'],
    },
  },
  {
    // the same face listing Yahoo and Alpha Vantage. the select offers the two, Yahoo first as the
    // default, and the face's key row shows only once Alpha Vantage is picked
    name: 'narrowed-stocks',
    face: 'stock-face',
    defines: {},
    providers: { stocks: ['yahoo', 'alphavantage'] },
    plugins: null,
    load: {
      visible: ['STOCK_PROVIDER', 'STOCK_SYMBOLS'],
      hidden: ['STOCK_API_KEY'],
      options: [{ key: 'STOCK_PROVIDER', has: ['yahoo', 'alphavantage'], lacks: ['finnhub', 'twelvedata'] }],
    },
    changes: [
      { key: 'STOCK_PROVIDER', value: 'alphavantage', visible: ['STOCK_API_KEY'] },
    ],
    save: { STOCK_PROVIDER: 'alphavantage' },
  },
  {
    // a face with no settings page of its own, taking its weather from a plugin alone. the page holds
    // only what the weather adds: where the weather comes from, and the supported plugins panel
    name: 'no-page-plugin-weather',
    face: 'no-page-face',
    defines: { PLUGIN_WEATHER: 1 },
    providers: { weather: ['plugin'] },
    plugins: 'built-in.json',
    load: {
      notesVisible: [SOURCE_TEXT],
      notesHidden: [PLUGINS_OFF_TEXT],
    },
    panel: { kinds: [PANEL_WEATHER], off: false },
  },
  {
    // the same face with plugins off, where the panel's own line says to turn them on, and nothing
    // else on the page needs saying
    name: 'no-page-plugin-weather-plugins-off',
    face: 'no-page-face',
    defines: { PLUGIN_WEATHER: 1 },
    providers: { weather: ['plugin'] },
    plugins: 'plugins-off.json',
    load: {
      notesHidden: [SOURCE_TEXT, PLUGINS_OFF_TEXT],
    },
    panel: { kinds: [PANEL_WEATHER_OFF], off: true },
  },
  {
    // a face with no visibleWhen row, no plugins, and no customClay of its own, opened the way the
    // Pebble Android app leaves the page while plugins are on. its selects, its key row, and its GPS
    // toggles have to keep no padding with the component styles ahead of Clay's base sheet
    name: 'android-head',
    face: 'core-face',
    defines: {},
    plugins: null,
    androidHead: true,
    load: {
      visible: ['WEATHER_TEMPERATURE_UNIT', 'WEATHER_PROVIDER', 'WEATHER_API_KEY', 'LOCATION_USE_GPS'],
    },
  },
  {
    // one row of every kind Clay draws in a card, in the usual order, where the row rules move none
    name: 'every-row',
    face: 'rows-face',
    defines: {},
    plugins: null,
    load: { visible: EVERY_ROW },
  },
  {
    // the same rows the way the Pebble Android app leaves the page, where each has to sit as it does
    // in the usual order
    name: 'every-row-android-head',
    face: 'rows-face',
    defines: {},
    plugins: null,
    androidHead: true,
    load: { visible: EVERY_ROW },
  },
  {
    // a theme picker on a page with no plain select, which takes its look from Clay's select only
    // through the framework, in the usual order
    name: 'picker-no-select',
    face: 'picker-face',
    defines: {},
    plugins: null,
    load: { visible: ['APPEARANCE_THEME', 'PICK_SWITCH'] },
  },
  {
    // the same page the way the Pebble Android app leaves it, where the picker has to keep its look
    // and sit as it does in the usual order
    name: 'picker-no-select-android-head',
    face: 'picker-face',
    defines: {},
    plugins: null,
    androidHead: true,
    load: { visible: ['APPEARANCE_THEME', 'PICK_SWITCH'] },
  },
  {
    // the panel on a weather face, listing the built-in plugin and the store's, where the settings page
    // can open a store listing outside itself
    name: 'panel-weather',
    defines: { PLUGIN_WEATHER: 1 },
    plugins: 'built-in.json',
    openUrl: true,
    load: {},
    panel: { kinds: [PANEL_WEATHER], off: false },
  },
  {
    // weather and the calendar both on, so both hooks add their kind to the one panel
    name: 'panel-weather-and-calendar',
    defines: { PLUGIN_WEATHER: 1, PLUGIN_CALENDAR: 1 },
    plugins: 'built-in.json',
    openUrl: true,
    load: {},
    panel: { kinds: [PANEL_WEATHER, PANEL_CALENDAR], off: false },
  },
  {
    // with plugins off the calendar select drops to its one option, and the panel still lists both
    // kinds, opening on the line to turn plugins on, with the built-in plugins marked off. with no
    // openUrl the store plugin is plain text
    name: 'panel-plugins-off',
    defines: { PLUGIN_WEATHER: 1, PLUGIN_CALENDAR: 1 },
    plugins: 'plugins-off.json',
    load: { hidden: ['CALENDAR_SOURCE'] },
    panel: { kinds: [PANEL_WEATHER_OFF, PANEL_CALENDAR_OFF], off: true },
  },
  {
    // a face with the weather define whose page has no Data Source select never picks a plugin, so it
    // gets no panel, and its location rows show as they do without the define
    name: 'panel-no-choice',
    face: 'no-choice-face',
    defines: { PLUGIN_WEATHER: 1 },
    plugins: 'built-in.json',
    load: { visible: ['LOCATION_USE_GPS', 'LOCATION_GPS_FALLBACK', 'LOCATION_NAME'] },
    absent: [PANEL_SELECTOR],
  },
  {
    // a face passing its own customClay gets the framework's show and hide first and its own code
    // after it. the page opens on the plugin, so the rows the plugin choice hides are already hidden
    // when the face's code runs, which its mark says. the face's code then shows the key row again,
    // and the later changes are the framework's alone
    name: 'face-custom-clay',
    face: 'custom-clay-face',
    defines: { PLUGIN_WEATHER: 1 },
    plugins: 'built-in.json',
    settings: 'plugin-picked.json',
    load: {
      visible: [...ALWAYS_SHOWN, 'WEATHER_API_KEY'],
      hidden: ['LOCATION_USE_GPS', 'LOCATION_GPS_FALLBACK', 'LOCATION_NAME'],
      notesVisible: [SOURCE_TEXT],
    },
    changes: [
      { key: 'WEATHER_PROVIDER', value: 'openmeteo', ...OPEN_METEO_ROWS, notesHidden: [SOURCE_TEXT] },
      { key: 'WEATHER_PROVIDER', value: 'plugin', visible: ALWAYS_SHOWN, hidden: WEATHER_MARKED, notesVisible: [SOURCE_TEXT] },
    ],
    present: [FACE_CODE_MARK],
    save: { WEATHER_PROVIDER: 'plugin' },
  },
  {
    // now playing and the phone battery on an Android phone with the built-in plugins. neither kind
    // has a select, both plugins serve, so the page needs no note, and the panel lists both kinds
    name: 'music-phone-built-in',
    face: 'music-phone-face',
    defines: { PLUGIN_MUSIC: 1, PLUGIN_PHONE: 1 },
    plugins: 'music-phone.json',
    load: musicPhoneNotes([]),
    panel: { kinds: [PANEL_MUSIC, PANEL_PHONE], off: false },
  },
  {
    // with plugins off the panel opens on its line to turn them on, so neither kind adds its own note
    // saying the same
    name: 'music-phone-plugins-off',
    face: 'music-phone-face',
    defines: { PLUGIN_MUSIC: 1, PLUGIN_PHONE: 1 },
    plugins: 'plugins-off.json',
    load: musicPhoneNotes([]),
    panel: { kinds: [PANEL_MUSIC_OFF, PANEL_PHONE_OFF], off: true },
  },
  {
    // an iPhone, where the Phone plugin serves and no music plugin does. the panel has no line about
    // plugins being off, so the music note shows, under the face's marked line
    name: 'music-phone-iphone',
    face: 'music-phone-face',
    defines: { PLUGIN_MUSIC: 1, PLUGIN_PHONE: 1 },
    plugins: 'phone-only.json',
    load: musicPhoneNotes([MUSIC_NO_PLUGIN_TEXT]),
    panel: { kinds: [PANEL_MUSIC_OFF, PANEL_PHONE], off: false },
  },
  {
    // a wearer who has not allowed Music for the face, where the note says to
    name: 'music-permission-denied',
    face: 'music-phone-face',
    defines: { PLUGIN_MUSIC: 1, PLUGIN_PHONE: 1 },
    plugins: 'music-permission-denied.json',
    load: musicPhoneNotes([MUSIC_PERMISSION_TEXT]),
  },
  {
    // a music plugin that answered without the readings the face reads, named in its note
    name: 'music-not-standard',
    face: 'music-phone-face',
    defines: { PLUGIN_MUSIC: 1, PLUGIN_PHONE: 1 },
    plugins: 'music-not-standard.json',
    load: musicPhoneNotes([MUSIC_NOT_STANDARD_TEXT]),
    panel: { kinds: [{ label: 'Now Playing', plugins: [...PANEL_MUSIC_OFF.plugins, { name: 'Odd Music', tag: INSTALLED_TAG }] }, PANEL_PHONE], off: false },
  },
];

/** What a page showed at one moment, as the browser read it. */
export interface Observed {
  /** Each message key asked about, with whether its row is on the page and whether it shows. */
  keys: Record<string, { exists: boolean; visible: boolean }>;
  /** Each text asked about, with whether a row with those words shows. */
  texts: Record<string, boolean>;
  /** Each note asked about, with whether a note with those words shows and whether it carries the badge. */
  notes: Record<string, { visible: boolean; badged: boolean }>;
  /**
   * Each text asked about for its place, by its words and then by the row's message key, with whether
   * the text row sits above or below that row, or null when either is not on the page.
   */
  places: Record<string, Record<string, 'above' | 'below' | null>>;
  /** Each select asked about, with its option values, or null when it is not on the page. */
  options: Record<string, string[] | null>;
  /** The rows asked about for their order that are on the page, top to bottom, by message key. */
  order: string[];
}

/**
 * Picks the scenarios to run from the check's arguments.
 *
 * @param args The scenario names given on the command line. None runs them all.
 * @param scenarios The scenario table.
 * @return The scenarios to run, in table order.
 */
export function pickScenarios(args: string[], scenarios: Scenario[]): Scenario[] {
  const unknown = args.filter((name) => !scenarios.some((scenario) => scenario.name === name));

  if (unknown.length) {
    throw new ToolError(`no scenario called ${unknown.join(', ')}. The scenarios are ${scenarios.map((scenario) => scenario.name).join(', ')}`);
  }

  return args.length ? scenarios.filter((scenario) => args.includes(scenario.name)) : scenarios;
}

/**
 * Compares what a page showed with what it should, and says what is wrong.
 *
 * @param observed What the browser read off the page.
 * @param expected What the page should show.
 * @param when When it was read, such as "on load", which each problem starts with.
 * @return One line per problem, empty when the page is right.
 */
export function expectationProblems(observed: Observed, expected: Expectation, when: string): string[] {
  const problems: string[] = [];

  (expected.visible || []).forEach((key) => {
    const row = observed.keys[key];

    if (!row || !row.exists) {
      problems.push(`${when}, ${key} is not on the page`);
    } else if (!row.visible) {
      problems.push(`${when}, ${key} is hidden but should show`);
    }
  });

  (expected.hidden || []).forEach((key) => {
    if (observed.keys[key] && observed.keys[key].visible) {
      problems.push(`${when}, ${key} shows but should be hidden`);
    }
  });

  (expected.textsVisible || []).forEach((text) => {
    if (!observed.texts[text]) {
      problems.push(`${when}, no row showing "${text}"`);
    }
  });

  (expected.textsHidden || []).forEach((text) => {
    if (observed.texts[text]) {
      problems.push(`${when}, a row shows "${text}" but should be hidden`);
    }
  });

  (expected.notesVisible || []).forEach((text) => {
    if (!observed.notes[text] || !observed.notes[text].visible) {
      problems.push(`${when}, no note showing "${text}"`);
    }
  });

  (expected.notesHidden || []).forEach((text) => {
    if (observed.notes[text] && observed.notes[text].visible) {
      problems.push(`${when}, a note shows "${text}" but should be hidden`);
    }
  });

  (expected.badged || []).forEach((text) => {
    if (!observed.notes[text] || !observed.notes[text].badged) {
      problems.push(`${when}, the note "${text}" carries no badge`);
    }
  });

  (expected.unbadged || []).forEach((text) => {
    if (!observed.notes[text] || !observed.notes[text].visible) {
      problems.push(`${when}, no note showing "${text}"`);
    } else if (observed.notes[text].badged) {
      problems.push(`${when}, the note "${text}" carries the warning badge but should not`);
    }
  });

  const placed = (wanted: 'above' | 'below') => ({ text, key }: { text: string; key: string }) => {
    const place = (observed.places[text] || {})[key];

    if (!place) {
      problems.push(`${when}, the row "${text}" or ${key} is not on the page to place`);
    } else if (place !== wanted) {
      problems.push(`${when}, the row "${text}" sits ${place} ${key}, not ${wanted} it`);
    }
  };

  (expected.textsAbove || []).forEach(placed('above'));
  (expected.textsBelow || []).forEach(placed('below'));

  if (expected.order && JSON.stringify(observed.order) !== JSON.stringify(expected.order)) {
    problems.push(`${when}, the rows run ${observed.order.join(' then ') || 'nowhere'}, not ${expected.order.join(' then ')}`);
  }

  (expected.options || []).forEach(({ key, has = [], lacks = [] }) => {
    const values = observed.options[key];

    if (!values) {
      problems.push(`${when}, the ${key} select is not on the page`);
      return;
    }

    has.filter((value) => !values.includes(value)).forEach((value) => problems.push(`${when}, ${key} has no ${value} option`));
    lacks.filter((value) => values.includes(value)).forEach((value) => problems.push(`${when}, ${key} offers ${value} but should not`));
  });

  return problems;
}

/** What the supported plugins panel showed, as the browser read it. */
export interface ObservedPanel {
  /** How many panels are on the page. */
  count: number;
  /** Whether the panel is open. */
  open: boolean;
  /** Whether what the panel holds shows, which it only does while the panel is open. */
  bodyShows: boolean;
  /** The words the panel shows while it is closed. */
  title: string;
  /** Whether the line saying to turn plugins on is there. */
  off: boolean;
  /** Each kind's heading and its plugins, in the order they run down the panel. */
  kinds: Array<{ label: string; plugins: Array<{ name: string; tag: string; href: string | null; address: string }> }>;
}

/**
 * Compares what the open panel lists with what it should, and says what is wrong.
 *
 * A store plugin's name has to link to its listing where the page has `Pebble.openUrl`, and has to be
 * plain text with the listing's address under it where it has not.
 *
 * @param observed What the browser read off the open panel.
 * @param expected What the panel should list.
 * @param openUrl Whether the page has `Pebble.openUrl`.
 * @return One line per problem, empty when the panel is right.
 */
export function panelProblems(observed: ObservedPanel, expected: PanelExpectation, openUrl: boolean): string[] {
  const problems: string[] = [];

  if (observed.title !== PANEL_TITLE) {
    problems.push(`the panel's title reads "${observed.title}", not "${PANEL_TITLE}"`);
  }

  if (observed.off !== expected.off) {
    problems.push(expected.off ? 'the panel does not open on the line to turn plugins on' : 'the panel tells the wearer to turn plugins on, but should not');
  }

  const labels = observed.kinds.map((kind) => kind.label);
  const wanted = expected.kinds.map((kind) => kind.label);

  if (JSON.stringify(labels) !== JSON.stringify(wanted)) {
    problems.push(`the panel lists ${labels.join(', ') || 'no kinds'}, not ${wanted.join(', ')}`);
    return problems;
  }

  expected.kinds.forEach((kind, index) => {
    const shown = observed.kinds[index].plugins;
    const names = shown.map((plugin) => plugin.name);

    if (JSON.stringify(names) !== JSON.stringify(kind.plugins.map((plugin) => plugin.name))) {
      problems.push(`the panel lists ${names.join(', ') || 'nothing'} under ${kind.label}, not ${kind.plugins.map((plugin) => plugin.name).join(', ')}`);
      return;
    }

    kind.plugins.forEach((plugin, at) => {
      const seen = shown[at];
      const listing = plugin.listing || '';
      const href = openUrl && listing ? listing : null;
      const address = !openUrl && listing ? listing.replace(/^https:\/\//, '') : '';

      if (seen.tag !== (plugin.tag || '')) {
        problems.push(`the panel tags ${plugin.name} "${seen.tag}", not "${plugin.tag || ''}"`);
      }

      if (seen.href !== href) {
        problems.push(href ? `the panel links ${plugin.name} to ${seen.href || 'nothing'}, not ${href}` : `the panel links ${plugin.name} to ${seen.href}, but should not link it`);
      }

      if (seen.address !== address) {
        problems.push(`the panel shows the address of ${plugin.name} as "${seen.address}", not "${address}"`);
      }
    });
  });

  return problems;
}

/** What starts the address the settings page goes to on a save. */
const CLOSE_PREFIX = 'pebblejs://close#';

/**
 * Reads the settings a save sends, out of the address the page navigates to.
 *
 * Clay ends the page by going to pebblejs://close# with the settings as URI-encoded JSON, each
 * message key holding an object with the value in it.
 *
 * @param url The address the page navigated to.
 * @return The settings by message key, or null when the address is not a save.
 */
export function savedPayload(url: string): Record<string, unknown> | null {
  if (!url.startsWith(CLOSE_PREFIX)) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(url.slice(CLOSE_PREFIX.length)));

    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** A saved value as the save carries it, or undefined when the save leaves the key out. */
function savedValue(payload: Record<string, unknown>, key: string): { value: unknown } | undefined {
  const entry = payload[key];

  return entry && typeof entry === 'object' && 'value' in entry ? (entry as { value: unknown }) : undefined;
}

/**
 * Compares a save with the values it should carry and the ones it must not.
 *
 * @param payload The settings the save sent, from savedPayload.
 * @param expected The values it has to carry, by message key.
 * @param forbidden The values it must not carry, by message key. A key the save leaves out carries none of them.
 * @return One line per key that is missing or wrong, empty when the save is right.
 */
export function saveProblems(payload: Record<string, unknown>, expected: Record<string, unknown>, forbidden: Record<string, unknown[]> = {}): string[] {
  const refused = Object.keys(forbidden).flatMap((key) => {
    const saved = savedValue(payload, key);

    return saved && forbidden[key].some((value) => JSON.stringify(value) === JSON.stringify(saved.value)) ? [`the save carries ${key} as ${JSON.stringify(saved.value)}, which it must not`] : [];
  });

  return Object.keys(expected).flatMap((key) => {
    const entry = payload[key];

    if (!entry || typeof entry !== 'object' || !('value' in entry)) {
      return [`the save carries no ${key}`];
    }

    const value = (entry as { value: unknown }).value;

    return JSON.stringify(value) === JSON.stringify(expected[key]) ? [] : [`the save carries ${key} as ${JSON.stringify(value)}, not ${JSON.stringify(expected[key])}`];
  }).concat(refused);
}

// the patterns a plain string replace reads in the text it puts in, which Clay's replace of
// $$CUSTOM_FN$$ would turn into something else
const REPLACE_PATTERNS = /\$[$&`']/g;

/**
 * Checks the custom function's text on one page, as the build the phone runs writes it.
 *
 * Clay pastes the text into the page with a plain string replace, so a replacement pattern in it is
 * read rather than copied and the page script breaks. The text has to hold none, and the page has to
 * carry it exactly as Clay was handed it, which also catches a later replace landing inside it.
 *
 * @param html The page as the browser opens it.
 * @param source The custom function's text, as Clay writes it into the page.
 * @return One line per problem, empty when the text is clean and on the page whole.
 */
export function customFnProblems(html: string, source: string): string[] {
  const problems: string[] = [];
  const patterns = source.match(REPLACE_PATTERNS) || [];

  if (patterns.length) {
    problems.push(`the custom function's text holds ${[...new Set(patterns)].join(', ')}, which Clay's string replace reads as a pattern`);
  }

  if (!html.includes(`window.customFn=${source},window.clayComponents=`)) {
    problems.push('the page does not carry the custom function text exactly as Clay was handed it');
  }

  return problems;
}

/** What marks the framework's row rules among the page's style rules, from ts/clay/page-style-component.ts. */
const ROW_RULE_MARK = '.component.component-select';

/** The rows Clay takes some padding off inside a card, which the framework's row rules repeat, by the class Clay gives each. */
const CLAY_ROWS = Object.keys(CLAY_ROW_PADDING);

/**
 * The script that lays a page out the way the Pebble Android app leaves it while plugins are on.
 *
 * The app runs a script at the very start of the page. With no head there yet, it makes one and puts
 * it first in the page, and the parser then opens the page's own head after it. `document.head` names
 * the first head, so every style Clay adds for a component lands ahead of Clay's base sheet.
 * Playwright runs its start script before the page has an html element, so that script would have
 * nowhere to put its head. This one goes just inside the page's own head instead, ahead of the base
 * sheet, and puts an empty head in front of it. That leaves the same two heads in the same order.
 */
const ANDROID_HEAD = '<script>document.documentElement.insertBefore(document.createElement(\'head\'), document.head);</script>';

/**
 * Lays a Clay page out the way the Pebble Android app leaves it while plugins are on.
 *
 * @param html The page as Clay writes it.
 * @return The page with the script just inside its own head, ahead of Clay's base sheet.
 */
export function withAndroidHead(html: string): string {
  const at = html.indexOf('<head>');

  if (at === -1) {
    throw new ToolError('the settings page has no <head> to put the Android app\'s head in front of');
  }

  const inside = at + '<head>'.length;

  return html.slice(0, inside) + ANDROID_HEAD + html.slice(inside);
}

/** One row in a card, as the browser read it. */
export interface PaddingRow {
  /** Its kind, by the class Clay gives it, such as `component-select`. */
  kind: string;
  /** Every class it carries. */
  classes: string[];
  /** Its padding, top, right, bottom, and left, as the page has it. */
  padding: string;
  /** Its padding with the framework's row rules turned off. */
  without: string;
  /** Its padding with Clay's base sheet moved ahead of every other sheet, the usual order. */
  usual: string;
}

/** The rows' padding on a page, as the browser read it with the framework's row rules on and off. */
export interface ObservedPadding {
  /** How many style sheets hold the row rules. */
  ruleSheets: number;
  /** Whether the check found Clay's base sheet, by the `.section > .component` rule it holds. */
  baseFound: boolean;
  /** Whether Clay's base sheet is the first style sheet in the page, as it is everywhere but the Android app. */
  baseFirst: boolean;
  /** Every row in a card, top to bottom. */
  rows: PaddingRow[];
}

/**
 * Checks the rows' padding on one page against the framework's row rules.
 *
 * Every page has to hold the rules once, and Clay's base sheet has to be found, since every other
 * check here leans on it. In the usual order the rules set what Clay's own rules already set, so
 * turning them off has to leave every row's padding as it was. That holds for the location search and
 * the theme picker too, since createClay registers the Clay component each borrows its class from,
 * unless the face passes its own.
 *
 * On a page laid out the way the Android app leaves it, every row has to sit as it does once the base
 * sheet is moved back ahead of the rest. The base sheet must not come first, and with the rules off it
 * has to move some row Clay takes padding off. Those two keep the check from passing on a page that
 * never showed the bug.
 *
 * @param observed The padding the browser read.
 * @param android Whether the page was laid out the way the Android app leaves it.
 * @return One line per problem, empty when the rows sit as they should.
 */
export function paddingProblems(observed: ObservedPadding, android: boolean): string[] {
  const problems: string[] = [];

  if (observed.ruleSheets !== 1) {
    problems.push(`the page holds the framework's row rules in ${observed.ruleSheets} style sheets, which should be one`);
  }

  if (!observed.baseFound) {
    problems.push('the check finds no style sheet holding Clay\'s .section > .component rule, so it cannot tell where Clay\'s base sheet sits');
  }

  if (!android) {
    observed.rows.filter((row) => row.padding !== row.without).forEach((row) => {
      problems.push(`the row rules move a ${row.kind} row's padding from ${row.without} to ${row.padding}`);
    });

    return [...new Set(problems)];
  }

  const clayRows = observed.rows.filter((row) => CLAY_ROWS.includes(row.kind));

  if (observed.baseFirst) {
    problems.push('the component styles sit behind Clay\'s base sheet, so the page is not laid out the way the Android app leaves it');
  }

  if (!clayRows.length) {
    problems.push('the page holds no row Clay takes padding off in a card to check');
  } else if (clayRows.every((row) => row.without === row.usual)) {
    problems.push('with the row rules off no row Clay takes padding off picks up the base sheet\'s padding, so the page shows nothing');
  }

  observed.rows.filter((row) => row.padding !== row.usual).forEach((row) => {
    problems.push(`a ${row.kind} row has ${row.padding} of padding with the component styles ahead of Clay's base sheet, and ${row.usual} in the usual order`);
  });

  return [...new Set(problems)];
}

/** A location search on the page, as the browser laid it out. */
export interface LocationField {
  /** How its label is laid out, the computed `display`. */
  label: string;
  /** How its text field is laid out, the computed `display`. */
  field: string;
}

/**
 * Checks each location search on a page carries the look of Clay's text box.
 *
 * The search draws the text box's markup and takes its look from Clay's text box style. Without that
 * style its label is laid out as a row, with the name beside a plain white field, rather than as a
 * block over a dark one. Both laid out as blocks is what the style alone gives them, so the check reads
 * that rather than a colour a face's own page style could change.
 *
 * @param fields Every location search on the page, top to bottom.
 * @return One line per search drawn without the style, empty when every one has it.
 */
export function locationFieldProblems(fields: LocationField[]): string[] {
  return fields.filter((field) => field.label !== 'block' || field.field !== 'block').map((field) => {
    return `a location search draws without Clay's text box style, with its label laid out as ${field.label} and its field as ${field.field}`;
  });
}

/** A theme picker on the page, as the browser laid it out. */
export interface ThemePicker {
  /** How the chosen theme's name is laid out, the computed `display` of its `.value`. */
  value: string;
  /** How see-through the native dropdown is, its computed `opacity`. */
  dropdown: string;
}

/**
 * Checks each theme picker on a page carries the look of Clay's select.
 *
 * The picker draws the select's markup and takes its look from Clay's select style, which lays the
 * chosen name out as a block with an arrow beside it and hides the native dropdown over it. Without
 * that style the bare dropdown shows on top of the name. The check reads those two rather than a
 * colour a face's own page style could change.
 *
 * @param pickers Every theme picker on the page, top to bottom.
 * @return One line per picker drawn without the style, empty when every one has it.
 */
export function themePickerProblems(pickers: ThemePicker[]): string[] {
  return pickers.filter((picker) => picker.value !== 'block' || picker.dropdown !== '0').map((picker) => {
    return `a theme picker draws without Clay's select style, with its name laid out as ${picker.value} and its dropdown at opacity ${picker.dropdown}`;
  });
}

/**
 * The folder of the fixture face a scenario previews.
 *
 * @param scenario The scenario, read for the face it names.
 * @return The face's folder under fixtures/.
 */
export function scenarioFace(scenario: Scenario): string {
  return path.join(FIXTURES, scenario.face ?? 'face');
}

/**
 * Where a fixture face sits for a build in one sandbox.
 *
 * A fixture is not a face in any unit, so it has no name the build can look up. It is built from the
 * framework's own folder, so the emit tree keeps the source's shape from there.
 *
 * @param sandbox The folder the build goes in.
 * @param faceDir The fixture face's folder.
 * @return The place facePaths and writeTsconfig take.
 */
export function fixturePlace(sandbox: string, faceDir: string = FIXTURE_FACE): FacePlace {
  return { root: ENGINE, rel: path.relative(ENGINE, faceDir).split(path.sep).join('/'), sandbox };
}

/** The paths a build of a fixture face reads and writes in one sandbox, laid out by facePaths. */
function fixturePaths(sandbox: string, faceDir: string): FacePaths {
  return facePaths(FACE, FACE, fixturePlace(sandbox, faceDir));
}

/** Compiles a fixture face and the framework's ts/ once, with the tsconfig the build writes, for every scenario to copy. */
function compileFixture(sandbox: string, faceDir: string): FacePaths {
  const paths = fixturePaths(sandbox, faceDir);

  cleanEmit(paths);
  writeTsconfig(FACE, paths, fixturePlace(sandbox, faceDir));
  compile(paths);
  return paths;
}

/**
 * Wraps the page's custom function so the check can reach Clay's page object.
 *
 * Clay calls the custom function with its page as this, and keeps it nowhere else the window can
 * see. The wrapper keeps it and then runs the page's own function, so the page builds exactly as it
 * would. It is a string, since it runs in the browser.
 */
const CAPTURE_CLAY = `(() => {
  let wrapped = function () { window.__pageCheckClay = this; };
  Object.defineProperty(window, 'customFn', {
    configurable: true,
    get: function () { return wrapped; },
    set: function (customFn) {
      wrapped = function () {
        window.__pageCheckClay = this;
        if (typeof customFn === 'function') {
          return customFn.apply(this, arguments);
        }
      };
    },
  });
})();`;

/** The keys, texts, notes, selects, and places one expectation asks about, so the browser reads only those. */
function askedAbout(expected: Expectation): { keys: string[]; texts: string[]; notes: string[]; selects: string[]; order: string[]; places: Array<{ text: string; key: string }> } {
  return {
    order: expected.order || [],
    keys: [...(expected.visible || []), ...(expected.hidden || [])],
    texts: [...(expected.textsVisible || []), ...(expected.textsHidden || [])],
    notes: [...(expected.notesVisible || []), ...(expected.notesHidden || []), ...(expected.badged || []), ...(expected.unbadged || [])],
    selects: (expected.options || []).map((option) => option.key),
    places: [...(expected.textsAbove || []), ...(expected.textsBelow || [])],
  };
}

/** Reads off the page what one expectation asks about. */
async function observe(page: Page, expected: Expectation): Promise<Observed> {
  return page.evaluate(({ keys, texts, notes, selects, order, places }) => {
    type Item = { $element?: HTMLElement[]; $manipulatorTarget?: HTMLSelectElement[] };
    const clay = (window as unknown as { __pageCheckClay: { getItemByMessageKey(key: string): Item | undefined } }).__pageCheckClay;
    const shows = (element: Element | undefined): boolean => Boolean(element) && (element as Element).isConnected && (element as Element).checkVisibility();
    const observed: Observed = { keys: {}, texts: {}, notes: {}, options: {}, order: [], places: {} };

    keys.forEach((key) => {
      const item = clay.getItemByMessageKey(key);
      const element = item && item.$element ? item.$element[0] : undefined;

      observed.keys[key] = { exists: Boolean(element), visible: shows(element) };
    });

    const rows = Array.from(document.querySelectorAll('.component-text, .component-heading'));

    texts.forEach((text) => {
      observed.texts[text] = rows.some((row) => (row.textContent || '').trim() === text && shows(row));
    });

    // a note is read by its words as text, so a name escaped twice or turned into markup does not match.
    // the badge is the warning's :before
    const drawn = Array.from(document.querySelectorAll('.pf-note'));

    notes.forEach((text) => {
      const note = drawn.find((element) => {
        const words = element.querySelector('.pf-note-text');

        return Boolean(words) && (words as Element).textContent === text;
      });

      observed.notes[text] = {
        visible: shows(note),
        badged: Boolean(note) && window.getComputedStyle(note as Element, '::before').content === '"!"',
      };
    });

    // each asked row that is on the page, sorted by where it sits in the document
    const placed = order.map((key) => {
      const item = clay.getItemByMessageKey(key);

      return { key, element: item && item.$element ? item.$element[0] : undefined };
    }).filter((row) => row.element && row.element.isConnected) as Array<{ key: string; element: HTMLElement }>;

    placed.sort((first, second) => (first.element.compareDocumentPosition(second.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    observed.order = placed.map((row) => row.key);

    // a text row is placed against a keyed row by where the two sit in the document, shown or not
    places.forEach(({ text, key }) => {
      const words = rows.find((row) => (row.textContent || '').trim() === text);
      const item = clay.getItemByMessageKey(key);
      const element = item && item.$element ? item.$element[0] : undefined;
      const place = !words || !element || !element.isConnected ? null : words.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING ? 'above' : 'below';

      observed.places[text] = { ...(observed.places[text] || {}), [key]: place };
    });

    selects.forEach((key) => {
      const item = clay.getItemByMessageKey(key);
      const select = item && item.$manipulatorTarget ? item.$manipulatorTarget[0] : undefined;

      observed.options[key] = select && select.options ? Array.from(select.options).map((option) => option.value) : null;
    });

    return observed;
  }, askedAbout(expected));
}

/**
 * Every row of the page that Clay left undrawn, by message key.
 *
 * A row naming capabilities is skipped along with every row inside it, since Clay leaves the whole of
 * it out on a watch that lacks them, which is the page working rather than failing.
 */
async function undrawnRows(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    type Row = { messageKey?: string; capabilities?: unknown; items?: Row[] };
    const clay = (window as unknown as { __pageCheckClay: { getItemByMessageKey(key: string): { $element?: HTMLElement[] } | undefined } }).__pageCheckClay;
    const config = (window as unknown as { clayConfig: Row[] }).clayConfig || [];
    const keys: string[] = [];
    const walk = (rows: Row[]) => rows.forEach((row) => {
      if (row.capabilities !== undefined) {
        return;
      }

      if (row.messageKey) {
        keys.push(row.messageKey);
      }

      walk(row.items || []);
    });

    walk(config);

    return keys.filter((key) => {
      const item = clay.getItemByMessageKey(key);

      return !item || !item.$element || !item.$element[0] || !item.$element[0].isConnected;
    });
  });
}

/**
 * Reads every row's padding off the page with the framework's row rules on, with every sheet holding
 * them turned off, and with Clay's base sheet moved ahead of every other sheet, which is the usual
 * order. Selectors are compared with their spaces put in one agreed form, so a Clay that writes
 * `.section>.component` and one that writes `.section > .component` are read the same.
 */
async function observePadding(page: Page): Promise<ObservedPadding> {
  return page.evaluate((mark) => {
    const agreed = (text: string): string => text.replace(/\s*([>+~,])\s*/g, '$1').replace(/\s+/g, ' ').trim();
    const holds = (sheet: CSSStyleSheet, test: (selector: string) => boolean): boolean => Array.from(sheet.cssRules).some((rule) => rule instanceof CSSStyleRule && test(agreed(rule.selectorText)));
    const sheets = Array.from(document.styleSheets);
    const ruleSheets = sheets.filter((sheet) => holds(sheet, (selector) => selector.includes(mark)));
    const base = sheets.find((sheet) => holds(sheet, (selector) => selector === '.section>.component'));
    const rows = Array.from(document.querySelectorAll('.section > .component'));
    const read = (): string[] => rows.map((row) => {
      const style = window.getComputedStyle(row);

      return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].join(' ');
    });

    const on = read();

    ruleSheets.forEach((sheet) => {
      sheet.disabled = true;
    });

    const off = read();

    ruleSheets.forEach((sheet) => {
      sheet.disabled = false;
    });

    // the base sheet goes first in the first head and then back where it was
    const baseNode = base ? base.ownerNode : null;
    let usual = on;

    if (baseNode && baseNode.parentNode && document.head) {
      const home = baseNode.parentNode;
      const next = baseNode.nextSibling;

      document.head.insertBefore(baseNode, document.head.firstChild);
      usual = read();
      home.insertBefore(baseNode, next);
    }

    return {
      ruleSheets: ruleSheets.length,
      baseFound: Boolean(base),
      baseFirst: Boolean(base) && sheets[0] === base,
      rows: rows.map((row, index) => {
        const classes = Array.from(row.classList);
        const kind = classes.find((name) => name.startsWith('component-')) || row.className;

        return { kind, classes, padding: on[index], without: off[index], usual: usual[index] };
      }),
    };
  }, ROW_RULE_MARK);
}

/** How the browser laid out each location search on the page, hidden or not, top to bottom. */
async function observeLocationFields(page: Page): Promise<LocationField[]> {
  return page.evaluate(() => Array.from(document.querySelectorAll('.pf-loc-search')).map((row) => {
    const display = (selector: string): string => {
      const found = row.querySelector(selector);

      return found ? window.getComputedStyle(found).display : 'missing';
    };

    return { label: display('label'), field: display('.pf-loc-query') };
  }));
}

/** How the browser laid out each theme picker on the page, hidden or not, top to bottom. */
async function observeThemePickers(page: Page): Promise<ThemePicker[]> {
  return page.evaluate(() => Array.from(document.querySelectorAll('.pf-theme')).map((row) => {
    const style = (selector: string): CSSStyleDeclaration | null => {
      const found = row.querySelector(selector);

      return found ? window.getComputedStyle(found) : null;
    };
    const value = style('.value');
    const dropdown = style('.pf-theme-select');

    return { value: value ? value.display : 'missing', dropdown: dropdown ? dropdown.opacity : 'missing' };
  }));
}

/**
 * Each card on the page that shows while every row in it but its headings is hidden or gone, by its
 * first heading, or empty text for a card with none. Clay draws a section as a card, so such a section
 * reads as a heading over nothing. A text row with no words counts as nothing too, so an anchor row
 * the page left behind does not keep a card looking full.
 */
async function emptyCards(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const shows = (element: Element): boolean => element.isConnected && element.checkVisibility();
    const empty = (row: Element): boolean => row.classList.contains('component-text') && (row.textContent || '').trim() === '';
    const counts = (row: Element): boolean => !row.classList.contains('component-heading') && !empty(row) && shows(row);

    return Array.from(document.querySelectorAll('.section'))
      .filter((card) => shows(card) && !Array.from(card.children).some(counts))
      .map((card) => (card.querySelector('.component-heading')?.textContent || '').trim());
  });
}

/** A problem for each card that shows with nothing in it but headings. */
function emptyCardProblems(cards: string[], when: string): string[] {
  return cards.map((card) => `${when}, ${card ? `the ${card} card` : 'a card with no heading'} shows with nothing in it`);
}

/**
 * The Pebble app's openUrl, as a scenario with `openUrl` hands it to the page. It records each address
 * and opens nothing, so the check can tell which listing a link asked for. It is a string, since it
 * runs in the browser.
 */
const FAKE_OPEN_URL = `(() => {
  window.__pageCheckOpened = [];
  window.Pebble = { openUrl: function (url) { window.__pageCheckOpened.push(String(url)); return Promise.resolve(true); } };
})();`;

/** Reads the supported plugins panel off the page. */
async function observePanel(page: Page): Promise<ObservedPanel> {
  return page.evaluate((selector) => {
    const panels = document.querySelectorAll(selector);
    const panel = panels[0] as HTMLDetailsElement | undefined;
    const body = panel ? panel.querySelector('.pf-plugins-body') : null;
    const textOf = (element: Element | null): string => (element ? element.textContent || '' : '');
    const kinds: ObservedPanel['kinds'] = [];

    // each heading is followed by the list of its plugins
    Array.from(panel ? panel.querySelectorAll('.pf-plugins-kind') : []).forEach((heading) => {
      const list = heading.nextElementSibling;
      const plugins = Array.from(list ? list.querySelectorAll('.pf-plugins-entry') : []).map((entry) => {
        const link = entry.querySelector('.pf-plugins-link');

        return {
          name: textOf(link || entry.querySelector('.pf-plugins-name')),
          tag: textOf(entry.querySelector('.pf-plugins-tag')),
          href: link ? link.getAttribute('href') : null,
          address: textOf(entry.querySelector('.pf-plugins-address')),
        };
      });

      kinds.push({ label: textOf(heading), plugins });
    });

    return {
      count: panels.length,
      open: Boolean(panel && panel.open),
      bodyShows: Boolean(body && body.checkVisibility()),
      title: panel ? textOf(panel.querySelector('.pf-plugins-title')) : '',
      off: Boolean(panel && panel.querySelector('.pf-plugins-off')),
      kinds,
    };
  }, PANEL_SELECTOR);
}

/**
 * Checks the supported plugins panel: there once, closed on load, opening on a tap of its title to
 * list what it should, each store link asking openUrl for its listing with the page staying where it
 * is, and closing again on a second tap.
 */
async function checkPanel(page: Page, expected: PanelExpectation, openUrl: boolean): Promise<string[]> {
  const before = await observePanel(page);

  if (before.count !== 1) {
    return [`the page holds ${before.count} supported plugins panels, not one`];
  }

  const problems: string[] = [];

  if (before.open || before.bodyShows) {
    problems.push('the panel is open on load');
  }

  await page.locator('.pf-plugins-title').click({ timeout: PAGE_WAIT_MS });

  const opened = await observePanel(page);

  if (!opened.open || !opened.bodyShows) {
    problems.push('the panel does not open on a tap of its title');
  }

  problems.push(...panelProblems(opened, expected, openUrl));

  if (openUrl) {
    const address = page.url();

    for (const plugin of expected.kinds.flatMap((kind) => kind.plugins).filter((listed) => listed.listing)) {
      const link = page.locator('.pf-plugins-link', { hasText: plugin.name });

      // a missing link is already a problem from panelProblems
      if (!(await link.count())) {
        continue;
      }

      await link.first().click({ timeout: PAGE_WAIT_MS });

      const asked = await page.evaluate(() => (window as unknown as { __pageCheckOpened: string[] }).__pageCheckOpened.slice(-1)[0]);

      if (asked !== plugin.listing) {
        problems.push(`a tap on ${plugin.name} asks to open ${asked || 'nothing'}, not ${plugin.listing}`);
      }

      if (page.url() !== address) {
        problems.push(`a tap on ${plugin.name} loads ${page.url()} inside the settings page`);
      }
    }
  }

  await page.locator('.pf-plugins-title').click({ timeout: PAGE_WAIT_MS });

  const closed = await observePanel(page);

  if (closed.open || closed.bodyShows) {
    problems.push('the panel does not close on a second tap of its title');
  }

  return problems;
}

/**
 * What Chromium logs when the save goes to pebblejs://close#, a scheme only the phone app opens. That
 * one message is the phone's job and not an error in the page. Headless Chromium leaves it out today,
 * and a headed run or another version may log it. The address part matches anything, since
 * encodeURIComponent leaves a quote in a saved value such as St. John's as it is.
 */
const FAILED_LAUNCH = /^Failed to launch 'pebblejs:\/\/close#.*' because the scheme does not have a registered handler\.$/;

/** Opens one built page and runs its scenario's checks, giving back every problem found. */
async function checkPage(browser: Browser, scenario: Scenario, html: string): Promise<string[]> {
  const problems: string[] = [];
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('pageerror', (error) => problems.push(`the page threw: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !FAILED_LAUNCH.test(message.text())) {
      problems.push(`the page logged an error: ${message.text()}`);
    }
  });
  page.on('dialog', (dialog) => {
    problems.push(`the page opened a dialog (${dialog.type()}) saying ${dialog.message()}`);
    dialog.dismiss().catch(() => {});
  });

  // Playwright's own request event drops everything after the #, where the save's settings are, so
  // the navigation the page asks for is read from Chromium itself
  const devtools = await context.newCDPSession(page);
  const saved: { url: string | null; landed: () => void } = { url: null, landed: () => {} };

  await devtools.send('Page.enable');
  devtools.on('Page.frameRequestedNavigation', (event) => {
    if (saved.url === null && event.url.startsWith(CLOSE_PREFIX)) {
      saved.url = event.url;
      saved.landed();
    }
  });

  try {
    await page.addInitScript(CAPTURE_CLAY);

    if (scenario.openUrl) {
      await page.addInitScript(FAKE_OPEN_URL);
    }

    await page.goto(pathToFileURL(html).href);
    await page.waitForFunction(() => {
      const clay = (window as unknown as { __pageCheckClay?: { getAllItems(): unknown[] } }).__pageCheckClay;

      try {
        return Boolean(clay) && (clay as { getAllItems(): unknown[] }).getAllItems().length > 0;
      } catch {
        return false;
      }
    }, undefined, { timeout: PAGE_WAIT_MS });

    const undrawn = await undrawnRows(page);

    if (undrawn.length) {
      problems.push(`Clay left ${undrawn.join(', ')} undrawn`);
    }

    problems.push(...paddingProblems(await observePadding(page), Boolean(scenario.androidHead)));
    problems.push(...locationFieldProblems(await observeLocationFields(page)));
    problems.push(...themePickerProblems(await observeThemePickers(page)));
    problems.push(...expectationProblems(await observe(page, scenario.load), scenario.load, 'on load'));
    problems.push(...emptyCardProblems(await emptyCards(page), 'on load'));

    if (scenario.panel) {
      problems.push(...(await checkPanel(page, scenario.panel, Boolean(scenario.openUrl))));
    }

    for (const change of scenario.changes || []) {
      const select = await page.evaluateHandle((key) => {
        const clay = (window as unknown as { __pageCheckClay: { getItemByMessageKey(name: string): { $manipulatorTarget?: HTMLSelectElement[] } | undefined } }).__pageCheckClay;
        const item = clay.getItemByMessageKey(key);

        return item && item.$manipulatorTarget ? item.$manipulatorTarget[0] : null;
      }, change.key);
      const element = select.asElement();

      if (!element) {
        problems.push(`the ${change.key} select is not on the page to change`);
        break;
      }

      await element.selectOption(change.value, { timeout: PAGE_WAIT_MS });
      problems.push(...expectationProblems(await observe(page, change), change, `after picking ${change.value} for ${change.key}`));
      problems.push(...emptyCardProblems(await emptyCards(page), `after picking ${change.value} for ${change.key}`));
    }

    const selectors = [
      ...(scenario.absent || []).map((selector) => ({ selector, wanted: false })),
      ...(scenario.present || []).map((selector) => ({ selector, wanted: true })),
    ];

    for (const { selector, wanted } of selectors) {
      const found = await page.locator(selector).count();

      if (wanted && !found) {
        problems.push(`the page holds no ${selector} element, which it should`);
      } else if (!wanted && found) {
        problems.push(`the page holds ${found} ${selector} element${found === 1 ? '' : 's'} it should not`);
      }
    }

    if (scenario.save || scenario.saveNot) {
      // settles as soon as the page asks to close, and gives up once the page has had its time
      const closing = new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, PAGE_WAIT_MS);

        saved.landed = () => {
          clearTimeout(timer);
          resolve();
        };
      });

      await page.locator('button[type="submit"]').click({ timeout: PAGE_WAIT_MS });
      await closing;

      const payload = saved.url === null ? null : savedPayload(saved.url);

      if (!payload) {
        problems.push(`the save never went to ${CLOSE_PREFIX} with settings in it`);
      } else {
        problems.push(...saveProblems(payload, scenario.save || {}, scenario.saveNot));
      }
    }
  } catch (error) {
    problems.push(`the check stopped: ${(error as Error).message.split('\n')[0]}`);
  } finally {
    await context.close();
  }

  return problems;
}

/** The keys of the scenario being rendered, which a require of message_keys gets. Each scenario fills in its own. */
let scenarioKeys: Record<string, number> | undefined;

/** A fixture face's appinfo, read once, and the build every scenario on it copies. */
interface Fixture {
  /** The fixture face's folder. */
  dir: string;
  /** The appinfo's messageKeys as written, which the build adds the features' and the defines' keys to before its checks. */
  declared: unknown;
  /** The build every scenario copies. */
  compiled: FacePaths;
}

/** Renders one scenario's page from its own copy of the build, onto a fresh phone, on the scenario's own keys. */
function renderScenario(scenario: Scenario, paths: FacePaths, messageKeys: Record<string, number>, withFeatures: boolean): ReturnType<typeof renderPage> {
  const settings = scenario.settings ? path.join(SETTINGS_FILES, scenario.settings) : null;

  forgetCompiled(paths);
  installHost({ platform: 'emery', settings }, scenario.plugins === null ? null : readPluginsFile(path.join(PLUGIN_FILES, scenario.plugins)));

  scenarioKeys = messageKeys;

  return renderPage({ face: FACE, platform: 'emery' }, paths, messageKeys, withFeatures);
}

/** Builds one scenario's page and gives back its HTML file, and any problem with the build itself. */
function buildScenario(scenario: Scenario, fixture: Fixture): { html: string; problems: string[] } {
  // a providers list or a define the face's keys cannot back is one the real build refuses, so the
  // check does too, with the same checks in the same order. the providers list is read before the
  // phone code, as the phone build reads it, and the keys are checked once the code says which
  // features it passes, with the keys those features and the defines bring added, as the build adds them
  const providers = readProviders({ providers: scenario.providers }, FACE, scenario.defines);

  const paths = fixturePaths(path.join(OUT_DIR, scenario.name), fixture.dir);
  const html = path.join(OUT_DIR, `${scenario.name}.html`);

  cleanEmit(paths);
  fs.cpSync(fixture.compiled.emit, paths.emit, { recursive: true });
  fillPreviewEmit(paths, scenario.defines, providers);

  const base = fillAppinfo({ messageKeys: fixture.declared }, FACE, NO_START, scenario.defines, providers).messageKeys;
  const appinfo = fillAppinfo({ messageKeys: fixture.declared }, FACE, startFacts(paths, FACE, base, ['emery']), scenario.defines, providers);

  checkMessageKeys(appinfo.messageKeys, FACE, scenario.defines, providers);

  // each render gets a map of its own, since the page load adds to the map it is given
  const keysFor = (): Record<string, number> => messageKeysOf(appinfo);

  // the page the preview shows, which starts the features only for a build with a plugin define
  const page = renderScenario(scenario, paths, keysFor(), hasPluginDefines(scenario.defines));
  const problems: string[] = [];

  fs.writeFileSync(html, scenario.androidHead ? withAndroidHead(page.html) : page.html);
  problems.push(...customFnProblems(page.html, page.customFn));

  // the phone starts every feature and runs its hooks on each open, plugin define or not, so that
  // path has to give the page the face builds with no features at all
  if (scenario.unchanged) {
    const phone = renderScenario(scenario, paths, keysFor(), true);
    const bare = renderScenario(scenario, paths, keysFor(), false);

    if (phone.html !== bare.html) {
      problems.push(phone.folded !== bare.folded
        ? 'the features changed the page config, which should match the face\'s own byte for byte'
        : 'the page config matches, but the page differs in its custom function or its components');
    }
  }

  return { html, problems };
}

async function main(): Promise<void> {
  const started = Date.now();
  const scenarios = pickScenarios(process.argv.slice(2), SCENARIOS);
  const fixtures = new Map<string, Fixture>();

  // each fixture face used is compiled once, before the browser starts
  scenarios.map(scenarioFace).forEach((dir) => {
    if (fixtures.has(dir)) {
      return;
    }

    const appinfo = path.join(dir, 'pebble.appinfo.json');

    fixtures.set(dir, {
      dir,
      declared: JSON.parse(fs.readFileSync(appinfo, 'utf8')).messageKeys,
      compiled: compileFixture(path.join(OUT_DIR, 'compiled', path.basename(dir)), dir),
    });
  });

  stubModuleLoad((id) => (id === 'message_keys' && scenarioKeys ? scenarioKeys : undefined));

  // loaded here rather than at the top, so the specs of the pure parts above never load Playwright
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  let failed = 0;

  try {
    for (const scenario of scenarios) {
      let problems: string[];
      let html = '';

      try {
        const built = buildScenario(scenario, fixtures.get(scenarioFace(scenario)) as Fixture);

        html = built.html;
        problems = [...built.problems, ...(await checkPage(browser, scenario, built.html))];
      } catch (error) {
        problems = [`the preview did not build: ${(error as Error).message.split('\n')[0]}`];
      }

      if (problems.length) {
        failed++;
        console.log(`FAIL ${scenario.name}${html ? ` (${path.relative(process.cwd(), html)})` : ''}`);
        problems.forEach((problem) => console.log(`  - ${problem}`));
      } else {
        console.log(`pass ${scenario.name}`);
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`${scenarios.length - failed} of ${scenarios.length} scenarios passed in ${((Date.now() - started) / 1000).toFixed(1)} s`);

  if (failed) {
    process.exitCode = 1;
  }
}

if (isMainScript(import.meta)) {
  main().catch(reportFailure);
}
