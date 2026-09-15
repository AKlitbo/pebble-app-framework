/**
 * Reads the warnings Doxygen prints while it builds.
 *
 * With the Doxyfile's WARN_FORMAT of `$file:$line: $text`, a warning about the source is one line of
 * `file:line: warning: message`. A warning about the Doxyfile itself, such as a setting this Doxygen does
 * not know, has no file. A longer warning carries on underneath on indented lines.
 */

// /home/runner/work/engine/engine/c/core/math/pct.h:20: warning: Member PCT_MAX (macro definition) of file pct.h is not documented.
const LOCATED = /^(.*?):(\d+): (warning|error): (.*)$/;
// warning: ignoring unsupported tag 'HTML_TIMESTAMP' at line 1234, file Doxyfile
const UNLOCATED = /^(warning|error): (.*)$/;

/**
 * Lists every warning and error Doxygen printed.
 *
 * @param output What Doxygen printed to stderr.
 * @return The warnings in the order Doxygen printed them, each with its file and line when it has them, its severity, and its message.
 */
function readWarnings(output) {
  const warnings = [];
  for (const line of String(output).split(/\r?\n/)) {
    const located = LOCATED.exec(line);
    const unlocated = located ? null : UNLOCATED.exec(line);
    if (located) {
      warnings.push({ file: located[1], line: Number(located[2]), severity: located[3], message: located[4] });
    } else if (unlocated) {
      warnings.push({ file: undefined, line: undefined, severity: unlocated[1], message: unlocated[2] });
    } else if (/^\s+\S/.test(line) && warnings.length > 0) {
      warnings[warnings.length - 1].message += `\n${line.trim()}`;
    }
  }
  return warnings;
}

module.exports = { readWarnings };
