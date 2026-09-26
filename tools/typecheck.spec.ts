/**
 * Specs for the typecheck project list.
 *
 * Framework CI names its typecheck projects one by one, so a project added to the list here and left
 * out of the workflow is checked locally and in every face repo but never on a framework pull request.
 * What is worth pinning is that the two lists agree, and that a family checks its own faces and nothing
 * beside it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { ENGINE, WORKSPACE } from './paths.ts';
import { PROJECTS, familyProjects } from './typecheck.ts';

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

describe('familyProjects', () => {
  const projects = familyProjects(path.join('/work', 'mosaic'), path.join('/work', 'mosaic', 'lib'), ['gridlock', 'sidereel']);
  const includes = (name: string) => projects.find((project) => project.name === name).config.include as string[];

  /** A face whose specs the check leaves out can merge a type error that only shows when someone runs the file. */
  test('takes in every face and the core', () => {
    const result = includes('tsconfig.spec.json');

    expect(result).toContain('/work/mosaic/gridlock/**/*.spec.ts');
    expect(result).toContain('/work/mosaic/sidereel/**/*.spec.ts');
    expect(result).toContain('/work/mosaic/core/**/*.spec.ts');
  });

  /**
   * A glob that starts above the family reaches the repos cloned beside it, and the check then fails
   * on their code. Every path has to stay inside the family.
   */
  test('reaches nothing outside the family', () => {
    const result = projects.flatMap((project) => project.config.include as string[]);

    expect(result.every((entry) => entry.startsWith('/work/mosaic/'))).toBe(true);
  });
});
