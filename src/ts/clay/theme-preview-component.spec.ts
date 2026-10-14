// @vitest-environment jsdom
/**
 * Specs for the theme preview Clay component.
 *
 * It is registered on the settings page, so Clay serialises it by writing initialize's toString. A
 * shorthand method stringifies with its name attached and stops the whole page parsing, which is the
 * invariant the first tests pin. The rest cover that every theme reaches the dropdown and that the
 * preview swaps to the chosen theme's pictures, since a wearer picks a palette by its picture.
 */
import { describe, test, expect } from 'vitest';
import component from './theme-preview-component';
import * as harness from './builder/ts/testing/harness';
import type { ClayComponentDefinition } from './builder/ts/testing/harness';

const DAY = 'data:image/png;base64,AAAA';
const NIGHT = 'data:image/png;base64,BBBB';

const themeConfig = {
  label: 'Scene Palette',
  options: [{ label: 'Sketchbook', value: 0 }, { label: 'Forest', value: 4 }],
  previews: { 0: [DAY, NIGHT], 4: [DAY] },
};

/**
 * Mounts the component the way Clay does, and stubs the ClayItem's own change subscription so the
 * handler initialize registers can be fired by hand.
 */
function mount(config?: Record<string, unknown>) {
  const { ctx, root } = harness.mount(component as unknown as ClayComponentDefinition, config);
  const handlers: Record<string, () => void> = {};

  (ctx as unknown as { on: (event: string, handler: () => void) => void }).on = (event, handler) => {
    handlers[event] = handler;
  };

  return { context: ctx, root, handlers };
}

/** The src of every preview image currently drawn. */
function previewSrcs(root: HTMLElement): string[] {
  return [...root.querySelectorAll('.tp-preview img')].map((img) => (img as HTMLImageElement).src);
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

  /** An arrow initialize would serialize fine but lose the `this` Clay binds, so $element is undefined. */
  test('does not declare initialize as an arrow function', () => {
    const result = String(component.initialize);

    expect(result).not.toMatch(/^\(?[^)]*\)?\s*=>/);
  });
});

describe('the dropdown', () => {
  /** Every theme has to reach the dropdown, or a palette the face offers cannot be picked. */
  test('builds one option per theme with the value as a string', () => {
    const { context, root } = mount(themeConfig);

    context.initialize();

    const result = [...root.querySelectorAll('.tp-select option')].map((option) => (option as HTMLOptionElement).value);

    expect(result).toEqual(['0', '4']);
  });

  /** Clay's value manipulator reads the select, so without the target the chosen theme never saves. */
  test('marks the select as the manipulator target', () => {
    const { root } = mount(themeConfig);

    const result = (root.querySelector('.tp-select') as HTMLElement).getAttribute('data-manipulator-target');

    expect(result).not.toBeNull();
  });
});

describe('the preview', () => {
  /** The selected theme's pictures are what the wearer compares, so both its shots have to render. */
  test('draws every picture for the chosen theme', () => {
    const { context, root } = mount(themeConfig);

    context.initialize();

    const result = previewSrcs(root);

    expect(result).toEqual([DAY, NIGHT]);
  });

  /** Picking another theme swaps the pictures, or the preview sticks on the theme first shown. */
  test('redraws the pictures when the theme changes', () => {
    const { context, root, handlers } = mount(themeConfig);

    context.initialize();
    (root.querySelector('.tp-select') as HTMLSelectElement).value = '4';
    handlers.change();

    const result = previewSrcs(root);

    expect(result).toEqual([DAY]);
  });

  /** A preview that is not a data url is a page or manifest slip, so the row shows no broken image. */
  test('skips a preview that is not a data url', () => {
    const { context, root } = mount({ options: [{ label: 'A', value: 0 }], previews: { 0: ['https://example.com/x.png'] } });

    context.initialize();

    const result = previewSrcs(root).length;

    expect(result).toBe(0);
  });

  /** A theme with no pictures still shows in the dropdown, so the preview area is simply empty. */
  test('draws nothing for a theme with no pictures', () => {
    const { context, root } = mount({ options: [{ label: 'A', value: 0 }] });

    context.initialize();

    const result = previewSrcs(root).length;

    expect(result).toBe(0);
  });
});

describe('robustness', () => {
  /** A throw in initialize takes the whole settings page down, so a missing config must survive. */
  test('does not throw without options, previews, or config', () => {
    const { context } = mount();

    (context as { config?: unknown }).config = undefined;

    const result = () => context.initialize();

    expect(result).not.toThrow();
  });
});
