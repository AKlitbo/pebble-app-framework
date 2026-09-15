/**
 * Specs for the step that publishes a face release.
 *
 * A release that goes out missing a pbw, or with one named for the wrong watch, is public before anyone
 * notices. What is worth pinning is that every target the face builds is attached under its release name,
 * and that a missing pbw stops before gh ever runs.
 *
 * Each spec lays out build output in a temporary folder, and fakes node and gh.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fakeCore, fakeExec } from '../../../shared/fakes.js';
import publishRelease from './publish-release.js';

let workspace;

beforeEach(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-release-'));
  vi.stubEnv('GITHUB_WORKSPACE', workspace);
  vi.stubEnv('RUNNER_TEMP', workspace);
  vi.stubEnv('GITHUB_REPOSITORY', 'AKlitbo/pebble-watchfaces');
  vi.stubEnv('RELEASE_TAG', 'gridlock-v1.3.1');
  vi.stubEnv('FACE', 'gridlock');
  vi.stubEnv('VERSION', '1.3.1');
  vi.stubEnv('TITLE', 'Gridlock 1.3.1');
  vi.stubEnv('NOTES_FILE', path.join(workspace, 'release-notes.md'));
});

afterEach(() => {
  fs.rmSync(workspace, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function writeTarget(target, platforms, { built = true } = {}) {
  const dir = path.join(workspace, 'targets', target);
  fs.mkdirSync(path.join(dir, 'build'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ pebble: { targetPlatforms: platforms } }));
  if (built) {
    fs.writeFileSync(path.join(dir, 'build', `${target}.pbw`), target);
  }
}

const TWO_TARGETS = ({ command }) => {
  if (command === 'node') {
    return { stdout: 'gridlock-face\ngridlock-app\n' };
  }
  return { stdout: 'https://github.com/AKlitbo/pebble-watchfaces/releases/tag/gridlock-v1.3.1\n' };
};

async function publish(answer = TWO_TARGETS) {
  const core = fakeCore();
  const exec = fakeExec(answer);
  await publishRelease({ core, exec });
  return { core, exec };
}

describe('publish-release', () => {
  /** A face that builds a watchface and a watchapp has to ship both, each named for what it installs on. */
  test('attaches every target under its release name', async () => {
    writeTarget('gridlock-face', ['emery']);
    writeTarget('gridlock-app', ['emery', 'gabbro']);

    const { core, exec } = await publish();

    expect(core.setFailed).not.toHaveBeenCalled();
    const assets = path.join(workspace, 'release-assets');
    expect(exec.getExecOutput).toHaveBeenCalledWith('gh', [
      'release', 'create', 'gridlock-v1.3.1',
      path.join(assets, 'gridlock-face-emery-1.3.1.pbw'),
      path.join(assets, 'gridlock-app-1.3.1.pbw'),
      '--title', 'Gridlock 1.3.1',
      '--notes-file', path.join(workspace, 'release-notes.md'),
      '--repo', 'AKlitbo/pebble-watchfaces',
    ], { ignoreReturnCode: true });
    expect(fs.readFileSync(path.join(assets, 'gridlock-app-1.3.1.pbw'), 'utf8')).toBe('gridlock-app');
  });

  /** A release published without one of its targets is public with a download missing, and has to be deleted by hand. */
  test('stops before gh when a target has no pbw', async () => {
    writeTarget('gridlock-face', ['emery']);
    writeTarget('gridlock-app', ['emery', 'gabbro'], { built: false });

    const { core, exec } = await publish();

    expect(core.setFailed).toHaveBeenCalledWith('targets/gridlock-app/build/gridlock-app.pbw is missing, so the build did not finish that target.');
    expect(exec.getExecOutput.mock.calls.some(([command]) => command === 'gh')).toBe(false);
  });

  /** gh failing to publish is the release not happening, and a green step there would hide it. */
  test('fails when gh cannot create the release', async () => {
    writeTarget('gridlock-face', ['emery']);
    writeTarget('gridlock-app', ['emery', 'gabbro']);

    const { core } = await publish(({ command }) => (command === 'node' ? TWO_TARGETS({ command }) : { exitCode: 1, stderr: 'HTTP 422: Validation Failed\n' }));

    expect(core.setFailed).toHaveBeenCalledWith('gh release create exited 1. HTTP 422: Validation Failed');
  });
});
