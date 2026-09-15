/**
 * Reads the results ESLint prints with its JSON formatter.
 *
 * Each file lists its messages with a severity of 2 for an error and 1 for a warning. A file ESLint could
 * not parse carries a fatal message with no rule, which counts as an error.
 */

/**
 * Lists every problem ESLint found, one entry per message.
 *
 * @param results The parsed JSON ESLint printed.
 * @return The problems in the order ESLint listed them, each with its file, place, severity, rule, and message.
 */
function readLint(results) {
  const problems = [];
  for (const file of results) {
    for (const message of file.messages) {
      const error = message.severity === 2 || message.fatal === true;
      problems.push({
        file: file.filePath,
        line: message.line,
        column: message.column,
        severity: error ? 'error' : 'warning',
        rule: message.ruleId || (message.fatal ? 'Parse Error' : ''),
        message: message.message,
      });
    }
  }
  return problems;
}

module.exports = { readLint };
