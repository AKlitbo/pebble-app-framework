/**
 * Specs for face discovery.
 *
 * Every build tool finds a face through here, so a face the lookup misses never builds, and one it
 * misnames builds into the wrong sandbox and releases under the wrong tag. The fixtures cover the two
 * shapes that mount the framework: one face, and a family with its faces beside a core.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect } from 'vitest';
import { tempDir } from '../../ts/testing/temp-dir';
import { findFaces, familyCoreFor, familyNameFor, requireMounted } from './faces';

const WORKSPACES = path.join(import.meta.dirname, 'fixtures', 'workspaces');
const ONE_FACE = path.join(WORKSPACES, 'one-face');
const FAMILY_ROOT = path.join(WORKSPACES, 'family-root');

describe('findFaces', () => {

  /** The root folder is named after wherever the repo was cloned, so the name has to come from the appinfo. */
  test('names a face at the repo root by its appinfo', () => {
    const result = findFaces(ONE_FACE);

    expect(result).toEqual([{ name: 'solo', rel: '.' }]);
  });

  /** A family's core/ carries no appinfo, so only the faces beside it may be found. */
  test('finds the faces of a family beside its core, sorted by name', () => {
    const result = findFaces(FAMILY_ROOT);

    expect(result).toEqual([
      { name: 'delta', rel: 'delta' },
      { name: 'epsilon', rel: 'epsilon' },
    ]);
  });

  /**
   * paf and the release actions read a root with an appinfo as one face. Listing the folder beside its
   * core/ as well would have paf check cover a face that paf build says does not exist.
   */
  test('finds only the root face when a face folder sits beside a core under it', () => {
    const result = findFaces(path.join(WORKSPACES, 'root-face-with-core'));

    expect(result).toEqual([{ name: 'top', rel: '.' }]);
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
    const result = familyCoreFor(FAMILY_ROOT, 'delta');

    expect(result).toBe(path.join(FAMILY_ROOT, 'core'));
  });

  /** A face of its own must not pick up a core, or it would compile another family's code. */
  test('gives a face on its own no core', () => {
    const result = familyCoreFor(ONE_FACE, '.');

    expect(result).toBeNull();
  });
});

describe('familyNameFor', () => {

  /**
   * The C build puts the family's name in front of every family header. Without a name the build
   * stages no family code, and every face fails on its first include of a core header.
   */
  test('names a family after its folder', () => {
    const result = familyNameFor(FAMILY_ROOT, 'delta');

    expect(result).toBe('family-root');
  });

  /** CI checks a family repo out under the repo's name, and a family named after that broke every core include there. */
  test('takes the family name from its package.json over its folder', () => {
    const root = tempDir('pebble-watchfaces-sketchbook-');
    fs.mkdirSync(path.join(root, 'core'));
    fs.mkdirSync(path.join(root, 'ridgeline'), { recursive: true });
    fs.writeFileSync(path.join(root, 'ridgeline', 'pebble.appinfo.json'), '{ "name": "ridgeline" }');
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ framework: { family: 'sketchbook' } }));

    const result = familyNameFor(root, 'ridgeline');

    expect(result).toBe('sketchbook');
  });

  /** The name goes into the generated wscript as a string, and a quote in it broke the build far from the cause. */
  test('refuses a family name that is not a plain folder name', () => {
    const root = tempDir('family-name-');
    fs.mkdirSync(path.join(root, 'core'));
    fs.mkdirSync(path.join(root, 'ridgeline'), { recursive: true });
    fs.writeFileSync(path.join(root, 'ridgeline', 'pebble.appinfo.json'), '{ "name": "ridgeline" }');
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ framework: { family: "it's" } }));

    const result = () => familyNameFor(root, 'ridgeline');

    expect(result).toThrow(/cannot start with a dot or hold a quote/);
  });

  /** A family folder with a space in its name built before the name was checked, and refusing it stopped every face in the family. */
  test('takes a family name with a space in it', () => {
    const root = path.join(tempDir('family-name-'), 'my faces');
    fs.mkdirSync(path.join(root, 'core'), { recursive: true });
    fs.mkdirSync(path.join(root, 'ridgeline'), { recursive: true });
    fs.writeFileSync(path.join(root, 'ridgeline', 'pebble.appinfo.json'), '{ "name": "ridgeline" }');

    const result = familyNameFor(root, 'ridgeline');

    expect(result).toBe('my faces');
  });

  /** A family folder named with a dot built before the name was checked, and refusing it stopped every face in the family. */
  test('takes a family name with a dot in it', () => {
    const root = path.join(tempDir('family-name-'), 'line.v2');
    fs.mkdirSync(path.join(root, 'core'), { recursive: true });
    fs.mkdirSync(path.join(root, 'ridgeline'), { recursive: true });
    fs.writeFileSync(path.join(root, 'ridgeline', 'pebble.appinfo.json'), '{ "name": "ridgeline" }');

    const result = familyNameFor(root, 'ridgeline');

    expect(result).toBe('line.v2');
  });

  /** A face of its own must not be handed a family name, or the build would stage a core that is not there. */
  test('gives a face in no family no name', () => {
    const result = familyNameFor(ONE_FACE, '.');

    expect(result).toBeNull();
  });
});

describe('requireMounted', () => {
  /** A unit that forgot to list paf in its workspaces would otherwise pass every check having checked nothing. */
  test('stops when no unit mounts the framework, naming the workspaces', () => {
    const call = () => requireMounted(false);

    expect(call).toThrow(/List paf and paf\/plugins\/\* in the unit's package.json workspaces/);
  });
});
