/**
 * An event's notes, cleaned close to the way the Pebble app's built-in Calendar plugin cleans them.
 *
 * The built-in sends a `description` of up to 300 characters, as on a timeline pin. Google and Outlook
 * often write a meeting's notes as HTML, so the tags come out and the text between them stays. Ours
 * differs from the built-in's in three places. It trims the ends, which the built-in leaves. It takes
 * out only tags that start with a letter, where the built-in takes out anything from a `<` to the next
 * `>`, which eats a note such as `budget < 5k, target > 10k`. And it cuts by whole characters, where
 * the built-in can cut an emoji in half.
 */

/** The most characters a description keeps, the built-in's own cap. */
export const DESCRIPTION_MAX = 300;

// a tag that starts with a letter, a `<` then a letter or a `/` and a letter, up to the next `>`
const TAG = /<\/?[A-Za-z][^>]*>/g;

/**
 * Turns an event's raw notes into plain text.
 *
 * Each HTML tag is taken out with nothing in its place, as the built-in does, so a `<br>` between two
 * lines joins them and the line breaks the text already has stay. A `<` or `>` that starts no tag
 * stays, and so do a comment and a `<!DOCTYPE>`, since neither starts with a letter. Entities such as
 * `&amp;` stay as written, which the built-in leaves too. The text is trimmed, and
 * one longer than 300 characters is cut to 299 with `…` on the end. Characters are counted as code
 * points, so an emoji counts as one and is never cut in half.
 *
 * @param raw The notes as the calendar gave them, which may be missing.
 * @return The plain text, empty when there is none.
 */
export function plainDescription(raw: string | null | undefined): string {
  const text = String(raw || '')
    .replace(TAG, '')
    .trim();
  const characters = Array.from(text);

  return characters.length <= DESCRIPTION_MAX ? text : characters.slice(0, DESCRIPTION_MAX - 1).join('') + '…';
}

export default { plainDescription, DESCRIPTION_MAX };
