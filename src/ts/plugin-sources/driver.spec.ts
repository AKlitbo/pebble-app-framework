/**
 * Specs for the part of plugin mode every kind shares.
 *
 * How the subscription follows the choice is pinned through each feature's own spec, where the
 * hooks that call it run. Here it is `pluginOnly`, which decides whether a kind loses its source
 * choice, so the lists worth pinning are the ones that come close: a mixed list, an empty one, and
 * none at all.
 */

import { describe, test, expect } from 'vitest';
import { pluginOnly } from './driver';

describe('pluginOnly', () => {
  /** A mixed list read as the plugin alone would take away the custom provider the face offers. */
  test.each([
    ['the plugin alone', ['plugin'], true],
    ['the plugin and a custom provider', ['plugin', 'ical'], false],
    ['a custom provider alone', ['ical'], false],
    ['an empty list', [], false],
    ['no list', undefined, false],
  ])('reads %s', (_label, listed, expected) => {
    const result = pluginOnly(listed, 'plugin');

    expect(result).toBe(expected);
  });
});
