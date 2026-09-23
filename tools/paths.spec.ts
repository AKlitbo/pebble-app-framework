/**
 * Specs for finding the workspace the framework belongs to.
 *
 * Every tool reads faces from that workspace and writes its output there, so getting it wrong puts
 * build sandboxes and manifests inside the framework, or reads faces from a repo that never asked for
 * them. What is worth pinning is that the framework's folder name plays no part, and that a folder of
 * faces that does not list the framework as a workspace is not taken for its home.
 */
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { workspaceFor } from './paths';

const WORKSPACES = path.join(import.meta.dirname, 'fixtures', 'workspaces');

describe('workspaceFor', () => {
  /** A repo that mounts the framework under a name other than lib would otherwise see every tool treat the framework as standing alone. */
  test('finds the repo of faces whatever the framework folder is called', () => {
    const result = workspaceFor(path.join(WORKSPACES, 'one-face', 'engine'));

    expect(result).toBe(path.join(WORKSPACES, 'one-face'));
  });

  /** npm also takes workspaces as an object with a packages list, and a repo written that way has to be found too. */
  test('reads a workspaces listing written as a packages object', () => {
    const result = workspaceFor(path.join(WORKSPACES, 'many-faces', 'lib'));

    expect(result).toBe(path.join(WORKSPACES, 'many-faces'));
  });

  /** A framework cloned beside someone's faces without being listed must not start writing build output into their repo. */
  test('treats a framework its parent does not list as a workspace as standing alone', () => {
    const engine = path.join(WORKSPACES, 'one-face', 'somewhere-else');

    const result = workspaceFor(engine);

    expect(result).toBe(engine);
  });
});
