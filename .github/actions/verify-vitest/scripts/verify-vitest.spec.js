/**
 * Specs for the step that runs Vitest.
 *
 * The report below is shaped from a real Vitest 4 run with one passing file, one failing test, a skipped
 * test, and a file that threw while loading. What is worth pinning is that a failing test lands on its
 * line, that a file that never loaded is still reported, and that a run which never wrote a report fails
 * rather than passing on nothing.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fakeCore, fakeExec } from '../../../shared/fakes.js';
import verifyVitest from './verify-vitest.js';

const WORKSPACE = '/home/runner/work/engine/engine';

const FAILING_REPORT = {
  numTotalTestSuites: 4,
  numFailedTestSuites: 3,
  numTotalTests: 3,
  numPassedTests: 1,
  numFailedTests: 1,
  numPendingTests: 1,
  numTodoTests: 0,
  success: false,
  testResults: [
    {
      name: `${WORKSPACE}/ts/stock/cache.spec.ts`,
      status: 'failed',
      message: '',
      assertionResults: [
        {
          fullName: 'the gate surviving a restart a poll straight after a restart is still throttled',
          status: 'failed',
          failureMessages: ['AssertionError: expected false to be true\n    at ts/stock/cache.spec.ts:129:20'],
          location: { line: 121, column: 3 },
        },
        { fullName: 'the gate surviving a restart later', status: 'skipped', failureMessages: [], location: { line: 140, column: 3 } },
      ],
    },
    { name: `${WORKSPACE}/ts/pkjs/wire.spec.ts`, status: 'failed', message: "Cannot find module './wire'", assertionResults: [] },
    {
      name: `${WORKSPACE}/ts/weather/util.spec.ts`,
      status: 'passed',
      message: '',
      assertionResults: [{ fullName: 'applyNight leaves Clear alone by day', status: 'passed', failureMessages: [], location: { line: 90, column: 3 } }],
    },
  ],
};

const PASSING_REPORT = {
  ...FAILING_REPORT,
  numFailedTests: 0,
  numPassedTests: 2,
  numPendingTests: 0,
  success: true,
  testResults: [FAILING_REPORT.testResults[2]],
};

let runnerTemp;

// writes the report where the step told Vitest to, the way the real reporter does
function vitestWrites(report, exitCode) {
  return ({ args }) => {
    const target = args.find((arg) => arg.startsWith('--outputFile.json=')).slice('--outputFile.json='.length);
    if (report) {
      fs.writeFileSync(target, JSON.stringify(report));
    }
    return { exitCode, stdout: ' RUN  v4.1.10', stderr: report ? '' : 'Error: Failed to load config/vitest.config.ts' };
  };
}

async function verify(answer) {
  const core = fakeCore();
  const exec = fakeExec(answer);
  await verifyVitest({ core, exec });
  return { core, exec };
}

beforeEach(() => {
  runnerTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-vitest-'));
  vi.stubEnv('RUNNER_TEMP', runnerTemp);
  vi.stubEnv('GITHUB_WORKSPACE', WORKSPACE);
  vi.stubEnv('VITEST_CONFIG', 'config/vitest.config.ts');
  // the config path is a name the fake stands behind, not a file on the machine running the specs
  vi.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fs.rmSync(runnerTemp, { recursive: true, force: true });
});

describe('verify-vitest', () => {
  /** Without the JSON reporter and task locations there is no file or line to annotate, only a log to scroll. */
  test('asks Vitest for its usual output, a JSON report, and each test line', async () => {
    const { exec } = await verify(vitestWrites(PASSING_REPORT, 0));

    const [[command, args]] = exec.getExecOutput.mock.calls;
    expect(command).toBe('npx');
    expect(args).toEqual(expect.arrayContaining(['run', '--config', 'config/vitest.config.ts', '--reporter=default', '--reporter=json', '--includeTaskLocation']));
  });

  /** A clean run has to pass, and the counts on the summary show how much ran. */
  test('passes a clean run and puts its counts on the summary', async () => {
    const { core } = await verify(vitestWrites(PASSING_REPORT, 0));

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.summary.addRaw.mock.calls[0][0]).toContain('| 1 | 0 | 3 | 2 | 0 | 0 |');
  });

  /** A failure without its line makes someone scroll the log to find which assertion broke. */
  test('annotates a failing test on its line with the first line of its message', async () => {
    const { core } = await verify(vitestWrites(FAILING_REPORT, 1));

    expect(core.error).toHaveBeenCalledWith('AssertionError: expected false to be true', {
      title: 'the gate surviving a restart a poll straight after a restart is still throttled',
      file: 'ts/stock/cache.spec.ts',
      startLine: 121,
    });
  });

  /** A file that throws while loading runs none of its tests, and with no failing test to list it would vanish from the report. */
  test('reports a spec file that failed to load', async () => {
    const { core } = await verify(vitestWrites(FAILING_REPORT, 1));

    expect(core.error).toHaveBeenCalledWith("Cannot find module './wire'", {
      title: 'Spec File',
      file: 'ts/pkjs/wire.spec.ts',
      startLine: undefined,
    });
    expect(core.setFailed).toHaveBeenCalledWith('1 test(s) failed across 2 spec file(s), and Vitest exited 1.');
  });

  /** An unhandled rejection makes Vitest exit 1 with every test in the report passing, and only its output says why. */
  test('fails a run that exits with an error even when the report shows no failures, with the output on the summary', async () => {
    const { core } = await verify(vitestWrites(PASSING_REPORT, 1));

    expect(core.setFailed).toHaveBeenCalledWith('Vitest exited 1 with no failing test, such as from an unhandled error or a coverage threshold. The summary shows the end of its output.');
    expect(core.summary.addRaw.mock.calls[0][0]).toContain('### Why Vitest Failed');
  });

  /** A job runs the framework suite and the docs suite, and two tables both headed Vitest could not be told apart. */
  test('names the config in the summary heading', async () => {
    const { core } = await verify(vitestWrites(PASSING_REPORT, 0));

    expect(core.summary.addRaw.mock.calls[0][0]).toContain('## Vitest (config/vitest.config.ts)');
  });

  /** A broken config writes no report at all, and treating no failures as a pass would ship an untested change. */
  test('fails a run that never wrote its report, with the output on the summary', async () => {
    const { core } = await verify(vitestWrites(null, 1));

    expect(core.setFailed).toHaveBeenCalledWith('Vitest exited 1 without writing its results, so it never got as far as running the specs.');
    expect(core.summary.addRaw.mock.calls[0][0]).toContain('Failed to load config/vitest.config.ts');
  });
});
