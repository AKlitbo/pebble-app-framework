/**
 * Specs for combining the settings page code into Clay's one custom function.
 *
 * Clay writes the custom function into the page as text and the page runs that text, so what is
 * worth pinning is the text. With no part or one part it has to be exactly the text Clay writes for
 * that page on its own, or every face's page would change. With two or more it has to run
 * each part once, in order, keep going past a part that throws, and stand on its own in a scope that
 * holds nothing from this module. A part reading a free name of its own must not pick up the
 * wrapper's argument. Clay pastes it in with a plain string replace, so the text around the parts
 * must hold none of the dollar patterns that replace reads. The page check runs the same pattern
 * check on every page it builds, from the tsc output the phone runs, so this is the fast first line.
 *
 * The page's run is copied by evaluating the text in a fresh context. Only the phone has to avoid
 * eval, and a spec is not the phone.
 */
import vm from 'node:vm';
import { describe, test, expect, vi } from 'vitest';
import { combineCustomFns, type PagePart } from './custom-fn';
import dependentVisibility from './dependent-visibility';

/** The page the parts run on, standing in for Clay's, which records each part that ran and what it was handed. */
interface RecordingPage {
  ran: string[];
  given: unknown[];
}

// a name the page leaves undefined, which a face's part could read without meaning the wrapper's
declare const minified: unknown;

/** A part that records its name and its argument on the page it runs on, and reaches nothing else. */
const first = function (this: RecordingPage, helper: unknown) {
  this.ran.push('first');
  this.given.push(helper);
};

/** A second recording part. */
const second = function (this: RecordingPage, helper: unknown) {
  this.ran.push('second');
  this.given.push(helper);
};

/** A part that records what a free `minified` holds when it runs. */
const readsFreeName = function (this: RecordingPage) {
  this.ran.push('free');
  this.given.push(typeof minified);
};

/** A part that throws before it records anything. */
const throwing = function (this: RecordingPage) {
  throw new Error('broken part');
};

/** Gives each piece of code a label, part 1 and onward, as the app labels its own. */
function labelled(...codes: unknown[]): PagePart[] {
  return codes.map((code, index) => ({ code, label: `part ${index + 1}` }));
}

/**
 * Runs a custom function the way the page runs it, from the text Clay writes, in a context that holds
 * nothing but the console it is given.
 */
function runOnPage(customFn: unknown, page: object, console: { error: (...args: unknown[]) => void } = { error: () => {} }): void {
  const loaded = vm.runInNewContext(`(${String(customFn)})`, { console }) as (this: object, helper: unknown) => void;

  loaded.call(page, 'helper');
}

/** A fresh recording page. */
function recordingPage(): RecordingPage {
  return { ran: [], given: [] };
}

/**
 * A page with enough of Clay's for dependentVisibility to run in full: one row that shows only while
 * MODE is "on", and the MODE control holding "off". It also records the parts, like the recording page.
 */
function visibilityPage() {
  const classes = new Set<string>();
  const handlers: Array<() => void> = [];
  const row = { config: { visibleWhen: { key: 'MODE', in: ['on'] } }, $element: [{ classList: { add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name), contains: (name: string) => classes.has(name) } }] };
  const control = { get: () => 'off', on: () => {} };

  return {
    ran: [] as string[],
    given: [] as unknown[],
    classes,
    handlers,
    EVENTS: { AFTER_BUILD: 'AFTER_BUILD' },
    on: (_event: string, handler: () => void) => handlers.push(handler),
    getAllItems: () => [row],
    getItemByMessageKey: (key: string) => (key === 'MODE' ? control : undefined),
  };
}

describe('combineCustomFns', () => {
  /** A page with no page code has to get no custom function, so Clay writes its own do-nothing one. */
  test('gives no custom function when there are no parts', () => {
    const result = combineCustomFns(labelled(undefined, undefined));

    expect(result).toBeUndefined();
  });

  /** A face page with only the show and hide, or only its own customClay, has to keep its page text byte for byte. */
  test('gives the one part itself when only one is there', () => {
    const result = combineCustomFns(labelled(undefined, dependentVisibility));

    expect(result).toBe(dependentVisibility);
  });

  /** Running a part twice would add every change listener twice, and running them out of order lets the face's code be undone by the framework's. */
  test('runs each part once, in order, with the page and the helper the page gives', () => {
    const page = recordingPage();
    const combined = combineCustomFns(labelled(first, second));

    runOnPage(combined, page);

    expect(page).toEqual({ ran: ['first', 'second'], given: ['helper', 'helper'] });
  });

  /** A face's broken customClay must not take the framework's show and hide down with it, or the other way round. */
  test('keeps running the next part after one throws, and logs the one that threw', () => {
    const page = recordingPage();
    const error = vi.fn();
    const combined = combineCustomFns(labelled(throwing, second));

    runOnPage(combined, page, { error });

    expect(page.ran).toEqual(['second']);
    expect(error).toHaveBeenCalledWith('part 1 threw: Error: broken part');
  });

  /**
   * A label carrying a quote, a dollar sign, a backslash, or a script tag would end its string early,
   * hand Clay a replace pattern, or close the page's script, so it has to reach the log as written
   * while the text around it holds no dollar sign.
   */
  test('logs a label with awkward characters as written, with no dollar sign in the text', () => {
    const label = 'the face\'s $& \\ </script> code';
    const error = vi.fn();
    const combined = combineCustomFns([{ code: throwing, label }, { code: second, label: 'the next part' }]);

    runOnPage(combined, recordingPage(), { error });

    expect(error).toHaveBeenCalledWith(`${label} threw: Error: broken part`);
    expect(String(combined)).not.toContain('$');
    expect(String(combined)).not.toContain('</script>');
  });

  /** A part that read the wrapper's argument through a free name of its own would get Clay's helper where it expected its own global. */
  test('hands a part reading a free minified nothing from the wrapper', () => {
    const page = recordingPage();
    const combined = combineCustomFns(labelled(first, readsFreeName));

    runOnPage(combined, page);

    expect(page.given).toEqual(['helper', 'undefined']);
  });

  /** A second copy of how the parts run could drift from the text the page runs, so the function itself refuses to run. */
  test('throws when the combined function is called straight', () => {
    const combined = combineCustomFns(labelled(first, second)) as () => void;

    const result = () => combined();

    expect(result).toThrow('only runs on the settings page');
  });

  /**
   * The page gets the text and nothing else, so a combined function that reached for anything in this
   * module would throw on the page and the settings would never open. The real show and hide goes in
   * and runs in full, hiding its row, to prove its own text stands alone too.
   */
  test('evaluates alone in a fresh context with no outside references', () => {
    const page = visibilityPage();
    const error = vi.fn();
    const combined = combineCustomFns(labelled(dependentVisibility, first));

    runOnPage(combined, page, { error });
    page.handlers.forEach((handler) => handler());

    expect(error).not.toHaveBeenCalled();
    expect(page.ran).toEqual(['first']);
    expect(page.classes.has('hide')).toBe(true);
  });

  /** Clay pastes the text in with a plain string replace, so a dollar pattern in it would scramble the page script. */
  test('writes no dollar sign of its own around the parts', () => {
    const result = String(combineCustomFns(labelled(first, second)));

    expect(result).not.toContain('$');
  });

  /** The framework's own page code goes into every page, so it must not bring a replacement pattern either. */
  test('holds no replacement pattern with the framework\'s show and hide inside', () => {
    const result = String(combineCustomFns(labelled(dependentVisibility, first)));

    expect(result).not.toMatch(/\$[$&`']/);
  });
});
