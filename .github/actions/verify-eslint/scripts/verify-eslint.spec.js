/**
 * Specs for the step that runs ESLint.
 *
 * The results below are shaped from a real ESLint 10 run with the JSON formatter. What is worth pinning is
 * that errors fail the step while warnings alone do not, that each problem lands on its line in the repo,
 * and that output which is not JSON fails as a broken run rather than as a clean one.
 */
import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fakeCore, fakeExec } from '../../../shared/fakes.js';
import verifyEslint from './verify-eslint.js';

const WORKSPACE = '/home/runner/work/engine/engine';

const RESULTS = [
  { filePath: `${WORKSPACE}/config/vitest.config.ts`, messages: [], errorCount: 0, warningCount: 0 },
  {
    filePath: `${WORKSPACE}/tools/faces.ts`,
    messages: [
      { ruleId: 'no-unused-vars', severity: 2, message: "'unused' is assigned a value but never used.", line: 1, column: 7 },
      { ruleId: 'eqeqeq', severity: 1, message: "Expected '===' and instead saw '=='.", line: 2, column: 7 },
    ],
    errorCount: 1,
    warningCount: 1,
  },
  {
    filePath: `${WORKSPACE}/tools/broken.ts`,
    messages: [{ ruleId: null, fatal: true, severity: 2, message: "Parsing error: ';' expected.", line: 4, column: 12 }],
    errorCount: 1,
    warningCount: 0,
  },
];

const WARNINGS_ONLY = [
  { filePath: `${WORKSPACE}/tools/faces.ts`, messages: [RESULTS[1].messages[1]], errorCount: 0, warningCount: 1 },
];

async function verify(result) {
  const core = fakeCore();
  const exec = fakeExec(() => result);
  await verifyEslint({ core, exec });
  return { core, exec };
}

beforeEach(() => {
  vi.stubEnv('GITHUB_WORKSPACE', WORKSPACE);
  vi.stubEnv('ESLINT_CONFIG', 'config/eslint.config.ts');
  // the config path is a name the fake stands behind, not a file on the machine running the specs
  vi.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('verify-eslint', () => {
  /** The repo's own config decides every rule, and the default formatter would leave nothing to parse. */
  test('lints the repo with its config and asks for JSON', async () => {
    const { exec } = await verify({ exitCode: 0, stdout: '[]' });

    expect(exec.getExecOutput).toHaveBeenCalledWith('npx', ['--no-install', 'eslint', '.', '--config', 'config/eslint.config.ts', '--format', 'json'], {
      ignoreReturnCode: true,
      silent: true,
    });
  });

  /** A problem without its line makes someone rerun lint locally just to find where it is. */
  test('annotates errors and warnings on their line in the repo', async () => {
    const { core } = await verify({ exitCode: 1, stdout: JSON.stringify(RESULTS) });

    expect(core.error).toHaveBeenCalledWith("'unused' is assigned a value but never used.", {
      title: 'no-unused-vars',
      file: 'tools/faces.ts',
      startLine: 1,
      startColumn: 7,
    });
    expect(core.warning).toHaveBeenCalledWith("Expected '===' and instead saw '=='.", {
      title: 'eqeqeq',
      file: 'tools/faces.ts',
      startLine: 2,
      startColumn: 7,
    });
  });

  /** A file ESLint could not parse has no rule, and dropping it would let a syntax error through lint. */
  test('counts a parse error as an error', async () => {
    const { core } = await verify({ exitCode: 1, stdout: JSON.stringify(RESULTS) });

    expect(core.error).toHaveBeenCalledWith("Parsing error: ';' expected.", expect.objectContaining({ title: 'Parse Error', file: 'tools/broken.ts' }));
    expect(core.setFailed).toHaveBeenCalledWith('ESLint reported 2 error(s) and 1 warning(s), and exited 1.');
  });

  /** ESLint exits cleanly on warnings, so failing on them here would block a change lint itself passes. */
  test('passes when there are only warnings', async () => {
    const { core } = await verify({ exitCode: 0, stdout: JSON.stringify(WARNINGS_ONLY) });

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.info).toHaveBeenCalledWith('ESLint passed over 1 files with 1 warning(s).');
  });

  /** ESLint can print clean results and still exit with an error, and only the exit code says the run went wrong. */
  test('fails when ESLint exits with an error even though it reported no problems', async () => {
    const { core } = await verify({ exitCode: 2, stdout: '[]' });

    expect(core.setFailed).toHaveBeenCalledWith('ESLint reported 0 error(s) and 0 warning(s), and exited 2.');
  });

  /** A broken config prints a stack trace instead of JSON, and reading that as no problems would pass a repo nobody linted. */
  test('fails when ESLint prints something other than its results', async () => {
    const { core } = await verify({ exitCode: 2, stdout: '', stderr: 'Oops! Something went wrong! :(\nError: Cannot find module' });

    expect(core.setFailed).toHaveBeenCalledWith('ESLint exited 2 without printing its results, so it never got as far as linting.');
    expect(core.summary.addRaw.mock.calls[0][0]).toContain('Something went wrong');
  });
});
