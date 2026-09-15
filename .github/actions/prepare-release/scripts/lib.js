/**
 * Reads a face release tag, and the changelog entry that becomes the release notes.
 *
 * A face release is tagged <face>-v<version>, such as lcars-stardate-v1.11.0. The changelogs follow Keep a
 * Changelog, so every release is already written up under a heading such as "## [1.11.0] - 2026-09-07", and
 * the notes are that entry as written. There is no second copy to keep in step.
 */

// a Keep a Changelog heading, such as "## [1.11.0] - 2026-09-07" or "## [Unreleased]"
const HEADING = /^## \[([^\]]+)\](?: - (.*))?$/;

// a link reference such as "[1.1.0]: https://...", which a changelog closes with after its oldest entry
const LINK_REFERENCE = /^\[[^\]]+\]: \S/;

/**
 * Splits a release tag into the face and the version.
 *
 * A face name can hold -v itself, as in retro-vapor, so the split is at the last -v.
 *
 * @param tag The tag that was pushed.
 * @return The face and the version, or null when the tag is not shaped <face>-v<version>.
 */
function splitTag(tag) {
  const match = /^(.+)-v(.+)$/.exec(String(tag));
  if (!match) {
    return null;
  }
  return { face: match[1], version: match[2] };
}

/**
 * Finds one version's entry in a changelog.
 *
 * @param text The whole changelog.
 * @param version The version to find, such as 1.11.0.
 * @return The date on its heading, or an empty string when the heading has none, and the entry's text with
 *   the blank lines either side trimmed. Null when no heading names that version.
 */
function readChangelogEntry(text, version) {
  const lines = String(text).split(/\r?\n/).map((line) => line.trimEnd());
  const start = lines.findIndex((line) => {
    const heading = HEADING.exec(line);
    return heading !== null && heading[1] === version;
  });
  if (start === -1) {
    return null;
  }

  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (HEADING.test(line) || LINK_REFERENCE.test(line)) {
      break;
    }
    body.push(line);
  }

  return { date: (HEADING.exec(lines[start])[2] || '').trim(), body: body.join('\n').trim() };
}

/**
 * Whether a changelog heading carries a real date, rather than Unreleased or nothing at all.
 *
 * @param date The date as readChangelogEntry read it.
 * @return True for a date written like 2026-09-07.
 */
function isDated(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

module.exports = { splitTag, readChangelogEntry, isDated };
