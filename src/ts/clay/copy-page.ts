/**
 * Copying a settings page, so code that changes one can leave the face's own page as it was.
 */

/**
 * A copy of a value from a settings page, down through every plain object and list. Anything else,
 * such as a function a custom component carries, is kept as it is.
 *
 * @param value The page, a row, or anything inside one.
 * @return The copy.
 */
export function copyPage<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => copyPage(entry)) as T;
  }

  if (value && typeof value === 'object' && [Object.prototype, null].indexOf(Object.getPrototypeOf(value)) !== -1) {
    const copy: Record<string, unknown> = {};

    Object.keys(value).forEach((key) => {
      copy[key] = copyPage((value as Record<string, unknown>)[key]);
    });

    return copy as T;
  }

  return value;
}

export default { copyPage };
