/**
 * Builds everything on the docs site that Doxygen does not.
 *
 * That is the TypeScript docs from TypeDoc, a coverage report for each test suite, and the site's own pages,
 * run in that order since the pages read both coverage reports. Each part runs even when one before it
 * failed, so one run shows every problem, and the step fails at the end if any part did. Every TypeDoc
 * warning fails the build, since the site only publishes from a build with none.
 */
const fs = require('fs');
const { fail, step, existingPath, firstLine, markdownTable, outputTail } = require('../../../shared/lib');
const { readTypedocWarnings, readVitestLines, readGcovrLines } = require('./lib');

const SITE = 'docs/site/dist';
const TS_COVERAGE = `${SITE}/coverage/ts`;
const TS_SUMMARY = `${TS_COVERAGE}/coverage-summary.json`;
const C_SUMMARY = `${SITE}/coverage/c/summary.json`;

/** A summary a coverage run did not write, or wrote badly, reads as null and shows as no report. */
function readSummary(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function figure(percent) {
  return percent === null ? 'no report' : `${percent.toFixed(1)}% of lines`;
}

module.exports = step(async ({ core, exec }) => {
  const typedocOptions = existingPath(process.env.TYPEDOC_OPTIONS || 'config/typedoc.json', 'typedoc-options');
  const vitestConfig = existingPath(process.env.VITEST_CONFIG || 'config/vitest.config.ts', 'vitest-config');

  // each part that fails leaves its message for the step and its output for the summary
  const problems = [];
  const run = async (title, command, args) => {
    const result = await core.group(`${command} ${args.join(' ')}`, () => exec.getExecOutput(command, args, { ignoreReturnCode: true }));
    return { title, ...result };
  };

  // TypeDoc lives in the docs package's own install, so it runs from there by path
  const typedoc = await run('TypeDoc', 'node', ['docs/node_modules/typedoc/bin/typedoc', '--options', typedocOptions]);
  const warnings = readTypedocWarnings(`${typedoc.stdout}\n${typedoc.stderr}`);
  const rows = warnings.map((warning) => {
    const file = warning.file || typedocOptions;
    const annotate = warning.severity === 'error' ? core.error : core.warning;
    const title = warning.severity === 'error' ? 'TypeDoc Error' : 'TypeDoc Warning';
    annotate(warning.message, { title, file });
    return [file, warning.severity, firstLine(warning.message)];
  });
  if (warnings.length > 0) {
    problems.push({ message: `TypeDoc reported ${warnings.length} warning(s). The docs only publish from a build with none.` });
  } else if (typedoc.exitCode !== 0) {
    problems.push({ message: `TypeDoc exited ${typedoc.exitCode}.`, output: typedoc });
  }

  const vitest = await run('TypeScript Coverage', 'npx', ['vitest', 'run', '--config', vitestConfig, '--coverage', `--coverage.reportsDirectory=${TS_COVERAGE}`]);
  if (vitest.exitCode !== 0) {
    problems.push({ message: `Vitest exited ${vitest.exitCode} while measuring coverage, so a spec failed.`, output: vitest });
  }

  const make = await run('C Coverage', 'make', ['-C', 'c/spec', 'coverage']);
  if (make.exitCode !== 0) {
    problems.push({ message: `make -C c/spec coverage exited ${make.exitCode}, so a C spec or gcovr failed.`, output: make });
  }

  const pages = await run('Site Pages', 'npm', ['--prefix', 'docs', 'run', 'site']);
  if (pages.exitCode !== 0) {
    problems.push({ message: `npm run docs:site exited ${pages.exitCode}.`, output: pages });
  }

  const summary = [
    '## Docs Site',
    '',
    markdownTable(['Part', 'Result'], [
      ['TypeDoc', warnings.length > 0 ? `${warnings.length} warning(s)` : typedoc.exitCode === 0 ? 'built with no warnings' : 'failed'],
      ['TypeScript coverage', figure(readVitestLines(readSummary(TS_SUMMARY)))],
      ['C coverage', figure(readGcovrLines(readSummary(C_SUMMARY)))],
      ['Site pages', pages.exitCode === 0 ? 'built' : 'failed'],
    ]),
  ];
  if (rows.length > 0) {
    summary.push('', '### TypeDoc Warnings', '', markdownTable(['Where', 'Severity', 'Message'], rows));
  }
  for (const problem of problems.filter((each) => each.output)) {
    summary.push('', `### ${problem.output.title}`, '', outputTail(`${problem.output.stdout}\n${problem.output.stderr}`));
  }
  await core.summary.addRaw(summary.join('\n'), true).write();

  if (problems.length > 0) {
    fail(problems.map((problem) => problem.message).join(' '));
  }
  core.info('Built the docs site with no warnings.');
});
