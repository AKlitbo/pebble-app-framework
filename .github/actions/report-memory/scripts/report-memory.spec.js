/**
 * Specs for the step that measures a face build's memory.
 *
 * It joins figures from two places, the log and each binary, into the rows render-memory ranks. What is worth
 * pinning is that each row takes its sizes from its own target and platform's binary, that a missing binary
 * still leaves a row, and that a log with no report fails rather than uploading nothing.
 *
 * Each spec lays out a build in a temporary folder.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fakeCore } from '../../../shared/fakes.js';
import { tempDir } from '../../../../src/ts/testing/temp-dir.ts';
import reportMemory from './report-memory.js';

const LOG = [
  'GABBRO APP MEMORY USAGE',
  'Total size of resources:        24344 bytes / 256.0KB',
  'Total footprint in RAM:         24886 bytes / 128.0KB',
  'Free RAM available (heap):      106186 bytes',
  'EMERY APP MEMORY USAGE',
  'Total size of resources:        20872 bytes / 256.0KB',
  'Total footprint in RAM:         25592 bytes / 128.0KB',
  'Free RAM available (heap):      105480 bytes',
  "Waf: Leaving directory `/home/runner/work/pebble-watchfaces/pebble-watchfaces/targets/ridgeline/build'",
].join('\n');

let workspace;

beforeEach(() => {
  workspace = tempDir('report-memory-');
  vi.stubEnv('GITHUB_WORKSPACE', workspace);
  vi.stubEnv('RUNNER_TEMP', workspace);
  vi.stubEnv('FACE', 'ridgeline');
  vi.stubEnv('BUILD_LOG', 'build-ridgeline.log');
  fs.mkdirSync(path.join(workspace, 'config'));
  fs.writeFileSync(path.join(workspace, 'config', 'pebble.appinfo.json'), JSON.stringify({ name: 'ridgeline' }));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function writeBinary(platform, length, virtualSize, project = '.') {
  const dir = path.join(workspace, project, 'targets', 'ridgeline', 'build', platform);
  fs.mkdirSync(dir, { recursive: true });
  const binary = Buffer.alloc(length);
  binary.writeUInt16LE(virtualSize, 0x80);
  fs.writeFileSync(path.join(dir, 'pebble-app.bin'), binary);
}

async function report(log = LOG) {
  fs.writeFileSync(path.join(workspace, 'build-ridgeline.log'), log);
  const core = fakeCore();
  await reportMemory({ core });
  const file = path.join(workspace, 'memory', 'ridgeline.json');
  return { core, rows: fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null };
}

describe('report-memory', () => {
  /** Sizes read from the wrong platform's binary would rank a face on figures from a watch it is not running on. */
  test('joins each platform block with the sizes from its own binary', async () => {
    writeBinary('gabbro', 22132, 24888);
    writeBinary('emery', 22844, 25592);

    const { core, rows } = await report();

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(rows).toEqual([
      { face: 'ridgeline', target: 'ridgeline', platform: 'gabbro', image: 22132, virtualSize: 24888, resources: 24344, footprint: 24886, free: 106186 },
      { face: 'ridgeline', target: 'ridgeline', platform: 'emery', image: 22844, virtualSize: 25592, resources: 20872, footprint: 25592, free: 105480 },
    ]);
  });

  /** A family with its own framework builds into its own targets/, so reading the repo root's would report every size as 0. */
  test('reads the binaries a family project built', async () => {
    fs.rmSync(path.join(workspace, 'config'), { recursive: true });
    fs.mkdirSync(path.join(workspace, 'watchfaces', 'contour', 'ridgeline', 'config'), { recursive: true });
    fs.mkdirSync(path.join(workspace, 'watchfaces', 'contour', 'core'));
    fs.writeFileSync(path.join(workspace, 'watchfaces', 'contour', 'ridgeline', 'config', 'pebble.appinfo.json'), JSON.stringify({ name: 'ridgeline' }));
    writeBinary('gabbro', 22132, 24888, 'watchfaces/contour');
    writeBinary('emery', 22844, 25592, 'watchfaces/contour');

    const { core, rows } = await report();

    expect(core.warning).not.toHaveBeenCalled();
    expect(rows.map((row) => [row.platform, row.image, row.virtualSize])).toEqual([['gabbro', 22132, 24888], ['emery', 22844, 25592]]);
  });

  /** Dropping the row for a missing binary would make the face look like it simply built fewer platforms. */
  test('keeps a row with zero sizes and a warning when a binary is missing', async () => {
    writeBinary('emery', 22844, 25592);

    const { core, rows } = await report();

    expect(rows[0]).toMatchObject({ platform: 'gabbro', image: 0, virtualSize: 0 });
    expect(core.warning).toHaveBeenCalledWith('targets/ridgeline/build/gabbro/pebble-app.bin is missing, so its app image and static size read as 0.', { title: 'ridgeline Memory' });
  });

  /** Uploading nothing would leave the face off the table with no sign anything went wrong in its job. */
  test('fails when the log has no memory report', async () => {
    const { core, rows } = await report('[ 12/102] Compiling emery | c: src/c/main.c\nBuild failed\n');

    expect(core.setFailed).toHaveBeenCalledWith('build-ridgeline.log has no memory report. Either the build did not get as far as linking, or it was incremental and had nothing to relink.');
    expect(rows).toBeNull();
  });

  /** An empty input read the repo folder itself and crashed with a stack trace. */
  test('fails with a message when no log is given', async () => {
    vi.stubEnv('BUILD_LOG', '');

    const { core } = await report();

    expect(core.setFailed).toHaveBeenCalledWith('No log was given. Pass the build log the build step tees its output to.');
  });

  /** Every other action refuses a path outside the repo, and this one read one quietly. */
  test('refuses a log outside the repo', async () => {
    vi.stubEnv('BUILD_LOG', '../build-ridgeline.log');

    const { core } = await report();

    expect(core.setFailed).toHaveBeenCalledWith("log '../build-ridgeline.log' has to be a relative path inside the repo.");
  });
});
