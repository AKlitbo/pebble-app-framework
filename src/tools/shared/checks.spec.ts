/**
 * Specs for what the face-side checks share.
 *
 * A check that stops on one broken face hides what it would have found in the rest, which reads as
 * a pass in CI, so that guard is what is worth pinning. The guard against a check that looks at no
 * face is requireMounted, which faces.spec.ts pins.
 */
import { describe, expect, test } from 'vitest';
import { checkFace } from './checks.ts';
import { ToolError } from './tool-error.ts';

describe('checkFace', () => {
  /** One face that throws would otherwise end the run and hide every problem in the faces after it. */
  test('turns a face that throws into a problem line and returns', async () => {
    const problems: string[] = [];

    await checkFace('gridlock', problems, () => {
      throw new ToolError('no module-meta.ts');
    });

    expect(problems).toEqual(['gridlock: could not be checked, no module-meta.ts']);
  });

  /** A bug in a check reported as one line would leave nothing pointing at the line that broke. */
  test('keeps the stack for anything but a ToolError', async () => {
    const problems: string[] = [];

    await checkFace('gridlock', problems, () => {
      throw new TypeError('cannot read the media list');
    });

    expect(problems[0]).toMatch(/^gridlock: could not be checked, TypeError: cannot read the media list\n\s+at /);
  });

  /** A face that passes leaves nothing behind, so a clean unit still reports clean. */
  test('adds nothing for a face that checks cleanly', async () => {
    const problems: string[] = [];

    await checkFace('gridlock', problems, () => undefined);

    expect(problems).toEqual([]);
  });
});
