/**
 * Runs the host C suite and reports every failing test, and every spec that did not build or finish.
 *
 * A failing test becomes an error annotation on its line, and gcc's errors and warnings land on the lines
 * gcc names. A spec that stopped before printing its counter is named on its own, since a crash leaves no
 * line to point at. The totals go on the job summary whether the suite passed or not.
 */
const { fail, step, repoPath, markdownTable, outputTail } = require('../../../shared/lib');
const { readSuite } = require('./lib');

// the Makefile lives here, and every path the suite prints is relative to it
const SPEC_DIR = 'c/spec';

module.exports = step(async ({ core, exec }) => {
  // the headers and Unity's lines go to stdout while gcc and the shell's crash line go to stderr
  // read apart, every compiler error would land under the last spec, so both go down one stream
  const result = await core.group(`make -C ${SPEC_DIR}`, () =>
    exec.getExecOutput('bash', ['-c', `make -C ${SPEC_DIR} 2>&1`], { ignoreReturnCode: true })
  );
  const output = [result.stdout, result.stderr].join('\n');
  const specs = readSuite(output);

  if (specs.length === 0) {
    await core.summary.addRaw(`## Host C Tests Could Not Run\n\n${outputTail(output)}`, true).write();
    fail(`make -C ${SPEC_DIR} exited ${result.exitCode} without running any spec.`);
  }

  const problems = [];
  let notBuilt = 0;
  let notFinished = 0;

  for (const spec of specs) {
    for (const failure of spec.failures) {
      const file = repoPath(failure.file, SPEC_DIR);
      const message = failure.message || 'Failed.';
      core.error(message, { title: failure.test, file, startLine: failure.line });
      problems.push([`${file}:${failure.line}`, failure.test, message]);
    }

    for (const note of spec.compiler) {
      const file = repoPath(note.file, SPEC_DIR);
      const annotate = note.severity === 'error' ? core.error : core.warning;
      const title = note.severity === 'error' ? 'Compiler Error' : 'Compiler Warning';
      annotate(note.message, { title, file, startLine: note.line, startColumn: note.column });
      problems.push([note.line ? `${file}:${note.line}` : file, title, note.message]);
    }

    if (spec.counts) {
      continue;
    }
    if (spec.compiler.some((note) => note.severity === 'error')) {
      notBuilt += 1;
      continue;
    }

    notFinished += 1;
    const file = repoPath(spec.file, SPEC_DIR);
    const message = `Stopped before it reported its results.${spec.crash ? ` ${spec.crash}.` : ''}`;
    core.error(message, { title: 'Spec Did Not Finish', file });
    problems.push([file, 'Spec Did Not Finish', message]);
  }

  const ran = specs.filter((spec) => spec.counts);
  const total = (field) => ran.reduce((sum, spec) => sum + spec.counts[field], 0);
  const tests = total('tests');
  const failures = total('failures');
  const ignored = total('ignored');

  const summary = [
    '## Host C Tests',
    '',
    markdownTable(
      ['Specs', 'Tests', 'Passed', 'Failed', 'Ignored', 'Did Not Build', 'Did Not Finish'],
      [[specs.length, tests, tests - failures - ignored, failures, ignored, notBuilt, notFinished]]
    ),
  ];
  if (problems.length > 0) {
    summary.push('', '### Problems', '', markdownTable(['Where', 'What', 'Message'], problems));
  }
  await core.summary.addRaw(summary.join('\n'), true).write();

  if (failures > 0 || notBuilt > 0 || notFinished > 0) {
    fail(`${failures} test(s) failed, ${notBuilt} spec(s) did not build, and ${notFinished} spec(s) did not finish.`);
  }
  if (result.exitCode !== 0) {
    fail(`make -C ${SPEC_DIR} exited ${result.exitCode} even though every spec passed. The log shows what stopped it.`);
  }
  core.info(`All ${tests} tests in ${specs.length} specs passed.`);
});
