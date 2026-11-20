/**
 * Specs for handing pins to the Pebble app from a plugin app.
 *
 * The Pebble app answers a pin call with nothing and drops a pin it refuses without a word. A call
 * throws only when the pin cannot be turned into JSON, and a Pebble app from before 1.18.0 has no pin
 * calls at all. A throw escaping would end the run that made the pin, so a bad pin would also lose the
 * events the run was serving. What is worth pinning is that every way a call can fail comes back as an
 * answer with its reason, that a refused pin reads as handed over and nothing more, and that a call
 * reaches the runtime with the pin as given.
 */

import { describe, test, expect } from 'vitest';
import { deletePin, insertPin, TIMELINE_UNAVAILABLE } from './timeline';
import type { TimelinePin } from './timeline';
import { fakePluginPebble } from '../testing/plugin-pebble';

const PIN: TimelinePin = {
  id: 'standup-2026-11-20',
  time: '2026-11-20T14:00:00Z',
  duration: 15,
  layout: { type: 'calendarPin', title: 'Standup', locationName: 'Room 4' },
  actions: [{ title: 'Done', type: 'pluginAction', action: 'complete', args: { id: '42' } }],
};

describe('insertPin', () => {
  /** A pin that went through has to land on the timeline as given, under its id. */
  test('puts the pin on the timeline', async () => {
    const phone = fakePluginPebble();

    const result = await insertPin(phone.pebble, PIN);

    expect([result, phone.timeline.get(PIN.id)]).toEqual([{ ok: true }, PIN]);
  });

  /**
   * The Pebble app takes a pin it refuses, such as one with no `Timeline` grant, and drops it without
   * a word. The answer can only say the call was handed over, so a plugin must not read it as on the watch.
   */
  test('answers handed over for a pin the Pebble app drops', async () => {
    const phone = fakePluginPebble({ pins: 'dropped' });

    const result = await insertPin(phone.pebble, PIN);

    expect([result, phone.calls.length, phone.timeline.has(PIN.id)]).toEqual([{ ok: true }, 1, false]);
  });

  /** A pin that cannot be turned into JSON throws, and a throw that escaped ended the run and the events it was serving. */
  test.each(['throw', 'reject'] as const)('answers the reason when the call fails by a %s', async (pins) => {
    const phone = fakePluginPebble({ pins });

    const result = await insertPin(phone.pebble, PIN);

    expect(result).toEqual({ ok: false, error: 'Converting circular structure to JSON' });
  });

  /** A Pebble app from before 1.18.0 has no pin calls, and calling one that is not there throws. */
  test('answers TIMELINE_UNAVAILABLE when the runtime has no pin calls', async () => {
    const phone = fakePluginPebble({ pins: 'missing' });

    const result = await insertPin(phone.pebble, PIN);

    expect(result).toEqual({ ok: false, error: TIMELINE_UNAVAILABLE });
  });

  /** A failure that names nothing still has to read as words on a settings page. */
  test('answers NO_REASON for a failure that names nothing', async () => {
    const phone = fakePluginPebble({ pins: 'reject', pinError: {} });

    const result = await insertPin(phone.pebble, PIN);

    expect(result).toEqual({ ok: false, error: 'NO_REASON' });
  });
});

describe('deletePin', () => {
  /** A pin left behind after its event was removed shows the wearer a meeting that is no longer on. */
  test('takes the pin off the timeline by its id', async () => {
    const phone = fakePluginPebble();

    await insertPin(phone.pebble, PIN);

    const result = await deletePin(phone.pebble, PIN.id);

    expect([result, phone.timeline.has(PIN.id), phone.calls.map((call) => call.call)]).toEqual([{ ok: true }, false, ['insert', 'delete']]);
  });

  /** A delete that throws must not end the run, any more than an insert may. */
  test('answers the reason when the call throws', async () => {
    const phone = fakePluginPebble({ pins: 'throw' });

    const result = await deletePin(phone.pebble, PIN.id);

    expect(result).toEqual({ ok: false, error: 'Converting circular structure to JSON' });
  });
});
