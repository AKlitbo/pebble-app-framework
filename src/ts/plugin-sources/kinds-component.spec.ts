// @vitest-environment jsdom
/**
 * Specs for the plugin kinds row's Clay component.
 *
 * The row goes first on the page, so whatever a plain lookup finds there is found before a face's own
 * rows. What is worth pinning is that a face finding its own hidden store with the generic class
 * never lands on this one, and that a face's component still finds this one by its own class.
 */
import { describe, test, expect } from 'vitest';
import kindsComponent, { PLUGIN_KINDS_CLASS } from './kinds-component';
import hiddenStoreComponent from '../clay/hidden-store-component';

/** A page with the plugin kinds row first and a face's own hidden store after it, drawn from each component's template. */
function pageWithBoth(): HTMLElement {
  const page = document.createElement('div');

  page.innerHTML = kindsComponent.template + hiddenStoreComponent.template;
  (page.children[1] as HTMLInputElement).value = 'face library';
  return page;
}

describe('the plugin kinds row on a page', () => {
  /** A face that finds its store with a plain lookup would otherwise read the framework's states as its own saved state. */
  test('is not what a plain hidden store lookup finds, though it comes first', () => {
    const page = pageWithBoth();

    const result = (page.querySelector('.pf-hidden-store') as HTMLInputElement).value;

    expect(result).toBe('face library');
  });

  /** A face's layout builder reads where each kind stands from here, so it has to find the row by its own class. */
  test('is found by its own class', () => {
    const page = pageWithBoth();

    const result = page.querySelector(`.${PLUGIN_KINDS_CLASS}`);

    expect(result).toBe(page.children[0]);
  });
});
