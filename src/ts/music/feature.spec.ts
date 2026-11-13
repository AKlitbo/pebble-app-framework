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

describe('now playing album art', () => {
  let pebble: FakePebble;

  // the art key beside the now playing keys, which music.withArtwork brings
  const ART_FACE_KEYS = { ...MUSIC_FACE_KEYS, MUSIC_ARTWORK: 'MUSIC_ARTWORK' } as unknown as Record<string, number>;

  // a 2 by 2 picture in two colours, as the built-in plugin sends it, and the bytes the watch takes
  const ART = { image: { width: 2, height: 2, palette: 'wP8=', pixels: 'ARA=' } };
  const ART_BYTES = [2, 2, 2, 0xc0, 0xff, 0x01, 0x10];
  const NO_ART = [0, 0, 0];

  /** One update with art beside the track, or with none. */
  function withArt(title: string, playing = true, artwork: unknown = ART) {
    const envelope = update(title, 'Coldplay', playing);

    if (artwork) {
      (envelope.instances[0].properties as Record<string, unknown>).artwork = artwork;
    }

    return envelope;
  }

  /**
   * A face started with music.withArtwork, its sends recorded, with ready already run. With
   * `refuseArt` the watch turns away every bitmap, as one whose inbox is too small for it does, and
   * takes only the marker for no art.
   */
  function startArtFace(size: unknown = { w: 28, h: 28 }, refuseArt = false) {
    localStorage.setItem(wantedKey('music', 'track'), '1');

    const sends: Record<string, unknown>[] = [];
    const queueSend = vi.fn((dict: Record<string, unknown>, onOk?: () => void, onFail?: () => void) => {
      sends.push(dict);

      if (refuseArt && Array.isArray(dict.MUSIC_ARTWORK) && dict.MUSIC_ARTWORK.length > 3) {
        onFail?.();
      } else {
        onOk?.();
      }
    });
    const hooks = music.withArtwork(size as { w: number; h: number })({
      messageKeys: ART_FACE_KEYS,
      defaults: {},
      queueSend: queueSend as unknown as FeatureContext['queueSend'],
      refetchDelayMs: 250,
      providers: null,
    });

    hooks.ready?.();

    return { hooks, sends };
  }

  /** The art sends, in order. */
  function artSends(sends: Record<string, unknown>[]): unknown[] {
    return sends.filter((dict) => 'MUSIC_ARTWORK' in dict).map((dict) => dict.MUSIC_ARTWORK);
  }

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

  /** The built-in plugin draws art only for a subscriber that names a size, so without it the face never gets any. */
  test('asks the plugin for artwork at the face\'s size', () => {
    startArtFace({ w: 40, h: 40 });

    const result = pebble.live()[0].request;

    expect(result.properties).toContain('artwork');
    expect(result.iconPixelSize).toEqual({ w: 40, h: 40 });
  });

  /** Encoding a bitmap costs the phone far more than text, so a face with no art must not ask for one. */
  test('asks for no art on the plain feature', () => {
    startFace();

    const result = pebble.live()[0].request;

    expect(result.iconPixelSize).toBeUndefined();
    expect(result.properties).not.toContain('artwork');
  });

  /** The watch builds its bitmap from these bytes as they come. */
  test('sends the art as the watch\'s bitmap bytes', () => {
    const { sends } = startArtFace();

    pebble.live()[0].push(withArt('Clocks'));

    expect(artSends(sends)).toEqual([ART_BYTES]);
  });

  /** A pause sends the whole track again, and a bitmap on every pause would wake the watch and fill its inbox for nothing. */
  test('sends the art once while only playing changes', () => {
    const { sends } = startArtFace();

    pebble.live()[0].push(withArt('Clocks', true));
    pebble.live()[0].push(withArt('Clocks', false));

    expect(artSends(sends)).toEqual([ART_BYTES]);
  });

  /** The plugin often sends the track before its art, and sends again once the art is in. */
  test('sends art that arrives after its track', () => {
    const { sends } = startArtFace();

    pebble.live()[0].push(withArt('Clocks', true, null));
    pebble.live()[0].push(withArt('Clocks', true));

    expect(artSends(sends)).toEqual([NO_ART, ART_BYTES]);
  });

  /** A new track with no art, as on an iPhone, would otherwise keep the last song's cover. */
  test('clears the art for a track with none', () => {
    const { sends } = startArtFace();

    pebble.live()[0].push(withArt('Clocks'));
    pebble.live()[0].push(withArt('Yellow', true, null));

    expect(artSends(sends)).toEqual([ART_BYTES, NO_ART]);
  });

  /** A watch that rebooted holds no art, so its ask has to bring the art back as well as the track. */
  test('resends the art on a MUSIC_REQUEST', () => {
    const { hooks, sends } = startArtFace();

    pebble.live()[0].push(withArt('Clocks'));
    hooks.message?.({ MUSIC_REQUEST: 1 });

    expect(artSends(sends)).toEqual([ART_BYTES, ART_BYTES]);
  });

  /** With no plugin the panel clears, and art left behind would sit beside an empty track. */
  test('clears the art when no plugin serves the music', () => {
    pebble.plugins = [];

    const { sends } = startArtFace();

    expect(artSends(sends)).toEqual([NO_ART]);
  });

  /** Art turned away while the link was down says nothing about the art, so the watch's ask after it reconnects has to try it again. */
  test('tries a refused bitmap again on a MUSIC_REQUEST', () => {
    const { hooks, sends } = startArtFace({ w: 28, h: 28 }, true);

    pebble.live()[0].push(withArt('Clocks'));
    hooks.message?.({ MUSIC_REQUEST: 1 });

    expect(artSends(sends)).toEqual([ART_BYTES, NO_ART, ART_BYTES, NO_ART]);
  });

  /** paf build adds a feature's keys to the face, so the art form has to carry its key. */
  test('carries the art key for the build', () => {
    const result = music.withArtwork({ w: 28, h: 28 }).messageKeys;

    expect(result).toEqual(['MUSIC_ARTWORK']);
  });

  /** A side past the cap would ask the phone for art no inbox holds. */
  test('holds each side of the size to 100', () => {
    startArtFace({ w: 500, h: 64 });

    const result = pebble.live()[0].request.iconPixelSize;

    expect(result).toEqual({ w: 100, h: 64 });
  });

  /** A size the face got wrong would otherwise ask for a picture a pixel across, with nothing to say why. */
  test.each([
    ['no size', undefined],
    ['a side that is not a number', { w: '40', h: 40 }],
    ['a side of 0', { w: 40, h: 0 }],
  ])('asks for no art and says why for %s', (_label, size) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = music.withArtwork(size as { w: number; h: number });

    expect(result.messageKeys).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('{ w, h }'));
  });

  /**
   * A bitmap the watch turns away, such as one too big for its inbox, would go again on every update,
   * waking the watch and holding up every other send, while the last cover sat beside the new track.
   */
  test('clears the art and sends a refused bitmap no more until the art changes', () => {
    const { sends } = startArtFace({ w: 28, h: 28 }, true);

    pebble.live()[0].push(withArt('Clocks', true));
    pebble.live()[0].push(withArt('Clocks', false));
    pebble.live()[0].push(withArt('Clocks', true));

    expect(artSends(sends)).toEqual([ART_BYTES, NO_ART]);
  });
});
