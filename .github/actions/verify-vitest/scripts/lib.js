/**
 * Reads the JSON report Vitest writes.
 *
 * A failing test carries its line when Vitest runs with --includeTaskLocation. A spec file that threw
 * while loading shows as a failed file with a message and no tests under it, so it is reported as the file
 * rather than as any one test.
 */
const { firstLine } = require('../../../shared/lib');

/**
 * Pulls the counts and every failure out of a Vitest JSON report.
 *
 * @param report The parsed report.
 * @return The file and test counts, and one entry per failing test or spec file that failed to load.
 */
function readReport(report) {
  const files = report.testResults || [];
  const failures = [];

  for (const file of files) {
    const failed = (file.assertionResults || []).filter((test) => test.status === 'failed');
    for (const test of failed) {
      failures.push({
        file: file.name,
        line: test.location ? test.location.line : undefined,
        name: test.fullName,
        message: firstLine(test.failureMessages && test.failureMessages[0]) || 'Failed.',
      });
    }
    if (file.status === 'failed' && failed.length === 0) {
      failures.push({ file: file.name, line: undefined, name: 'Spec File', message: firstLine(file.message) || 'Failed to run.' });
    }
  }

  return {
    counts: {
      files: files.length,
      failedFiles: files.filter((file) => file.status === 'failed').length,
      tests: report.numTotalTests || 0,
      passedTests: report.numPassedTests || 0,
      failedTests: report.numFailedTests || 0,
      skippedTests: (report.numPendingTests || 0) + (report.numTodoTests || 0),
    },
    failures,
  };
}

module.exports = { readReport };
