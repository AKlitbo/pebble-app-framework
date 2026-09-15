/**
 * Runs Vitest and reports every failing test on its line.
 *
 * Vitest prints its usual output to the log and writes a JSON report alongside, and the report is what
 * this reads, since it carries each failure's file and line without scraping the log. A run that never
 * wrote a report never got as far as the specs, such as a broken config, so its output goes on the summary
 * instead.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fail, step, repoPath, existingPath, markdownTable, outputTail } = require('../../../shared/lib');
const { readReport } = require('./lib');

module.exports = step(async ({ core, exec }) => {
  const config = existingPath(process.env.VITEST_CONFIG || 'config/vitest.config.ts', 'config');

  // a report left from an earlier run on the same runner would pass for this one, so it goes first
  const results = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'vitest-results.json');
  fs.rmSync(results, { force: true });

  const args = [
    'vitest',
    'run',
    '--config',
    config,
    '--reporter=default',
    '--reporter=json',
    `--outputFile.json=${results}`,
    '--includeTaskLocation',
  ];
  const run = await core.group('vitest run', () => exec.getExecOutput('npx', args, { ignoreReturnCode: true }));

  if (!fs.existsSync(results)) {
    await core.summary.addRaw(`## Vitest Could Not Run\n\n${outputTail([run.stdout, run.stderr].join('\n'))}`, true).write();
    fail(`Vitest exited ${run.exitCode} without writing its results, so it never got as far as running the specs.`);
  }

  const { counts, failures } = readReport(JSON.parse(fs.readFileSync(results, 'utf8')));

  const rows = failures.map((failure) => {
    const file = repoPath(failure.file);
    core.error(failure.message, { title: failure.name, file, startLine: failure.line });
    return [failure.line ? `${file}:${failure.line}` : file, failure.name, failure.message];
  });

  const summary = [
    '## Vitest',
    '',
    markdownTable(
      ['Spec Files', 'Failed Files', 'Tests', 'Passed', 'Failed', 'Skipped'],
      [[counts.files, counts.failedFiles, counts.tests, counts.passedTests, counts.failedTests, counts.skippedTests]]
    ),
  ];
  if (rows.length > 0) {
    summary.push('', '### Failures', '', markdownTable(['Where', 'Test', 'Message'], rows));
  }
  await core.summary.addRaw(summary.join('\n'), true).write();

  if (failures.length > 0 || run.exitCode !== 0) {
    fail(`${counts.failedTests} test(s) failed across ${counts.failedFiles} spec file(s), and Vitest exited ${run.exitCode}.`);
  }
  core.info(`All ${counts.passedTests} tests in ${counts.files} spec files passed, with ${counts.skippedTests} skipped.`);
});
