/**
 * Specs for the one-round-at-a-time rule the fetching features share.
 *
 * The watch re-asks every few seconds until its first reading lands, a settings save forces a
 * fetch while one may still be out, and a watchdog can fire after the round it guards has closed.
 * The rule is two fields nobody can check by eye across those, so each transition is pinned here.
 */

import { describe, test, expect } from 'vitest';
import { createRound, finishRound, roundIsCurrent, shutOutRound, startRound } from './round';

describe('startRound', () => {
  /** Each of the watch's re-asks would start its own gps fix and provider fetch, and spend the quota on every one. */
  test('drops an unforced start while a round is running', () => {
    const state = createRound();
    startRound(state, false);

    const result = startRound(state, false);

    expect(result).toBeNull();
  });

  /** A settings save that could not take over a running round would leave the old symbols or unit on the watch. */
  test('lets a forced start take over a running round', () => {
    const state = createRound();
    const older = startRound(state, false) as number;

    const result = startRound(state, true);

    expect(result).not.toBeNull();
    expect(roundIsCurrent(state, older)).toBe(false);
  });

  /** A round that stayed running after it ended would drop every later fetch until the JS restarts. */
  test('starts again once the round has ended', () => {
    const state = createRound();
    const older = startRound(state, false) as number;
    finishRound(state, older);

    const result = startRound(state, false);

    expect(result).not.toBeNull();
  });
});

describe('finishRound', () => {
  /** A watchdog firing after the last quote landed would send the watch a second strip. */
  test('ends a round once', () => {
    const state = createRound();
    const round = startRound(state, false) as number;
    finishRound(state, round);

    const result = finishRound(state, round);

    expect(result).toBe(false);
  });

  /** The old round's watchdog closing the new round would send ERR quotes and throw the new round's quotes away. */
  test('leaves a round alone that a forced start took over', () => {
    const state = createRound();
    const older = startRound(state, false) as number;
    startRound(state, true);

    const result = finishRound(state, older);

    expect(result).toBe(false);
    expect(state.inFlight).toBe(true);
  });
});

describe('shutOutRound', () => {
  /** A reading in the old unit landing in the moment before the save's refetch would reach the watch after the switch. */
  test('drops the running round', () => {
    const state = createRound();
    const older = startRound(state, false) as number;
    shutOutRound(state);

    const result = roundIsCurrent(state, older);

    expect(result).toBe(false);
  });

  /** The shut-out round's own close is one of the answers dropped, so the flag has to clear with it or every unforced fetch is held off till the JS restarts. */
  test('lets the next unforced start through', () => {
    const state = createRound();
    startRound(state, false);
    shutOutRound(state);

    const result = startRound(state, false);

    expect(result).not.toBeNull();
  });
});
