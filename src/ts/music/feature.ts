/**
 * What the phone is playing, as a feature a face opts into.
 *
 * It reads the track from a music plugin and sends the watch `MUSIC_TITLE` and `MUSIC_ARTIST` as
 * ASCII text, and `MUSIC_PLAYING` as 1 or 0, all three together. Nothing playing sends both lines
 * empty and playing off. While no plugin serves now playing, both lines go empty and `MUSIC_PLAYING`
 * carries -2, so the watch can tell the two apart. The watch asks again with `MUSIC_REQUEST`. A face turns it on with
 * `PLUGIN_MUSIC` in its appinfo's defines and lists the feature in startPebbleApp. All of the plugin
 * code lives behind plugin-sources/index, so a face built without the define reads null there and
 * carries none of it. Listed without the define, the feature logs why and does nothing.
 */
import { createDedupedSender } from '../pkjs/send-queue';
import type { Feature } from '../pkjs/feature';
import { WIRE_CAPS } from '../pkjs/wire';
import { musicPlugins } from '../plugin-sources/index';
import type { MusicTrack } from '../plugin-sources/types';

/** What `MUSIC_PLAYING` carries for a track: 1 playing, 0 paused or nothing, or the no plugin marker. */
function playingValue(track: MusicTrack): number {
  if (track.noPlugin) {
    return WIRE_CAPS.NO_PLUGIN_MARKER;
  }

  return track.playing ? 1 : 0;
}

/**
 * Starts the now playing feature for a face.
 *
 * @param context What the app shares: the face's message keys and the send queue.
 * @return The hooks the app calls on ready, on a watch message, on each refresh tick, and around the
 *   settings page, or none for a face built without `PLUGIN_MUSIC`.
 */
const music: Feature = (context) => {
  const { messageKeys, queueSend } = context;

  if (!musicPlugins) {
    console.warn('Music: this face lists the music feature but is built without PLUGIN_MUSIC, so it reads nothing playing. Add "PLUGIN_MUSIC": 1 to the defines in its appinfo');
    return {};
  }

  // the track the watch holds, so a plugin that sends the same track again, as a polling one does,
  // wakes nothing
  const sender = createDedupedSender(queueSend, 'Music');

  return musicPlugins.driver(context, {
    send: (track) => sender.push({
      [messageKeys.MUSIC_TITLE]: track.title,
      [messageKeys.MUSIC_ARTIST]: track.artist,
      [messageKeys.MUSIC_PLAYING]: playingValue(track),
    }),
    forget: () => sender.forget(),
  });
};

export default music;
