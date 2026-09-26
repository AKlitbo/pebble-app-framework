/**
 * Runs ESLint over the repo and reports every error and warning on its line.
 *
 * ESLint prints JSON here rather than its usual formatter, so each problem arrives with its file and place
 * already split out. The JSON is not readable in a log, so each problem is also written there as one line.
 * Output that is not JSON means ESLint never got as far as linting, such as a broken config, and that output
 * goes on the summary instead.
 */
const { fail, step, repoPath, existingPath, markdownTable, outputTail } = require('../../../shared/lib');
const { readLint } = require('./lib');

module.exports = step(async ({ core, exec }) => {
  const config = existingPath(process.env.ESLINT_CONFIG || 'config/eslint.config.ts', 'config');

  // silent, since the JSON would bury the log. each problem is written back out below as its own line
  const run = await exec.getExecOutput('npx', ['--no-install', 'eslint', '.', '--config', config, '--format', 'json'], {
    ignoreReturnCode: true,
    silent: true,
  });

  let results;
  try {
    results = JSON.parse(run.stdout);
  } catch {
    await core.summary.addRaw(`## ESLint Could Not Run\n\n${outputTail([run.stdout, run.stderr].join('\n'))}`, true).write();
    fail(`ESLint exited ${run.exitCode} without printing its results, so it never got as far as linting.`);
  }

  const problems = readLint(results);
  const rows = problems.map((problem) => {
    const file = repoPath(problem.file);
    const annotate = problem.severity === 'error' ? core.error : core.warning;
    annotate(problem.message, { title: problem.rule, file, startLine: problem.line, startColumn: problem.column });
    core.info(`${file}:${problem.line}:${problem.column} ${problem.severity} ${problem.message} (${problem.rule})`);
    return [`${file}:${problem.line}:${problem.column}`, problem.severity, problem.rule, problem.message];
  });

  const errors = problems.filter((problem) => problem.severity === 'error').length;
  const warnings = problems.length - errors;

  const summary = ['## ESLint', '', markdownTable(['Files', 'Errors', 'Warnings'], [[results.length, errors, warnings]])];
  if (rows.length > 0) {
    summary.push('', '### Problems', '', markdownTable(['Where', 'Severity', 'Rule', 'Message'], rows));
  }
  await core.summary.addRaw(summary.join('\n'), true).write();

  if (errors > 0 || run.exitCode !== 0) {
    fail(`ESLint reported ${errors} error(s) and ${warnings} warning(s), and exited ${run.exitCode}.`);
  }
  core.info(`ESLint passed over ${results.length} files with ${warnings} warning(s).`);
});
