/**
 * Specs for the paf keys the framework and its plugins ship.
 *
 * paf finds every generator, check, and tool through the paf key in src/package.json and in each
 * plugin's package.json, and runs the file each entry names. The keys are plain JSON, so nothing
 * else notices a tool that was renamed or moved while its key still names the old path. What is
 * worth pinning is that every package carries a key and every file a key names is there.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

/** The shape of a paf key, as far as the files it names go. */
type PafKey = {
  gen?: Record<string, { script: string }>;
  check?: string[];
  tools?: Record<string, { script: string }>;
};

const SRC = import.meta.dirname;

/** The core and every plugin folder, whether or not it holds a package.json yet. */
const PACKAGES = [
  SRC,
  ...fs.readdirSync(path.join(SRC, 'plugins'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(SRC, 'plugins', entry.name)),
];

/** Each package by a name a failing test can show, with its folder. */
const NAMED = PACKAGES.map((dir) => [path.relative(SRC, dir).split(path.sep).join('/') || 'the core', dir]);

/** The paf key out of a package's package.json, or undefined when it has none or no package.json. */
function pafKey(dir: string): PafKey | undefined {
  const file = path.join(dir, 'package.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).paf : undefined;
}

/** Every file a paf key names, relative to its package's folder. */
function namedFiles(key: PafKey): string[] {
  return [
    ...Object.values(key.gen ?? {}).map((entry) => entry.script),
    ...(key.check ?? []),
    ...Object.values(key.tools ?? {}).map((entry) => entry.script),
  ];
}

describe('the paf keys', () => {
  /** A plugin with no package.json or no key offers paf nothing to run, so listing it would do nothing. */
  test.each(NAMED)('%s carries a paf key', (_name, dir) => {
    const result = pafKey(dir);

    expect(result).toBeDefined();
  });

  /** A key naming a moved or renamed file fails the first paf gen or paf check in every face that lists it. */
  test.each(NAMED)('%s names only files it ships', (_name, dir) => {
    const result = namedFiles(pafKey(dir) ?? {}).filter((file) => !fs.existsSync(path.join(dir, file)));

    expect(result).toEqual([]);
  });

  /** paf leaves specs and fixtures out of a unit's copy, so a key naming one fails in every face though the file is here. */
  test.each(NAMED)('%s names no file paf leaves out of a unit', (_name, dir) => {
    const result = namedFiles(pafKey(dir) ?? {}).filter((file) => /\.spec\.(ts|c)$/.test(file) || file.split('/').includes('fixtures'));

    expect(result).toEqual([]);
  });
});
