/**
 * Small checks on values read from JSON or handed over by a face's own code.
 */

/**
 * Whether a value is a plain object, rather than null, an array, or a single value.
 *
 * @param value The value to check.
 * @return True for an object that is not null and not an array.
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
