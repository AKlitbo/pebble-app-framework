/**
 * Specs for the step that builds the docs.
 *
 * The warnings below are shaped from real Doxygen 1.18 runs. What is worth pinning is that a warning fails
 * the build and lands on the line it names, that a warning about the Doxyfile itself still lands somewhere,
 * and that a Doxygen too old for the Doxyfile is refused before it builds different docs.
 */
import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fakeCore, fakeExec } from '../../../shared/fakes.js';
import buildDoxygen from './build-doxygen.js';

const WORKSPACE = '/home/runner/work/engine/engine';

const WARNINGS = [
  `${WORKSPACE}/c/core/math/pct.h:20: warning: Member PCT_MAX (macro definition) of file pct.h is not documented.`,
  "warning: ignoring unsupported tag 'HTML_TIMESTAMP' at line 1234, file Doxyfile",
  `${WORKSPACE}/README.md:65: warning: unable to resolve reference to 'LICENSE' for \\ref command`,
].join('\n');

async function build({ version = '1.18.0 (8e760943e5d9581a444cf327f43a0b4d20d29482)', result = {} } = {}) {
  const core = fakeCore();
  const exec = fakeExec(({ args }) => (args[0] === '--version' ? { stdout: version } : result));
  await buildDoxygen({ core, exec });
  return { core, exec };
}

beforeEach(() => {
  vi.stubEnv('GITHUB_WORKSPACE', WORKSPACE);
  vi.stubEnv('VERSION', '1.18.0');
  vi.stubEnv('DOXYFILE', 'Doxyfile');
  // the Doxyfile is a name the fake stands behind, not a file on the machine running the specs
  vi.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('build-doxygen', () => {
  /** A Doxygen missing from the path throws rather than exiting, and the run showed a stack trace with no reason. */
  test('fails with a message when doxygen is not on the path', async () => {
    const core = fakeCore();
    const exec = fakeExec(() => {
      throw new Error('Unable to locate executable file: doxygen.');
    });

    await buildDoxygen({ core, exec });

    expect(core.setFailed).toHaveBeenCalledWith('doxygen could not run, so Doxygen is not installed on the path. Unable to locate executable file: doxygen.');
  });

  /** A clean build has to pass, since it is the only one that publishes. */
  test('passes a build with no warnings', async () => {
    const { core, exec } = await build();

    expect(exec.getExecOutput).toHaveBeenCalledWith('doxygen', ['Doxyfile'], { ignoreReturnCode: true });
    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.summary.addRaw.mock.calls[0][0]).toContain('Built with no warnings.');
  });

  /** An undocumented member is the warning this whole setup exists to catch, and it has to point at the header. */
  test('annotates a warning on the line it names and fails the build', async () => {
    const { core } = await build({ result: { exitCode: 0, stderr: WARNINGS } });

    expect(core.warning).toHaveBeenCalledWith('Member PCT_MAX (macro definition) of file pct.h is not documented.', {
      title: 'Doxygen Warning',
      file: 'c/core/math/pct.h',
      startLine: 20,
    });
    expect(core.setFailed).toHaveBeenCalledWith('Doxygen reported 3 warning(s). The docs only publish from a build with none.');
  });

  /** A warning about the Doxyfile has no file of its own, and dropping it would publish docs built with a setting ignored. */
  test('puts a warning with no file on the Doxyfile', async () => {
    const { core } = await build({ result: { exitCode: 0, stderr: WARNINGS } });

    expect(core.warning).toHaveBeenCalledWith("ignoring unsupported tag 'HTML_TIMESTAMP' at line 1234, file Doxyfile", {
      title: 'Doxygen Warning',
      file: 'Doxyfile',
      startLine: undefined,
    });
  });

  /** An older Doxygen skips the settings it does not know and builds docs that look nothing like the ones checked locally. */
  test('refuses a Doxygen version other than the one asked for', async () => {
    const { core, exec } = await build({ version: '1.9.8' });

    expect(core.setFailed).toHaveBeenCalledWith('Doxygen 1.9.8 is on the path, but 1.18.0 was asked for. An older Doxygen ignores the settings it does not know.');
    expect(exec.getExecOutput).toHaveBeenCalledTimes(1);
  });

  /** A crash after some warnings showed only the warnings, so the reason the build stopped was never on the summary. */
  test('puts its output on the summary when Doxygen stops after warnings', async () => {
    const { core } = await build({ result: { exitCode: 134, stderr: `${WARNINGS}\nSegmentation fault (core dumped)` } });

    expect(core.setFailed).toHaveBeenCalledWith('Doxygen exited 134 after 3 warning(s). The summary shows the end of its output.');
    expect(core.summary.addRaw.mock.calls[0][0]).toContain('Segmentation fault');
  });

  /** A Doxygen that crashes can print no warning at all, and the summary read as a clean build with no reason given. */
  test('fails with its output on the summary when Doxygen exits without a warning', async () => {
    const { core } = await build({ result: { exitCode: 134, stderr: 'Segmentation fault (core dumped)' } });

    expect(core.setFailed).toHaveBeenCalledWith('Doxygen exited 134 without a warning line. The summary shows the end of its output.');
    expect(core.summary.addRaw.mock.calls[0][0]).toContain('Segmentation fault');
    expect(core.summary.addRaw.mock.calls[0][0]).not.toContain('Built with no warnings.');
  });
});
