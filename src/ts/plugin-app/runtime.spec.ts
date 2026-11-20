/**
 * Specs for the words a failed read of a source gives.
 *
 * Every read in the plugin app helpers and a plugin app's own reads give a refusal through
 * `failureReason`, so a page that shows one shows it in the same words wherever it came from. What is
 * worth pinning is which part of the failure wins and that a failure naming nothing still reads as
 * words rather than the text of an object.
 */

import { describe, test, expect } from 'vitest';
import { failureReason, NO_REASON } from './runtime';

describe('failureReason', () => {
  /** A plugin reading sources of its own has to show a refusal in the same words the framework's reads use, or one page reads two ways. */
  test.each([
    [Object.assign(new Error('refused'), { code: 'PERMISSION_DENIED' }), 'PERMISSION_DENIED'],
    [{ code: 0, message: 'Location is off' }, 'Location is off'],
    [{ code: '', message: '' }, NO_REASON],
    [null, NO_REASON],
  ])('reads %o as %s', (error, expected) => {
    const result = failureReason(error);

    expect(result).toBe(expected);
  });
});
