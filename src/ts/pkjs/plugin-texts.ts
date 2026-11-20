/**
 * The face's own wording for the plugin rows and the supported plugins panel, held where every plugin
 * source page reads it.
 *
 * A face passes it to startPebbleApp as `pluginTexts`. faceStart keeps it here, and it is what the
 * phone, the build's own page load, and clay-preview all start the face through, so each of them opens
 * the page in the face's words. pluginSourcePage reads it for every kind and the panel, so no feature
 * or driver hands it on, and a new kind gets it without asking.
 *
 * This file is in every face's phone bundle, since app.ts sets it, so it holds the wording alone and
 * imports nothing but types.
 */

import type { PluginTextOverrides } from '../plugin-sources/page';

/** The wording the face started with, empty for a face that passes none. */
let held: PluginTextOverrides = {};

/**
 * Keeps the face's wording for every plugin source page from here on, in place of any kept before.
 *
 * @param texts What the face passed as `pluginTexts`, or undefined for none.
 */
export function keepPluginTexts(texts: PluginTextOverrides | undefined): void {
  held = texts || {};
}

/**
 * The face's own wording, as faceStart last kept it.
 *
 * @return The wording by kind and for the panel, empty when the face passed none.
 */
export function pluginTexts(): PluginTextOverrides {
  return held;
}

export default { keepPluginTexts, pluginTexts };
