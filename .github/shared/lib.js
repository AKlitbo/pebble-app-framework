/**
 * Helpers every action script shares.
 *
 * Each action runs its script through actions/github-script, which hands the script `core` and `exec`.
 * An action is used by path, and the runner has the whole repo on disk for it, so a script reaches this
 * folder from its own action folder.
 */
const fs = require('fs');
const { posix } = require('path');

/** A failure the script expects, such as a failing test, as opposed to a crash in the script itself. */
class ExpectedFailure extends Error {}

/**
 * Stops the script with a message meant for whoever reads the run.
 *
 * @param message What went wrong and, where it helps, what to do about it.
 * @return Never returns. It always throws.
 */
function fail(message) {
  throw new ExpectedFailure(message);
}

/**
 * Wraps a script so an expected failure fails the step with its plain message.
 *
 * Anything else is a real crash in the script, so it is thrown on with its stack trace intact.
 *
 * @param run The script body, handed the github-script arguments.
 * @return The wrapped script, ready to export for github-script to call.
 */
function step(run) {
  return async (args) => {
    try {
      return await run(args);
    } catch (error) {
      if (!(error instanceof ExpectedFailure)) {
        throw error;
      }
      args.core.setFailed(error.message);
      return undefined;
    }
  };
}

/**
 * A path from an action input, relative to the repo root with forward slashes.
 *
 * A path that climbs out of the repo is refused, and so is an absolute one. A Windows drive path such as
 * C:/x counts as absolute too, since posix does not see it that way.
 *
 * @param given The path as the workflow passed it.
 * @param label What the input is called, for the message when it is wrong.
 * @return The path tidied, relative to the repo root.
 */
function insideRepo(given, label) {
  const normalized = posix.normalize(String(given).replace(/\\/g, '/'));
  if (normalized === '..' || normalized.startsWith('../') || posix.isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized)) {
    fail(`${label} '${given}' has to be a relative path inside the repo.`);
  }
  return normalized;
}

/**
 * A path inside the repo that has to exist on the runner, for a tool pointed at it.
 *
 * A missing path fails here with a message naming the input, rather than as the tool's own confusing error.
 *
 * @param given The path as the workflow passed it.
 * @param label What the input is called, for the message when it is wrong.
 * @return The path tidied, relative to the repo root.
 */
function existingPath(given, label) {
  const normalized = insideRepo(given, label);
  if (!fs.statSync(normalized, { throwIfNoEntry: false })) {
    fail(`${label} '${given}' does not exist.`);
  }
  return normalized;
}

/**
 * A path a tool printed, the way an annotation wants it, relative to the repo root with forward slashes.
 *
 * Tools print paths in three ways. An absolute path under the workspace loses the workspace, a path
 * relative to the folder the tool ran in is joined onto that folder, and anything outside the repo is
 * returned as it came, since GitHub quietly drops an annotation it cannot place.
 *
 * @param file The path as the tool printed it.
 * @param cwd The folder the tool ran in, relative to the repo root. Defaults to the root.
 * @return The path relative to the repo root.
 */
function repoPath(file, cwd = '.') {
  const given = String(file).replace(/\\/g, '/');
  const root = (process.env.GITHUB_WORKSPACE || process.cwd()).replace(/\\/g, '/').replace(/\/+$/, '');
  if (posix.isAbsolute(given) || /^[A-Za-z]:\//.test(given)) {
    // a Windows drive letter can print in either case, so the workspace is matched without case
    return given.toLowerCase().startsWith(`${root.toLowerCase()}/`) ? given.slice(root.length + 1) : given;
  }
  return posix.normalize(posix.join(cwd.replace(/\\/g, '/'), given));
}

/**
 * A code fence that the text inside it cannot close.
 *
 * Tool output can carry its own ``` lines, such as a code block in a doc comment, and a fence of the same
 * length would end the block there. So the fence is one backtick longer than the longest run in the text.
 *
 * @param text The text going inside the fence.
 * @return The fence to put either side of it.
 */
function fenceFor(text) {
  const longest = Math.max(0, ...(String(text).match(/`+/g) || []).map((run) => run.length));
  return '`'.repeat(Math.max(3, longest + 1));
}

/**
 * The last lines of a tool's output, fenced for the job summary.
 *
 * @param text The tool's output.
 * @param count How many lines from the end to keep.
 * @return The fenced block.
 */
function outputTail(text, count = 40) {
  const lines = String(text || '').trimEnd().split(/\r?\n/).slice(-count).join('\n');
  const fence = fenceFor(lines);
  return `${fence}text\n${lines}\n${fence}`;
}

/**
 * A markdown table, with any | or line break in a cell made safe so it cannot break the row.
 *
 * Angle brackets are escaped too, outside backtick code. The job summary reads `<void>` in a message such as
 * `Promise<void>` as an HTML tag and drops it. Inside backticks it shows as written, and there an escape
 * would show as the entity text.
 *
 * @param headings The column headings.
 * @param rows The rows, each a list of cells in heading order.
 * @return The table as markdown.
 */
function markdownTable(headings, rows) {
  // splitting on a capture group keeps the code spans, at the odd places in the list
  const escapeTags = (text) => text.split(/(`[^`]*`)/).map((part, index) => (index % 2 === 1 ? part : part.replace(/</g, '&lt;').replace(/>/g, '&gt;'))).join('');
  const cell = (value) => escapeTags(String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' '));
  const row = (cells) => `| ${cells.map(cell).join(' | ')} |`;
  return [row(headings), row(headings.map(() => '---')), ...rows.map(row)].join('\n');
}

/**
 * The first line of a message, for places that only have room for one.
 *
 * @param text A message that may run over several lines, or nothing at all.
 * @return Its first non-empty line, trimmed, or an empty string.
 */
function firstLine(text) {
  return String(text || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || '';
}

/**
 * Reads a JSON file, failing with its name when it is missing or does not parse, such as after a stray
 * trailing comma, rather than crashing with a stack trace.
 *
 * @param file The file's path.
 * @param label How the message names the file, normally its path from the repo root.
 * @return What the file holds.
 */
function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${label} is missing or is not valid JSON. ${error.message}`);
  }
}

// the colour codes a tool wraps its output in when it thinks a terminal is watching, as in ESC[93m
// the escape is built from its character code, since lint refuses a control character inside a regex
const COLOUR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/**
 * Takes the terminal colour codes out of a tool's output, so its lines can be matched as plain text.
 *
 * @param text What the tool printed.
 * @return The same text with no colour codes.
 */
function stripColour(text) {
  return String(text || '').replace(COLOUR, '');
}

// a release tag, such as v2.0.0 or v3.0.0-rc.27
const VERSION_TAG = /^v(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/**
 * Whether a name is a release tag.
 *
 * @param name The tag or folder name, such as v2.0.0.
 * @return True for a release tag, with or without a pre-release label.
 */
function isVersionTag(name) {
  return VERSION_TAG.test(String(name));
}

/** A release tag's parts, with the pre-release label split on its dots. */
function parseVersionTag(name) {
  const match = VERSION_TAG.exec(String(name));
  return { release: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ? match[4].split('.') : [] };
}

/** Orders two pre-release labels the way semver does. A number sorts below a word, and a longer label wins a tie. */
function comparePre(first, second) {
  for (let index = 0; index < Math.min(first.length, second.length); index++) {
    const firstPart = first[index];
    const secondPart = second[index];
    const firstIsNumber = /^\d+$/.test(firstPart);
    const secondIsNumber = /^\d+$/.test(secondPart);
    if (firstIsNumber && secondIsNumber && Number(firstPart) !== Number(secondPart)) {
      return Number(firstPart) - Number(secondPart);
    }
    if (firstIsNumber !== secondIsNumber) {
      return firstIsNumber ? -1 : 1;
    }
    if (!firstIsNumber && firstPart !== secondPart) {
      return firstPart < secondPart ? -1 : 1;
    }
  }
  return first.length - second.length;
}

/**
 * Orders two release tags oldest first, the way semver does. A release candidate sorts below the release
 * it leads up to, and rc.9 below rc.27.
 *
 * @param first A release tag, such as v3.0.0-rc.9.
 * @param second Another release tag.
 * @return Below zero when first is older, above zero when it is newer, and zero for the same version.
 */
function compareVersionTags(first, second) {
  const older = parseVersionTag(first);
  const newer = parseVersionTag(second);
  for (let index = 0; index < 3; index++) {
    if (older.release[index] !== newer.release[index]) {
      return older.release[index] - newer.release[index];
    }
  }
  if (older.pre.length === 0 || newer.pre.length === 0) {
    return newer.pre.length - older.pre.length;
  }
  return comparePre(older.pre, newer.pre);
}

/**
 * Whether a release tag carries a pre-release label, such as rc.1.
 *
 * @param name A release tag.
 * @return True for a pre-release. A name that is not a release tag at all is not one.
 */
function isPrereleaseTag(name) {
  return isVersionTag(name) && parseVersionTag(name).pre.length > 0;
}

module.exports = {
  fail, step, insideRepo, existingPath, repoPath, fenceFor, outputTail, markdownTable, firstLine, stripColour, readJson,
  isVersionTag, compareVersionTags, isPrereleaseTag,
};
