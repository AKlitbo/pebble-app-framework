/**
 * Specs for the row walk the face's page and a plugin app's page are checked with.
 *
 * Both builds stop on, or fall back from, a page holding a row type no component draws, and they find
 * those types with this walk. Clay builds the rows of a list that sits where a row goes, so a walk that
 * read the list as a row with no type would stop a page that opens fine. That is what is pinned here.
 */

import { describe, test, expect } from 'vitest';
import { rowTypes, typesWithoutComponent } from './rows';
import type { ClayConfigItem } from './types';

/** A page holding a section and, where a row goes, a list of rows with one inside it. */
const PAGE = [
  { type: 'heading', defaultValue: 'Settings' },
  [{ type: 'toggle', messageKey: 'FLIP' }, [{ type: 'locationsearch', messageKey: 'PLACE' }]],
  { type: 'section', items: [{ type: 'select', messageKey: 'PICK' }, [{ type: 'input', messageKey: 'WORDS' }]] },
] as unknown as ClayConfigItem[];

describe('rowTypes', () => {
  /** A list read as a row put undefined among the types, which the builds took as a row with no type. */
  test('walks into a list of rows the way Clay builds it', () => {
    const result = rowTypes(PAGE);

    expect(result).toEqual(['heading', 'toggle', 'locationsearch', 'section', 'select', 'input']);
  });
});

describe('typesWithoutComponent', () => {
  /** A page whose rows are all drawn, lists and all, opens on the phone, so nothing may be named missing. */
  test('finds nothing missing on a page whose listed rows are all drawn', () => {
    const drawn = { heading: {}, toggle: {}, locationsearch: {}, select: {}, input: {} };

    const result = typesWithoutComponent(PAGE, drawn);

    expect(result).toEqual([]);
  });
});
