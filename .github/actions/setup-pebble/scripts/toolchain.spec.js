/**
 * Specs for reading a face's recorded toolchain.
 *
 * This is what makes CI install the SDK a face's framework was built with rather than whatever is newest,
 * and what lets that install be cached. The cases worth pinning are finding the right face's framework
 * and stopping, with the reason, when there is nothing to read.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { fakeCore, tempTree } from '../../../shared/fakes.js';
import toolchain from './toolchain.js';

/** Writes files into a fresh temp folder and points the action at it. */
function repo(files) {
  const root = tempTree(files, 'toolchain-');
  vi.stubEnv('GITHUB_WORKSPACE', root);
  return root;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('toolchain', () => {
  /** A face in a family builds with that family's framework, so its versions come from the family's paf/. */
  test('reads the versions from the paf/ of the family the face is in', async () => {
    repo({
      'watchfaces/mosaic/core/.gitkeep': '',
      'watchfaces/mosaic/paf/toolchain.json': '{ "format": 1, "sdk": "4.33.1", "pebbleTool": "5.0.40", "node": 24 }',
      'watchfaces/mosaic/gridlock/config/pebble.appinfo.json': '{ "name": "gridlock" }',
      'watchfaces/mosaic/node_modules/.package-lock.json': '{}',
    });
    vi.stubEnv('FACE', 'gridlock');
    const core = fakeCore();

    await toolchain({ core });

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalledWith('sdk', '4.33.1');
    expect(core.setOutput).toHaveBeenCalledWith('pebble-tool', '5.0.40');
    expect(core.setOutput).toHaveBeenCalledWith('node', '24');
  });

  /** paf sync installs the project along with its paf/, and a build run without it failed later on a missing package. */
  test('stops on a face project paf sync has not installed', async () => {
    repo({
      'watchfaces/mosaic/core/.gitkeep': '',
      'watchfaces/mosaic/paf/toolchain.json': '{ "format": 1, "sdk": "4.33.1", "pebbleTool": "5.0.40", "node": 24 }',
      'watchfaces/mosaic/gridlock/config/pebble.appinfo.json': '{ "name": "gridlock" }',
    });
    vi.stubEnv('FACE', 'gridlock');
    const core = fakeCore();

    await toolchain({ core });

    expect(core.setFailed).toHaveBeenCalledWith('watchfaces/mosaic has no node_modules. Run paf sync before this step.');
  });

  /** A toolchain.json emptied to null by a bad merge crashed the step with a TypeError that named no file. */
  test('names a toolchain file that holds no object', async () => {
    repo({
      'watchfaces/ide-vscode/paf/toolchain.json': 'null',
      'watchfaces/ide-vscode/config/pebble.appinfo.json': '{ "name": "ide-vscode" }',
    });
    vi.stubEnv('FACE', 'ide-vscode');
    const core = fakeCore();

    await toolchain({ core });

    expect(core.setFailed).toHaveBeenCalledWith('watchfaces/ide-vscode/paf/toolchain.json does not hold a toolchain object.');
  });

  /** An action from an older framework tag must not guess at a newer toolchain file it cannot read. */
  test('stops on a toolchain format it does not read', async () => {
    repo({
      'watchfaces/ide-vscode/paf/toolchain.json': '{ "format": 99, "sdk": "4.33.1", "pebbleTool": "5.0.40", "node": 24 }',
      'watchfaces/ide-vscode/config/pebble.appinfo.json': '{ "name": "ide-vscode" }',
    });
    vi.stubEnv('FACE', 'ide-vscode');
    const core = fakeCore();

    await toolchain({ core });

    expect(core.setFailed).toHaveBeenCalledWith(expect.stringMatching(/is format 99, which this action does not read/));
  });

  /** A missing version would reach the install as the word undefined, and pip would fail far from the cause. */
  test('stops on a toolchain with no pebble-tool version', async () => {
    repo({
      'watchfaces/ide-vscode/paf/toolchain.json': '{ "format": 1, "sdk": "4.33.1", "node": 24 }',
      'watchfaces/ide-vscode/config/pebble.appinfo.json': '{ "name": "ide-vscode" }',
    });
    vi.stubEnv('FACE', 'ide-vscode');
    const core = fakeCore();

    await toolchain({ core });

    expect(core.setFailed).toHaveBeenCalledWith(expect.stringMatching(/names no pebbleTool version/));
  });

  /** Without the framework filled in there is nothing to read, and installing latest instead would hide it. */
  test('stops when the face\'s paf/ has no toolchain', async () => {
    repo({
      'watchfaces/ide-vscode/config/pebble.appinfo.json': '{ "name": "ide-vscode" }',
    });
    vi.stubEnv('FACE', 'ide-vscode');
    const core = fakeCore();

    await toolchain({ core });

    expect(core.setFailed).toHaveBeenCalledWith(expect.stringMatching(/^watchfaces\/ide-vscode\/paf\/toolchain\.json is missing/));
  });
});
