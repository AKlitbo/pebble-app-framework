/**
 * Specs for the agenda's week.
 *
 * ical.spec.ts already drives the filter and the sort through whole feeds, including the last
 * evening of the sixth day. What is left to pin is the horizon on the phone's own clock, which those
 * feeds never reach. The suite runs in Toronto, so a week holding a clock change and an evening that
 * is already tomorrow in UTC are both real here.
 */

import { describe, test, expect } from 'vitest';
import { horizonFor } from './window';
import { phoneOffsetMinutes } from '../pkjs/phone-clock';

describe('horizonFor', () => {
  /**
   * The clocks go back on 2026-11-01 in Toronto, so that week is an hour longer. Counting the week
   * in hours would end it at 23:00 on the sixth day and drop that evening's last hour.
   */
  test('ends on midnight across a clock change', () => {
    // Wednesday 2026-10-28 12:00 in Toronto, still on summer time
    const now = Math.floor(Date.UTC(2026, 9, 28, 16, 0) / 1000);

    const result = horizonFor(now);

    // the last second of Tuesday 2026-11-03 in Toronto, on winter time
    expect(result).toBe(Math.floor(Date.UTC(2026, 10, 4, 5, 0) / 1000) - 1);
  });

  /**
   * At 22:00 in Toronto it is already the next day in UTC. Counting the week from the UTC date would
   * run it a day past what the agenda's day codes show.
   */
  test('counts the week from the phone date not the UTC one', () => {
    // Friday 2026-07-10 22:00 in Toronto, which is Saturday 02:00 UTC
    const now = Math.floor(Date.UTC(2026, 6, 11, 2, 0) / 1000);

    const result = horizonFor(now);

    // the last second of Thursday 2026-07-16 in Toronto
    expect(result).toBe(Math.floor(Date.UTC(2026, 6, 17, 4, 0) / 1000) - 1);
  });

  /**
   * A spec standing the phone in another zone counts the week through an offset reader. In Toronto,
   * whose clocks change at 02:00, that has to end the same week as the phone's own clock, or a zone
   * spec would pin a different week from the one a real phone gets. The week holds the clock change.
   */
  test('ends on the same midnight through the phone offset reader', () => {
    // Wednesday 2026-10-28 12:00 in Toronto, still on summer time
    const now = Math.floor(Date.UTC(2026, 9, 28, 16, 0) / 1000);

    const result = horizonFor(now, phoneOffsetMinutes);

    expect(result).toBe(Math.floor(Date.UTC(2026, 10, 4, 5, 0) / 1000) - 1);
  });
});
