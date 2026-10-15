/**
 * Shared Clay types for the pkjs runtime. They live in the framework rather than
 * in a face's src/pkjs, so the framework never imports from a face.
 */

/** A value Clay stores for a setting: a single value, or the { value } wrapper Clay
 * puts around some component values. */
export type ClayValue = string | number | boolean | { value: string | number | boolean };

/** One choice a select or radio group offers: its label and the value Clay stores. */
export type ClayOption = { label: string; value: string | number };

/** One `visibleWhen` test: the control to read, by messageKey, and the values that reveal the item. */
export type VisibilityCondition = { key: string; in: Array<string | number | boolean> };

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
  /** input, select, and radiogroup only: how Clay sends the value to the watch. 'string', the
   * default, sends it as it is. 'integer' sends a whole number, and Clay turns any value that is not
   * one into 0, so it only suits a select whose option values are all numbers and that fills a choice
   * setting. A text setting on the watch drops an integer, and a word would land as the first choice. */
  serializeValueAs?: 'string' | 'integer';
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
   * keyed by platform, so a round and a rectangular watch each show their own shots. */
  previews?: Record<string, ThemePreviewPictures>;
  /** hiddenStore only: the extra class that tells one store on a page from another. */
  storeClass?: string;
  /** Shows this item only while another control holds one of the given values, so a row that does
   * nothing under the current choice is hidden rather than left on the page. One condition, or a
   * list of them that all have to hold. `key` is a control's messageKey and `in` the values that
   * reveal this item (a toggle's are `true`/`false`). The framework wires the showing and hiding
   * when a page has any, as long as the face passes no customClay of its own. */
  visibleWhen?: VisibilityCondition | VisibilityCondition[];
  /** color only: false shows the true colours instead of their washed-out sunlight pair. */
  sunlight?: boolean;
  /** slider only: the gap between values. Its decimal places are how far Clay scales the value up for the watch. */
  step?: number;
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
