/**
 * Specs for the helpers every action script shares.
 *
 * repoPath decides where every annotation lands, so a path it gets wrong puts a failure on no line or on
 * the wrong file. step decides whether a failing check reads as a plain failure or as a crash in the
 * script. existingPath is what stops a mistyped input reaching a tool. Those are what is worth pinning.
 */
import fs from 'node:fs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { fakeCore } from './fakes.js';
import { existingPath, fail, fenceFor, markdownTable, repoPath, step } from './lib.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('step', () => {
  /** A failing check would otherwise show as a crash in the script, with a stack trace nobody needs. */
  test('fails the step with the plain message of an expected failure', async () => {
    const core = fakeCore();

    await step(async () => fail('2 test(s) failed.'))({ core });

    expect(core.setFailed).toHaveBeenCalledWith('2 test(s) failed.');
  });

  /** A bug in the script passed off as a failing check would hide the stack trace that explains it. */
  test('lets a real crash through with its stack trace', async () => {
    const core = fakeCore();

    const run = step(async () => {
      throw new TypeError('cannot read properties of undefined');
    })({ core });

    await expect(run).rejects.toThrow('cannot read properties of undefined');
    expect(core.setFailed).not.toHaveBeenCalled();
  });
});

describe('repoPath', () => {
  /** ESLint and Vitest print absolute paths, and an annotation with the runner's workspace in front lands on no file. */
  test('drops the workspace from an absolute path inside it', () => {
    vi.stubEnv('GITHUB_WORKSPACE', '/home/runner/work/engine/engine');

    const result = repoPath('/home/runner/work/engine/engine/ts/stock/cache.spec.ts');

    expect(result).toBe('ts/stock/cache.spec.ts');
  });

  /** gcc and Unity print paths relative to c/spec, and left that way every C failure would point outside the repo. */
  test('joins a relative path onto the folder the tool ran in', () => {
    const result = repoPath('../core/math/pct.spec.c', 'c/spec');

    expect(result).toBe('c/core/math/pct.spec.c');
  });

  /** A local run on Windows prints backslashes and can change the drive letter's case, and neither may stop the match. */
  test('matches a Windows workspace whatever the slashes and the drive letter case', () => {
    vi.stubEnv('GITHUB_WORKSPACE', 'C:\\Temp\\engine');

    const result = repoPath('c:/Temp/engine/tools/faces.ts');

    expect(result).toBe('tools/faces.ts');
  });
});

describe('existingPath', () => {
  /** A path out of the checkout would point a tool at something other than this repo. */
  test.each([['..'], ['../elsewhere'], ['/etc/passwd'], ['C:/Windows']])("refuses '%s'", (given) => {
    const call = () => existingPath(given, 'config');

    expect(call).toThrow(`config '${given}' has to be a relative path inside the repo.`);
  });

  /** A mistyped input would otherwise surface as the tool's own confusing error, which never names the input. */
  test('refuses a path that is not there', () => {
    vi.spyOn(fs, 'statSync').mockReturnValue(undefined);

    const call = () => existingPath('config/missing.ts', 'config');

    expect(call).toThrow("config 'config/missing.ts' does not exist.");
  });
});

describe('fenceFor', () => {
  /** A doc comment's own ``` line would close a same-length fence and spill the rest of the output into the summary as markdown. */
  test('makes the fence longer than any run of backticks in the text', () => {
    const result = fenceFor('/**\n * ```c\n * x = 1\n * ````\n */');

    expect(result).toBe('`````');
  });
});

describe('markdownTable', () => {
  /** A message holding a | would split its row and push every later cell into the wrong column on the summary. */
  test('escapes a | inside a cell', () => {
    const result = markdownTable(['Message'], [['a | b']]);

    expect(result).toBe('| Message |\n| --- |\n| a \\| b |');
  });
});
