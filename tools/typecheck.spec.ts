/**
 * Specs for the typecheck project list.
 *
 * Framework CI names its typecheck projects one by one, so a project added to the list here and left
 * out of the workflow is checked locally but never on a framework pull request. What is worth pinning
 * is that the two lists agree.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { PROJECTS, ROOT } from './typecheck.ts';

describe('the typecheck projects', () => {
  /** A project the workflow leaves out merges with type errors nobody sees until someone runs the check by hand. */
  test('match the ones framework CI checks, with the docs project besides', () => {
    const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'framework-ci.yml'), 'utf8');
    const block = /projects: \|\n((?: {12}\S.*\n)+)/.exec(workflow);
    const checked = (block ? block[1] : '').split('\n').map((line) => line.trim()).filter(Boolean);

    const result = [...PROJECTS.map((project) => path.relative(ROOT, project).split(path.sep).join('/')), 'docs/tsconfig.json'];

    expect(checked).toEqual(result);
  });
});
