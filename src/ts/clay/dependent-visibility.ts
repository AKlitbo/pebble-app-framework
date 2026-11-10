/**
 * Shows each item only while the control it depends on holds a value that reveals it.
 *
 * An item declares a `visibleWhen` in its config, one condition or a list that all have to hold, and
 * this hides it whenever the condition does not, so a row that does nothing under the current choice
 * is off the page rather than sitting there looking live. The framework runs this on a page that has
 * any such item, ahead of the face's own customClay when it passes one.
 *
 * Clay serialises this and re-runs it inside the config webview, so it reaches nothing outside
 * itself: no imports and no module-scope constants. It reads the rules off the items on the page
 * rather than being told them, so one copy drives every face. A hidden item keeps its saved value,
 * so a control turning a section back on brings the earlier choices back.
 *
 * A section marked `hideWhenEmpty` is hidden too while every row in it is hidden, since Clay draws a
 * section as a card and an empty one would stay on the page. A section without the mark stays as
 * Clay drew it.
 */

/** One `visibleWhen` test: a control's messageKey and the values that reveal the dependent item, or the values that hide it. */
interface Condition {
  key: string;
  in?: Array<string | number | boolean>;
  notIn?: Array<string | number | boolean>;
}

/** The bits of an element this reaches, a row's own or the section card around it. */
interface PageElement {
  classList: { add(name: string): void; remove(name: string): void; contains(name: string): boolean };
  /** The element's children, which for a section card are its rows. */
  children?: ArrayLike<PageElement>;
  /** The nearest element up from this one that matches, itself included. */
  closest?(selector: string): PageElement | null;
}

/** The bits of a page item's config this reaches, a section's included. */
interface PageItem {
  type?: string;
  messageKey?: string;
  hideWhenEmpty?: boolean;
  items?: PageItem[];
}

/** The bits of a Clay row this reaches. */
interface ClayRow {
  config: { visibleWhen?: Condition | Condition[] };
  // the row's own element, so its `hide` class can be toggled straight. the manipulator's hide/show
  // only exist on Clay's built-in controls, not on a locationsearch or a face's own component, and
  // the class is what those methods set anyway
  $element: PageElement[];
  get(): unknown;
  on(event: string, handler: () => void): void;
}

/** The bits of the Clay config page this reaches. */
interface ClayPage {
  EVENTS: { AFTER_BUILD: string };
  /** The page the rows were built from, sections included. */
  config?: PageItem[];
  on(event: string, handler: () => void): void;
  getAllItems(): ClayRow[];
  getItemByMessageKey(messageKey: string): ClayRow | undefined;
}

export default function dependentVisibility(this: ClayPage): void {
  // arrows rather than a this alias, so the handlers reach the page without carrying a copy
  this.on(this.EVENTS.AFTER_BUILD, () => {
    const dependents = this.getAllItems().filter((item) => item.config && item.config.visibleWhen);

    if (!dependents.length) {
      return;
    }

    const conditionsOf = (item: ClayRow): Condition[] => {
      const rule = item.config.visibleWhen;

      return Array.isArray(rule) ? rule : rule ? [rule] : [];
    };

    // compared as strings so a stored "1" matches an option value of 1, and a toggle's true matches true
    const holds = (condition: Condition): boolean => {
      const control = this.getItemByMessageKey(condition.key);

      if (!control) {
        return false;
      }

      const value = control.get();
      const named = (list: Array<string | number | boolean>) => list.some((wanted) => String(wanted) === String(value));

      // a notIn row shows for any value the list leaves out, a blank one included
      return condition.notIn ? !named(condition.notIn) : named(condition.in || []);
    };

    const update = () => {
      dependents.forEach((item) => {
        const root = item.$element && item.$element[0];

        if (!root) {
          return;
        }

        if (conditionsOf(item).every(holds)) {
          root.classList.remove('hide');
        } else {
          root.classList.add('hide');
        }
      });
    };

    // the card of each section marked to hide when empty. Clay keeps nothing that leads from a
    // section's config to its card, so the card is found from the element of a row inside it. a
    // section with no row reachable by its message key is left as Clay drew it
    const cards: PageElement[] = [];

    const findCards = (items: PageItem[]) => {
      items.forEach((item) => {
        if (item.type === 'section' && item.hideWhenEmpty) {
          const keyed = (item.items || []).map((row) => (row.messageKey ? this.getItemByMessageKey(row.messageKey) : undefined)).find((row) => row && row.$element && row.$element[0]);
          const card = keyed && keyed.$element[0].closest ? keyed.$element[0].closest('.section') : null;

          if (card && cards.indexOf(card) === -1) {
            cards.push(card);
          }
        }

        findCards(item.items || []);
      });
    };

    findCards(Array.isArray(this.config) ? this.config : []);

    const updateCards = () => {
      cards.forEach((card) => {
        const rows = Array.prototype.slice.call(card.children || []) as PageElement[];

        if (rows.every((row) => row.classList.contains('hide'))) {
          card.classList.add('hide');
        } else {
          card.classList.remove('hide');
        }
      });
    };

    update();
    updateCards();

    // listen to each control a condition names, once each, so a change restages the dependents
    const listened: Record<string, boolean> = {};

    dependents.forEach((item) => {
      conditionsOf(item).forEach((condition) => {
        if (listened[condition.key]) {
          return;
        }

        listened[condition.key] = true;
        const control = this.getItemByMessageKey(condition.key);

        if (control) {
          control.on('change', () => {
            update();
            updateCards();
          });
        }
      });
    });
  });
}
