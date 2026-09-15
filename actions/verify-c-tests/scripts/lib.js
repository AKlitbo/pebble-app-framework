/**
 * Reads the host C suite's output, the way `make -C c/spec` prints it.
 *
 * The Makefile prints a `== <spec> ==` header before each spec, then gcc's messages for a spec that did
 * not build, or Unity's lines for one that ran. Unity prints a FAIL line for each failing test and closes
 * with a `N Tests M Failures K Ignored` counter. A spec that crashed prints no counter, so a header with no
 * counter under it is a spec that never finished.
 */

// == ../core/math/pct.spec.c ==
const HEADER = /^== (.+\.spec\.c) ==$/;
// 8 Tests 4 Failures 0 Ignored
const COUNTER = /^(\d+) Tests (\d+) Failures (\d+) Ignored$/;
// ../core/math/pct.spec.c:54:test_nothing_done_is_zero:FAIL: Expected 7 Was 0
const RESULT = /^(.+?\.c):(\d+):(\w+):(FAIL|IGNORE)(?::\s*(.*))?$/;
// ../core/units/wind.spec.c:100:29: error: expected expression before ';' token
// ../core/math/pct.spec.c:3:10: fatal error: pct.h: No such file or directory
const COMPILER = /^(.+?\.[ch]):(\d+):(\d+): (fatal error|error|warning): (.*)$/;
// a link failure names no line worth pointing at, so it is kept against the spec as a whole
// /usr/bin/ld: /tmp/ccX.o: in function `test_x': pct.spec.c:(.text+0x1a): undefined reference to `pct_of'
const LINKER = /undefined reference to|ld returned \d+ exit status/;
// the shell's own line for a spec binary that died, such as Segmentation fault (core dumped)
const CRASH = /Segmentation fault|Bus error|Aborted|Floating point exception|Illegal instruction/;

/**
 * Splits the suite's output into one entry per spec, with everything each one reported.
 *
 * @param output The combined output of `make -C c/spec`.
 * @return The specs in the order they ran. Each has its file, its counts or null when it printed none,
 *   its failing and ignored tests, its compiler messages, and the crash line if it had one.
 */
function readSuite(output) {
  const specs = [];
  let spec = null;

  for (const line of String(output).split(/\r?\n/).map((raw) => raw.trimEnd())) {
    const header = HEADER.exec(line);
    if (header) {
      spec = { file: header[1], counts: null, failures: [], ignored: [], compiler: [], crash: '' };
      specs.push(spec);
      continue;
    }
    if (!spec) {
      continue;
    }

    const counter = COUNTER.exec(line);
    const result = RESULT.exec(line);
    const compiler = COMPILER.exec(line);
    if (counter) {
      spec.counts = { tests: Number(counter[1]), failures: Number(counter[2]), ignored: Number(counter[3]) };
    } else if (result) {
      const entry = { file: result[1], line: Number(result[2]), test: result[3], message: result[5] || '' };
      (result[4] === 'FAIL' ? spec.failures : spec.ignored).push(entry);
    } else if (compiler) {
      spec.compiler.push({
        file: compiler[1],
        line: Number(compiler[2]),
        column: Number(compiler[3]),
        severity: compiler[4] === 'warning' ? 'warning' : 'error',
        message: compiler[5],
      });
    } else if (LINKER.test(line)) {
      spec.compiler.push({ file: spec.file, line: undefined, column: undefined, severity: 'error', message: line.trim() });
    } else if (CRASH.test(line)) {
      spec.crash = line.trim();
    }
  }

  return specs;
}

module.exports = { readSuite };
