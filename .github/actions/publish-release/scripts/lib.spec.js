/**
 * Specs for naming the release assets.
 *
 * The name is all a wearer has to go on when picking a download. What is worth pinning is that a pbw for one
 * watch says which, and one for several does not claim to be for just one of them.
 */
import { describe, expect, test } from 'vitest';
import { assetName } from './lib.js';

describe('assetName', () => {
  /** A plugin app lists no platforms, and naming it from an empty list crashed the step after the whole build. */
  test('names a plugin app by its version alone', () => {
    const result = assetName('calendar-ical', null, '1.0.0');

    expect(result).toBe('calendar-ical-1.0.0.pbw');
  });

  /** Without the platform in the name, a gabbro owner cannot tell an emery-only pbw will not install. */
  test('names the watch for a pbw built for one platform', () => {
    const result = assetName('lcars-stardate', ['emery'], '1.11.0');

    expect(result).toBe('lcars-stardate-emery-1.11.0.pbw');
  });

  /** Naming a pbw for emery and gabbro after either one would tell the other's owners it is not for them. */
  test('leaves the platform out for a pbw built for several', () => {
    const result = assetName('ridgeline', ['emery', 'gabbro'], '1.5.0');

    expect(result).toBe('ridgeline-1.5.0.pbw');
  });
});
