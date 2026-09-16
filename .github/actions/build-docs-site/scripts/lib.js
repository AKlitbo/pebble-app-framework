/**
 * Reads what TypeDoc prints and the coverage summaries the two test suites write.
 */

// TypeDoc colours its output when it thinks a terminal is watching, as in ESC[93m[warning]ESC[0m
// the escape is built from its character code, since lint refuses a control character inside a regex
const COLOUR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
// [warning] StartOptions, defined in pebble-watchface-engine/ts/pkjs/app.ts, is referenced by pkjs/app.default.__type.startPebbleApp.__type.options but not included in the documentation
const LINE = /^\[(warning|error)\] (.*)$/;
// [warning] Found 0 errors and 1 warnings
const TALLY = /^Found \d+ errors? and \d+ warnings?$/;
// TypeDoc names a file by the package folder and then its path inside it
const DEFINED_IN = /defined in [^/\s]+\/(\S+?\.[cm]?[jt]sx?),/;

/**
 * Lists every warning and error TypeDoc printed.
 *
 * TypeDoc prints no line numbers. A warning about a type names the file the type is defined in, and that
 * is the file it gets. Anything else has no file. The closing tally is not a warning of its own.
 *
 * @param output What TypeDoc printed, stdout and stderr together.
 * @return The warnings in the order TypeDoc printed them, each with its file when it names one, its severity, and its message.
 */
function readTypedocWarnings(output) {
  const warnings = [];
  for (const line of String(output).replace(COLOUR, '').split(/\r?\n/)) {
    const match = LINE.exec(line.trim());
    if (!match || TALLY.test(match[2])) {
      continue;
    }
    const defined = DEFINED_IN.exec(match[2]);
    warnings.push({ file: defined ? defined[1] : undefined, severity: match[1], message: match[2] });
  }
  return warnings;
}

/** A coverage figure is only worth showing when it is a real percentage. */
function percentOrNull(value) {
  return typeof value === 'number' && value >= 0 && value <= 100 ? value : null;
}

/**
 * The share of lines covered, from the summary Vitest's json-summary reporter writes.
 *
 * @param json The parsed coverage-summary.json, or null when there was none.
 * @return The total line percentage, or null when there is no real one. Vitest writes "Unknown" when it measured nothing.
 */
function readVitestLines(json) {
  const lines = json && json.total && json.total.lines;
  return lines ? percentOrNull(lines.pct) : null;
}

/**
 * The share of lines covered, from the summary gcovr's --json-summary writes.
 *
 * @param json The parsed summary.json, or null when there was none.
 * @return The line percentage, or null when there is no real one.
 */
function readGcovrLines(json) {
  return json ? percentOrNull(json.line_percent) : null;
}

module.exports = { readTypedocWarnings, readVitestLines, readGcovrLines };
