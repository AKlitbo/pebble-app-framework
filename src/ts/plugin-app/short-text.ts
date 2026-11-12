/**
 * The length a plugin app's `shortText` keeps to, and the cut that fits a name into it.
 *
 * The Pebble app warns on a `shortText` longer than this, since the tight spots that read it cut it
 * off. The weather and stock instances both keep to it, apart from the few texts each leaves longer
 * on purpose and says why beside them.
 */

/** The most a `shortText` holds before the Pebble app warns it is too long. */
export const SHORT_TEXT_MAX = 7;

/**
 * A name cut to fit a `shortText`. A name with a short form of its own takes it, and any other is
 * cut to `SHORT_TEXT_MAX`, so a name that fits already goes as it is.
 *
 * @param name The full name.
 * @param shortForms The short forms by full name, or by an id where the caller looks names up by id.
 * @return The short form, or the name cut to fit.
 */
export function shortName(name: string, shortForms: Readonly<Record<string, string>>): string {
  return Object.prototype.hasOwnProperty.call(shortForms, name) ? shortForms[name] : name.slice(0, SHORT_TEXT_MAX);
}
