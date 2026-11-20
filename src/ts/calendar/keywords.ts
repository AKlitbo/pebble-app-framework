/**
 * Matching an event's title against keywords the wearer types, such as `Lunch, Canceled:`, for a
 * reader that hides or marks events by their title.
 *
 * A keyword matches from the start of a word in the title and runs on from there, so `Lunch` finds
 * "Team Lunch" and "Lunch with Sam" but not "Brunch".
 */

/**
 * Splits a keyword list as the wearer types it into the keywords to match.
 *
 * The list is split on commas. Each keyword loses the spaces at its ends and goes to lower case, and
 * an empty one is left out, so `Lunch, , Canceled:` gives two.
 *
 * @param list The list as typed, which may be missing.
 * @return The keywords, lower case, in the order typed.
 */
export function parseKeywords(list: string | null | undefined): string[] {
  return String(list || '')
    .split(',')
    .map(plainKeyword)
    .filter((keyword) => keyword.length > 0);
}

/** A keyword without the spaces at its ends, in lower case, the form a title is searched for it in. */
function plainKeyword(keyword: string): string {
  return String(keyword || '')
    .trim()
    .toLowerCase();
}

/**
 * Whether a character belongs to a word. A digit does, and so does a letter, which is told apart by
 * having an upper and a lower case. A script with no case, such as Chinese, has no spaces between its
 * words either, so its characters count as breaks and a keyword in it matches anywhere.
 */
function isWordCharacter(character: string): boolean {
  return (character >= '0' && character <= '9') || character.toLowerCase() !== character.toUpperCase();
}

/**
 * Whether any keyword matches the title. Case is ignored, and a keyword matches only where it starts
 * at the start of a word, which is the title's start or a place after anything that is not a letter
 * or a digit. So `Canceled:` matches "Canceled: Standup".
 *
 * @param title The event's title.
 * @param keywords The list as the wearer typed it, or a list of keywords, such as the one
 *   `parseKeywords` gave for it, for a caller that checks many titles against one list. Each keyword in
 *   a list is trimmed and lowered too, so a list built by hand matches the same.
 * @return True when a keyword matches. An empty list matches nothing.
 */
export function matchesKeyword(title: string, keywords: string | readonly string[]): boolean {
  const list = typeof keywords === 'string' ? parseKeywords(keywords) : keywords.map(plainKeyword);
  const lowered = String(title || '').toLowerCase();

  return list.some((keyword) => {
    let at = keyword ? lowered.indexOf(keyword) : -1;

    while (at !== -1) {
      if (at === 0 || !isWordCharacter(lowered.charAt(at - 1))) {
        return true;
      }

      at = lowered.indexOf(keyword, at + 1);
    }

    return false;
  });
}

export default { parseKeywords, matchesKeyword };
