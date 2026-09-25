/**
 * Specs for face discovery.
 *
 * Every build tool finds a face through here, so a face the lookup misses never builds, and one it
 * misnames builds into the wrong sandbox and releases under the wrong tag. The fixtures cover the
 * repo shapes the framework supports: one face at the root, and several under watchfaces/ with a
 * family among them.
 */

import path from 'node:path';
import { describe, test, expect } from 'vitest';
import { findFaces, familyCoreFor } from './faces';

const WORKSPACES = path.join(import.meta.dirname, 'fixtures', 'workspaces');
const ONE_FACE = path.join(WORKSPACES, 'one-face');
const MANY_FACES = path.join(WORKSPACES, 'many-faces');
const CLASHING_FACES = path.join(WORKSPACES, 'clashing-faces');

describe('findFaces', () => {
  /** The root folder is named after wherever the repo was cloned, so the name has to come from the appinfo. */
  test('names a face at the repo root by its appinfo', () => {
    const result = findFaces(ONE_FACE);

    expect(result).toEqual([{ name: 'solo', rel: '.' }]);
  });

  /** A family's core/ carries no appinfo, so only the faces beside it may be found. */
  test('finds faces under watchfaces/ and inside a family, sorted by name', () => {
    const result = findFaces(MANY_FACES);

    expect(result).toEqual([
      { name: 'alpha', rel: 'watchfaces/alpha' },
      { name: 'beta', rel: 'watchfaces/family/beta' },
    ]);
  });

  /**
   * Two families can each hold a face with the same folder name. Both builds would share one sandbox
   * and one release tag, and the lookup quietly picked one, so the clash has to stop the tools.
   */
  test('refuses two faces with the same name', () => {
    const result = () => findFaces(CLASHING_FACES);

    expect(result).toThrow(/two faces are named "clock"/);
  });

  /** A folder holding no faces, like a framework on its own, has nothing to build. */
  test('finds nothing in a folder with no faces', () => {
    const result = findFaces(WORKSPACES);

    expect(result).toEqual([]);
  });
});

describe('familyCoreFor', () => {
  /** A family face compiles its family's core in, so the lookup has to reach the folder beside it. */
  test('finds the core beside a face in a family', () => {
    const result = familyCoreFor(MANY_FACES, 'watchfaces/family/beta');

    expect(result).toBe(path.join(MANY_FACES, 'watchfaces', 'family', 'core'));
  });

  /** A face of its own must not pick up a core, or it would compile another family's code. */
  test('gives a face straight under watchfaces/ no core', () => {
    const result = familyCoreFor(MANY_FACES, 'watchfaces/alpha');

    expect(result).toBeNull();
  });

  /** The repo root is never inside a family. */
  test('gives a face at the repo root no core', () => {
    const result = familyCoreFor(ONE_FACE, '.');

    expect(result).toBeNull();
  });
});
