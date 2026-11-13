// @vitest-environment jsdom
/**
 * Specs for the now playing feature.
 *
 * It drives the feature's hooks straight against the fake Pebble. What is worth pinning is what
 * reaches the watch and when: the three keys together for each real change and nothing for a plugin
 * that sends the same track again, the empty state for nothing playing, no plugin, or a permission
 * the wearer has not given, an answer to every ask from the watch, and a face built without the
 * define running none of it. localStorage comes from jsdom, since the subscription saves its state
 * there.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import music from './feature';
import { withFakePebble } from '../testing/pebble';
import type { FakePebble } from '../testing/pebble';
import type { FeatureContext } from '../pkjs/feature';
import { wantedKey } from '../plugin-sources/reading-driver';

// the plugin code a face built with PLUGIN_MUSIC finds, which a spec turns off to stand for a face
// built without it. the build writes null into the index then, which is what the getter hands back
const pluginCode = vi.hoisted(() => ({ off: false }));

vi.mock('../plugin-sources/index', async (importOriginal) => {
  const real = await importOriginal<typeof import('../plugin-sources/index')>();

  return {
    ...real,
    get musicPlugins() {
      return pluginCode.off ? null : real.musicPlugins;
    },
  };
});

// the keys a now playing face declares, each standing for its own number, so a send reads by name
const MUSIC_FACE_KEYS = {
  MUSIC_TITLE: 'MUSIC_TITLE',
  MUSIC_ARTIST: 'MUSIC_ARTIST',
  MUSIC_PLAYING: 'MUSIC_PLAYING',
  MUSIC_REQUEST: 'MUSIC_REQUEST',
} as unknown as Record<string, number>;

// the Pebble app's own Music plugin, as its manifest lists it
const BUILT_IN_MUSIC = {
  uuid: '00000000-0000-0000-0001-000000000003',
  name: 'Music',
  sources: [{ category: 'music', items: ['track'], properties: { title: ['shortText', 'longText'], artist: ['shortText', 'longText'], playing: ['boolean', 'shortText'] } }],
};

// the empty state the watch clears its panel to
const NOTHING_PLAYING = { MUSIC_TITLE: '', MUSIC_ARTIST: '', MUSIC_PLAYING: 0 };

// what the watch hears while no plugin serves now playing, both lines empty and playing as the marker
const NO_PLUGIN = { MUSIC_TITLE: '', MUSIC_ARTIST: '', MUSIC_PLAYING: -2 };

/** One update from a music plugin, with a progress reading such as a polling plugin sends beside the track. */
function update(title: string, artist: string, playing = true, progress = 0) {
  return {
    pluginUuid: BUILT_IN_MUSIC.uuid,
    instances: [{
      instanceId: 'track',
      properties: {
        title: { longText: { text: title } },
        artist: { longText: { text: artist } },
        playing: { boolean: { value: playing } },
        progress: { numericValue: { value: progress, unit: 's' } },
      },
    }],
  };
}

/**
 * A face with the now playing keys and its sends recorded, each acked straight away, with ready run
 * unless asked not to. The watch has already said it shows the track, so the feature subscribes on
 * ready.
 */
function startFace(ready = true) {
  localStorage.setItem(wantedKey('music', 'track'), '1');

  const sends: Record<string, unknown>[] = [];
  const queueSend = vi.fn((dict: Record<string, unknown>, onOk?: () => void) => {
    sends.push(dict);
    onOk?.();
  });
  const hooks = music({
    messageKeys: MUSIC_FACE_KEYS,
    defaults: {},
    queueSend: queueSend as unknown as FeatureContext['queueSend'],
    refetchDelayMs: 250,
    providers: null,
  });

  if (ready) {
    hooks.ready?.();
  }

  return { hooks, sends };
}

describe('now playing feature', () => {
  let pebble: FakePebble;

  beforeEach(() => {
    localStorage.clear();
    pebble = withFakePebble();
    pebble.plugins = [BUILT_IN_MUSIC];
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    pebble.restore();
    vi.restoreAllMocks();
  });

  /** The watch reads the three keys from one message, so a send missing one would leave its panel half updated. */
  test('sends the title, the artist, and playing together', () => {
    const { sends } = startFace();

    pebble.live()[0].push(update('Clocks', 'Coldplay'));

    expect(sends).toEqual([{ MUSIC_TITLE: 'Clocks', MUSIC_ARTIST: 'Coldplay', MUSIC_PLAYING: 1 }]);
  });

  /** A polling plugin sends the same track every 15 seconds with only its progress moved, which must not wake the watch. */
  test('sends nothing for an update that only moved the progress', () => {
    const { sends } = startFace();

    pebble.live()[0].push(update('Clocks', 'Coldplay', true, 10));

    pebble.live()[0].push(update('Clocks', 'Coldplay', true, 25));

    expect(sends).toHaveLength(1);
  });

  /** A pause changes only the glyph, but the watch has to hear it or it shows playing all through the silence. */
  test('sends a pause of the same track', () => {
    const { sends } = startFace();

    pebble.live()[0].push(update('Clocks', 'Coldplay', true));

    pebble.live()[0].push(update('Clocks', 'Coldplay', false));

    expect(sends.map((dict) => dict.MUSIC_PLAYING)).toEqual([1, 0]);
  });

  /** Nothing playing comes as an update with no instance, and the watch would otherwise keep showing the last song. */
  test('clears the panel for an update with no instance', () => {
    const { sends } = startFace();

    pebble.live()[0].push(update('Clocks', 'Coldplay'));

    pebble.live()[0].push({ pluginUuid: BUILT_IN_MUSIC.uuid, instances: [] });

    expect(sends[1]).toEqual(NOTHING_PLAYING);
  });

  /** A watch that rebooted holds nothing, so its ask has to be answered even though the sender has sent that track. */
  test('resends the held track on a MUSIC_REQUEST', () => {
    const { hooks, sends } = startFace();

    pebble.live()[0].push(update('Clocks', 'Coldplay'));

    hooks.message?.({ MUSIC_REQUEST: 1 });

    expect(sends).toHaveLength(2);
    expect(sends[1]).toEqual(sends[0]);
  });

  /** An ask before the plugin has said anything still needs an answer, and the empty state is the honest one. */
  test('answers a MUSIC_REQUEST before the first update with the empty state', () => {
    const { hooks, sends } = startFace();

    hooks.message?.({ MUSIC_REQUEST: 1 });

    expect(sends).toEqual([NOTHING_PLAYING]);
  });

  /**
   * With plugins off, or on an iPhone with no music plugin, the panel shows its empty state rather
   * than an old song. Playing carries -2, so a face can say no plugin serves it rather than show
   * nothing playing.
   */
  test('clears the panel with the no plugin marker when no plugin serves the music', () => {
    pebble.plugins = [];

    const { sends } = startFace();

    expect(sends).toEqual([NO_PLUGIN]);
  });

  /** A wearer who has not allowed music gets the empty panel, and the settings page says why. */
  test('clears the panel with the no plugin marker on PERMISSION_DENIED', () => {
    const { sends } = startFace();

    pebble.live()[0].push(update('Clocks', 'Coldplay'));

    pebble.live()[0].fail({ code: 'PERMISSION_DENIED', message: 'not allowed' });

    expect(sends[1]).toEqual(NO_PLUGIN);
  });

  /** The kept song is from before the wearer took music away, so a rebooted watch must not get it back. */
  test('answers a MUSIC_REQUEST after PERMISSION_DENIED with the no plugin marker', () => {
    const { hooks, sends } = startFace();

    pebble.live()[0].push(update('Clocks', 'Coldplay'));
    pebble.live()[0].fail({ code: 'PERMISSION_DENIED', message: 'not allowed' });

    hooks.message?.({ MUSIC_REQUEST: 1 });

    expect(sends[2]).toEqual(NO_PLUGIN);
  });

  /** Artwork costs the plugin a bitmap per track and progress wakes the watch, so neither is asked for. */
  test('asks the plugin for the title, the artist, and playing alone', () => {
    startFace();

    const result = pebble.live()[0].request.properties;

    expect(result).toEqual(['title', 'artist', 'playing']);
  });
});

describe('now playing on a face built without PLUGIN_MUSIC', () => {
  let pebble: FakePebble;

  beforeEach(() => {
    pluginCode.off = true;
    localStorage.clear();
    pebble = withFakePebble();
    pebble.plugins = [BUILT_IN_MUSIC];
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
    expect(pebble.subscriptions).toEqual([]);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});
