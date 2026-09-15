/**
 * Builds the docs with Doxygen and reports every warning on the line it names.
 *
 * The Doxyfile is written for a recent Doxygen, and an older one quietly ignores the settings it does not
 * know and builds different docs, so the version on the path is checked against the one asked for first.
 * Any warning fails the build, since the published docs are meant to have none.
 */
const { fail, step, repoPath, existingPath, firstLine, markdownTable } = require('../../../shared/lib');
const { readWarnings } = require('./lib');

module.exports = step(async ({ core, exec }) => {
  const wanted = process.env.VERSION;
  const doxyfile = existingPath(process.env.DOXYFILE || 'Doxyfile', 'doxyfile');

  const version = await exec.getExecOutput('doxygen', ['--version'], { ignoreReturnCode: true, silent: true });
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

  const summary = [`## Doxygen ${found}`, '', warnings.length === 0 ? 'Built with no warnings.' : `Built with ${warnings.length} warning(s).`];
  if (rows.length > 0) {
    summary.push('', markdownTable(['Where', 'Severity', 'Message'], rows));
  }
  await core.summary.addRaw(summary.join('\n'), true).write();

  if (run.exitCode !== 0) {
    fail(`Doxygen exited ${run.exitCode}.`);
  }
  if (warnings.length > 0) {
    fail(`Doxygen reported ${warnings.length} warning(s). The docs only publish from a build with none.`);
  }
  core.info('Doxygen built the docs with no warnings.');
});
