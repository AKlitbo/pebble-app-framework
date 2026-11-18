/**
 * Getting a theme picker's pictures ready for the one watch the settings page opens on.
 *
 * A face's previews carry every platform's shots, and a picker with previewsByKey carries a whole
 * set for every value of the other control, which can run to megabytes of base64. Clay writes the
 * whole page into its data URL each time the page opens, so the page only gets the shots the watch in
 * hand would draw.
 *
 * A row's previews can also be a function that hands the map back, so a face that requires its
 * generated file inside it only loads the pictures once the settings page opens. The functions are
 * taken off the page before anything builds Clay and kept in a table by the picker's messageKey,
 * since Clay rebuilds every function on its page from the function's text, which loses the require
 * inside it. Each open calls the function again and cuts for the watch Clay read when the phone code
 * became ready.
 */
import type { ClayConfigItem, ClayOption, ThemePreviewMap, ThemePreviewPictures } from './types';

/** The component type of the theme picker, whose rows carry previews. */
const PICKER = 'themePreview';

/** A face's previews functions, by the messageKey of the picker each belongs to. */
export type PreviewLoaders = Record<string, () => ThemePreviewMap>;

/** The Clay a page's URL is written from, the parts of it this reads and sets. */
export interface PreviewClay {
  config: unknown[];
  meta?: unknown;
  generateUrl(): string;
}

/**
 * Whether one option's previews carry at least one picture, across both shapes they can take, a plain
 * list or a list per platform.
 *
 * @param pictures One option's pictures.
 * @return True when there is a picture to draw.
 */
export function hasPicture(pictures?: ThemePreviewPictures): boolean {
  if (!pictures) {
    return false;
  }

  if (Array.isArray(pictures)) {
    return pictures.length > 0;
  }

  return Object.keys(pictures).some((platform) => (pictures[platform] || []).length > 0);
}

/**
 * Warns for each option a previews map has no picture for. An option with no picture still shows by
 * its name alone, so the picker is not where this gets noticed, and the warning turns up in the
 * preview tool's console instead.
 *
 * @param options The picker's options.
 * @param map The option value to pictures map.
 * @param where What the map is, which the warning opens with.
 */
export function warnMissingPictures(options: ClayOption[] | undefined, map: Record<string, ThemePreviewPictures>, where: string): void {
  (options || []).forEach((option) => {
    if (!hasPicture(map[String(option.value)])) {
      console.warn(`${where} has no picture for "${option.label}" (value ${option.value})`);
    }
  });
}

/**
 * The one platform's shots a theme would draw on a watch, the same choice the picker makes.
 *
 * The picker draws the watch's own list when the theme has a non-empty one, and otherwise the first
 * list the theme carries, which is also what it draws when it does not know the watch. Keeping only
 * that list leaves the page drawing exactly what it would have drawn with all of them. A flat list is
 * the same on every watch, so it stays as it is.
 *
 * @param pictures One theme's pictures, a list or a map of lists by platform.
 * @param platform The watch the page opens on, such as emery, or empty when it is not known.
 * @return The pictures, with a map cut down to the one list the picker would draw.
 */
export function picturesForWatch(pictures: ThemePreviewPictures, platform: string): ThemePreviewPictures {
  if (!pictures || typeof pictures !== 'object' || Array.isArray(pictures)) {
    return pictures;
  }

  const own = platform ? pictures[platform] : undefined;

  if (own && own.length) {
    return { [platform]: own };
  }

  const first = Object.keys(pictures)[0];

  return first === undefined ? pictures : { [first]: pictures[first] };
}

/** Cuts every theme in a previews map down to one watch's shots. A map nested under previewsByKey
 * is cut one level down, inside each of the other control's values. Anything that is not an object
 * is handed back as it is, since the picker draws nothing from it either way. */
function mapForWatch(map: unknown, nested: boolean, platform: string): unknown {
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    return map;
  }

  const cut: Record<string, unknown> = {};

  Object.keys(map).forEach((value) => {
    const entry = (map as Record<string, unknown>)[value];

    cut[value] = nested ? mapForWatch(entry, false, platform) : picturesForWatch(entry as ThemePreviewPictures, platform);
  });

  return cut;
}

/** Walks a page, sections included, handing each theme picker row to change and keeping every other
 * row as it is. A list holding no changed row comes back as the very same list, and so does anything
 * that is not a list at all. */
function mapPickers(items: ClayConfigItem[], change: (item: ClayConfigItem) => ClayConfigItem): ClayConfigItem[] {
  if (!Array.isArray(items)) {
    return items;
  }

  let changed = false;

  const mapped = items.map((item) => {
    let next = item;

    if (item.type === PICKER && item.previews !== undefined) {
      next = change(item);
    } else if (item.items) {
      const inner = mapPickers(item.items, change);

      next = inner === item.items ? item : { ...item, items: inner };
    }

    changed = changed || next !== item;
    return next;
  });

  return changed ? mapped : items;
}

/**
 * Takes every previews function off a page, so nothing that builds Clay ever sees one.
 *
 * Each function's picker keeps an empty map in its place, and the function goes in a table under the
 * picker's messageKey, which the settings page reads back as it opens. A picker with no messageKey
 * has nothing to file its function under, so it opens with no pictures and a warning says why.
 *
 * @param page The face's settings page.
 * @return A copy of the page with no function under any picker's previews, and the functions taken off it.
 */
export function takePreviewLoaders(page: ClayConfigItem[]): { page: ClayConfigItem[]; loaders: PreviewLoaders } {
  const loaders: PreviewLoaders = {};

  const taken = mapPickers(page, (item) => {
    if (typeof item.previews !== 'function') {
      return item;
    }

    if (item.messageKey) {
      loaders[item.messageKey] = item.previews;
    } else {
      console.warn(`the ${item.label || PICKER} picker has a previews function but no messageKey to keep it under, so it opens without pictures`);
    }

    return { ...item, previews: {} };
  });

  return { page: taken, loaders };
}

/** Calls a previews function and hands back the map it gives, warning for each option it has no
 * picture for. One that throws leaves the picker with no pictures rather than stopping the settings
 * page from opening. */
function loadPreviews(item: ClayConfigItem, load: () => ThemePreviewMap): unknown {
  const label = item.label || item.messageKey || PICKER;

  try {
    const map = load();
    const where = `the ${label} picker`;

    if (map && typeof map === 'object') {
      const nested = map as Record<string, unknown>;
      const groups: Array<[string, unknown]> = item.previewsByKey ? Object.keys(nested).map((key) => [`${where} under "${key}"`, nested[key]]) : [[where, map]];

      groups.forEach(([at, group]) => warnMissingPictures(item.options, (group || {}) as Record<string, ThemePreviewPictures>, at));
    }

    return map;
  } catch (error) {
    console.log(`the previews for the ${label} picker would not load, so it opens without pictures: ${error}`);
    return {};
  }
}

/**
 * A copy of the page with every theme picker's previews loaded and cut down to one watch's shots.
 *
 * A picker whose function sits in the loaders table has it called here, and so does one whose
 * previews is still a function, so the pictures load only as the page opens. The page handed in is
 * left as it was. Rows other than the pickers are the same objects in the copy.
 *
 * @param page The settings page about to open.
 * @param platform The watch it opens on, such as emery, or empty when it is not known.
 * @param loaders The previews functions takePreviewLoaders took off the page, by messageKey.
 * @return The page to write into the URL.
 */
export function pageForWatch(page: ClayConfigItem[], platform: string, loaders: PreviewLoaders = {}): ClayConfigItem[] {
  return mapPickers(page, (item) => {
    const source = item.previews;
    const load = typeof source === 'function' ? source : item.messageKey ? loaders[item.messageKey] : undefined;
    const map = load ? loadPreviews(item, load) : source;

    return { ...item, previews: mapForWatch(map, Boolean(item.previewsByKey), platform) as ThemePreviewMap };
  });
}

/**
 * The platform of the watch a Clay page was opened from, as Clay's meta holds it. The picker reads
 * the same field in the page, so the cut and the drawing always agree.
 *
 * @param clay The Clay page.
 * @return The platform, such as emery, or empty when Clay holds no watch.
 */
export function watchPlatform(clay: PreviewClay): string {
  const meta = clay.meta as { activeWatchInfo?: { platform?: unknown } | null } | undefined;
  const platform = meta && meta.activeWatchInfo ? meta.activeWatchInfo.platform : undefined;

  return typeof platform === 'string' ? platform : '';
}

/**
 * Writes the settings page's URL for the watch it opens on.
 *
 * Clay writes the page from its config, so for the one generateUrl it holds the page with each
 * picker's previews loaded and cut to the watch in its meta. It gets its own page back straight
 * after, since the next open may come from another watch and needs its own cut.
 *
 * @param clay The Clay page, set up for this open.
 * @param loaders The previews functions takePreviewLoaders took off the page, by messageKey.
 * @return The data URL to open.
 */
export function settingsPageUrl(clay: PreviewClay, loaders: PreviewLoaders): string {
  const page = clay.config as ClayConfigItem[];

  clay.config = pageForWatch(page, watchPlatform(clay), loaders);

  try {
    return clay.generateUrl();
  } finally {
    clay.config = page;
  }
}

export default { hasPicture, picturesForWatch, takePreviewLoaders, pageForWatch, watchPlatform, settingsPageUrl };
