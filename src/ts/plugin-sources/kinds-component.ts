/**
 * A Clay component holding where each plugin kind stands as the settings page opens, which the page
 * hooks put first on the page so a face's own components can read it.
 *
 * It is a hidden input on Clay's `val` manipulator, like the hidden store, and shows nothing. It
 * carries its own class rather than the hidden store's `pf-hidden-store`, so a face whose component
 * finds its own store with a plain `.pf-hidden-store` lookup still finds its own, even though this
 * one is built first. Its row has no message key, so Clay never saves it and it never reaches the
 * watch.
 *
 * It lives with the plugin sources, so a face built with no plugin define carries none of it. The
 * page hooks hand it to the app with their other components, and the app registers it only for a
 * page holding the row.
 */

/** The row type the component draws. */
export const PLUGIN_KINDS_TYPE = 'pluginKinds';

/**
 * The class a face's component finds the input by. Its value is JSON mapping each kind the face
 * reads from a plugin, by its name in the providers list, to its `PluginKindState`, such as
 * `{"weather":"served","music":"off"}`. A kind the face does not read from a plugin is left out.
 */
export const PLUGIN_KINDS_CLASS = 'pf-plugin-kinds';

export default {
  name: PLUGIN_KINDS_TYPE,

  // the input is the manipulator target itself, so Clay's val sets the row's value on it
  template: `<input type="hidden" class="${PLUGIN_KINDS_CLASS}" data-manipulator-target>`,

  manipulator: 'val',
};
