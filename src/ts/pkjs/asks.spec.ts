/**
 * Specs for who gets to fetch between the watch and the phone.
 *
 * Weather, stocks, and the calendar each fetched once for the watch's poll and again for the phone's
 * own refresh, and a settings save raced the watch's ask for the new setting. The rule is a few lines
 * of state that no one can check by eye across a day of ticks, so each transition is pinned here.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { ASK_GAP_MS, askShouldFetch, createAsks, fetchFinished, refetchAfterSave, slowTickShouldFetch } from './asks';

describe('askShouldFetch', () => {
  /**
   * Saving a new temperature unit refetched twice. The phone forced a refetch after the save, and
   * the watch asked as well once it took the new unit, each with its own gps fix and provider call.
   */
  test('folds a watch ask into the refetch a settings save has pending', () => {
    const asks = createAsks();

    asks.savePending = true;

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

describe('askShouldFetch with a gap', () => {
  // a fetch that finished at 16:20 UTC on 1 July 2026
  const FETCHED = Date.UTC(2026, 6, 1, 16, 20);

  /** A gapped ask state whose last fetch finished at FETCHED. */
  function fetchedAsks() {
    const asks = createAsks(ASK_GAP_MS);

    fetchFinished(asks, FETCHED);

    return asks;
  }

  /** Every launch fetched twice, once as the phone came up and again for the watch's ask a moment after. */
  test('resends rather than fetches for an ask just after a fetch', () => {
    const asks = fetchedAsks();
    const resend = vi.fn();

    const result = askShouldFetch(asks, FETCHED + 2000, resend);

    expect(result).toBe(false);
    expect(resend).toHaveBeenCalledTimes(1);
  });

  /** The watch's own poll after the gap has to fetch, or the reading never moves on. */
  test('fetches for an ask once the gap has passed', () => {
    const asks = fetchedAsks();
    const resend = vi.fn();

    const result = askShouldFetch(asks, FETCHED + ASK_GAP_MS, resend);

    expect(result).toBe(true);
    expect(resend).not.toHaveBeenCalled();
  });

  /** A clock set back would otherwise hold every ask inside a gap that never ends. */
  test('fetches for an ask that reads as earlier than the fetch', () => {
    const asks = fetchedAsks();

    const result = askShouldFetch(asks, FETCHED - 1000, vi.fn());

    expect(result).toBe(true);
  });

  /** The save's refetch answers the ask, and a resend first would put the old setting's reading back on the watch. */
  test('folds an ask inside the gap into a pending save without a resend', () => {
    const asks = fetchedAsks();
    const resend = vi.fn();

    asks.savePending = true;

    const result = askShouldFetch(asks, FETCHED + 2000, resend);

    expect(result).toBe(false);
    expect(resend).not.toHaveBeenCalled();
  });

  /** Before any fetch has finished there is nothing to resend, so the ask fetches. */
  test('fetches for an ask before any fetch has finished', () => {
    const asks = createAsks(ASK_GAP_MS);

    const result = askShouldFetch(asks, FETCHED, vi.fn());

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

  /** A tick in the moment before a save's refetch ran fetched too, which spent a metered stock call twice. */
  test('waits while a save refetch is pending', () => {
    const asks = createAsks();

    asks.savePending = true;

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

  /**
   * A calendar link cleared and saved a few seconds after a download, then a watch ask inside the
   * minute, resent the removed feed's events. A new weather city whose fetch failed resent the old
   * city's reading the same way. The save has to close the gap.
   */
  test('closes the gap so an ask after a save fetches rather than resends', () => {
    const fetched = Date.UTC(2026, 6, 1, 16, 20);
    const asks = createAsks(ASK_GAP_MS);
    const resend = vi.fn();

    vi.setSystemTime(fetched);
    fetchFinished(asks, fetched);
    refetchAfterSave(asks, 250, () => {});
    vi.advanceTimersByTime(250);

    const result = askShouldFetch(asks, fetched + 41 * 1000, resend);

    expect(result).toBe(true);
    expect(resend).not.toHaveBeenCalled();
  });

  /** A round from before the save that lands while the refetch waits carries the old reading, so it must not reopen the gap. */
  test('opens no gap for a fetch that finishes while the refetch waits', () => {
    const fetched = Date.UTC(2026, 6, 1, 16, 20);
    const asks = createAsks(ASK_GAP_MS);
    const resend = vi.fn();

    vi.setSystemTime(fetched);
    refetchAfterSave(asks, 250, () => {});
    fetchFinished(asks, fetched + 100);
    vi.advanceTimersByTime(250);

    const result = askShouldFetch(asks, fetched + 41 * 1000, resend);

    expect(result).toBe(true);
    expect(resend).not.toHaveBeenCalled();
  });
});
