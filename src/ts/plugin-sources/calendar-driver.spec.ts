/**
 * Specs for the calendar plugin driver's request.
 *
 * The count of events it asks for is worked out from the agenda's slot cap, and the Pebble app takes
 * a `limit` from 1 to `SOURCE_LIMIT_MAX`. The part worth pinning is that range, since a raised cap would otherwise
 * send a limit the phone may turn down.
 */

import { describe, test, expect } from 'vitest';
import { CALENDAR_PLUGIN_LIMIT } from './calendar-driver';
import { WIRE_CAPS } from '../pkjs/wire';
import { SOURCE_LIMIT_MAX } from '../plugin-app/source-limit';

describe('CALENDAR_PLUGIN_LIMIT', () => {
  /** A limit past the most the Pebble app takes could be refused or cut, and the agenda would run short again. */
  test('stays inside the 1 to SOURCE_LIMIT_MAX the Pebble app takes', () => {
    const result = CALENDAR_PLUGIN_LIMIT;

    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(SOURCE_LIMIT_MAX);
  });

  /** A limit under the agenda's own cap would leave slots empty on a busy day. */
  test('asks for at least a full agenda', () => {
    const result = CALENDAR_PLUGIN_LIMIT;

    expect(result).toBeGreaterThanOrEqual(WIRE_CAPS.CALENDAR_SLOTS_MAX);
  });
});
