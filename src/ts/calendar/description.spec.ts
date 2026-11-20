/**
 * Specs for cleaning an event's notes.
 *
 * A plugin app serving an iCal feed's events has to send the notes close to the way the Pebble app's
 * built-in Calendar plugin sends a phone calendar's, or a face reading either shows them two ways. What
 * is worth pinning is what happens to tags, to a `<` that is no tag, and to line breaks, and the cut at
 * 300 characters, which the plugin guide states as the most a `description` holds.
 */

import { describe, test, expect } from 'vitest';
import { DESCRIPTION_MAX, plainDescription } from './description';

describe('plainDescription', () => {
  /** Google writes notes as HTML, and a face would show the tags as text. */
  test('takes the tags out and keeps the text between them', () => {
    const result = plainDescription('<p>Bring <b>snacks</b></p>');

    expect(result).toBe('Bring snacks');
  });

  /** The built-in drops a `<br>` with nothing in its place and keeps the line breaks the text has, and a face reading both has to see the same. */
  test('joins the lines a br splits and keeps real line breaks', () => {
    const result = plainDescription('one<br>two\nthree');

    expect(result).toBe('onetwo\nthree');
  });

  /** Notes padded with spaces or blank lines would push the real text off a small screen. */
  test('trims the ends', () => {
    const result = plainDescription('\n  Agenda attached  \n');

    expect(result).toBe('Agenda attached');
  });

  /** A description past 300 characters is more than the built-in ever sends. */
  test('cuts a long text to 299 characters and an ellipsis', () => {
    const result = plainDescription('a'.repeat(400));

    expect([result.length, result.slice(-2)]).toEqual([300, 'a…']);
  });

  /** Cutting inside an emoji leaves half of it, which shows as a broken box before the ellipsis. */
  test('cuts by whole characters, never inside an emoji', () => {
    const result = plainDescription('a'.repeat(298) + '😀😀😀');

    expect(result).toBe('a'.repeat(298) + '😀…');
  });

  /** Notes about numbers use `<` and `>` as words, and taking them for a tag ate everything between them. */
  test('keeps a < or > that starts no tag', () => {
    const result = plainDescription('budget < 5k, target > 10k<br/>a <3 note');

    expect(result).toBe('budget < 5k, target > 10ka <3 note');
  });

  /** A text of exactly the cap is sent whole, as the built-in sends it, rather than losing its last character. */
  test('keeps a text of exactly 300 characters whole', () => {
    const result = plainDescription('b'.repeat(DESCRIPTION_MAX));

    expect(result).toBe('b'.repeat(300));
  });

  /** Missing notes have to read as none rather than as the word undefined. */
  test('reads missing notes as empty', () => {
    const result = plainDescription(undefined);

    expect(result).toBe('');
  });
});
