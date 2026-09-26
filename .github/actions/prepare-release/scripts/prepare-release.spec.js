/**
 * Specs for the step that checks a face release before anything is built.
 *
 * This is the last thing between a pushed tag and a published release that cannot be taken back cleanly.
 * What is worth pinning is that each thing that should stop a release does, that a face is found in either
 * repo layout, and that a release that passes gets notes built from its changelog entry.
 *
 * Each spec builds a small repo of faces in a temporary folder, and fakes git and gh.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fakeCore, fakeExec } from '../../../shared/fakes.js';
import prepareRelease from './prepare-release.js';

const CHANGELOG = '# Changelog\n\n## [1.11.0] - 2026-09-07\n\n### Added\n\n- Added a Next Alarm readout.\n';

let workspace;

beforeEach(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-release-'));
  vi.stubEnv('GITHUB_WORKSPACE', workspace);
  vi.stubEnv('RUNNER_TEMP', workspace);
  vi.stubEnv('GITHUB_REPOSITORY', 'AKlitbo/pebble-watchface-lcars');
  vi.stubEnv('RELEASE_TAG', 'lcars-stardate-v1.11.0');
});

afterEach(() => {
  fs.rmSync(workspace, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function writeFace(rel, { name = 'lcars-stardate', version = '1.11.0', changelog = CHANGELOG, targetPlatforms = ['emery', 'gabbro'] } = {}) {
  const dir = path.join(workspace, rel);
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'config', 'pebble.appinfo.json'), JSON.stringify({ name, displayName: 'LCARS Stardate', version, targetPlatforms }));
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), changelog);
}

const TAGGED = ({ command, args }) => {
  if (command === 'git' && args.includes('--points-at')) {
    return { stdout: 'v1.2.0\n' };
  }
  if (command === 'gh') {
    return { exitCode: 1, stderr: 'release not found\n' };
  }
  return {};
};

async function prepare(answer = TAGGED) {
  const core = fakeCore();
  const exec = fakeExec(answer);
  await prepareRelease({ core, exec });
  return { core, exec };
}

describe('prepare-release', () => {
  /** The notes are what the release page shows, and the outputs are what the later steps build and publish with. */
  test('writes the notes from the changelog entry and hands on the face, version and title', async () => {
    writeFace('.');

    const { core } = await prepare();

    expect(core.setFailed).not.toHaveBeenCalled();
    const notesFile = path.join(workspace, 'release-notes.md');
    expect(core.setOutput).toHaveBeenCalledWith('face', 'lcars-stardate');
    expect(core.setOutput).toHaveBeenCalledWith('version', '1.11.0');
    expect(core.setOutput).toHaveBeenCalledWith('title', 'LCARS Stardate 1.11.0');
    expect(core.setOutput).toHaveBeenCalledWith('notes-file', notesFile);
    expect(fs.readFileSync(notesFile, 'utf8')).toBe('Released 2026-09-07.\n\n### Added\n\n- Added a Next Alarm readout.\n');
  });

  /** One step serves both repo layouts, so a face inside a family folder has to be found as well as one at the root. */
  test('finds a face inside a family folder under watchfaces/', async () => {
    fs.mkdirSync(path.join(workspace, 'watchfaces', 'mosaic', 'core'), { recursive: true });
    writeFace('watchfaces/mosaic/gridlock', { name: 'gridlock', version: '1.3.1', changelog: '## [1.3.1] - 2026-09-07\n\n- Fixed the grey bell.\n' });
    vi.stubEnv('RELEASE_TAG', 'gridlock-v1.3.1');

    const { core } = await prepare();

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalledWith('face', 'gridlock');
  });

  /** A release on an untagged framework ships code that no framework version names, so nobody can say what it was built on. */
  test('stops when the framework is not on a tag', async () => {
    writeFace('.');

    const { core } = await prepare(({ command, args }) => {
      if (command === 'git' && args.includes('--points-at')) {
        return { stdout: 'wip\n' };
      }
      return command === 'git' ? { stdout: '2f22717\n' } : {};
    });

    expect(core.setFailed).toHaveBeenCalledWith('The framework is at 2f22717, which is not a framework tag. Move lib to a framework tag before releasing.');
  });

  /** A face with no version in its appinfo builds as the repo's version, and its tag could never match undefined. */
  test('holds a face with no appinfo version to the repo version', async () => {
    writeFace('.', { version: null });
    fs.writeFileSync(path.join(workspace, 'package.json'), JSON.stringify({ version: '1.11.0' }));

    const { core } = await prepare();

    expect(core.setFailed).not.toHaveBeenCalled();
  });

  /** A missing platform list only failed at publish, after the SDK install and the whole build. */
  test('stops before the build when the appinfo lists no platforms', async () => {
    writeFace('.', { targetPlatforms: null });

    const { core } = await prepare();

    expect(core.setFailed).toHaveBeenCalledWith('config/pebble.appinfo.json lists no targetPlatforms. Add them so the release can name what each pbw installs on.');
  });

  /** A version with build metadata was never read as a pre-release, so a candidate went out marked Latest. */
  test('refuses a version publish-release cannot read', async () => {
    writeFace('.', { version: '1.11.0-rc.1+b5' });
    vi.stubEnv('RELEASE_TAG', 'lcars-stardate-v1.11.0-rc.1+b5');

    const { core } = await prepare();

    expect(core.setFailed).toHaveBeenCalledWith('Version 1.11.0-rc.1+b5 is not shaped X.Y.Z or X.Y.Z-label, such as 1.11.0 or 1.11.0-rc.1.');
  });

  /** A trailing comma in the root package.json crashed the step with a stack trace that named no file. */
  test('names a package.json that is not valid JSON', async () => {
    writeFace('.', { version: null });
    fs.writeFileSync(path.join(workspace, 'package.json'), '{ "version": "1.11.0", }');

    const { core } = await prepare();

    expect(core.setFailed).toHaveBeenCalledWith(expect.stringMatching(/^package\.json is missing or is not valid JSON\./));
  });

  /** With no version anywhere the message read "package.json says undefined", which names no fix. */
  test('says when neither the appinfo nor the repo sets a version', async () => {
    writeFace('.', { version: null });

    const { core } = await prepare();

    expect(core.setFailed).toHaveBeenCalledWith('Tag lcars-stardate-v1.11.0 says version 1.11.0, but neither config/pebble.appinfo.json nor package.json sets a version.');
  });

  /** A tag typed with the wrong version would publish a release whose name disagrees with what the watch reports. */
  test('stops when the tag version disagrees with the appinfo', async () => {
    writeFace('.', { version: '1.10.0' });

    const { core } = await prepare();

    expect(core.setFailed).toHaveBeenCalledWith('Tag lcars-stardate-v1.11.0 says version 1.11.0, but config/pebble.appinfo.json says 1.10.0.');
  });

  /** An entry still marked Unreleased means the changelog was never finished, and it would ship as the notes. */
  test('stops on a changelog entry that is not dated', async () => {
    writeFace('.', { changelog: '## [1.11.0] - Unreleased\n\n- Added a thing.\n' });

    const { core } = await prepare();

    expect(core.setFailed).toHaveBeenCalledWith("CHANGELOG.md has [1.11.0] dated 'Unreleased'. Date the heading, such as 1.11.0 - 2026-09-07, before releasing.");
  });

  /** A moved or pushed again tag would build for minutes and only then collide with the release already out. */
  test('stops when the tag is already released', async () => {
    writeFace('.');

    const { core, exec } = await prepare(({ command, args }) => (command === 'gh' ? { exitCode: 0 } : TAGGED({ command, args })));

    expect(exec.getExecOutput).toHaveBeenCalledWith('gh', ['release', 'view', 'lcars-stardate-v1.11.0', '--repo', 'AKlitbo/pebble-watchface-lcars'], { ignoreReturnCode: true, silent: true });
    expect(core.setFailed).toHaveBeenCalledWith('lcars-stardate-v1.11.0 is already released. Delete that release first to publish it again.');
  });

  /** gh failing to look at all, such as a bad token, would read as a new release and only fail once the build was done. */
  test('stops when gh cannot check for a release at all', async () => {
    writeFace('.');

    const { core } = await prepare(({ command, args }) => (command === 'gh' ? { exitCode: 4, stderr: 'HTTP 401: Bad credentials\n' } : TAGGED({ command, args })));

    expect(core.setFailed).toHaveBeenCalledWith('gh could not check whether lcars-stardate-v1.11.0 is already released. HTTP 401: Bad credentials');
  });
});
