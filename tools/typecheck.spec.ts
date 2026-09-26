/**
 * Specs for the typecheck project list.
 *
 * Framework CI names its typecheck projects one by one, so a project added to the list here and left
 * out of the workflow is checked locally and in every face repo but never on a framework pull request.
 * What is worth pinning is that the two lists agree.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { ENGINE, WORKSPACE } from './paths.ts';
import { PROJECTS } from './typecheck.ts';

// in a repo mounting the framework the list starts at that repo's own root, which the workflow never names
describe.skipIf(WORKSPACE !== ENGINE)('the typecheck projects', () => {
  /** A project the workflow leaves out merges with type errors nobody sees until a face repo builds. */
  test('match the ones framework CI checks, with the docs project besides', () => {
    const workflow = fs.readFileSync(path.join(ENGINE, '.github', 'workflows', 'framework-ci.yml'), 'utf8');
    const block = /projects: \|\n((?: {12}\S.*\n)+)/.exec(workflow);
    const checked = (block ? block[1] : '').split('\n').map((line) => line.trim()).filter(Boolean);

    const result = [...PROJECTS.map((project) => path.relative(ENGINE, project).split(path.sep).join('/')), 'docs/tsconfig.json'];

    expect(checked).toEqual(result);
  });
});
