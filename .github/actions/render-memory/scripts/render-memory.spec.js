/**
 * Specs for the step that puts every face's memory rows on the run summary.
 *
 * It reads whatever the build jobs uploaded. What is worth pinning is that no rows at all fails rather than
 * passing with an empty table, since that means every build broke or none uploaded, and that a face close to
 * a limit is raised on the run and not only buried in the table.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fakeCore } from '../../../shared/fakes.js';
import renderMemory from './render-memory.js';

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-memory-'));
  vi.stubEnv('MEMORY_DIR', dir);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function upload(face, rows) {
  fs.writeFileSync(path.join(dir, `${face}.json`), JSON.stringify(rows));
}

async function render() {
  const core = fakeCore();
  await renderMemory({ core });
  return core;
}

describe('render-memory', () => {
  /** An empty table reads as a pass, when really every build broke or none of them uploaded anything. */
  test('fails when no build job left any rows', async () => {
    const core = await render();

    expect(core.setFailed).toHaveBeenCalledWith(`No memory rows under ${dir}. Every build job either failed before it reported or never uploaded its rows.`);
  });

  /** A face creeping toward its static limit only in the table is easy to miss until the build that finally fails. */
  test('warns on a face at 80% of a limit and puts every face in one table', async () => {
    upload('lcars-stardate', [{ face: 'lcars-stardate', target: 'lcars-stardate', platform: 'emery', image: 30000, virtualSize: 56000, resources: 90000, footprint: 60000, free: 40000 }]);
    upload('radar-array', [{ face: 'radar-array', target: 'radar-array', platform: 'emery', image: 20000, virtualSize: 20000, resources: 10000, footprint: 30000, free: 90000 }]);

    const core = await render();

    expect(core.warning).toHaveBeenCalledTimes(1);
    expect(core.warning).toHaveBeenCalledWith('lcars-stardate on emery is at 85% of its static size limit.', { title: 'lcars-stardate Memory' });
    const summary = core.summary.addRaw.mock.calls[0][0];
    expect(summary.indexOf('**lcars-stardate**')).toBeLessThan(summary.indexOf('**radar-array**'));
    expect(core.setFailed).not.toHaveBeenCalled();
  });
});
