/**
 * Specs for the fingerprint phone code and plugin apps keep in place of a key or a link.
 *
 * The quota ledgers keep their stamps under the fingerprint of the key in use, and a plugin app keeps
 * one to notice a changed link. A fingerprint that came out differently after an update would read
 * as a new key, so every saved count would start again and a metered plan could run past its limit.
 * The values are pinned as literals for that reason.
 */

import { describe, test, expect } from 'vitest';
import { fingerprint } from './fingerprint';

describe('fingerprint', () => {
  /** A ledger saved by an older release holds these values, and a different one starts its count again. */
  test.each([
    ['', '45h'],
    ['k', '3t1q'],
    ['demo-key-123', '1r8gw1'],
    ['https://calendar.google.com/calendar/ical/x/private-abc/basic.ics', 'mc9q69'],
    ['ключ😀', 'p6ujgw'],
  ])('fingerprints %j as %s', (text, expected) => {
    const result = fingerprint(text);

    expect(result).toBe(expected);
  });
});
