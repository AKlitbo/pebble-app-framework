/**
 * Adds the Pebble app plugin choice to a face's settings page, along with the rows that go with it.
 *
 * A feature built with plugin sources calls this from its page hook each time the settings page
 * opens. It changes the page it is given and hands it back. The page hook gets its own copy of the
 * page from the app's fold, so the face's own page, which the defaults and the settings restore
 * read, is never changed.
 *
 * The config builder marks its rows on every face, built with plugin sources or not. A
 * `pluginSource` mark sits on the select a plugin choice joins, and a `pluginSourceHides` mark sits
 * on a row that means nothing while a plugin is picked. Clay ignores both. This is what acts on them.
 * It adds the "Pebble App: Preferred Source" option, hides the marked rows while it is picked, and
 * puts the feature's warnings under the select. A select with no real choice left on it is dropped,
 * and the rows marked for it then show as they do on a face without plugin sources.
 *
 * The select is found by its mark, or failing that by its message key, since the key is what the
 * feature reads the choice by. A face whose select comes from a family core with no mark still gets
 * the choice.
 *
 * A kind with no source choice, such as now playing or a face whose providers list is the plugin
 * alone, has no select. For it the page only gets the notes, always shown, straight after the row
 * the face marks with `pluginSourceRows` for that kind, or else at the foot of the page.
 */

import { declaresStandard, servesItem } from './standard';
import { escapeHtml, shownName, uuidKey } from './escape';
import { addPluginsPanel, PANEL_TYPE } from './panel';
import { allItems, conditionsOf, dropRow, dropRows, findRow, footIndex, listHolding, settleConditions } from '../clay/rows';
import type { StandardReadings } from './standard';
import type { PluginSummary, SourceState } from './types';
import type { ClayConfigItem } from '../clay/types';

/** The value a select saves when the wearer picks the Pebble app plugin. */
export const PLUGIN_VALUE = 'plugin';

/** The label of the option that picks the Pebble app plugin. */
export const PLUGIN_LABEL = 'Pebble App: Preferred Source';

/** The label the option keeps while it is the saved choice and no plugin on the phone serves the item. */
export const PLUGINS_OFF_LABEL = 'Pebble App: Preferred Source (Plugins Off)';

/** The row under the select while the saved plugin choice has no plugin on the phone to serve it. */
export const PLUGINS_OFF_TEXT = 'The Pebble app is not offering this source right now. Turn on plugins in the Pebble app under Settings, Plugins, or update the Pebble app.';

/** The warning rows a feature shows under its select while a plugin is picked. A text left out gets no row. */
export interface PluginSourceTexts {
  /** The row for a plugin that answered last but does not declare the standard readings. It gets the plugin's name. */
  notStandard?: (pluginName: string) => string;
  /**
   * The same row on a page with no source choice, which can only point the wearer at the Pebble app.
   * Left out, `notStandard` serves both.
   */
  notStandardNoSelect?: (pluginName: string) => string;
  /** The row for a last error of `PERMISSION_DENIED`. */
  permissionDenied?: string;
  /** The row for a last update that held nothing, drawn in the calmer info look. */
  empty?: string;
  /** The row saying where the plugin's data comes from, which shows whenever a plugin is picked. */
  source?: string;
  /**
   * The row for a kind with no source choice while the plugin list read at page open has nothing
   * serving it, which is also what a phone with plugins off reports. It says how to turn them on, or
   * for a kind the Pebble app has no plugin of its own for, how to get one. A kind with a source choice
   * shows it under the select too, in place of the line to turn plugins on, while the phone lists
   * other plugins.
   */
  noPlugin?: string;
  /**
   * The option's label while the plugin is the saved choice and the phone lists plugins but none
   * serving the kind, for a kind the Pebble app has no plugin of its own for. Left out, the option
   * reads as Plugins Off.
   */
  notInstalledLabel?: string;
}

/** A select a feature adds because the face's page has none, and where it goes. */
export interface PluginSourceInsert {
  /** The select itself, carrying its `pluginSource` mark. */
  select: ClayConfigItem;
  /** The messageKey of the row whose section the select joins, such as `CALENDAR_ICS_URL`. */
  anchorKey: string;
}

/** What a feature's page hook hands pluginSourcePage. */
export interface PluginSourceInputs {
  /**
   * The messageKey of the select the plugin choice joins, such as `WEATHER_PROVIDER`. Left out for a
   * kind with no source choice, which gets its notes alone.
   */
  selectKey?: string;
  /** The category the feature subscribes to, such as `weather`. */
  category: string;
  /**
   * The kind as a face's `pluginSourceRows` mark names it, which is its name in the providers list,
   * such as `stocks`. Left out, the category, which is the same name for every other kind.
   */
  rowKind?: string;
  /** The item inside it, such as `location`. */
  item: string;
  /**
   * The installed plugins, as the subscription's `plugins()` reads them, or null when the phone's list
   * cannot be read. An unreadable list still offers the plugin, since the phone may route to one.
   */
  plugins: PluginSummary[] | null;
  /** The face's message keys, by name. */
  messageKeys: Record<string, number>;
  /** What the subscription saved, from its `state()`. */
  state: SourceState;
  /** The readings a plugin has to declare for the face to read it. */
  standard: StandardReadings;
  /** The feature's own wording for each warning row. */
  texts: PluginSourceTexts;
  /** The select to add when the face's page has none, as the calendar does. */
  insert?: PluginSourceInsert;
  /** The select's saved value. A saved plugin choice keeps its option while no plugin serves the item. */
  saved?: unknown;
  /**
   * The messageKey of a row whose section only feeds the other sources, such as `LOCATION_USE_GPS`.
   * While a plugin choice is on offer, that section moves to sit straight after the select's own, so
   * the rows the select hides sit below it rather than above.
   */
  movesBelow?: string;
  /**
   * Whether the page gets the supported plugins panel at its foot, listing the plugins that serve
   * this item. It goes on whenever the face offers the plugin choice, with plugins on or off.
   */
  panel?: boolean;
}

/** The section a row sits in, and the list holding that section, or undefined for a row in no section. */
function sectionOf(items: ClayConfigItem[], target: ClayConfigItem): { list: ClayConfigItem[]; section: ClayConfigItem } | undefined {
  for (const item of items) {
    if (item.type === 'section' && item.items && item.items.includes(target)) {
      return { list: items, section: item };
    }

    const found = item.items ? sectionOf(item.items, target) : undefined;

    if (found) {
      return found;
    }
  }

  return undefined;
}

/**
 * Moves the section holding the row with the given key to sit straight after the select's section.
 *
 * Picking the plugin hides the moved section's rows. Above the select that makes the page jump under
 * the wearer's finger, and below it the rows simply fold away under the choice that hid them. A
 * section is only moved when every row in it is a heading or a row marked for the select, since
 * moving one that holds anything else would carry an unrelated setting away from where the face put
 * it.
 */
function moveBelowSelect(page: ClayConfigItem[], select: ClayConfigItem, rowKey: string, selectKey: string): void {
  const row = allItems(page).find((item) => item.messageKey === rowKey);
  const moving = row ? sectionOf(page, row) : undefined;
  const target = sectionOf(page, select);

  if (!moving || !target || moving.section === target.section) {
    return;
  }

  const onlyMarked = (moving.section.items || []).every((item) => item.type === 'heading' || item.pluginSourceHides === selectKey);

  if (!onlyMarked) {
    return;
  }

  moving.list.splice(moving.list.indexOf(moving.section), 1);
  target.list.splice(target.list.indexOf(target.section) + 1, 0, moving.section);
}

/**
 * Whether a row leads into the select right above it, so it stays above the select when the select
 * moves up. That is a row marked as the select's lead line, or a text row with no mark.
 */
function leadsInto(item: ClayConfigItem, selectKey: string): boolean {
  return item.pluginSourceLead === selectKey || (item.type === 'text' && item.pluginSourceHides === undefined);
}

/**
 * Puts the select first in its section, so the control that shows and hides rows comes before them.
 *
 * The section's own heading and opening text stay on top, and so does the lead line right above the
 * select. Then comes the select, then the rows that belong to it, then the section's other rows in
 * their own order. The rows that belong to it are the ones it hides, the ones whose visibleWhen names
 * it, and the ones that already sat under it, such as a family core's key row with no mark, so a key
 * row stays next to the Data Source it is for. A select outside any section is left where it is,
 * since moving it would move the page.
 */
function putSelectFirst(page: ClayConfigItem[], select: ClayConfigItem, selectKey: string): void {
  const holder = sectionOf(page, select);

  if (!holder || !holder.section.items) {
    return;
  }

  const rows = holder.section.items;
  const at = rows.indexOf(select);
  let top = 0;

  while (top < at && isLeading(rows[top])) {
    top++;
  }

  let leadStart = at;

  while (leadStart > top && leadsInto(rows[leadStart - 1], selectKey)) {
    leadStart--;
  }

  const below = rows.slice(at + 1);
  const rest = [...rows.slice(top, leadStart), ...below];
  const belongs = (item: ClayConfigItem) => {
    return item.pluginSourceHides === selectKey || below.includes(item) || conditionsOf(item).some((condition) => condition.key === selectKey);
  };

  rows.splice(0, rows.length, ...rows.slice(0, top), ...rows.slice(leadStart, at), select, ...rest.filter(belongs), ...rest.filter((item) => !belongs(item)));
}

/**
 * Whether a row opens its section, so an added select goes below it. That is a heading, or a text
 * row with no mark, since a marked text row belongs with the rows it hides along with.
 */
function isLeading(item: ClayConfigItem): boolean {
  return item.type === 'heading' || (item.type === 'text' && item.pluginSourceHides === undefined);
}

/** Puts the feature's select in the section holding its anchor row, below that section's leading rows. */
function insertSelect(page: ClayConfigItem[], insert: PluginSourceInsert, selectKey: string): void {
  // a page that already has the select keeps its own, rather than showing two
  if (allItems(page).some((item) => item.messageKey === selectKey)) {
    return;
  }

  const section = listHolding(page, (item) => item.messageKey === insert.anchorKey);

  if (!section) {
    return;
  }

  let at = 0;

  while (at < section.length && isLeading(section[at])) {
    at++;
  }

  section.splice(at, 0, { ...insert.select });
}

/**
 * The select the plugin choice joins, or undefined when the page has none.
 *
 * A select carrying the mark for the item wins. Without one, any row with the select's key and a
 * list of options is taken, since the feature reads the choice by that key whatever row saved it.
 */
function findSelect(page: ClayConfigItem[], inputs: PluginSourceInputs): ClayConfigItem | undefined {
  const rows = allItems(page);
  const marked = rows.find((item) => {
    return item.messageKey === inputs.selectKey && item.pluginSource?.category === inputs.category && item.pluginSource?.item === inputs.item;
  });

  return marked || rows.find((item) => item.messageKey === inputs.selectKey && Array.isArray(item.options));
}

/** Takes every mark naming the select off the page, so each marked row shows as it does on a face without plugin sources. */
function removeMarks(page: ClayConfigItem[], selectKey: string): void {
  allItems(page).forEach((item) => {
    if (item.pluginSourceHides === selectKey) {
      delete item.pluginSourceHides;
    }
  });
}

/**
 * Takes every mark naming a select that is not on the page, and settles every visibleWhen condition
 * naming it. A lead line marked for the select goes with it, since it would ask for a choice over
 * nothing, and so does a section the two leave holding only its heading.
 *
 * A select dropped with one option left saves that value, so each condition is settled against it,
 * and a row the face hid for that value stays hidden. With no value left, every condition comes off
 * and each row shows as it does on a face without plugin sources.
 */
function stripMarks(page: ClayConfigItem[], selectKey: string, onlyValue?: string | number | boolean): void {
  removeMarks(page, selectKey);
  dropRows(page, (item) => item.pluginSourceLead === selectKey);
  settleConditions(page, selectKey, onlyValue);
}

/**
 * Turns each mark naming the select into a visibleWhen on the select's other values, so the row
 * hides while a plugin is picked. A row with a visibleWhen of its own keeps it, and the new condition
 * joins it, since every condition in the list has to hold.
 *
 * Clay draws a section as a card and cannot hide one, so a section whose rows all hide would leave
 * an empty card, as the builder's Location Settings does. Such a section gets `hideWhenEmpty`, and
 * `dependentVisibility` hides the card while every row in it is hidden.
 */
function hideMarkedRows(page: ClayConfigItem[], select: ClayConfigItem, selectKey: string): void {
  const others = (select.options || []).map((option) => option.value).filter((value) => value !== PLUGIN_VALUE);

  allItems(page).forEach((item) => {
    if (item.type === 'section' && item.items && item.items.length && item.items.every((row) => row.pluginSourceHides === selectKey)) {
      item.hideWhenEmpty = true;
    }
  });

  allItems(page).forEach((item) => {
    if (item.pluginSourceHides !== selectKey) {
      return;
    }

    delete item.pluginSourceHides;
    item.visibleWhen = [...conditionsOf(item), { key: selectKey, in: others }];
  });
}

/** The two looks a note takes. A warning carries the badge, and info is the calmer look for a plain fact. */
type NoteTone = 'warning' | 'info';

/** A note drawn by the pluginNote component, always shown. */
function noteRow(text: string, tone: NoteTone = 'warning'): ClayConfigItem {
  return { type: 'pluginNote', tone, defaultValue: escapeHtml(text) };
}

/** A note shown only while a plugin is picked on the select. */
function pluginOnlyRow(text: string, selectKey: string, tone: NoteTone = 'warning'): ClayConfigItem {
  return { ...noteRow(text, tone), visibleWhen: { key: selectKey, in: [PLUGIN_VALUE] } };
}

/**
 * The warning rows the saved state calls for, each made by the given maker. The row for an empty
 * update takes the calmer info look, since an empty week reads the same as a missing permission from
 * here and may need nothing fixed.
 */
function warningRows(inputs: PluginSourceInputs, makeRow: (text: string, tone?: NoteTone) => ClayConfigItem): ClayConfigItem[] {
  const { state, texts } = inputs;
  const rows: ClayConfigItem[] = [];

  // the phone's update and its plugin list can write one uuid in different cases
  const wanted = uuidKey(state.pluginUuid);
  const answered = wanted && inputs.plugins
    ? inputs.plugins.find((plugin) => Boolean(plugin) && typeof plugin === 'object' && uuidKey(plugin.uuid) === wanted)
    : undefined;

  if (answered && texts.notStandard && !declaresStandard(answered, inputs.category, inputs.item, inputs.standard)) {
    rows.push(makeRow(texts.notStandard(shownName(answered))));
  }

  if (state.lastError === 'PERMISSION_DENIED' && texts.permissionDenied) {
    rows.push(makeRow(texts.permissionDenied));
  }

  if (state.lastEmpty && texts.empty) {
    rows.push(makeRow(texts.empty, 'info'));
  }

  return rows;
}

/** Offers the plugin choice on a select the face has, with the rows that go with it. Steps 3 to 7 of pluginSourcePage. */
function placeChoice(page: ClayConfigItem[], select: ClayConfigItem, inputs: PluginSourceInputs, selectKey: string): void {
  // a list the phone will not give says nothing about what is installed, and the phone may still
  // route a subscription to a plugin, so the choice is offered as usual. only a list read as having
  // nothing to serve the item keeps a saved plugin as plugins off
  const listed = inputs.plugins;
  const offersPlugin = listed === null || servesItem(listed, inputs.category, inputs.item);
  const keptOff = listed !== null && !offersPlugin && inputs.saved === PLUGIN_VALUE;
  const options = select.options || [];

  // a phone that lists other plugins has them on, so a kind the Pebble app has no plugin of its own
  // for is missing one rather than switched off
  const pluginsOn = listed !== null && listed.length > 0;
  const keptLabel = pluginsOn && inputs.texts.notInstalledLabel ? inputs.texts.notInstalledLabel : PLUGINS_OFF_LABEL;
  const keptText = pluginsOn && inputs.texts.noPlugin ? inputs.texts.noPlugin : PLUGINS_OFF_TEXT;

  if ((offersPlugin || keptOff) && !options.some((option) => option.value === PLUGIN_VALUE)) {
    select.options = [...options, { label: offersPlugin ? PLUGIN_LABEL : keptLabel, value: PLUGIN_VALUE }];
  }

  // the face's own conditions on a select dropped with one option are settled against the value the
  // feature goes on using, so the rows describe the provider the watch really gets. that is the saved
  // value when there is one, which the feature reads ahead of any default, and otherwise the one
  // option left, which every save from here carries
  if ((select.options || []).length < 2) {
    const left = (select.options || [])[0];
    const saved = inputs.saved;
    const used = (typeof saved === 'string' && saved !== '') || typeof saved === 'number' || typeof saved === 'boolean' ? saved : left?.value;

    dropRow(page, select);
    stripMarks(page, selectKey, used);
    return;
  }

  // with no plugin on offer and none saved, the marked rows show as they do on a face without plugin
  // sources. the face's own conditions on the select stay, since the select is still there to read
  if (!offersPlugin && !keptOff) {
    removeMarks(page, selectKey);
    return;
  }

  putSelectFirst(page, select, selectKey);

  if (inputs.movesBelow) {
    moveBelowSelect(page, select, inputs.movesBelow, selectKey);
  }

  hideMarkedRows(page, select, selectKey);

  // the note on where the data comes from sits under the select, since the section the hidden rows
  // were in is hidden with them
  const list = listHolding(page, (item) => item === select) as ClayConfigItem[];
  const note = inputs.texts.source ? [pluginOnlyRow(inputs.texts.source, selectKey, 'info')] : [];
  const whilePicked = (text: string, tone?: NoteTone) => pluginOnlyRow(text, selectKey, tone);
  const rows = [...note, ...(keptOff ? [whilePicked(keptText)] : warningRows(inputs, whilePicked))];

  list.splice(list.indexOf(select) + 1, 0, ...rows);
}

/** Whether the supported plugins panel is on the page and opens on its line saying to turn plugins on. */
function panelSaysPluginsOff(page: ClayConfigItem[]): boolean {
  const panel = findRow(page, (row) => row.type === PANEL_TYPE);

  return Boolean(panel && panel.row.panel && panel.row.panel.off);
}

/**
 * Adds the notes for a kind with no source choice, each always shown, and the supported plugins
 * panel when the feature asks for it.
 *
 * The note saying where the data comes from leads, when the kind has one and something on the phone
 * serves it. With nothing serving the kind, the watch shows nothing, so that note is left out and the
 * one note says how to turn plugins on. The list is read at page open rather than taken from the saved
 * error, so the note is right on a page opened before the feature has run, and after plugins were
 * turned off since the last subscription. A panel that opens on its own line saying the same takes the
 * place of that note, so the wearer reads the instruction once. That relies on the panel being on the
 * page already, which every caller makes sure of by passing `panel: true`. A
 * list the phone will not give says nothing about what is installed, so it gets the warnings the
 * saved state calls for, as a list serving the kind does, with the not standard wording that points
 * at the Pebble app alone.
 *
 * The notes go straight after the row the face marks for the kind, or else at the foot of the page,
 * in the card holding the supported plugins panel and above it.
 */
function placeNotes(page: ClayConfigItem[], inputs: PluginSourceInputs): void {
  const { texts } = inputs;
  const listed = inputs.plugins;
  const missing = listed !== null && !servesItem(listed, inputs.category, inputs.item);

  if (inputs.panel) {
    addPluginsPanel(page, inputs.category, inputs.item, inputs.plugins);
  }

  const source = texts.source && !missing ? [noteRow(texts.source, 'info')] : [];
  const noPlugin = texts.noPlugin && !panelSaysPluginsOff(page) ? [noteRow(texts.noPlugin)] : [];
  const noSelect = { ...inputs, texts: { ...texts, notStandard: texts.notStandardNoSelect || texts.notStandard } };
  const notes = [...source, ...(missing ? noPlugin : warningRows(noSelect, noteRow))];

  if (!notes.length) {
    return;
  }

  const anchor = findRow(page, (row) => row.pluginSourceRows === (inputs.rowKind || inputs.category));
  const panel = findRow(page, (row) => row.type === PANEL_TYPE);

  if (anchor) {
    anchor.list.splice(anchor.list.indexOf(anchor.row) + 1, 0, ...notes);
  } else if (panel) {
    panel.list.splice(panel.list.indexOf(panel.row), 0, ...notes);
  } else {
    page.splice(footIndex(page), 0, { type: 'section', items: notes });
  }
}

/**
 * Adds a feature's plugin choice to the settings page, with the rows that go with it.
 *
 * 1. It adds the feature's select below the leading rows of the section holding its anchor row, when
 *    the feature brings one and the page has none.
 * 2. It drops the select when the face declares no message key for it, and logs why. Clay would
 *    otherwise put a setting the watch cannot map into the save.
 * 3. It adds the Preferred Source option when a plugin on the phone serves the item. When none does
 *    and the plugin is the saved choice, the option stays as Preferred Source (Plugins Off), so a save
 *    keeps the choice and the plugin answers again once the wearer turns plugins back on. A kind with
 *    a `notInstalledLabel` takes that label instead while the phone lists other plugins.
 *    A plugin list the phone will not give offers the option as usual.
 * 4. It drops a select left with one option, which is no choice at all.
 * 5. With no select left on the page, it takes the select's marks off every row, drops the lead line
 *    marked for it, and settles the visibleWhen conditions naming it against the value the feature
 *    uses, the saved one or else the one option it had left. A section that dropping the select or
 *    its lead line leaves with only headings goes too. With the select there but no plugin on offer,
 *    it takes the marks off and leaves the conditions.
 * 6. Otherwise it puts the select first in its section, after the heading and its lead line, with
 *    the rows it hides under it and the section's other rows after those. It moves the section the
 *    feature names to sit after the select's own, when that section holds only rows for the other
 *    sources. It hides each marked row while a plugin is picked, and a section whose rows all hide
 *    goes with them.
 * 7. It then puts the feature's note on where the data comes from under the select, and the warning
 *    rows the saved state calls for after it. A plugin choice kept with plugins off gets the one row
 *    saying how to turn them on in place of the warnings, or the kind's `noPlugin` row while the phone
 *    lists other plugins.
 *
 * Once the select has passed step 2, a feature that asks for it also gets the supported plugins
 * panel at the foot of the page, whatever steps 3 to 7 made of the select.
 *
 * A kind with no source choice passes no select key, and none of the steps above apply. It gets its
 * notes alone, always shown: where its data comes from, then the one saying to turn plugins on while
 * nothing on the phone serves the kind, or else the warnings the saved state calls for. A panel
 * opening on its own line to turn plugins on stands in for that note. They go straight after the row
 * the face marks with `pluginSourceRows` for the kind, or at the foot of the page just above the panel.
 *
 * @param page The settings page so far, the page hook's own copy. It is changed in place.
 * @param inputs The select, the plugin list, the saved state and value, and the feature's wording.
 * @return The page, changed.
 */
export function pluginSourcePage(page: ClayConfigItem[], inputs: PluginSourceInputs): ClayConfigItem[] {
  const { selectKey } = inputs;

  if (selectKey === undefined) {
    placeNotes(page, inputs);
    return page;
  }

  if (inputs.insert) {
    insertSelect(page, inputs.insert, selectKey);
  }

  let select = findSelect(page, inputs);

  if (select && inputs.messageKeys[selectKey] === undefined) {
    console.warn(`plugin sources: the face declares no ${selectKey} message key, so its select is left off the settings page. Add ${selectKey} to the face's messageKeys`);
    dropRow(page, select);
    select = undefined;
  }

  // a select that is gone takes its conditions with it, since a condition on a missing control
  // hides its row for good
  if (!select) {
    stripMarks(page, selectKey);
    return page;
  }

  placeChoice(page, select, inputs, selectKey);

  // the panel goes on whenever the face offers the choice, with plugins on or off, since plugins off
  // is when the wearer most needs to hear what to turn on and where to get it
  if (inputs.panel) {
    addPluginsPanel(page, inputs.category, inputs.item, inputs.plugins);
  }

  return page;
}

export default { pluginSourcePage, PLUGIN_LABEL, PLUGINS_OFF_LABEL, PLUGINS_OFF_TEXT, PLUGIN_VALUE };
