/**
 * Specs for the step that typechecks each project.
 *
 * The output below is shaped from real tsc 5 runs with --pretty false. What is worth pinning is that every
 * project runs even after one fails, that an explanation spanning several lines stays with its error, and
 * that a project error with no file still lands somewhere a reader can find.
 */
import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fakeCore, fakeExec } from '../../../shared/fakes.js';
import verifyTypecheck from './verify-typecheck.js';

const PROJECTS = 'tsconfig.json\nconfig/tsconfig.tools.json\n\nconfig/tsconfig.spec.json\n';

const TOOLS_ERRORS = [
  "tools/faces.ts(12,5): error TS2345: Argument of type '{ a: number; }' is not assignable to parameter of type 'Face'.",
  "  Property 'name' is missing in type '{ a: number; }' but required in type 'Face'.",
  "tools/paths.ts(3,7): error TS2322: Type 'string' is not assignable to type 'number'.",
].join('\n');

async function verify(answers) {
  const core = fakeCore();
  const exec = fakeExec(({ args }) => answers[args[2]] || {});
  await verifyTypecheck({ core, exec });
  return { core, exec };
}

beforeEach(() => {
  vi.stubEnv('PROJECTS', PROJECTS);
  // the project paths are names the fake stands behind, not files on the machine running the specs
  vi.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('verify-typecheck', () => {
  /** Stopping at the first failing project, the way npm run typecheck does, hides every error in the ones after it. */
  test('runs every project even after one fails', async () => {
    const { exec } = await verify({ 'config/tsconfig.tools.json': { exitCode: 2, stdout: TOOLS_ERRORS } });

    const projects = exec.getExecOutput.mock.calls.map(([, args]) => args[2]);
    expect(projects).toEqual(['tsconfig.json', 'config/tsconfig.tools.json', 'config/tsconfig.spec.json']);
  });

  /** A type error that loses its second line loses the part that says which property is missing. */
  test('annotates each error on its line with its full explanation', async () => {
    const { core } = await verify({ 'config/tsconfig.tools.json': { exitCode: 2, stdout: TOOLS_ERRORS } });

    expect(core.error).toHaveBeenCalledWith(
      "Argument of type '{ a: number; }' is not assignable to parameter of type 'Face'.\nProperty 'name' is missing in type '{ a: number; }' but required in type 'Face'.",
      { title: 'TS2345', file: 'tools/faces.ts', startLine: 12, startColumn: 5 }
    );
    expect(core.setFailed).toHaveBeenCalledWith('2 type error(s) in 1 of 3 project(s).');
  });

  /** A project error has no file of its own, and an annotation with none would not say which tsconfig broke. */
  test('puts a project-level error on the project file', async () => {
    const { core } = await verify({
      'config/tsconfig.spec.json': { exitCode: 1, stdout: "error TS5058: The specified path does not exist: 'config/missing.json'." },
    });

    expect(core.error).toHaveBeenCalledWith("The specified path does not exist: 'config/missing.json'.", {
      title: 'TS5058',
      file: 'config/tsconfig.spec.json',
      startLine: undefined,
      startColumn: undefined,
    });
  });

  /** A crash in tsc itself prints no error line, and without its output the summary would show a failure with no reason. */
  test('puts the output of a project that failed without a type error on the summary', async () => {
    const { core } = await verify({ 'tsconfig.json': { exitCode: 1, stderr: 'RangeError: Maximum call stack size exceeded' } });

    expect(core.summary.addRaw.mock.calls[0][0]).toContain('Maximum call stack size exceeded');
    expect(core.setFailed).toHaveBeenCalledWith('0 type error(s) in 1 of 3 project(s).');
  });

  /** An empty projects input would check nothing and pass, so a typo in the workflow would switch typecheck off. */
  test('refuses an empty list of projects', async () => {
    vi.stubEnv('PROJECTS', '\n  \n');

    const { core, exec } = await verify({});

    expect(core.setFailed).toHaveBeenCalledWith('No projects to check. Pass one tsconfig per line in projects.');
    expect(exec.getExecOutput).not.toHaveBeenCalled();
  });

  /** A clean typecheck has to pass. */
  test('passes when every project typechecks', async () => {
    const { core } = await verify({});

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.info).toHaveBeenCalledWith('All 3 projects typecheck.');
  });
});
