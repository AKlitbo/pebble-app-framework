/**
 * Reads what TypeDoc prints and the coverage summaries the two test suites write.
 */
const { stripColour } = require('../../../shared/lib');

// [warning] StartOptions, defined in pebble-app-framework/ts/pkjs/app.ts, is referenced by pkjs/app.default.__type.startPebbleApp.__type.options but not included in the documentation
const LINE = /^\[(warning|error)\] (.*)$/;
// [warning] Found 0 errors and 1 warnings
const TALLY = /^Found \d+ errors? and \d+ warnings?$/;
// [error] html output could not be generated due to the errors above
// TypeDoc's closing line when a warning stopped the build, which only points back at the real ones
const NOT_GENERATED = /output could not be generated due to the errors above$/;
// TypeDoc names a file by the package folder and then its path inside it
const DEFINED_IN = /defined in [^/\s]+\/(\S+?\.[cm]?[jt]sx?),/;
// ./ts/pkjs/app.ts:42:4 - [warning] Failed to resolve link to "Foo" in comment for bar
// TypeDoc puts the file and line first for a warning it can tie to the source, such as a broken link
const LOCATED = /^(?:\.\/)?(\S+?):(\d+):\d+ - \[(warning|error)\] (.*)$/;
// [error] ./ts/pkjs/app.ts:42:5 - error TS2322: Type 'string' is not assignable to type 'number'.
// a TypeScript error TypeDoc passes on keeps the compiler's own shape behind the tag
const COMPILE_ERROR = /^\[(warning|error)\] (?:\.\/)?(\S+?):(\d+):\d+ - (?:error|warning) (TS\d+: .*)$/;

/**
 * Lists every warning and error TypeDoc printed.
 *
 * A warning TypeDoc can tie to the source, such as a broken link in a comment, opens with the file and
 * line, and it gets both. So does a TypeScript error TypeDoc passes on, which puts them after its tag. A warning about a type names the file the type is defined in, and that is the
 * file it gets. Anything else has no file. The closing tally and the closing line saying the output could
 * not be generated are not warnings of their own.
 *
 * @param output What TypeDoc printed, stdout and stderr together.
 * @return The warnings in the order TypeDoc printed them, each with its file and line when it names them, its severity, and its message.
 */
function readTypedocWarnings(output) {
  const warnings = [];
  for (const line of stripColour(output).split(/\r?\n/)) {
    const located = LOCATED.exec(line.trim());
    if (located) {
      warnings.push({ file: located[1], line: Number(located[2]), severity: located[3], message: located[4] });
      continue;
    }
    const compileError = COMPILE_ERROR.exec(line.trim());
    if (compileError) {
      warnings.push({ file: compileError[2], line: Number(compileError[3]), severity: compileError[1], message: compileError[4] });
      continue;
    }
    const match = LINE.exec(line.trim());
    if (!match || TALLY.test(match[2]) || NOT_GENERATED.test(match[2])) {
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
