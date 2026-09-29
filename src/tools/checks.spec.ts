/**
 * Specs for what the face-side checks share.
 *
 * A check that looks at no face prints that every face is current, and a check that stops on one
 * broken face hides what it would have found in the rest. Both read as a pass in CI, so the guards
 * against them are what is worth pinning.
 */
import { describe, expect, test } from 'vitest';
import { checkFace, facesToCheck } from './checks.ts';

describe('facesToCheck', () => {
  /** A unit that forgot to list paf in its workspaces would otherwise pass every check having checked nothing. */
  test('stops when no unit mounts the framework', () => {
    const call = () => facesToCheck(false, () => ['gridlock']);

    expect(call).toThrow(/No unit mounts this framework/);
  });

  /** A unit whose face lookup finds nothing would otherwise report every face current. */
  test('stops when the unit holds no faces', () => {
    const call = () => facesToCheck(true, () => []);

    expect(call).toThrow('The unit holds no faces to check.');
  });

  /** The faces the check goes on to look at are the unit's own, in the order the lookup gives them. */
  test('gives the unit\'s faces when there are some', () => {
    const result = facesToCheck(true, () => ['gridlock', 'sidereel']);

    expect(result).toEqual(['gridlock', 'sidereel']);
  });
});

describe('checkFace', () => {
  /** One face that throws would otherwise end the run and hide every problem in the faces after it. */
  test('turns a face that throws into a problem line and returns', async () => {
    const problems: string[] = [];

    await checkFace('gridlock', problems, () => {
      throw new Error('no module-meta.ts');
    });

    expect(problems).toEqual(['gridlock: could not be checked, no module-meta.ts']);
  });

  /** A face that passes leaves nothing behind, so a clean unit still reports clean. */
  test('adds nothing for a face that checks cleanly', async () => {
    const problems: string[] = [];

    await checkFace('gridlock', problems, () => undefined);

    expect(problems).toEqual([]);
  });
});
