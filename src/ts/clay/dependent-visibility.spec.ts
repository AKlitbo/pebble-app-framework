/**
 * Specs for the dependent-visibility custom function.
 *
 * It is what hides a row that does nothing under the current choice, so the behaviours worth pinning
 * are that a condition that does not hold hides its row, that a row with several conditions needs
 * all of them, and that a change on a control restages the rows. It reads the rules off the page's
 * items and listens to the controls, so the test drives a stand-in page rather than a real Clay one.
 */
import { describe, test, expect } from 'vitest';
import dependentVisibility from './dependent-visibility';

interface Rule {
  key: string;
  in: Array<string | number | boolean>;
}

/** A stand-in Clay row: it toggles a `hide` class on its element the way the real show/hide does. */
class FakeRow {
  private readonly classes = new Set<string>();
  readonly $element = [{
    classList: {
      add: (name: string) => this.classes.add(name),
      remove: (name: string) => this.classes.delete(name),
    },
  }];
  value: unknown;
  readonly changeHandlers: Array<() => void> = [];

  constructor(readonly config: { visibleWhen?: Rule | Rule[] }, value?: unknown) {
    this.value = value;
  }

  get(): unknown {
    return this.value;
  }

  on(event: string, handler: () => void): void {
    if (event === 'change') {
      this.changeHandlers.push(handler);
    }
  }

  /** Shown when nothing has added the `hide` class, which is how the real page reads it. */
  get shown(): boolean {
    return !this.classes.has('hide');
  }
}

/** A stand-in Clay page over a map of rows, keyed by messageKey. */
function makePage(rows: Record<string, FakeRow>) {
  let afterBuild: (() => void) | null = null;
  const page = {
    EVENTS: { AFTER_BUILD: 'after_build' },
    on(event: string, handler: () => void) {
      if (event === 'after_build') {
        afterBuild = handler;
      }
    },
    getAllItems: () => Object.values(rows),
    getItemByMessageKey: (key: string) => rows[key],
  };

  return {
    build: () => {
      dependentVisibility.call(page as unknown as ThisParameterType<typeof dependentVisibility>);
      afterBuild?.();
    },
    setValue: (key: string, value: unknown) => {
      rows[key].value = value;
    },
    fireChange: (key: string) => rows[key].changeHandlers.forEach((handler) => handler()),
  };
}

describe('dependentVisibility', () => {
  /** A row whose condition does not hold is hidden, so a control that does nothing is off the page. */
  test('hides a row whose condition does not hold', () => {
    const rows = {
      MODE: new FakeRow({}, 0),
      SHUFFLE: new FakeRow({ visibleWhen: { key: 'MODE', in: [1] } }),
    };

    makePage(rows).build();

    expect(rows.SHUFFLE.shown).toBe(false);
  });

  /** A row whose condition holds is shown, so the control for the current choice is on the page. */
  test('shows a row whose condition holds', () => {
    const rows = {
      MODE: new FakeRow({}, 1),
      SHUFFLE: new FakeRow({ visibleWhen: { key: 'MODE', in: [1] } }),
    };

    makePage(rows).build();

    expect(rows.SHUFFLE.shown).toBe(true);
  });

  /** A stored value and an option value match as strings, so 1 and "1" are the same choice. */
  test('matches the value as a string', () => {
    const rows = {
      MODE: new FakeRow({}, '1'),
      SHUFFLE: new FakeRow({ visibleWhen: { key: 'MODE', in: [1] } }),
    };

    makePage(rows).build();

    expect(rows.SHUFFLE.shown).toBe(true);
  });

  /** A row with several conditions needs them all, so a nested control shows only when its parent is on too. */
  test('needs every condition when a row lists more than one', () => {
    const rows = {
      MODE: new FakeRow({}, 2),
      NIGHT_ON: new FakeRow({}, false),
      NIGHT: new FakeRow({ visibleWhen: [{ key: 'MODE', in: [2] }, { key: 'NIGHT_ON', in: [true] }] }),
    };
    const page = makePage(rows);

    page.build();

    expect(rows.NIGHT.shown).toBe(false);

    page.setValue('NIGHT_ON', true);
    page.fireChange('NIGHT_ON');

    expect(rows.NIGHT.shown).toBe(true);
  });

  /** A change on a control restages its rows, or the page would freeze on its first-shown state. */
  test('restages the rows when a control changes', () => {
    const rows = {
      MODE: new FakeRow({}, 0),
      SHUFFLE: new FakeRow({ visibleWhen: { key: 'MODE', in: [1] } }),
    };
    const page = makePage(rows);

    page.build();
    page.setValue('MODE', 1);
    page.fireChange('MODE');

    expect(rows.SHUFFLE.shown).toBe(true);
  });

  /** A row with no visibleWhen is left alone, so a plain control is never hidden by this. */
  test('leaves a row with no visibleWhen shown', () => {
    const rows = {
      MODE: new FakeRow({}, 0),
      PLAIN: new FakeRow({}),
    };

    makePage(rows).build();

    expect(rows.PLAIN.shown).toBe(true);
  });
});
