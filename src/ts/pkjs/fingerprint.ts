/**
 * A short fingerprint of some text, for phone code and plugin apps that have to tell a changed key,
 * link, or list from the same one without keeping the text itself.
 *
 * The quota ledgers keep their stamps under the fingerprint of the key in use, so the output stays
 * the same from release to release. A change here would start every saved count again.
 */

/**
 * A short fingerprint of some text, the xor form of the djb2 hash, in base 36. Two texts can share one, so it tells a
 * change apart, not a secret.
 *
 * @param text The text, such as an API key or a feed link.
 * @return The fingerprint, a few letters and digits.
 */
export function fingerprint(text: string): string {
  let hash = 5381;

  for (let index = 0; index < text.length; index++) {
    hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}

export default { fingerprint };
