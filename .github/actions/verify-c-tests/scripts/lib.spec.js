/**
 * Specs for reading the host C suite's output.
 *
 * The suite prints nothing but plain lines, so this reader is the only thing that turns them into
 * failures a PR can show. What is worth pinning is the three ways a spec can go wrong, since each prints
 * something different: a failing assertion, a spec that did not build, and a spec that crashed before its
 * counter. The output below is shaped from a real run with one of each.
 */
import { describe, expect, test } from 'vitest';
import { readSuite } from './lib.js';

const OUTPUT = [
  "make: Entering directory '/home/runner/work/engine/engine/tests/c/spec'",
  '== ../../../src/c/core/math/series.spec.c ==',
  '../../../src/c/core/math/series.spec.c:24:test_lo_and_hi_cover_the_run:PASS',
  '',
  '-----------------------',
  '6 Tests 0 Failures 0 Ignored ',
  'OK',
  '== ../../../src/c/core/math/pct.spec.c ==',
  '../../../src/c/core/math/pct.spec.c:54:test_a_zero_goal_does_not_divide:FAIL: Expected 7 Was 0',
  '../../../src/c/core/math/pct.spec.c:61:test_skipped_for_now:IGNORE',
  '../../../src/c/core/math/pct.spec.c:70:test_nothing_done_is_zero:FAIL',
  '',
  '-----------------------',
  '8 Tests 2 Failures 1 Ignored ',
  'FAIL',
  '== ../../../src/c/core/units/wind.spec.c ==',
  "../../../src/c/core/units/wind.spec.c: In function 'broken':",
  "../../../src/c/core/units/wind.spec.c:100:29: error: expected expression before ';' token",
  '  100 | void broken(void) { int x = ; }',
  '      |                             ^',
  "../../../src/c/core/units/wind.spec.c:100:25: warning: unused variable 'x' [-Wunused-variable]",
  '== ../../../src/c/core/text/text_case.spec.c ==',
  'Segmentation fault (core dumped)',
  'make: *** [Makefile:36: test] Error 1',
].join('\n');

describe('readSuite', () => {
  /** A counter read wrong gives the summary a total that does not match the log. */
  test('reads the counter each spec closes with', () => {
    const [series, pct] = readSuite(OUTPUT);

    expect(series.counts).toEqual({ tests: 6, failures: 0, ignored: 0 });
    expect(pct.counts).toEqual({ tests: 8, failures: 2, ignored: 1 });
  });

  /** A missed FAIL line is a failing test the PR never shows, including one with no message after it. */
  test('reads each failing test with its line, and its message when it has one', () => {
    const [, pct] = readSuite(OUTPUT);

    expect(pct.failures).toEqual([
      { file: '../../../src/c/core/math/pct.spec.c', line: 54, test: 'test_a_zero_goal_does_not_divide', message: 'Expected 7 Was 0' },
      { file: '../../../src/c/core/math/pct.spec.c', line: 70, test: 'test_nothing_done_is_zero', message: '' },
    ]);
  });

  /** A spec that did not build has no counter, and without gcc's own lines it would be mistaken for a crash. */
  test('reads gcc errors and warnings for a spec that did not build', () => {
    const [, , wind] = readSuite(OUTPUT);

    expect(wind.counts).toBeNull();
    expect(wind.compiler).toEqual([
      { file: '../../../src/c/core/units/wind.spec.c', line: 100, column: 29, severity: 'error', message: "expected expression before ';' token" },
      { file: '../../../src/c/core/units/wind.spec.c', line: 100, column: 25, severity: 'warning', message: "unused variable 'x' [-Wunused-variable]" },
    ]);
  });

  /** A missing header is gcc's fatal error, and missing it would count a spec that never built as one that crashed. */
  test('reads a fatal error as an error', () => {
    const output = '== ../../../src/c/core/math/pct.spec.c ==\n../../../src/c/core/math/pct.spec.c:3:10: fatal error: pct.h: No such file or directory';

    const [pct] = readSuite(output);

    expect(pct.compiler).toEqual([
      { file: '../../../src/c/core/math/pct.spec.c', line: 3, column: 10, severity: 'error', message: 'pct.h: No such file or directory' },
    ]);
  });

  /** A function declared but never compiled in fails at the link, with no file and line of the usual shape to match. */
  test('reads a link failure as an error against the spec', () => {
    const output = [
      '== ../../../src/c/core/math/pct.spec.c ==',
      "/usr/bin/ld: /tmp/ccX.o: in function `test_x': pct.spec.c:(.text+0x1a): undefined reference to `pct_of'",
      'collect2: error: ld returned 1 exit status',
    ].join('\n');

    const [pct] = readSuite(output);

    expect(pct.compiler).toHaveLength(2);

    // the collect2 line that closes it belongs to the spec too, and landing it on the Makefile blamed the build setup
    for (const note of pct.compiler) {
      expect(note).toMatchObject({ file: '../../../src/c/core/math/pct.spec.c', line: undefined, severity: 'error' });
    }
  });

  /** A crash prints neither a counter nor a FAIL line, so the shell's own line is the only clue to what happened. */
  test('keeps the crash line for a spec that died before its counter', () => {
    const [, , , textCase] = readSuite(OUTPUT);

    expect(textCase).toMatchObject({ file: '../../../src/c/core/text/text_case.spec.c', counts: null, crash: 'Segmentation fault (core dumped)' });
  });
});
