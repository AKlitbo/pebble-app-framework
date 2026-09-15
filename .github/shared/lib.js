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
 * @param headings The column headings.
 * @param rows The rows, each a list of cells in heading order.
 * @return The table as markdown.
 */
function markdownTable(headings, rows) {
  const cell = (value) => String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
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

module.exports = { fail, step, insideRepo, existingPath, repoPath, fenceFor, outputTail, markdownTable, firstLine };
