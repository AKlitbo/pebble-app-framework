/**
 * Specs for who gets to fetch between the watch and the phone.
 *
 * Weather, stocks, and the calendar each fetched once for the watch's poll and again for the phone's
 * own refresh, and a settings save raced the watch's ask for the new setting. The rule is a few lines
 * of state that no one can check by eye across a day of ticks, so each transition is pinned here.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { askShouldFetch, createAsks, refetchAfterSave, slowTickShouldFetch } from './asks';

describe('askShouldFetch', () => {
  /**
   * Saving a new temperature unit refetched twice. The phone forced a refetch after the save, and
   * the watch asked as well once it took the new unit, each with its own gps fix and provider call.
   */
  test('folds a watch ask into the refetch a settings save has pending', () => {
    const asks = { sinceSlowTick: false, savePending: true };

    const result = askShouldFetch(asks);

    expect(result).toBe(false);
  });

  /** An ask with nothing pending is the watch's own poll, and it must fetch or the face goes stale. */
  test('fetches for an ask with no save pending', () => {
    const asks = createAsks();

    const result = askShouldFetch(asks);

    expect(result).toBe(true);
  });
});

describe('slowTickShouldFetch', () => {
  /** The watch polls every 30 minutes and the phone ticked every 30 too, so each reading was fetched once per end. */
  test('skips the slow tick that follows a watch ask', () => {
    const asks = createAsks();
    askShouldFetch(asks);

    const result = slowTickShouldFetch(asks);

    expect(result).toBe(false);
  });

  /** A watch out of range stops asking, and the phone has to keep the data fresh on its own. */
  test('fetches on the next slow tick once the watch stops asking', () => {
    const asks = createAsks();
    askShouldFetch(asks);
    slowTickShouldFetch(asks);

    const result = slowTickShouldFetch(asks);

    expect(result).toBe(true);
  });
});

describe('refetchAfterSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** The watch's ask for a changed setting arrives inside the delay, and it must not start a second fetch. */
  test('holds watch asks back until the refetch runs', () => {
    const asks = createAsks();
    const refetch = vi.fn();
    refetchAfterSave(asks, 250, refetch);

    const result = askShouldFetch(asks);

    expect(result).toBe(false);
    expect(refetch).not.toHaveBeenCalled();
  });

  /** Once the refetch has run, the next watch poll is a normal ask again, or the feature would never fetch. */
  test('runs the refetch and lets asks through again after the delay', () => {
    const asks = createAsks();
    const refetch = vi.fn();
    refetchAfterSave(asks, 250, refetch);
    vi.advanceTimersByTime(250);

    const result = askShouldFetch(asks);

    expect(result).toBe(true);
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
