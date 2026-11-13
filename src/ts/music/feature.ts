/**
 * What the phone is playing, as a feature a face opts into.
 *
 * It reads the track from a music plugin and sends the watch `MUSIC_TITLE` and `MUSIC_ARTIST` as
 * ASCII text, and `MUSIC_PLAYING` as 1 or 0, all three together. Nothing playing sends both lines
 * empty and playing off. While no plugin serves now playing, both lines go empty and `MUSIC_PLAYING`
 * carries -2, so the watch can tell the two apart.
 *
 * A face that shows album art starts it as `music.withArtwork({ w, h })`, with the largest size its
 * panel draws. The phone then asks the plugin for art at that size and sends it as `MUSIC_ARTWORK`,
 * the watch's own 4-bit palettized bitmap, only when the art changes. A face that starts the plain
 * feature asks for no art, carries no art key, and the plugin draws none.
 *
 * The watch asks again with `MUSIC_REQUEST`. A face turns it on with `PLUGIN_MUSIC` in its appinfo's
 * defines and lists the feature in startPebbleApp. All of the plugin
 * code lives behind plugin-sources/index, so a face built without the define reads null there and
 * carries none of it. Listed without the define, the feature logs why and does nothing.
 */
import { createDedupedSender } from '../pkjs/send-queue';
import type { Feature, FeatureContext, FeatureHooks } from '../pkjs/feature';
import wire, { WIRE_CAPS } from '../pkjs/wire';
import { musicPlugins } from '../plugin-sources/index';
import type { ImageSize, MusicArtwork, MusicTrack } from '../plugin-sources/types';

/** The now playing feature, plus the form of it that also sends album art. */
export interface MusicFeature extends Feature {
  /**
   * The now playing feature for a face that shows album art.
   *
   * The art comes at the size given or smaller, and each side is held from 1 to 100 pixels. Its
   * message holds `3 + colours + ceil(w / 2) * h` bytes, 16 colours at most, so a 28 square takes
   * 411 bytes, a 40 square 819, and a 64 square 2,067. The watch's inbox has to hold that and about 8
   * bytes more for the message around it.
   *
   * @param size The largest art the face draws, in pixels, such as `{ w: 40, h: 40 }`.
   * @return A feature to pass to startPebbleApp in place of the plain one.
   */
  withArtwork(size: ImageSize): Feature;
}

/** The message key album art rides, which the art form of the feature carries so paf build adds it. */
export const MUSIC_ART_KEYS = ['MUSIC_ARTWORK'];

/**
 * The art size a face asked for, each side rounded and held to the cap, or null for a size that is not
 * two numbers from 1 up, which asks for no art.
 */
function artSizeFrom(size: unknown): ImageSize | null {
  const given = size && typeof size === 'object' ? (size as Record<string, unknown>) : {};
  const sides = [given.w, given.h].map((side) => (typeof side === 'number' && Number.isFinite(side) ? Math.round(side) : NaN));

  if (sides.some((side) => !(side >= 1))) {
    return null;
  }

  return { w: Math.min(WIRE_CAPS.MUSIC_ART_SIDE_MAX, sides[0]), h: Math.min(WIRE_CAPS.MUSIC_ART_SIDE_MAX, sides[1]) };
}

/** Sends album art to the watch, and forgets what the watch holds so the next art goes even when it matches. */
interface ArtSender {
  push(art: MusicArtwork | null | undefined): void;
  forget(): void;
}

// what the art sender holds before it has sent anything, which no art is ever the same as
const NOTHING_SENT = {};

/**
 * Makes the sender for album art.
 *
 * Art the mapping read again is handed over as the same object, so an unchanged cover is told apart
 * by that alone, before any packing. Art the watch turns away, such as one too big for its inbox,
 * stays turned away until the art changes, since sending it again on every update would wake the
 * watch and hold up every other send for a cover that never lands. The watch's art is cleared in its
 * place, so the last cover never sits beside a new track. A forget, as after the watch reconnects or
 * asks again, lets the refused art try once more, since a refusal during a dropped link says nothing
 * about the art.
 */
function createArtSender(queueSend: FeatureContext['queueSend'], key: number): ArtSender {
  let sent: unknown = NOTHING_SENT;
  let refused: MusicArtwork | null = null;

  function push(art: MusicArtwork | null | undefined): void {
    const next = art && art !== refused ? art : null;

    if (next === sent) {
      return;
    }

    sent = next;
    queueSend(
      { [key]: wire.packMusicArt(next) },
      () => {
        console.log('Music art: sent to Pebble');
      },
      () => {
        console.error('Music art: send failed');
        sent = NOTHING_SENT;

        if (next) {
          refused = next;
          push(null);
        }
      }
    );
  }

  return {
    push,
    forget() {
      sent = NOTHING_SENT;
      refused = null;
    },
  };
}

/** What `MUSIC_PLAYING` carries for a track: 1 playing, 0 paused or nothing, or the no plugin marker. */
function playingValue(track: MusicTrack): number {
  if (track.noPlugin) {
    return WIRE_CAPS.NO_PLUGIN_MARKER;
  }

  return track.playing ? 1 : 0;
}

/**
 * Starts the now playing feature for a face, with album art at a size or without it.
 *
 * @param context What the app shares: the face's message keys and the send queue.
 * @param artSize The largest art the face draws, or null for a face that shows none.
 * @return The hooks, or none for a face built without `PLUGIN_MUSIC`.
 */
function startMusic(context: FeatureContext, artSize: ImageSize | null): FeatureHooks {
  const { messageKeys, queueSend } = context;

  if (!musicPlugins) {
    console.warn('Music: this face lists the music feature but is built without PLUGIN_MUSIC, so it reads nothing playing. Add "PLUGIN_MUSIC": 1 to the defines in its appinfo');
    return {};
  }

  // the track the watch holds, so a plugin that sends the same track again, as a polling one does,
  // wakes nothing
  const sender = createDedupedSender(queueSend, 'Music');

  // the art goes in a message of its own through a sender of its own, so a pause or a new track with
  // the same art sends no bitmap, and art that arrives after its track still goes
  const artKey = artSize ? messageKeys.MUSIC_ARTWORK : undefined;
  const artSender = artKey !== undefined ? createArtSender(queueSend, artKey) : null;

  if (artSize && artKey === undefined) {
    console.warn('Music: this face asks for album art but declares no MUSIC_ARTWORK message key, so it gets none');
  }

  return musicPlugins.driver(context, {
    send: (track) => {
      sender.push({
        [messageKeys.MUSIC_TITLE]: track.title,
        [messageKeys.MUSIC_ARTIST]: track.artist,
        [messageKeys.MUSIC_PLAYING]: playingValue(track),
      });

      artSender?.push(track.art);
    },
    forget: () => {
      sender.forget();
      artSender?.forget();
    },
    imageSize: artSender && artSize ? artSize : undefined,
  });
}

/**
 * Starts the now playing feature for a face.
 *
 * @param context What the app shares: the face's message keys and the send queue.
 * @return The hooks the app calls on ready, on a watch message, on each refresh tick, and around the
 *   settings page, or none for a face built without `PLUGIN_MUSIC`.
 */
const music = ((context) => startMusic(context, null)) as MusicFeature;

music.withArtwork = (size) => {
  const artSize = artSizeFrom(size);

  // a size the face got wrong asks for no art at all, rather than a picture a pixel across
  if (!artSize) {
    console.warn(`Music: withArtwork takes the art's size as { w, h }, each a number of pixels from 1 up, such as { w: 40, h: 40 }, and was given ${JSON.stringify(size)}, so the face gets no art`);
    return music;
  }

  const withArtwork: Feature = (context) => startMusic(context, artSize);

  withArtwork.messageKeys = MUSIC_ART_KEYS;
  return withArtwork;
};

export default music;
