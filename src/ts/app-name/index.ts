/**
 * The app's name, the one way into this folder for the rest of the phone code.
 *
 * The phone build writes its own copy of this file in place of the compiled one, holding the
 * `displayName` from the face's appinfo, so the settings page can name the app it belongs to. Phone
 * code compiled outside the build, such as a spec's, keeps this file as it is, so its `appName` is
 * null.
 *
 * That copy writes the named export alone, so this file has no default export. One here would read as
 * undefined on the phone.
 */

/** The app's `displayName`, written in by the build. Null when the build has not written one. */
export const appName: string | null = null;
