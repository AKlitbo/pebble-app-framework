// @vitest-environment jsdom
/**
 * Specs for the phone battery feature.
 *
 * It drives the feature's hooks straight against the fake Pebble. What is worth pinning is what
 * reaches the watch and when: one whole percent per real change and nothing for an update that only
 * moved the Wi-Fi, -2 whenever there is no plugin to read and -1 only for a reading still to come, an
 * answer to every ask from the watch even
 * when the sender thinks the watch holds it, and a face built without the define running none of it.
 * localStorage comes from jsdom, since the subscription saves its state there.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import phone from './feature';
import { withFakePebble } from '../testing/pebble';
import type { FakePebble } from '../testing/pebble';
import type { FeatureContext } from '../pkjs/feature';
import { PLUGIN_KINDS_TYPE } from '../plugin-sources/page';
import type { ClayConfigItem } from '../clay/types';
import { wantedKey } from '../plugin-sources/reading-driver';

// the plugin code a face built with PLUGIN_PHONE finds, which a spec turns off to stand for a face
// built without it. the build writes null into the index then, which is what the getter hands back
const pluginCode = vi.hoisted(() => ({ off: false }));

vi.mock('../plugin-sources/index', async (importOriginal) => {
  const real = await importOriginal<typeof import('../plugin-sources/index')>();

  return {
    ...real,
    get phonePlugins() {
      return pluginCode.off ? null : real.phonePlugins;
    },
  };
});

// the keys a phone battery face declares, each standing for its own number, so a send reads by name
const PHONE_FACE_KEYS = { PHONE_BATTERY: 'PHONE_BATTERY', PHONE_REQUEST: 'PHONE_REQUEST' } as unknown as Record<string, number>;

// the Pebble app's own Phone plugin, as its manifest lists it
const BUILT_IN_PHONE = {
  uuid: '00000000-0000-0000-0001-000000000001',
  name: 'Phone',
  sources: [{ category: 'phone', items: ['phone_state'], properties: { battery_level: ['numericValue', 'shortText'], wifi: ['boolean', 'shortText'] } }],
};

/** One update from the Phone plugin, with the Wi-Fi as given. */
function update(level: number, wifi = true) {
  return {
    pluginUuid: BUILT_IN_PHONE.uuid,
    instances: [{ instanceId: 'phone', properties: { battery_level: { numericValue: { value: level, unit: '%' } }, wifi: { boolean: { value: wifi } } } }],
  };
}

/**
 * A face with the phone keys, its sends recorded. Each send is acked unless `failNext` says to refuse
 * the next one, as a busy watch does. `shown` is what the watch last said, true for a watch that
 * shows the battery, false for one that does not, and null to leave what the phone keeps as it is.
 */
function startFace(ready = true, shown: boolean | null = true) {
  if (shown !== null) {
    localStorage.setItem(wantedKey('phone', 'phone_state'), shown ? '1' : '0');
  }

  const sends: Record<string, unknown>[] = [];
  const outcome = { failNext: false };
  const queueSend = vi.fn((dict: Record<string, unknown>, onOk?: () => void, onFail?: () => void) => {
    sends.push(dict);

    if (outcome.failNext) {
      outcome.failNext = false;
      onFail?.();
    } else {
      onOk?.();
    }
  });
  const hooks = phone({
    messageKeys: PHONE_FACE_KEYS,
    defaults: {},
    queueSend: queueSend as unknown as FeatureContext['queueSend'],
    refetchDelayMs: 250,
    providers: null,
  });

  if (ready) {
    hooks.ready?.();
  }

  return { hooks, sends, outcome };
}

/** The levels the watch was sent, in order. */
function levels(sends: Record<string, unknown>[]): unknown[] {
  return sends.map((dict) => dict.PHONE_BATTERY);
}

/** The page without the plugin kinds store every kind's page hook puts first, so a spec reads the face's own rows. */
function faceRows(page: ClayConfigItem[]): ClayConfigItem[] {
  return page.filter((item) => item.type !== PLUGIN_KINDS_TYPE);
}

describe('phone battery feature', () => {
  let pebble: FakePebble;

  beforeEach(() => {
    localStorage.clear();
    pebble = withFakePebble();
    pebble.plugins = [BUILT_IN_PHONE];
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    pebble.restore();
    vi.restoreAllMocks();
  });

  /** The watch only ever hears the level through PHONE_BATTERY, so the update has to land there. */
  test('sends an update to the watch as the whole percent', () => {
    const { sends } = startFace();

    pebble.live()[0].push(update(84));

    expect(sends).toEqual([{ PHONE_BATTERY: 84 }]);
  });

  /** The plugin sends its whole state on a Wi-Fi switch, and a send for an unchanged level wakes the watch for nothing. */
  test('sends nothing when only the Wi-Fi changed', () => {
    const { sends } = startFace();

    pebble.live()[0].push(update(84, true));

    pebble.live()[0].push(update(84, false));

    expect(levels(sends)).toEqual([84]);
  });

  /**
   * With plugins off the watch would keep a level from before, so it is told there is none. It hears
   * -2 rather than -1, so a face can say plugins are off rather than show a reading still to come.
   */
  test('sends -2 for a plugin list with nothing serving the phone', () => {
    pebble.plugins = [];

    const { sends } = startFace();

    expect(levels(sends)).toEqual([-2]);
  });

  /** A watch asking with nothing serving the phone has to hear why, or it shows a reading still to come forever. */
  test('answers a PHONE_REQUEST with -2 when nothing serves the phone', () => {
    pebble.plugins = [];
    const { hooks, sends } = startFace(false, false);

    hooks.message?.({ PHONE_REQUEST: 1 });

    expect(levels(sends)).toEqual([-2]);
  });

  /** The subscription reports no plugin on its own, and the watch has to hear it as no plugin, not as no reading. */
  test('sends -2 for a no plugin error from the subscription', () => {
    const { sends } = startFace();

    pebble.live()[0].fail({ code: 'noPlugin', message: 'nothing serves it' });

    expect(levels(sends)).toEqual([-2]);
  });

  /** A watch that rebooted holds nothing, so its ask has to be answered even though the sender has sent that level. */
  test('resends the held level on a PHONE_REQUEST', () => {
    const { hooks, sends } = startFace();

    pebble.live()[0].push(update(84));

    hooks.message?.({ PHONE_REQUEST: 1 });

    expect(levels(sends)).toEqual([84, 84]);
  });

  /** An ask before the plugin has said anything still needs an answer, or the watch waits on nothing. */
  test('answers a PHONE_REQUEST before the first update with -1', () => {
    const { hooks, sends } = startFace();

    hooks.message?.({ PHONE_REQUEST: 1 });

    expect(levels(sends)).toEqual([-1]);
  });

  /** A refused send leaves the watch on the old level, so the same level goes again with the next update. */
  test('sends a level again on the next update after its send failed', () => {
    const { sends, outcome } = startFace();

    outcome.failNext = true;
    pebble.live()[0].push(update(84));

    pebble.live()[0].push(update(84, false));

    expect(levels(sends)).toEqual([84, 84]);
  });

  /** The phone ends the subscription when the plugin goes away, and the level it last sent is no longer true. */
  test('sends -2 when the phone ends the subscription', () => {
    const { sends } = startFace();

    pebble.live()[0].push(update(84));

    pebble.live()[0].fail({ code: 'PLUGIN_UNAVAILABLE', message: 'gone' });

    expect(levels(sends)).toEqual([84, -2]);
  });

  /** A second ready that left the first subscription running would send every update twice. */
  test('leaves one subscription running after a second ready', () => {
    const { hooks } = startFace();

    hooks.ready?.();

    expect(pebble.live()).toHaveLength(1);
  });

  /** Every change in the battery wakes the watch, so a face with no panel showing it must not subscribe. */
  test('subscribes nothing on ready while the watch last said it shows no battery', () => {
    startFace(true, false);

    const result = pebble.live();

    expect(result).toHaveLength(0);
  });

  /**
   * After an install or an upgrade the phone has never heard an answer, and the watch's ask can run
   * out of tries while the phone code starts, which would leave the panel empty until the face restarts.
   */
  test('subscribes on ready when the watch has never said', () => {
    startFace(true, null);

    const result = pebble.live();

    expect(result).toHaveLength(1);
  });

  /** The phone code restarts on its own, and a watch showing the battery must not lose its updates until it next asks. */
  test('subscribes again on the next ready once the watch has asked', () => {
    const { hooks } = startFace(true, false);

    hooks.message?.({ PHONE_REQUEST: 1 });
    startFace(true, null);

    const result = pebble.subscriptions.length;

    expect(result).toBe(2);
  });

  /** A face whose layout dropped the panel says so with a 0, and the phone has to stop waking the watch for it. */
  test('ends the subscription and sends nothing when the watch no longer shows the battery', () => {
    const { hooks, sends } = startFace();

    hooks.message?.({ PHONE_REQUEST: 0 });
    pebble.live()[0]?.push(update(84));
    startFace(true, null);

    const result = [pebble.live().length, levels(sends)];

    expect(result).toEqual([0, []]);
  });

  /** Asking only for the battery keeps the phone from working out readings nothing reads. */
  test('asks the plugin for the battery alone', () => {
    startFace();

    const result = pebble.live()[0].request;

    expect([result.category, result.item, result.properties]).toEqual(['phone', 'phone_state', ['battery_level']]);
  });

  /** A face with the keys and no feature answering the ask is what the app warns about, so the feature has to claim it. */
  test('claims PHONE_REQUEST', () => {
    const { hooks } = startFace(false);

    const result = hooks.requests;

    expect(result).toEqual(['PHONE_REQUEST']);
  });

  /** With no select to explain it, the note on the page is the only place the wearer learns the phone plugin is missing. */
  test('puts the note at the foot of the page while nothing serves the phone', () => {
    pebble.plugins = [{ uuid: 'other-uuid', name: 'Other', sources: [{ category: 'music', items: ['track'] }] }];
    const { hooks } = startFace(false);

    const result = faceRows(hooks.page?.([{ type: 'submit', defaultValue: 'Save' }]) || []);

    expect(result[0].items?.map((row) => row.type)).toEqual(['pluginNote', 'pluginPanel']);
    expect(result[1].type).toBe('submit');
  });
});

describe('phone battery on a face built without PLUGIN_PHONE', () => {
  let pebble: FakePebble;

  beforeEach(() => {
    pluginCode.off = true;
    localStorage.clear();
    pebble = withFakePebble();
    pebble.plugins = [BUILT_IN_PHONE];
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    pluginCode.off = false;
    pebble.restore();
    vi.restoreAllMocks();
  });

  /** The define is the opt-in, so a face that lists the feature without it must subscribe to nothing and send nothing. */
  test('returns no hooks and says why', () => {
    const { hooks: result, sends } = startFace(false);

    expect(result).toEqual({});
    expect(sends).toEqual([]);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});
