/**
 * Specs for the shared value checks.
 *
 * isObject guards every read of a JSON file or a face's own settings page, where null and a list both
 * look like objects to typeof. A check that let either through would read a field off null and stop the
 * tool with a TypeError, or read a list as a map of settings.
 */
import { describe, expect, test } from 'vitest';
import { isObject } from './values.ts';

describe('isObject', () => {
  /** null and a list are the two typeof objects a reader must not walk into. */
  test.each([[null], [[]], [undefined], [0], [''], [false], ['dev']])('refuses %j', (value) => {
    const result = isObject(value);

    expect(result).toBe(false);
  });

  /** An empty map is what a plugin with no settings takes, so it has to count. */
  test.each([[{}], [{ dev: {} }]])('takes %j', (value) => {
    const result = isObject(value);

    expect(result).toBe(true);
  });
});
