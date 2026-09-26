/**
 * Runs tsc over each project and reports every type error on its line.
 *
 * Each project runs on its own and the run keeps going past a failure, so a single run shows every error.
 * Each error lands as an annotation on its line, with the totals for each project on the job summary. A
 * project that exits with an error but prints nothing tsc-shaped goes on the summary with its output.
 */
const fs = require('node:fs');
const { fail, step, repoPath, insideRepo, firstLine, markdownTable, outputTail } = require('../../../shared/lib');
const { readTsc } = require('./lib');

module.exports = step(async ({ core, exec }) => {
  const projects = String(process.env.PROJECTS || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((project) => insideRepo(project, 'project'));
  if (projects.length === 0) {
    fail('No projects to check. Pass one tsconfig per line in projects.');
  }

  const results = [];
  const problems = [];
  const unreadable = [];

  for (const project of projects) {
    // a missing tsconfig is one failure among the rest, so the other projects still get checked
    if (!fs.statSync(project, { throwIfNoEntry: false })) {
      core.error(`project '${project}' does not exist.`, { title: 'Missing Project' });
      problems.push([project, 'Missing Project', 'The tsconfig does not exist.']);
      results.push({ project, exitCode: 1, errors: 1 });
      continue;
    }
    const run = await core.group(`tsc -p ${project}`, () =>
      exec.getExecOutput('npx', ['--no-install', 'tsc', '-p', project, '--pretty', 'false'], { ignoreReturnCode: true })
    );
    const errors = readTsc([run.stdout, run.stderr].join('\n'));

    for (const error of errors) {
      const file = error.file ? repoPath(error.file) : project;
      core.error(error.message, { title: error.code, file, startLine: error.line, startColumn: error.column });
      problems.push([error.line ? `${file}:${error.line}:${error.column}` : file, error.code, firstLine(error.message)]);
    }

    if (run.exitCode !== 0 && errors.length === 0) {
      unreadable.push(`### ${project}\n\n${outputTail([run.stdout, run.stderr].join('\n'))}`);
    }
    results.push({ project, exitCode: run.exitCode, errors: errors.length });
  }

  const failed = results.filter((result) => result.exitCode !== 0);
  const rows = results.map((result) => {
    const outcome = result.exitCode === 0 ? 'Passed' : `${result.errors} error(s), exited ${result.exitCode}`;
    return [result.project, outcome];
  });

  const summary = ['## Typecheck', '', markdownTable(['Project', 'Result'], rows)];
  if (problems.length > 0) {
    summary.push('', '### Errors', '', markdownTable(['Where', 'Code', 'Message'], problems));
  }
  if (unreadable.length > 0) {
    summary.push('', '## Projects That Failed Without a Type Error', '', ...unreadable);
  }
  await core.summary.addRaw(summary.join('\n'), true).write();

  if (failed.length > 0) {
    fail(`${problems.length} type error(s) in ${failed.length} of ${projects.length} project(s).`);
  }
  core.info(`All ${projects.length} projects typecheck.`);
});
