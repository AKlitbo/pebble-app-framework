/**
 * The Clay components the framework's rows take their look from, and the spare Clay they are taken
 * from when a page has none of its own.
 *
 * The location search draws Clay's text box, the dark rounded field with the label above it, and the
 * theme picker draws Clay's select, the chosen name with an arrow beside it over an unseen dropdown.
 * Clay adds a component's style only to a page that registers the component, and registers its own
 * only for the types on the page it was built with. Without it the search shows as a plain white
 * field beside its label on a page with no other text box, and the picker shows the bare dropdown on
 * a page with no other select.
 *
 * A face's page takes them in ts/pkjs/app.ts, and a plugin app's page in tools/pkjs/plugin-page.ts.
 * Node runs the plugin page build straight from its source, and it cannot load an import with no
 * extension, so this file imports nothing but types. It names the rows by their type rather than
 * importing their components, and a spec checks the names against the components.
 */

import type { ClayConfigItem } from './types';

// the phone's bridge, or the stand-in a build puts up. only the listener is reached here, and the
// file declares it itself, since the tools typecheck has no phone types
declare const Pebble: { addEventListener: unknown } | undefined;

/** Clay's constructor, as a spare is built with it. */
export type SpareClayConstructor<Built> = new (config: ClayConfigItem[], customFn: null, options: { autoHandleEvents: boolean }) => Built;

/** The bits of a Clay the looks are registered on. */
export interface LookClay {
  components?: Record<string, unknown>;
  registerComponent(component: unknown): void;
}

/**
 * The framework's rows that take their look from a Clay component, by the row's type, with the type
 * of the Clay component each one borrows.
 */
export const BORROWED_LOOKS: Record<string, string> = {
  locationsearch: 'input',
  themePreview: 'select',
};

/**
 * Builds a Clay only to take the components it registers for a page, without the listener its
 * constructor adds.
 *
 * Clay keeps its own components to itself and registers one only for a row on the page it is built
 * from, so a spare Clay is the way to reach one the real page lacks. Its constructor also adds a
 * ready listener that reads the watch info and the account and watch tokens into the spare, which
 * nothing reads. So the spare is built with Pebble.addEventListener swapped for a function that does
 * nothing, and the real one goes back straight after, even when the build throws. A bridge that will
 * not take the swap keeps its own and is left alone after, and the spare's listener then only fills
 * in fields nobody reads.
 *
 * @param Clay Clay's constructor.
 * @param page The rows to build the spare from.
 * @return The spare Clay.
 */
export function spareClay<Built>(Clay: SpareClayConstructor<Built>, page: ClayConfigItem[]): Built {
  const bridge = typeof Pebble === 'undefined' ? null : Pebble;
  const listen = bridge ? bridge.addEventListener : null;
  const quiet = function () {};
  let swapped = false;

  // a bridge that refuses the swap keeps its listener, which still builds the spare. one whose
  // listener is a getter with no setter throws here, since this file is strict, and putting the
  // listener back after would throw the same way out of the settings page
  try {
    if (bridge) {
      bridge.addEventListener = quiet;
      swapped = bridge.addEventListener === quiet;
    }
  } catch {
    swapped = false;
  }

  try {
    return new Clay(page, null, { autoHandleEvents: false });
  } finally {
    if (bridge && listen && swapped) {
      bridge.addEventListener = listen;
    }
  }
}

/**
 * The Clay components a page's framework rows borrow their look from that nothing has registered. A
 * component already registered, Clay's own or a face's, is the one those rows use.
 *
 * @param components Every component registered on the page's Clay, by name.
 * @param types Every row type on the page, as rowTypes in rows.ts gives them.
 * @return The types of the Clay components to borrow, each once.
 */
export function looksNeeded(components: Record<string, unknown>, types: string[]): string[] {
  return Object.keys(BORROWED_LOOKS)
    .filter((row) => types.indexOf(row) !== -1)
    .map((row) => BORROWED_LOOKS[row])
    .filter((type, index, all) => all.indexOf(type) === index && !(type in components));
}

/**
 * Registers each Clay component a page's framework rows take their look from that nothing has
 * registered, from one spare Clay. A component the page's owner registers itself is left to it, so a
 * face or a plugin app passing its own text box keeps the place it registers it in, and no spare is
 * built for it.
 *
 * @param Clay Clay's constructor, which the spare is built with.
 * @param clay The Clay the page is built on.
 * @param types Every row type on the page, as rowTypes in rows.ts gives them.
 * @param own The names of the components the page's owner registers itself.
 * @return The types it registered, in the order it registered them.
 */
export function borrowLooks<Built extends { components?: Record<string, unknown> }>(Clay: SpareClayConstructor<Built>, clay: LookClay, types: string[], own: unknown[] = []): string[] {
  const looks = looksNeeded(clay.components || {}, types).filter((type) => own.indexOf(type) === -1);

  if (!looks.length) {
    return [];
  }

  const lent = spareClay(Clay, looks.map((type) => ({ type }))).components || {};
  const taken = looks.filter((type) => type in lent);

  taken.forEach((type) => clay.registerComponent(lent[type]));

  return taken;
}
