/**
 * Getting words ready to go into a row of the settings page as written.
 *
 * Clay writes every row of the page into a script block of the settings page as it stands, so words
 * holding a closing script tag would end that block and run whatever comes next. Clay puts the rows in
 * with a plain string replace, which reads a `$` followed by `'`, `` ` ``, `&`, or another `$` as a
 * replacement pattern, so words holding one would break the page script and the settings would never
 * open. Words that come from somewhere other than the face's own code, such as a plugin's name or the
 * app's name from its appinfo, go through `escapeHtml` first.
 */

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

export default { escapeHtml };
