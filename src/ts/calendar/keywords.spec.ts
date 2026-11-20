/**
 * Specs for matching titles against the keywords a wearer types.
 *
 * A reader hides or marks events by these keywords, so a keyword matching too much hides a meeting
 * the wearer wanted, and one matching too little leaves on show what they asked to hide. What is
 * worth pinning is how the typed list is read and where in a title a keyword counts.
 */

import { describe, test, expect } from 'vitest';
import { keywordMatcher, matchesKeyword, parseKeywords } from './keywords';

describe('parseKeywords', () => {
  /** An empty entry would match every title, so a stray comma would hide the whole agenda. */
  test('drops empty entries and the spaces at the ends', () => {
    const result = parseKeywords(' Lunch, , Canceled: ,,');

    expect(result).toEqual(['lunch', 'canceled:']);
  });

  /** A setting never filled in has to read as no keywords rather than throw. */
  test('reads a missing list as no keywords', () => {
    const result = parseKeywords(undefined);

    expect(result).toEqual([]);
  });
});

describe('matchesKeyword', () => {
  /** A keyword matches at the start of any word, whatever the case. */
  test.each([
    ['Team Lunch', true],
    ['lunch with Sam', true],
    ['Lunchtime walk', true],
    ['(Lunch)', true],
    ['Brunch', false],
    ['Sunday Brunch', false],
  ])('matches Lunch against %j as %s', (title, expected) => {
    const result = matchesKeyword(title, 'Lunch');

    expect(result).toBe(expected);
  });

  /** A keyword ending in punctuation, as calendars mark a cancelled meeting, has to match as typed. */
  test('matches a keyword with punctuation in it', () => {
    const result = matchesKeyword('Canceled: Standup', 'Holiday, canceled:');

    expect(result).toBe(true);
  });

  /** A keyword found first inside a word still has to match where it later starts one. */
  test('keeps looking past a match inside a word', () => {
    const result = matchesKeyword('Brunch then lunch', 'lunch');

    expect(result).toBe(true);
  });

  /** A list parsed once has to match the same as the list as typed. */
  test('takes a parsed list', () => {
    const result = matchesKeyword('Team Lunch', parseKeywords('Gym, Lunch'));

    expect(result).toBe(true);
  });

  /** A list a plugin builds by hand keeps the wearer's capitals, and it matched nothing until lowered. */
  test('lowers the keywords of a list built by hand', () => {
    const result = matchesKeyword('Team lunch', [' Lunch ']);

    expect(result).toBe(true);
  });

  /** An empty list must hide nothing. */
  test('matches nothing against an empty list', () => {
    const result = matchesKeyword('Team Lunch', ' , ');

    expect(result).toBe(false);
  });
});

describe('keywordMatcher', () => {
  /** A plugin hiding events checks every title against one list, and a prepared list has to match the same as the list as typed. */
  test('matches each title against the list prepared once', () => {
    const matches = keywordMatcher('Lunch, CANCELED:');

    const result = ['Team Lunch', 'Brunch', 'canceled: Standup', 'Review'].map(matches);

    expect(result).toEqual([true, false, true, false]);
  });

  /** A hand-built list with blank entries would otherwise hold an empty keyword, which matches every title. */
  test('drops blank entries from a list built by hand', () => {
    const result = keywordMatcher(['  ', ''])('Team Lunch');

    expect(result).toBe(false);
  });
});
