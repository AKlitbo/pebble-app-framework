/**
 * Builds the docs with Doxygen and reports every warning on the line it names.
 *
 * The Doxyfile is written for a recent Doxygen, and an older one quietly ignores the settings it does not
 * know and builds different docs, so the version on the path is checked against the one asked for first.
 * Any warning fails the build, since the published docs are meant to have none.
 */
const { fail, step, repoPath, existingPath, firstLine, markdownTable, outputTail } = require('../../../shared/lib');
const { readWarnings } = require('./lib');

module.exports = step(async ({ core, exec }) => {
  const wanted = process.env.VERSION;
  const doxyfile = existingPath(process.env.DOXYFILE || 'Doxyfile', 'doxyfile');

  let version;
  try {
    version = await exec.getExecOutput('doxygen', ['--version'], { ignoreReturnCode: true, silent: true });
  } catch (error) {
    // a command missing from the path throws rather than exiting, so the real reason goes in the message
    fail(`doxygen could not run, so Doxygen is not installed on the path. ${error.message}`);
  }
  if (version.exitCode !== 0) {
    fail(`doxygen --version exited ${version.exitCode}, so Doxygen is not installed on the path.`);
  }
  // 1.18.0 (8e760943e5d9581a444cf327f43a0b4d20d29482)
  const found = version.stdout.trim().split(/\s+/)[0];
  if (wanted && found !== wanted) {
    fail(`Doxygen ${found} is on the path, but ${wanted} was asked for. An older Doxygen ignores the settings it does not know.`);
  }

  const run = await core.group(`doxygen ${doxyfile}`, () => exec.getExecOutput('doxygen', [doxyfile], { ignoreReturnCode: true }));
  const warnings = readWarnings(run.stderr);

  const rows = warnings.map((warning) => {
    const file = warning.file ? repoPath(warning.file) : doxyfile;
    const annotate = warning.severity === 'error' ? core.error : core.warning;
    const title = warning.severity === 'error' ? 'Doxygen Error' : 'Doxygen Warning';
    annotate(warning.message, { title, file, startLine: warning.line });
    return [warning.line ? `${file}:${warning.line}` : file, warning.severity, firstLine(warning.message)];
  });

  // a warning alone never stops Doxygen, so a nonzero exit is something else, and its reason prints in some
  // other shape. the end of the output goes on the summary, whether or not warnings came before it
  const stopped = run.exitCode !== 0;
  const stoppedHow = warnings.length === 0 ? 'without a warning line' : `after ${warnings.length} warning(s)`;
  const outcome = stopped ? `Exited ${run.exitCode} ${stoppedHow}.` : warnings.length > 0 ? `Built with ${warnings.length} warning(s).` : 'Built with no warnings.';
  const summary = [`## Doxygen ${found}`, '', outcome];
  if (rows.length > 0) {
    summary.push('', markdownTable(['Where', 'Severity', 'Message'], rows));
  }
  if (stopped) {
    summary.push('', outputTail([run.stdout, run.stderr].join('\n')));
  }
  await core.summary.addRaw(summary.join('\n'), true).write();

  if (stopped) {
    fail(`Doxygen exited ${run.exitCode} ${stoppedHow}. The summary shows the end of its output.`);
  }
  if (warnings.length > 0) {
    fail(`Doxygen reported ${warnings.length} warning(s). The docs only publish from a build with none.`);
  }
  core.info('Doxygen built the docs with no warnings.');
});
