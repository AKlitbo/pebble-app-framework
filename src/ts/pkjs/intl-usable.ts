/**
 * Whether the runtime can build an `Intl.DateTimeFormat` without dying.
 *
 * The phone code and a plugin app's script both format dates with `Intl` where it works, and both
 * ask here first.
 */

/**
 * Whether this runtime has the locale data a formatter needs. The emulator's runtime has none, and
 * building an Intl.DateTimeFormat there runs it out of memory and kills the process, which no
 * try/catch can stop. supportedLocalesOf reads the same list without building a formatter, so an
 * empty answer means leave the formatter alone.
 *
 * @return True when a formatter can be built.
 */
export function intlUsable(): boolean {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf(['en']).length > 0;
  } catch (error) {
    return false;
  }
}

export default { intlUsable };
