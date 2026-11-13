/**
 * The supported plugins panel at the foot of a settings page, which lists the Pebble app plugins the
 * face can read from and where to get them.
 *
 * A face with any plugin define gets it once its page hook offers a plugin choice. It is one row,
 * drawn by the pluginPanel component as a closed panel the wearer can open. Under a heading for each
 * kind of data it lists the plugins the directory knows to serve that kind, and any plugin on the
 * phone serving it that the directory does not know. A store plugin carries the version tested with
 * the face, and is marked installed when the phone lists it. A built-in one a readable list leaves out
 * is marked off. When the phone lists no
 * plugins at all, the panel opens on a line saying to turn plugins on.
 *
 * Each kind's page hook adds its own kind, so a face with weather and the calendar gets one panel
 * listing both rather than two panels. The kinds keep the directory's order whichever hook runs first.
 */

import { KNOWN_PLUGINS, PANEL_KINDS, knownServing, storeListing } from './directory';
import type { KnownPlugin } from './directory';
import { escapeHtml, shownName, uuidKey } from './escape';
import { findRow, footIndex } from '../clay/rows';
import { servesItem } from './standard';
import type { PluginSummary } from './types';
import type { ClayConfigItem, PluginPanelContent, PluginPanelEntry, PluginPanelKind } from '../clay/types';

/** The words the panel shows while it is closed. */
export const PANEL_TITLE = 'Plugins This Watchface Supports';

/** The line under the title once the panel opens. */
export const PANEL_INTRO = 'This watchface can read from these Pebble app plugins. Choose which one it uses under Preferred Sources in the Pebble app. The version beside each plugin is one that has been tested with this watchface, which may not be its newest.';

/** The panel's first line while the phone lists no plugins, with plugins off or a Pebble app from before them. */
export const PANEL_OFF_TEXT = 'The Pebble app is not offering any plugins right now. Turn on plugins in the Pebble app under Settings, Plugins, or update the Pebble app.';

/** The word after a plugin built into the Pebble app. */
export const BUILT_IN_TAG = 'Built Into the Pebble App';

/** The word after a built-in plugin a readable list leaves out, so the wearer can see it is not running. */
export const OFF_TAG = 'Off';

/** The word after a plugin the phone lists. */
export const INSTALLED_TAG = 'Installed';

/** What goes between the parts after a plugin's name, and between the name and the first of them. */
export const TAG_SEPARATOR = ' - ';

/** The name a plugin the directory does not know shows under when it gives none. */
export const UNNAMED_PLUGIN = 'Unnamed Plugin';

/** The row type the panel component draws. */
export const PANEL_TYPE = 'pluginPanel';

/** The uuids the phone lists, in lowercase, so a uuid in another case still matches. */
function listedUuids(plugins: PluginSummary[] | null): string[] {
  return (plugins || []).map((plugin) => (plugin ? uuidKey(plugin.uuid) : null)).filter((uuid): uuid is string => uuid !== null);
}

/** The version a store plugin was tested at, as `v1.0.5`, or empty when the directory records none. */
function testedVersion(plugin: KnownPlugin): string {
  const version = typeof plugin.verifiedVersion === 'string' ? plugin.verifiedVersion.trim() : '';

  if (!version) {
    return '';
  }

  return /^v/i.test(version) ? version : `v${version}`;
}

/**
 * The words after a known plugin. A built-in one is marked built in, with where it runs for one built
 * into only some phones, and off as well when a readable list leaves it out. A store one carries the
 * version tested with the face, and is marked installed when the list holds it. A list the phone will
 * not give says nothing about either, so it adds neither mark.
 */
function knownTag(plugin: KnownPlugin, listing: string | null, listed: boolean, readable: boolean): string {
  if (!listing) {
    const builtIn = plugin.where ? `${BUILT_IN_TAG}, ${plugin.where}` : BUILT_IN_TAG;

    return readable && !listed ? `${builtIn}, ${OFF_TAG}` : builtIn;
  }

  return [testedVersion(plugin), listed ? INSTALLED_TAG : ''].filter(Boolean).join(TAG_SEPARATOR);
}

/**
 * The plugins on the phone serving the item that the directory does not know, each once. An entry
 * with no uuid cannot be told from another, so it is left out.
 */
function unknownServing(category: string, item: string, plugins: PluginSummary[] | null): PluginSummary[] {
  const seen = KNOWN_PLUGINS.map((plugin) => uuidKey(plugin.uuid));

  return (plugins || []).filter((plugin) => {
    const uuid = plugin && typeof plugin === 'object' ? uuidKey(plugin.uuid) : null;

    if (uuid === null || !servesItem([plugin], category, item) || seen.includes(uuid)) {
      return false;
    }

    seen.push(uuid);
    return true;
  });
}

/** The entries for one kind: the known plugins serving it, then any on the phone serving it that the directory does not know. */
function entriesFor(category: string, item: string, plugins: PluginSummary[] | null): PluginPanelEntry[] {
  const listed = listedUuids(plugins);
  const known = knownServing(category, item).map((plugin): PluginPanelEntry => {
    const listing = storeListing(plugin);
    const tag = knownTag(plugin, listing, listed.includes(uuidKey(plugin.uuid) ?? ''), Array.isArray(plugins));

    return { name: escapeHtml(plugin.name), tag: escapeHtml(tag), listing: escapeHtml(listing || '') };
  });

  const others = unknownServing(category, item, plugins).map((plugin): PluginPanelEntry => {
    // the uuid would mean nothing to the wearer, so a plugin with no name gets a plain label
    const name = typeof plugin.name === 'string' && plugin.name ? shownName(plugin) : UNNAMED_PLUGIN;

    return { name: escapeHtml(name), tag: escapeHtml(INSTALLED_TAG), listing: '' };
  });

  return known.concat(others);
}

/**
 * Adds one kind of data to the supported plugins panel, putting the panel on the page first when it
 * has none. A kind the panel already lists, or one the directory has no heading for, is left alone.
 *
 * It works on the page it is given, which is the page hook's own copy from the app's fold. A panel
 * already there is replaced by a new row rather than changed, so a page an earlier hook made is never
 * changed under it.
 *
 * @param page The settings page being built. It is changed in place.
 * @param category The kind's category, such as `weather`.
 * @param item The item inside it, such as `location`.
 * @param plugins The plugins the phone lists, or null when its list cannot be read.
 */
export function addPluginsPanel(page: ClayConfigItem[], category: string, item: string, plugins: PluginSummary[] | null): void {
  const kind = PANEL_KINDS.find((known) => known.category === category && known.item === item);

  if (!kind) {
    return;
  }

  const entries = entriesFor(category, item, plugins);
  // the line saying no plugin is installed only holds while the phone lists plugins. with plugins off,
  // or a list the phone will not give, the plugin may be installed and only not showing
  const pluginsOn = Array.isArray(plugins) && plugins.length > 0;
  const added: PluginPanelKind = { category, item, label: escapeHtml(kind.label), entries, ...(!entries.length && kind.none && pluginsOn ? { none: escapeHtml(kind.none) } : {}) };
  const off = Array.isArray(plugins) && plugins.length === 0 ? escapeHtml(PANEL_OFF_TEXT) : '';
  const existing = findRow(page, (row) => row.type === PANEL_TYPE && Boolean(row.panel));

  if (!existing) {
    const row: ClayConfigItem = {
      type: PANEL_TYPE,
      panel: { title: escapeHtml(PANEL_TITLE), intro: escapeHtml(PANEL_INTRO), off, kinds: [added] },
    };

    page.splice(footIndex(page), 0, { type: 'section', items: [row] });
    return;
  }

  const { row, list } = existing;
  const panel = row.panel as PluginPanelContent;

  if (panel.kinds.some((listed) => listed.category === category && listed.item === item)) {
    return;
  }

  const order = (listed: PluginPanelKind) => PANEL_KINDS.findIndex((known) => known.category === listed.category && known.item === listed.item);
  const kinds = [...panel.kinds, added].sort((first, second) => order(first) - order(second));

  list.splice(list.indexOf(row), 1, { ...row, panel: { ...panel, off: panel.off || off, kinds } });
}

export default { addPluginsPanel, PANEL_TITLE, PANEL_INTRO, PANEL_OFF_TEXT, BUILT_IN_TAG, OFF_TAG, INSTALLED_TAG, TAG_SEPARATOR, UNNAMED_PLUGIN, PANEL_TYPE };
