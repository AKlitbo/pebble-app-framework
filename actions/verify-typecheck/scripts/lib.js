/**
 * Reads what tsc prints with --pretty false.
 *
 * Each error is one line of `file(line,column): error TS1234: message`, and a longer explanation carries on
 * underneath on lines indented by two spaces. An error about the project itself, such as a file in its
 * include that does not exist, has no file or place at all.
 */

// tools/faces.ts(12,5): error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.
const LOCATED = /^(.+?)\((\d+),(\d+)\): (error|warning) (TS\d+): (.*)$/;
// error TS5058: The specified path does not exist: 'config/missing.json'.
const UNLOCATED = /^(error|warning) (TS\d+): (.*)$/;

/**
 * Lists every error tsc printed, with its explanation lines folded into its message.
 *
 * @param output What one tsc run printed.
 * @return The errors in the order tsc printed them, each with its file and place when it has them, its code, and its message.
 */
function readTsc(output) {
  const errors = [];
  for (const line of String(output).split(/\r?\n/)) {
    const located = LOCATED.exec(line);
    const unlocated = located ? null : UNLOCATED.exec(line);
    if (located) {
      errors.push({
        file: located[1],
        line: Number(located[2]),
        column: Number(located[3]),
        severity: located[4],
        code: located[5],
        message: located[6],
      });
    } else if (unlocated) {
      errors.push({ file: undefined, line: undefined, column: undefined, severity: unlocated[1], code: unlocated[2], message: unlocated[3] });
    } else if (/^\s+\S/.test(line) && errors.length > 0) {
      errors[errors.length - 1].message += `\n${line.trim()}`;
    }
  }
  return errors;
}

module.exports = { readTsc };
