/**
 * Walking the rows of a settings page, sections and the rows inside them, and taking rows off it.
 *
 * The plugin source page, the supported plugins panel, and the face providers' passes all change a
 * page by finding rows wherever they sit, so they share these.
 */

import type { ClayConfigItem, ClayOption, VisibilityCondition } from './types';

/**
 * A select's options with Clay's option groups opened up, in the order the select lists them. Clay
 * draws an option whose `value` is a list as a group of the options in that list.
 *
 * @param options The options a row carries, which may be missing or hold anything.
 * @return Every option that saves a value, groups and all.
 */
export function flatOptions(options: unknown): ClayOption[] {
  if (!Array.isArray(options)) {
    return [];
  }

  return options.flatMap((option): ClayOption[] => {
    if (!option || typeof option !== 'object') {
      return [];
    }

    const value = (option as { value?: unknown }).value;

    return Array.isArray(value) ? flatOptions(value) : [option as ClayOption];
  });
}

/**
 * Every row on the page, sections and the rows inside them, in page order.
 *
 * @param items The page, or a section's rows.
 * @param into The list to add the rows to, a new one when left out.
 * @return Every row, each section before the rows inside it.
 */
export function allItems(items: ClayConfigItem[], into: ClayConfigItem[] = []): ClayConfigItem[] {
  items.forEach((item) => {
    into.push(item);

    if (item.items) {
      allItems(item.items, into);
    }
  });
  return into;
}

/**
 * A matching row, and the list holding it, the page itself or a section's rows. A list is searched
 * before the sections inside it, so a match at the top of the page wins over one in a section.
 *
 * @param items The page, or a section's rows.
 * @param matches Whether a row is the one wanted.
 * @return The row and its list, or undefined when none matches.
 */
export function findRow(items: ClayConfigItem[], matches: (item: ClayConfigItem) => boolean): { row: ClayConfigItem; list: ClayConfigItem[] } | undefined {
  const here = items.find(matches);

  if (here) {
    return { row: here, list: items };
  }

  for (const item of items) {
    const found = item.items ? findRow(item.items, matches) : undefined;

    if (found) {
      return found;
    }
  }

  return undefined;
}

/**
 * The list a matching row sits in, the page itself or a section's rows.
 *
 * @param items The page, or a section's rows.
 * @param matches Whether a row is the one wanted.
 * @return The list holding the first matching row, or undefined when none matches.
 */
export function listHolding(items: ClayConfigItem[], matches: (item: ClayConfigItem) => boolean): ClayConfigItem[] | undefined {
  const found = findRow(items, matches);

  return found ? found.list : undefined;
}

/**
 * Where a row added at the foot of the page goes: after the page's last row, or before the save
 * button when the page ends on one.
 *
 * @param page The settings page.
 * @return The position in the page to add the row at.
 */
export function footIndex(page: ClayConfigItem[]): number {
  let at = page.length;

  while (at > 0 && page[at - 1].type === 'submit') {
    at--;
  }

  return at;
}

/**
 * Takes every matching row off the page, wherever it sits. A section that loses a row and is left
 * with nothing but headings goes too, since Clay would still draw it as a card with its headings
 * standing over nothing.
 *
 * @param items The page, or a section's rows. It is changed in place.
 * @param drop Whether a row is one to take off.
 * @return True when anything at this level or below was taken off.
 */
export function dropRows(items: ClayConfigItem[], drop: (item: ClayConfigItem) => boolean): boolean {
  let dropped = false;

  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];

    if (drop(item)) {
      items.splice(index, 1);
      dropped = true;
    } else if (item.items && dropRows(item.items, drop)) {
      dropped = true;

      if (item.type === 'section' && item.items.every((row) => row.type === 'heading')) {
        items.splice(index, 1);
      }
    }
  }

  return dropped;
}

/**
 * Takes one row off the page, wherever it sits, and its section with it when only headings are left.
 * A row that is not on the page is left be.
 *
 * @param page The settings page. It is changed in place.
 * @param target The row to take off.
 */
export function dropRow(page: ClayConfigItem[], target: ClayConfigItem): void {
  dropRows(page, (item) => item === target);
}

/**
 * A row's visibleWhen as a list, whichever of its two forms it takes.
 *
 * @param item The row.
 * @return Its conditions, empty for a row with none.
 */
export function conditionsOf(item: ClayConfigItem): VisibilityCondition[] {
  if (Array.isArray(item.visibleWhen)) {
    return item.visibleWhen;
  }

  return item.visibleWhen ? [item.visibleWhen] : [];
}

/**
 * Settles every visibleWhen condition naming a control that has left the page.
 *
 * `dependentVisibility` reads a condition on a control that is not on the page as false, so leaving
 * one would hide its row for good. A control dropped with one value left goes on saving that value,
 * so each condition is settled against it. One that holds comes off and its row shows. One that fails
 * stays, and its row stays hidden as the face meant. With no value given, every condition naming the
 * control comes off and each row shows.
 *
 * @param page The settings page. It is changed in place.
 * @param key The messageKey of the control that left.
 * @param onlyValue The value the control goes on saving, or undefined when there is none.
 */
export function settleConditions(page: ClayConfigItem[], key: string, onlyValue?: string | number | boolean): void {
  // compared as text, the way dependentVisibility compares a control's value
  const fails = (condition: VisibilityCondition) => {
    if (onlyValue === undefined) {
      return false;
    }

    const named = (list: Array<string | number | boolean>) => list.some((wanted) => String(wanted) === String(onlyValue));

    return 'notIn' in condition ? named(condition.notIn) : !named(condition.in);
  };

  allItems(page).forEach((item) => {
    const conditions = conditionsOf(item);
    const kept = conditions.filter((condition) => condition.key !== key || fails(condition));

    if (kept.length === conditions.length) {
      return;
    }

    if (kept.length) {
      item.visibleWhen = kept;
    } else {
      delete item.visibleWhen;
    }
  });
}

/**
 * Takes the builder's default intro back to its plain wording when no Weather section is left.
 *
 * The builder writes the wording that mentions weather for a face whose page has a Weather section.
 * A fold can take that section off, such as the face providers' pass on a face whose weather comes
 * from a plugin alone and that shows no unit, and the intro would then promise settings the page
 * no longer has. A section counts while its Weather heading is on the page, since a section goes
 * with the last of its rows. The mark comes off either way, so it is settled once.
 *
 * @param page The settings page. It is changed in place.
 */
export function settleIntro(page: ClayConfigItem[]): void {
  const rows = allItems(page);
  const hasWeather = rows.some((item) => item.type === 'heading' && item.defaultValue === 'Weather');

  rows.forEach((item) => {
    if (typeof item.introWithoutWeather !== 'string') {
      return;
    }

    if (!hasWeather) {
      item.defaultValue = item.introWithoutWeather;
    }

    delete item.introWithoutWeather;
  });
}

export default { allItems, conditionsOf, dropRow, dropRows, findRow, footIndex, listHolding, settleConditions, settleIntro };
