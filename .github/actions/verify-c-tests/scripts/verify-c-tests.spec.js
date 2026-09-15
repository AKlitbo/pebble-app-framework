/**
 * Specs for the step that runs the host C suite.
 *
 * The suite is the only thing that checks the watch's maths off the watch, so a failure the step reports
 * as a pass ships a bug. What is worth pinning is that every way a spec can go wrong fails the step and
 * points at the right file in the repo, and that a clean run still passes with its totals on the summary.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { fakeCore, fakeExec } from '../../../shared/fakes.js';
import verifyCTests from './verify-c-tests.js';

const PASSING = [
  "make: Entering directory '/home/runner/work/engine/engine/c/spec'",
  '== ../core/math/series.spec.c ==',
  '../core/math/series.spec.c:24:test_lo_and_hi_cover_the_run:PASS',
  '',
  '-----------------------',
  '6 Tests 0 Failures 0 Ignored ',
  'OK',
  "make: Leaving directory '/home/runner/work/engine/engine/c/spec'",
].join('\n');

const BROKEN = [
  '== ../core/math/pct.spec.c ==',
  '../core/math/pct.spec.c:70:test_nothing_done_is_zero:FAIL: Expected 7 Was 0',
  '-----------------------',
  '8 Tests 1 Failures 0 Ignored ',
  'FAIL',
  '== ../core/units/wind.spec.c ==',
  "../core/units/wind.spec.c:100:29: error: expected expression before ';' token",
  "../core/units/wind.spec.c:100:25: warning: unused variable 'x' [-Wunused-variable]",
  '== ../core/text/text_case.spec.c ==',
  'Segmentation fault (core dumped)',
  'make: *** [Makefile:36: test] Error 1',
].join('\n');

async function verify(result) {
  const core = fakeCore();
  const exec = fakeExec(() => result);
  await verifyCTests({ core, exec });
  return { core, exec };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verify-c-tests', () => {
  /** A clean suite has to pass, and its totals on the summary are the only record of how much actually ran. */
  test('passes a clean suite and puts its totals on the summary', async () => {
    const { core } = await verify({ exitCode: 0, stdout: PASSING });

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.summary.addRaw.mock.calls[0][0]).toContain('| 1 | 6 | 6 | 0 | 0 | 0 | 0 |');
    expect(core.info).toHaveBeenCalledWith('All 6 tests in 1 specs passed.');
  });

  /**
   * gcc and the crash line go to stderr and the spec headers to stdout. Read as two streams, every
   * compiler error lands under the last spec and the one that really broke reads as a crash.
   */
  test('runs make in c/spec with stderr folded into stdout', async () => {
    const { exec } = await verify({ exitCode: 0, stdout: PASSING });

    expect(exec.getExecOutput).toHaveBeenCalledWith('bash', ['-c', 'make -C c/spec 2>&1'], { ignoreReturnCode: true });
  });

  /** make can fail after every spec passes, such as a clean-up rule, and only its exit code says so. */
  test('fails when make exits with an error even though every spec passed', async () => {
    const { core } = await verify({ exitCode: 2, stdout: PASSING });

    expect(core.setFailed).toHaveBeenCalledWith('make -C c/spec exited 2 even though every spec passed. The log shows what stopped it.');
  });

  /** The paths Unity prints are relative to c/spec, and a failure pointed there lands on no file in the PR. */
  test('annotates a failing test on its line in the repo', async () => {
    const { core } = await verify({ exitCode: 2, stdout: BROKEN });

    expect(core.error).toHaveBeenCalledWith('Expected 7 Was 0', {
      title: 'test_nothing_done_is_zero',
      file: 'c/core/math/pct.spec.c',
      startLine: 70,
    });
  });

  /** A spec that does not build runs none of its tests, which would otherwise read as those tests never existing. */
  test('annotates gcc errors and warnings at their line and column', async () => {
    const { core } = await verify({ exitCode: 2, stdout: BROKEN });

    expect(core.error).toHaveBeenCalledWith("expected expression before ';' token", {
      title: 'Compiler Error',
      file: 'c/core/units/wind.spec.c',
      startLine: 100,
      startColumn: 29,
    });
    expect(core.warning).toHaveBeenCalledWith("unused variable 'x' [-Wunused-variable]", {
      title: 'Compiler Warning',
      file: 'c/core/units/wind.spec.c',
      startLine: 100,
      startColumn: 25,
    });
  });

  /** A crash leaves no FAIL line, so without naming the spec the step would fail with nothing to point at. */
  test('names a spec that crashed before it reported', async () => {
    const { core } = await verify({ exitCode: 2, stdout: BROKEN });

    expect(core.error).toHaveBeenCalledWith('Stopped before it reported its results. Segmentation fault (core dumped).', {
      title: 'Spec Did Not Finish',
      file: 'c/core/text/text_case.spec.c',
    });
  });

  /** The counts in the message say at a glance how much is wrong, before anyone opens the log. */
  test('fails with how many tests failed and how many specs did not build or finish', async () => {
    const { core } = await verify({ exitCode: 2, stdout: BROKEN });

    expect(core.setFailed).toHaveBeenCalledWith('1 test(s) failed, 1 spec(s) did not build, and 1 spec(s) did not finish.');
  });

  /** A Makefile that breaks before the first spec prints no header, and reading that as a pass would hide the whole suite. */
  test('fails when make runs no spec at all', async () => {
    const { core } = await verify({ exitCode: 2, stderr: "make: *** No rule to make target 'test'.  Stop." });

    expect(core.setFailed).toHaveBeenCalledWith('make -C c/spec exited 2 without running any spec.');
    expect(core.summary.addRaw.mock.calls[0][0]).toContain('No rule to make target');
  });
});
