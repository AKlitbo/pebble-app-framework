/**
 * Builds a plugin app's settings page into the config.html its pbw carries.
 *
 * A plugin app's settings page is a Clay page, written as a Clay config in src/config/index.ts the
 * way a face writes its page, with an optional customClay beside it. The Pebble app opens a plugin's
 * page from a file in the pbw rather than from a URL the phone builds, so the page is built here, once,
 * into a single self-contained file.
 *
 * The config is bundled with esbuild the way the plugin's script is, so its imports resolve the same
 * way, and then Clay builds the page as it would on a phone, with the phone's globals stood in. The
 * page gets the framework's show and hide for its `visibleWhen` rows, then the framework's plugin
 * settings code from ts/plugin-app/page.ts, then the plugin app's own customClay. The settings code
 * loads the saved settings from the plugin and saves them back to it, so the page gets a status row for
 * it to report in, above the Save button, and a Save button when the config has none. Clay's own Save
 * goes to a return address, which is pointed at an in-page hash so it can never close the page unsaved.
 *
 * A plugin settings page opens with no watch behind it, so a row that names watch capabilities is
 * refused, since Clay has no watch to check them against.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import esbuild from 'esbuild';
import { combineCustomFns } from '../../ts/clay/custom-fn.ts';
import dependentVisibility from '../../ts/clay/dependent-visibility.ts';
import pageStyleComponent from '../../ts/clay/page-style-component.ts';
import pluginSettingsPage from '../../ts/plugin-app/page.ts';
import { stubModuleLoad } from '../../ts/testing/module-load.ts';
import { ENGINE, icaljsBundle, WORKSPACE } from '../shared/paths.ts';
import { ToolError } from '../shared/tool-error.ts';
import { isObject } from '../shared/values.ts';
import { icaljsPlugin } from './build-plugin.ts';
import { checkCustomClay, installHost } from './settings-page.ts';
import type { ClayConfigItem } from '../../ts/clay/types.ts';

/** Where a plugin app's settings page config starts, relative to the plugin app's folder. */
export const PLUGIN_CONFIG_ENTRY = path.join('src', 'config', 'index.ts');

/** The id of the row the settings code reports in. */
export const SAVE_STATUS_ID = 'paf-save-status';

/** Clay's return address on a phone, which a plugin app's page cannot use. */
const PHONE_RETURN = 'window.returnTo="pebblejs://close#"';

/** The in-page hash the page's return address points at in its place. */
const PAGE_RETURN = 'window.returnTo="#paf-save:"';

/** What a plugin app's src/config/index.ts exports. */
export interface PluginPageSource {
  clayConfig: ClayConfigItem[];
  customClay?: unknown;
}

/** Whether any row on the page, inside sections too, matches. */
function anyItem(items: ClayConfigItem[], test: (item: ClayConfigItem) => boolean): boolean {
  return items.some((item) => test(item) || (item.items ? anyItem(item.items, test) : false));
}

/** Puts the status row just above the first Save button, inside a section too, and says whether there was one. */
function placeStatus(items: ClayConfigItem[], status: ClayConfigItem): boolean {
  const submit = items.findIndex((item) => item.type === 'submit');

  if (submit !== -1) {
    items.splice(submit, 0, status);
    return true;
  }

  return items.some((item) => (item.items ? placeStatus(item.items, status) : false));
}

/**
 * The rows a plugin app's page is built from: its own, a status row above its Save button, and a
 * Save button at the foot when it has none.
 *
 * @param config The plugin app's Clay config.
 * @param name The plugin app's name, which a refusal names.
 * @return The rows to build the page from. The config passed in is left as it was.
 */
export function pluginPageItems(config: ClayConfigItem[], name: string): ClayConfigItem[] {
  if (anyItem(config, (item) => (item as { capabilities?: unknown }).capabilities !== undefined)) {
    throw new ToolError(`${name}'s settings page has a row that names watch capabilities, which a plugin's page cannot check, since it opens with no watch behind it. Take capabilities off the row`);
  }

  // a Clay config is plain data, so a copy through JSON leaves the plugin's own untouched
  const items: ClayConfigItem[] = JSON.parse(JSON.stringify(config));
  const status: ClayConfigItem = { type: 'text', id: SAVE_STATUS_ID, defaultValue: '' };

  if (!placeStatus(items, status)) {
    items.push(status, { type: 'submit', defaultValue: 'Save' });
  }

  return items;
}

/**
 * Builds a plugin app's settings page as one self-contained HTML file.
 *
 * @param source The plugin app's Clay config and its optional customClay.
 * @param name The plugin app's name, which a refusal names.
 * @return The page's HTML.
 */
export function renderPluginPage(source: PluginPageSource, name: string): string {
  const items = pluginPageItems(source.clayConfig, name);
  const customFn = combineCustomFns([
    { code: anyItem(items, (item) => item.visibleWhen !== undefined) ? dependentVisibility : undefined, label: 'the framework\'s show and hide' },
    { code: pluginSettingsPage, label: 'the framework\'s plugin settings' },
    { code: source.customClay, label: 'the plugin app\'s customClay' },
  ]);

  // Clay reads message_keys, Pebble, and localStorage as it loads and as it builds the page, and
  // none of them exist under node, so each is stood in for the build and put back after it
  const restoreHost = installHost({ platform: 'emery', settings: null }, null);
  const restoreLoad = stubModuleLoad((id) => (id === 'message_keys' ? {} : undefined));

  try {
    const Clay = createRequire(path.join(ENGINE, 'package.json'))('@rebble/clay/src/js/index') as new (config: unknown, customFn: unknown, options: unknown) => { meta: unknown; generateUrl(): string; registerComponent(component: unknown): void };
    const clay = new Clay(items, customFn, { autoHandleEvents: false });

    // the framework's rules for the whole page, the same ones a face's page carries. without them the
    // Pebble Android app's head script puts Clay's component styles ahead of its base sheet, and a select
    // row keeps the base padding, a gap under its value and at each side
    clay.registerComponent(pageStyleComponent);

    // a plugin's page opens with no watch behind it
    clay.meta = { activeWatchInfo: null, accountToken: '', watchToken: '', userData: {} };

    const url = clay.generateUrl();
    const prefix = 'data:text/html;charset=utf-8,';
    const html = url.startsWith(prefix) ? decodeURIComponent(url.slice(prefix.length)) : url;

    if (!html.includes(PHONE_RETURN)) {
      throw new ToolError(`Clay's page for ${name} does not set its return address where the build expects, so its Save could close the page unsaved. Check the @rebble/clay version the framework asks for`);
    }

    return html.replace(PHONE_RETURN, PAGE_RETURN);
  } finally {
    restoreLoad();
    restoreHost();
  }
}

/**
 * Reads a plugin app's settings page config from its src/config/index.ts.
 *
 * The config is bundled with esbuild the way the plugin's script is, so a value it imports from the
 * plugin's own code or the framework's resolves the same way, and then run under node.
 *
 * @param pluginDir The plugin app's folder.
 * @param name The plugin app's name, which a refusal names.
 * @return The Clay config and the optional customClay it exports.
 */
export async function readPluginPage(pluginDir: string, name: string): Promise<PluginPageSource> {
  const entry = path.resolve(pluginDir, PLUGIN_CONFIG_ENTRY);
  const shown = PLUGIN_CONFIG_ENTRY.split(path.sep).join('/');

  if (!fs.existsSync(entry)) {
    throw new ToolError(`${name} names config.html as its settings page but has no ${shown}, which is where its page starts`);
  }

  let code: string;

  try {
    // a page that shares a file with the plugin's script can reach the iCal reader, whose ./icaljs only
    // the build provides, so it is mapped here as it is for the script
    const result = await esbuild.build({ entryPoints: [entry], absWorkingDir: WORKSPACE, bundle: true, write: false, format: 'cjs', platform: 'node', logLevel: 'silent', plugins: [icaljsPlugin(icaljsBundle())] });

    code = result.outputFiles[0].text;
  } catch (error) {
    throw new ToolError(`${name}'s ${shown} did not bundle. ${error instanceof Error ? error.message : String(error)}`);
  }

  const module = { exports: {} as Record<string, unknown> };

  try {
    vm.runInThisContext(`(function (module, exports, require) {\n${code}\n})`, { filename: entry })(module, module.exports, createRequire(entry));
  } catch (error) {
    throw new ToolError(`${name}'s ${shown} stopped as it loaded. ${error instanceof Error ? error.message : String(error)}`);
  }

  const exported = isObject(module.exports) ? module.exports : {};

  if (!Array.isArray(exported.clayConfig)) {
    throw new ToolError(`${name}'s ${shown} has to export clayConfig, the page's Clay config as a list of rows`);
  }

  checkCustomClay(name, exported.customClay);

  return { clayConfig: exported.clayConfig as ClayConfigItem[], customClay: exported.customClay };
}
