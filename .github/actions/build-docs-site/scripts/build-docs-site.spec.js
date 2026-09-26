/**
 * Specs for the step that builds the docs site around the Doxygen pages.
 *
 * The TypeDoc lines below are shaped from real TypeDoc 0.28 runs, colours included. What is worth pinning
 * is that a TypeDoc warning fails the build and lands on the file it names, that a failing spec in either
 * coverage run fails it too, that one failure does not hide another, and that a missing coverage report
 * reads as no report on the summary rather than breaking the step.
 */
import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fakeCore, fakeExec } from '../../../shared/fakes.js';
import buildDocsSite from './build-docs-site.js';

const ESC = String.fromCharCode(27);

const TYPEDOC_WARNINGS = [
  `${ESC}[93m[warning]${ESC}[0m StartOptions, defined in pebble-app-framework/ts/pkjs/app.ts, is referenced by pkjs/app.default.__type.startPebbleApp.__type.options but not included in the documentation`,
  `${ESC}[93m[warning]${ESC}[0m The entry point ../ts/missing.ts does not exist`,
  `${ESC}[93m[warning]${ESC}[0m Found 0 errors and 2 warnings`,
  // with treatWarningsAsErrors on, TypeDoc closes with this, and it is no warning of its own
  `${ESC}[91m[error]${ESC}[0m html output could not be generated due to the errors above`,
].join('\n');

const SUMMARIES = {
  'docs/site/dist/coverage/ts/coverage-summary.json': JSON.stringify({ total: { lines: { pct: 77.14 } } }),
  'docs/site/dist/coverage/c/summary.json': JSON.stringify({ line_percent: 97.66 }),
};

/** Runs the step with each tool answering from `results`, keyed by the tool's name. */
async function build({ results = {}, summaries = SUMMARIES } = {}) {
  const readFileSync = fs.readFileSync;
  vi.spyOn(fs, 'readFileSync').mockImplementation((file, ...rest) => {
    if (typeof file === 'string' && file.startsWith('docs/site/dist/')) {
      if (!(file in summaries)) {
        throw Object.assign(new Error(`ENOENT: ${file}`), { code: 'ENOENT' });
      }
      return summaries[file];
    }
    return readFileSync(file, ...rest);
  });

  const core = fakeCore();
  const tool = (command, args) => (command === 'node' ? 'typedoc' : command === 'npx' ? args[1] : command);
  const exec = fakeExec(({ command, args }) => results[tool(command, args)] || {});
  await buildDocsSite({ core, exec });
  return { core, exec };
}

beforeEach(() => {
  vi.stubEnv('GITHUB_WORKSPACE', '/home/runner/work/engine/engine');
  vi.stubEnv('TYPEDOC_OPTIONS', 'config/typedoc.json');
  vi.stubEnv('VITEST_CONFIG', 'config/vitest.config.ts');
  // the two config paths are names the fake stands behind, not files on the machine running the specs
  vi.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('build-docs-site', () => {
  /** A clean build has to pass and show both figures, since it is the only one that publishes. */
  test('passes a clean build and puts both coverage figures on the summary', async () => {
    const { core } = await build();

    const summary = core.summary.addRaw.mock.calls[0][0];
    expect(core.setFailed).not.toHaveBeenCalled();
    expect(summary).toContain('| TypeDoc | built with no warnings |');
    expect(summary).toContain('| TypeScript coverage | 77.1% of lines |');
    expect(summary).toContain('| C coverage | 97.6% of lines |');
  });

  /** The pages read both coverage reports, so they have to be built after both runs and not before. */
  test('builds the pages last', async () => {
    const { exec } = await build();

    const commands = exec.getExecOutput.mock.calls.map(([command, args]) => `${command} ${args[0]}`);
    expect(commands).toEqual(['node docs/node_modules/typedoc/bin/typedoc', 'npx --no-install', 'make -C', 'npm --prefix']);
  });

  /** An unexported type is the warning TypeDoc is set to catch, and it has to point at the file to fix. */
  test('annotates a TypeDoc warning on the file it names and fails the build', async () => {
    const { core } = await build({ results: { typedoc: { exitCode: 4, stdout: TYPEDOC_WARNINGS } } });

    expect(core.warning).toHaveBeenCalledWith(
      'StartOptions, defined in pebble-app-framework/ts/pkjs/app.ts, is referenced by pkjs/app.default.__type.startPebbleApp.__type.options but not included in the documentation',
      { title: 'TypeDoc Warning', file: 'ts/pkjs/app.ts' }
    );
    expect(core.setFailed).toHaveBeenCalledWith('TypeDoc reported 2 warning(s). The docs only publish from a build with none.');
  });

  /** A broken link in a doc comment names its file and line first, and it landed on the options file with no line. */
  test('puts a TypeDoc warning on the line it names', async () => {
    const output = `./ts/pkjs/app.ts:42:4 - ${ESC}[93m[warning]${ESC}[0m Failed to resolve link to "Foo" in comment for bar`;

    const { core } = await build({ results: { typedoc: { exitCode: 4, stdout: output } } });

    expect(core.warning).toHaveBeenCalledWith('Failed to resolve link to "Foo" in comment for bar', { title: 'TypeDoc Warning', file: 'ts/pkjs/app.ts', startLine: 42 });
  });

  /** A type error TypeDoc passed on landed on the options file with no line, so the reader had to hunt for it. */
  test('puts a TypeScript error TypeDoc passes on at its line', async () => {
    const output = `${ESC}[91m[error]${ESC}[0m ./ts/pkjs/app.ts:42:5 - error TS2322: Type 'string' is not assignable to type 'number'.`;

    const { core } = await build({ results: { typedoc: { exitCode: 4, stdout: output } } });

    expect(core.error).toHaveBeenCalledWith("TS2322: Type 'string' is not assignable to type 'number'.", { title: 'TypeDoc Error', file: 'ts/pkjs/app.ts', startLine: 42 });
  });

  /** A warning that names no file would be dropped by GitHub, so it lands on the options file instead. */
  test('puts a TypeDoc warning with no file on the options file', async () => {
    const { core } = await build({ results: { typedoc: { exitCode: 4, stdout: TYPEDOC_WARNINGS } } });

    expect(core.warning).toHaveBeenCalledWith('The entry point ../ts/missing.ts does not exist', { title: 'TypeDoc Warning', file: 'config/typedoc.json' });
  });

  /** A TypeDoc that crashed after a warning showed only the warning, so the reason it stopped never reached the summary. */
  test('puts the output on the summary when TypeDoc stops past its warnings', async () => {
    const output = `${ESC}[93m[warning]${ESC}[0m The entry point ../ts/missing.ts does not exist\nRangeError: Maximum call stack size exceeded`;

    const { core } = await build({ results: { typedoc: { exitCode: 7, stdout: output } } });

    expect(core.summary.addRaw.mock.calls[0][0]).toContain('Maximum call stack size exceeded');
  });

  /** A type from a scoped package named a file outside the repo, and GitHub dropped the annotation without a word. */
  test('puts a TypeDoc warning about a file outside the repo on the options file', async () => {
    fs.statSync.mockImplementation((file) => (String(file).startsWith('clay/') ? undefined : { isFile: () => true }));
    const output = '[warning] ClayConfig, defined in @rebble/clay/index.d.ts, is referenced by ts/pkjs/app.ts but not included in the documentation';

    const { core } = await build({ results: { typedoc: { exitCode: 4, stdout: output } } });

    expect(core.warning).toHaveBeenCalledWith(expect.any(String), { title: 'TypeDoc Warning', file: 'config/typedoc.json' });
  });

  /** A failing spec makes the coverage run exit nonzero, and publishing then would hide a red suite. */
  test('fails when a coverage run fails', async () => {
    const { core } = await build({ results: { vitest: { exitCode: 1, stdout: 'Tests  1 failed | 777 passed' } } });

    expect(core.setFailed).toHaveBeenCalledWith('Vitest exited 1 while measuring coverage. The summary shows the end of its output.');
    expect(core.summary.addRaw.mock.calls[0][0]).toContain('Tests  1 failed | 777 passed');
  });

  /** Stopping at the first failure would make a second push just to find the next one. */
  test('reports every part that failed in one run', async () => {
    const { core } = await build({
      results: {
        typedoc: { exitCode: 4, stdout: TYPEDOC_WARNINGS },
        make: { exitCode: 2, stderr: 'GCOV could not find source file' },
      },
    });

    expect(core.setFailed).toHaveBeenCalledWith(
      'TypeDoc reported 2 warning(s). The docs only publish from a build with none. make -C c/spec coverage exited 2, so a C spec or gcovr failed.'
    );
  });

  /** A coverage run that wrote nothing should read as missing on the summary, not crash the step that explains why. */
  test('shows a missing coverage report as no report', async () => {
    const { core } = await build({ summaries: {} });

    const summary = core.summary.addRaw.mock.calls[0][0];
    expect(summary).toContain('| TypeScript coverage | no report |');
    expect(summary).toContain('| C coverage | no report |');
  });
});
