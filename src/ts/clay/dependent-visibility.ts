/**
 * Shows each item only while the control it depends on holds a value that reveals it.
 *
 * An item declares a `visibleWhen` in its config, one condition or a list that all have to hold, and
 * this hides it whenever the condition does not, so a row that does nothing under the current choice
 * is off the page rather than sitting there looking live. The framework passes this as a page's
 * customClay when the page has any such item and the face passes no customClay of its own.
 *
 * Clay serialises this and re-runs it inside the config webview, so it reaches nothing outside
 * itself: no imports and no module-scope constants. It reads the rules off the items on the page
 * rather than being told them, so one copy drives every face. A hidden item keeps its saved value,
 * so a control turning a section back on brings the earlier choices back.
 */

/** One `visibleWhen` test: a control's messageKey and the values that reveal the dependent item. */
interface Condition {
  key: string;
  in: Array<string | number | boolean>;
}

/** The bits of a Clay row this reaches. */
interface ClayRow {
  config: { visibleWhen?: Condition | Condition[] };
  // the row's own element, so its `hide` class can be toggled straight. the manipulator's hide/show
  // only exist on Clay's built-in controls, not on a locationsearch or a face's own component, and
  // the class is what those methods set anyway
  $element: Array<{ classList: { add(name: string): void; remove(name: string): void } }>;
  get(): unknown;
  on(event: string, handler: () => void): void;
}

/** The bits of the Clay config page this reaches. */
interface ClayPage {
  EVENTS: { AFTER_BUILD: string };
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

      return condition.in.some((wanted) => String(wanted) === String(value));
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

    update();

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
          control.on('change', update);
        }
      });
    });
  });
}
