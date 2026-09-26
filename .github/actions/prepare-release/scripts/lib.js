/**
 * Reads a face release tag, and the changelog entry that becomes the release notes.
 *
 * A face release is tagged <face>-v<version>, such as lcars-stardate-v1.11.0. The changelogs follow Keep a
 * Changelog, so every release is already written up under a heading such as "## [1.11.0] - 2026-09-07", and
 * the notes are that entry as written. There is no second copy to keep in step.
 */

const { isVersionTag, compareVersionTags } = require('../../../shared/lib');

// a Keep a Changelog heading, such as "## [1.11.0] - 2026-09-07" or "## [Unreleased]"
const HEADING = /^## \[([^\]]+)\](?: - (.*))?$/;

// a link reference such as "[1.1.0]: https://...", which a changelog closes with after its oldest entry
const LINK_REFERENCE = /^\[[^\]]+\]: \S/;

/**
 * Splits a release tag into the face and the version.
 *
 * A face name can hold -v itself, as in retro-vapor, and so can a pre-release label, as in -very.1, so the
 * split is at the last -v that a version number starts after.
 *
 * @param tag The tag that was pushed.
 * @return The face and the version, or null when the tag is not shaped <face>-v<version>.
 */
function splitTag(tag) {
  const match = /^(.+)-v(\d.*)$/.exec(String(tag));
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
 * @return True for a real date written like 2026-09-07. A typo such as 2026-19-07 is not one.
 */
function isDated(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }
  // a month past 12 reads as no date at all, and a day past the month's end rolls over into another one,
  // so a date is only real when it reads back the same
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

/**
 * Picks the framework version a commit is on, from every tag it carries.
 *
 * A commit can carry more than one, such as a release candidate's tag and the final release's, and git
 * describe names only one of them. The highest version wins, and a release beats its own candidates. A tag
 * that is not a version, such as wip, is no framework version at all.
 *
 * @param tags Every tag on the commit.
 * @return The highest version tag, or null when none of them is one.
 */
function pickFrameworkTag(tags) {
  const versions = tags.filter(isVersionTag).sort(compareVersionTags);
  return versions.length ? versions[versions.length - 1] : null;
}

module.exports = { splitTag, readChangelogEntry, isDated, pickFrameworkTag };
