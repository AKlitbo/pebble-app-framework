/**
 * Specs for the dependent-visibility custom function.
 *
 * It is what hides a row that does nothing under the current choice, so the behaviours worth pinning
 * are that a condition that does not hold hides its row, that a row with several conditions needs
 * all of them, that a `notIn` row shows for a value its list leaves out, a blank one included, and
 * that a change on a control restages the rows. A section marked to hide when empty
 * has to go and come back with its rows, and one without the mark has to stay as Clay drew it. It
 * reads the rules off the page's items and listens to the controls, so the test drives a stand-in
 * page rather than a real Clay one.
 */
import { describe, test, expect } from 'vitest';
import dependentVisibility from './dependent-visibility';

interface Rule {
  key: string;
  in?: Array<string | number | boolean>;
  notIn?: Array<string | number | boolean>;
}

/** A stand-in section card, the element Clay wraps a section's rows in. */
class FakeCard {
  private readonly classes = new Set<string>();
  readonly classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
    contains: (name: string) => this.classes.has(name),
  };
  readonly children: unknown[] = [];

  /** Puts rows in the card, the way Clay adds each row's element to its section. */
  hold(...rows: FakeRow[]): this {
    rows.forEach((row) => {
      row.card = this;
      this.children.push(row.$element[0]);
    });
    return this;
  }

  /** Shown when nothing has added the `hide` class. */
  get shown(): boolean {
    return !this.classes.has('hide');
  }
}

/** A stand-in Clay row: it toggles a `hide` class on its element the way the real show/hide does. */
class FakeRow {
  private readonly classes = new Set<string>();
  card: FakeCard | null = null;
  readonly $element = [{
    classList: {
      add: (name: string) => this.classes.add(name),
      remove: (name: string) => this.classes.delete(name),
      contains: (name: string) => this.classes.has(name),
    },
    closest: (selector: string) => (selector === '.section' ? this.card : null),
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

/** A stand-in Clay page over a map of rows, keyed by messageKey, and the config the page was built from. */
function makePage(rows: Record<string, FakeRow>, config: unknown[] = []) {
  let afterBuild: (() => void) | null = null;
  const page = {
    EVENTS: { AFTER_BUILD: 'after_build' },
    config,
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

  /**
   * A key row hidden for the keyless providers has to show under a blank select, which is what a
   * saved provider the page no longer offers leaves, or the wearer could never fill the key in.
   */
  test.each([
    ['a value the list leaves out', 'owm', true],
    ['a blank value', '', true],
    ['a value the list names', 'openmeteo', false],
  ])('shows a notIn row for %s only when the list leaves it out', (_name, value, shown) => {
    const rows = {
      PROVIDER: new FakeRow({}, value),
      KEY: new FakeRow({ visibleWhen: { key: 'PROVIDER', notIn: ['openmeteo'] } }),
    };

    makePage(rows).build();

    expect(rows.KEY.shown).toBe(shown);
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

describe('dependentVisibility sections', () => {
  /** The location card's rows and the select they hide behind, with the card holding the rows. */
  function locationPage(hideWhenEmpty: boolean) {
    const rows = {
      SOURCE: new FakeRow({}, 'plugin'),
      GPS: new FakeRow({ visibleWhen: { key: 'SOURCE', in: ['fetch'] } }),
      CITY: new FakeRow({ visibleWhen: { key: 'SOURCE', in: ['fetch'] } }),
    };
    const card = new FakeCard().hold(rows.GPS, rows.CITY);
    const config = [
      { type: 'section', items: [{ type: 'select', messageKey: 'SOURCE' }] },
      { type: 'section', ...(hideWhenEmpty ? { hideWhenEmpty: true } : {}), items: [{ type: 'toggle', messageKey: 'GPS' }, { type: 'input', messageKey: 'CITY' }] },
    ];

    return { card, page: makePage(rows, config) };
  }

  /** Clay cannot hide a card, so without this every row hiding leaves an empty Location Settings card on the page. */
  test('hides a marked section while every row in it is hidden, and shows it once one returns', () => {
    const { card, page } = locationPage(true);

    page.build();

    expect(card.shown).toBe(false);

    page.setValue('SOURCE', 'fetch');
    page.fireChange('SOURCE');

    expect(card.shown).toBe(true);
  });

  /** Only a section the plugin source page marked may hide, so every page drawn today keeps its cards. */
  test('leaves an unmarked section showing with every row in it hidden', () => {
    const { card, page } = locationPage(false);

    page.build();

    expect(card.shown).toBe(true);
  });
});
