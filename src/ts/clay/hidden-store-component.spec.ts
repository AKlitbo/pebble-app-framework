// @vitest-environment jsdom
/**
 * Specs for the hidden store Clay component.
 *
 * The component is tiny, but it is registered on a settings page, and Clay serialises a registered
 * component by writing each key followed by the function's own toString. A function declared with
 * shorthand method syntax stringifies with its name attached, which comes out as
 * `initialize:initialize() {` and stops the whole page parsing. Every other component on the page
 * goes down with it, so the symptom is a config screen that never opens at all. That is the
 * invariant most of this file is about, since nothing else in the build catches it.
 */

import { describe, test, expect } from 'vitest';
import component from './hidden-store-component';
import * as harness from './builder/ts/testing/harness';
import type { ClayComponentDefinition } from './builder/ts/testing/harness';

/**
 * Mounts the component the way Clay does. It rides on Clay's own 'val' manipulator, so the
 * harness binds initialize and nothing else.
 */
function mount(config?: { storeClass?: string }) {
  const { ctx, root } = harness.mount(component as unknown as ClayComponentDefinition, config);

  return { context: ctx, root: root };
}

describe('Clay serialisation safety', () => {
  /**
   * Shorthand method syntax stringifies as `initialize() {`, which Clay writes out as
   * `initialize:initialize() {` and the config page then fails to parse, so the settings screen
   * never opens for any component on the page.
   */
  test('declares initialize as a function expression, not a shorthand method', () => {
    const result = String(component.initialize);

    expect(result.startsWith('function')).toBe(true);
  });

  /** The same trap with a name attached: `function initialize()` also serialises to a broken key. */
  test('leaves the initialize function anonymous', () => {
    const result = String(component.initialize);

    expect(result).toMatch(/^function\s*\(/);
  });

  /** An arrow initialize would serialize fine but lose the `this` Clay binds, so $element is undefined. */
  test('does not declare initialize as an arrow function', () => {
    const result = String(component.initialize);

    expect(result).not.toMatch(/^\(?[^)]*\)?\s*=>/);
  });
});

describe('template', () => {
  /** Without the manipulator target Clay has nothing to read or write, so the value never persists. */
  test('marks the input as the manipulator target', () => {
    const { root } = mount();

    const result = root.getAttribute('data-manipulator-target');

    expect(result).not.toBeNull();
  });

  /** A visible input would show a raw JSON blob on the settings page. */
  test('renders a hidden input', () => {
    const { root } = mount();

    const result = root.getAttribute('type');

    expect(result).toBe('hidden');
  });

  /** Another component finds this store by .gl-store, so dropping the class orphans the value. */
  test('carries the gl-store handle class', () => {
    const { root } = mount();

    const result = root.classList.contains('gl-store');

    expect(result).toBe(true);
  });

  /** Clay round-trips the value through its built-in val manipulator, so anything else drops it. */
  test('uses the val manipulator', () => {
    const result = component.manipulator;

    expect(result).toBe('val');
  });

  /** The page item references this component by name, so a rename silently stops resolving. */
  test('registers under the hiddenStore name', () => {
    const result = component.name;

    expect(result).toBe('hiddenStore');
  });
});

describe('initialize', () => {
  /**
   * A page with two stores would otherwise have both answer to .gl-store, and a querySelector
   * would keep finding the first, so the second store's value is read as the first one's.
   */
  test('stamps the configured storeClass onto the input', () => {
    const { context, root } = mount({ storeClass: 'gl-layouts' });

    context.initialize();

    expect(root.classList.contains('gl-layouts')).toBe(true);
  });

  /** The shared handle has to survive the extra class or every existing lookup stops matching. */
  test('keeps the gl-store class alongside the configured one', () => {
    const { context, root } = mount({ storeClass: 'gl-layouts' });

    context.initialize();

    expect(root.classList.contains('gl-store')).toBe(true);
  });

  /** The only store on a page needs no extra class, and adding "undefined" would break selectors. */
  test('leaves the classes alone when no storeClass is configured', () => {
    const { context, root } = mount();

    context.initialize();

    expect(root.className).toBe('gl-store');
  });

  /** A throw inside initialize takes the whole settings page down, so a missing config must be survivable. */
  test('does not throw when the config is absent', () => {
    const { context } = mount();
    // Clay can hand over an item with no config at all, which the harness type does not allow for
    (context as { config?: unknown }).config = undefined;

    const result = () => context.initialize();

    expect(result).not.toThrow();
  });

  /** Same again for an unmounted element: a crash here costs the user the entire config screen. */
  test('does not throw when the element is missing', () => {
    const { context } = mount({ storeClass: 'gl-layouts' });
    context.$element = [];

    const result = () => context.initialize();

    expect(result).not.toThrow();
  });
});
