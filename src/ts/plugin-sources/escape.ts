/**
 * Getting words the plugin sources put on the settings page ready to go there, and telling plugins
 * apart by uuid.
 *
 * Clay writes every row of the page into a script block of the settings page as it stands, so a
 * plugin named with a closing script tag would end that block and run whatever its name holds next.
 * Clay puts the rows in with a plain string replace, which reads a `$` followed by `'`, `` ` ``, `&`,
 * or another `$` as a replacement pattern, so a name holding one would break the page script and the
 * settings would never open. Every word a row carries goes through `escapeHtml` first. The plugin
 * source components turn the six escapes back and show the words as text, so they read as written
 * and never become markup.
 */

import type { PluginSummary } from './types';

/** The longest plugin name the page shows, with an ellipsis standing in for the rest. */
export const NAME_LIMIT = 40;

/**
 * Words with their HTML characters escaped, and the dollar sign with them.
 *
 * @param text The words as they should read.
 * @return The words with `&`, `<`, `>`, both quotes, and `$` written as their entities.
 */
export function escapeHtml(text: string): string {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;', '$': '&#36;' };

  return text.replace(/[&<>"'$]/g, (character) => entities[character]);
}

/**
 * A plugin's uuid in lowercase, so the same uuid written in another case still matches.
 *
 * @param uuid The uuid as the phone gave it, which may be anything.
 * @return The uuid in lowercase, or null when it is not text.
 */
export function uuidKey(uuid: unknown): string | null {
  return typeof uuid === 'string' ? uuid.toLowerCase() : null;
}

/**
 * A plugin's name cut to a length that fits a row, or its uuid when it has none.
 *
 * @param plugin The plugin as the phone lists it.
 * @return The name to show, still to be escaped.
 */
export function shownName(plugin: PluginSummary): string {
  const raw = typeof plugin.name === 'string' && plugin.name ? plugin.name : String(plugin.uuid);
  // counted in whole characters, so an emoji at the cut is never split into half a character
  const characters = Array.from(raw);

  return characters.length > NAME_LIMIT ? characters.slice(0, NAME_LIMIT - 1).join('') + '…' : raw;
}

export default { escapeHtml, shownName, uuidKey, NAME_LIMIT };
