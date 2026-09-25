/**
 * Specs for the helpers the weather and stock providers share.
 *
 * pickProvider is pinned through the two dispatchers' own fallback specs. What is left is the join
 * OWM and WeatherAPI wait on, where closing before every request reports sends a reading without
 * the extras or the forecast strip it went to fetch.
 */

import { describe, test, expect, vi } from 'vitest';
import { joinCalls } from './providers';

describe('joinCalls', () => {
  /** Closing on the first report would send the reading before Open-Meteo's extras or strip landed. */
  test('waits for every request before running', () => {
    const whenAll = vi.fn();
    const report = joinCalls(2, whenAll);

    report();

    expect(whenAll).not.toHaveBeenCalled();
  });

  /** A late report after the join closed must not send the weather to the watch a second time. */
  test('runs once however many reports come in', () => {
    const whenAll = vi.fn();
    const report = joinCalls(2, whenAll);

    report();
    report();
    report();

    expect(whenAll).toHaveBeenCalledTimes(1);
  });
});
