/**
 * Shared Clay types for the pkjs runtime. They live in the framework rather than
 * in a face's src/pkjs, so the framework never imports from a face.
 */

/** A value Clay stores for a setting: a single value, or the { value } wrapper Clay
 * puts around some component values. */
export type ClayValue = string | number | boolean | { value: string | number | boolean };

/** One choice a select or radio group offers: its label and the value Clay stores. */
export type ClayOption = { label: string; value: string | number };

/** One `visibleWhen` test: the control to read, by messageKey, and either `in`, the values that
 * reveal the item, or `notIn`, the values that hide it. A value neither list names, such as a select
 * left blank by a saved choice it no longer offers, hides an `in` row and shows a `notIn` one. */
export type VisibilityCondition = { key: string; in: Array<string | number | boolean> } | { key: string; notIn: Array<string | number | boolean> };

/** The pictures a themePreview draws for one option. A plain list is drawn on every watch. A map
 * keyed by platform name (emery, gabbro, and so on) draws that watch's own list, so a round watch
 * shows its round shots and a rectangular one shows its. The generator writes whichever shape the
 * face's manifest uses. */
export type ThemePreviewPictures = string[] | Record<string, string[]>;

/**
 * One Clay config item (a section, heading, select, toggle, input, custom
 * component, etc.). The fields both the config builder and the runtime touch are
 * declared. Custom-component props ride along as optional. No index signature, so
 * a face's own typed config array stays assignable to this.
 */
export interface ClayConfigItem {
  type: string;
  /** Names the item for Clay's getItemById, for an item a custom function has to reach. */
  id?: string;
  messageKey?: string;
  label?: string;
  description?: string;
  defaultValue?: string | number | boolean;
  options?: ClayOption[];
  /** heading only: how big the heading is, from 1 to 6. Clay draws 4 when none is given. */
  size?: number;
  /** A name Clay's getItemsByGroup finds the item by, for a custom function that works on several
   * items at once. */
  group?: string;
  items?: ClayConfigItem[];
  attributes?: Record<string, unknown>;
  /** Clay's own per-item filter, resolved against the watch the page was opened from. Names come
   * from Clay's capability map (PLATFORM_GABBRO, BW, HEALTH and so on) and take a NOT_ prefix to
   * invert, so ['NOT_PLATFORM_GABBRO'] drops the item on a round watch and keeps it everywhere
   * else. An item with none declared is always shown. */
  capabilities?: string[];
  /** Marks a `locationsearch` item as a time zone picker. It offers zones and plain offsets beside the
   * places, and the phone sends it to the watch as "offset,label" with the offset read off the zone. */
  timeZone?: boolean;
  // custom components (layoutBuilder / themeBuilder / slotBuilder) carry these
  moduleOptions?: unknown;
  moduleThumbnails?: unknown;
  /** themePreview only: the pictures for each option, keyed by the option's value as a string, from
   * the face's theme-previews.g.js. A value is a list of data URLs, drawn side by side, so a theme
   * can carry one picture or a few (such as a day and a night shot). A value can instead be a map
   * keyed by platform, so a round and a rectangular watch each show their own shots. With
   * previewsByKey set, it nests one level deeper, keyed first by the sibling control's value. */
  previews?: Record<string, ThemePreviewPictures> | Record<string, Record<string, ThemePreviewPictures>>;
  /** themePreview only: the messageKey of another control on the page whose value picks which set of
   * previews to draw. The previews map then nests, keyed first by that control's value and then by the
   * option's value, so the shots under the picker follow a second choice such as the scene. The named
   * control is read once the page is built, and the preview redraws whenever it changes. */
  previewsByKey?: string;
  /** The builder's default intro carries the plain wording here. The page takes it in place of the
   * wording that mentions weather when no Weather section is left once the page is folded, such as
   * on a face whose weather comes from a plugin alone. Clay ignores the field. */
  introWithoutWeather?: string;
  /** hiddenStore only: the extra class that tells one store on a page from another. */
  storeClass?: string;
  /** Shows this item only while another control holds one of the given values, so a row that does
   * nothing under the current choice is hidden rather than left on the page. One condition, or a
   * list of them that all have to hold. `key` is a control's messageKey and `in` the values that
   * reveal this item (a toggle's are `true`/`false`), or `notIn` the values that hide it. The
   * framework wires the showing and hiding when a page has any, ahead of the face's own customClay. */
  visibleWhen?: VisibilityCondition | VisibilityCondition[];
  /** select only: the Pebble app plugin source this choice can read from instead, by category and
   * item, such as weather and location. A face built with plugin sources adds a "Pebble App:
   * Preferred Source" option to it when a plugin on the phone serves that item. Clay ignores the
   * field, so on any other face the select is left as it is. */
  pluginSource?: { category: string; item: string };
  /** The messageKey of a pluginSource select this row means nothing under while a plugin is picked,
   * such as the API key row under WEATHER_PROVIDER. A face built with plugin sources hides the row
   * while that select reads from a plugin. Clay ignores the field, so on any other face the row
   * shows as it always does. */
  pluginSourceHides?: string;
  /** The messageKey of the provider select this text row leads into, such as the builder's line above
   * WEATHER_PROVIDER. It shows with a plugin choice on offer, so the select stays where the wearer
   * found it, and only a page that takes the select away takes this row with it. Clay ignores the
   * field. */
  pluginSourceLead?: string;
  /** The kind of Pebble app plugin data whose notes go straight after this row, such as `music`,
   * `phone`, `weather`, or `calendar`. A face built with that kind's plugin define puts the notes for
   * a kind with no source choice here, such as the one saying to turn plugins on. Without the mark
   * they go at the foot of the page. Clay ignores the field. */
  pluginSourceRows?: string;
  /** pluginNote only: `warning`, the default, with its "!" badge, or `info` for the calmer look. */
  tone?: 'warning' | 'info';
  /** pluginPanel only: what the supported plugins panel lists, every word in it HTML-escaped. */
  panel?: PluginPanelContent;
  /** section only: hides the whole card while every row in it is hidden, and shows it again once
   * any row shows. Clay draws a section as a card it cannot hide, so a section whose rows all hide
   * would leave an empty card. `dependentVisibility` acts on it, and only a section carrying it is
   * hidden. The plugin source page sets it on a section whose rows all hide while a plugin is picked. */
  hideWhenEmpty?: boolean;
  /** color only: false shows the true colours instead of their washed-out sunlight pair. */
  sunlight?: boolean;
  /** slider only: the gap between values. Its decimal places are how far Clay scales the value up for the watch. */
  step?: number;
}

/** One plugin in the supported plugins panel. */
export interface PluginPanelEntry {
  /** The plugin's name. */
  name: string;
  /** A short word after the name, such as that it is installed, or empty for none. */
  tag: string;
  /** The address of its store listing, or empty for a plugin with none. */
  listing: string;
}

/** One kind of data in the supported plugins panel, with the plugins that serve it. */
export interface PluginPanelKind {
  category: string;
  item: string;
  /** The heading over its plugins, such as `Weather`. */
  label: string;
  entries: PluginPanelEntry[];
}

/** What the supported plugins panel shows. Every word is HTML-escaped, since Clay writes the row into a script block. */
export interface PluginPanelContent {
  /** The words the panel shows while it is closed. */
  title: string;
  /** The line under the title once it opens. */
  intro: string;
  /** The line saying to turn plugins on, or empty while the phone lists any plugin. */
  off: string;
  kinds: PluginPanelKind[];
}

/**
 * Per-option presentation metadata, keyed by label in a face's clay/module-meta.ts.
 *
 * embed-thumbnails.ts reads the slug from here, so the thumbnail list has one home rather than a
 * second copy alongside the option list.
 *
 * Here rather than with the builder types because a module-meta.ts is runtime code that config.ts
 * ships. A type import reaching into clay/builder/ would pull that folder into the compiled
 * bundle, which is the one thing those pieces must never do.
 */
export interface ModuleMeta {
  icon: string;
  blockColor: string;
  /** resources/thumbnails/<slug>-<size>.png filename stem. */
  slug: string;
}
