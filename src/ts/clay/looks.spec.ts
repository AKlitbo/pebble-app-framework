/**
 * Specs for the table of Clay looks the framework's rows borrow.
 *
 * The table names each row by its type rather than importing its component, so node can load it for a
 * plugin app's page. A name that drifted from the component's would leave that row without its look on
 * every page, which is what is pinned here. Taking the look from a spare Clay is pinned through the
 * pages that use it, in ts/pkjs/app.spec.ts and tools/pkjs/plugin-page.spec.ts.
 */

import { describe, test, expect } from 'vitest';
import { BORROWED_LOOKS } from './looks';
import locationComponent from './location-component';
import themePreviewComponent from './theme-preview-component';

describe('BORROWED_LOOKS', () => {
  /** A row type that no longer matches its component's name never gets Clay's look, so the search shows as a plain white field. */
  test('names each borrowing row by its component\'s name', () => {
    const result = Object.keys(BORROWED_LOOKS).sort();

    expect(result).toEqual([locationComponent.name, themePreviewComponent.name].sort());
  });
});
