/**
 * Shared Clay types for the pkjs runtime. Kept in lib (not imported from
 * src/pkjs) so lib stays independent as the copy-as-starter base.
 */

/** A value Clay stores for a setting: a single value, or the { value } wrapper Clay
 * puts around some component values. */
export type ClayValue = string | number | boolean | { value: string | number | boolean };

/** One choice a select or radio group offers: its label and the value Clay stores. */
export type ClayOption = { label: string; value: string | number };

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
  /** hiddenStore only: the extra class that tells one store on a page from another. */
  storeClass?: string;
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
