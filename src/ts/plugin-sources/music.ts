/**
 * What the phone is playing, from a Pebble app music plugin, as the watch takes it.
 *
 * A music plugin serves `music/track` with one instance for the track, or none when nothing is
 * playing. The Pebble app has one built in on Android, which sends on every change of the phone's
 * media session. As of November 2026 no plugin serves it on iOS, so an iPhone shows the empty state
 * until one is published, and then works with no change here. A plugin that polls, as a Spotify one
 * may every 15 seconds, sends the same track again and again. Only the title, the artist, and
 * whether it plays are asked for and sent, never the progress, so the feature's deduped sender keeps
 * the watch asleep through those. A face that asks for album art at a size gets the art too, which
 * only the built-in plugin on Android draws. An iPhone, a track with no art, or art that does not check
 * out reads as none, and the watch clears its own.
 *
 * The watch fonts carry ASCII alone, so both lines are folded to it and cut to the watch's length. A
 * title in a script with no ASCII form would arrive as a row of question marks, so a line that held
 * characters outside ASCII and is left with no letter or digit is sent empty, and the watch shows its
 * empty state instead. A line that was ASCII all along goes as written, punctuation alone included.
 *
 * The page hook's wording lives here too, so a face built without `PLUGIN_MUSIC` carries none of it.
 */

import { firstProperties, flag, image, text } from '../plugin-shapes/shapes';
import { uuidKey } from './escape';
import type { PluginSourceTexts } from './page';
import { MUSIC_STANDARD } from './standard';
import { createReadingDriver } from './reading-driver';
import type { ImageSize, MusicArtwork, MusicPlugins, MusicTrack, SourceEnvelope, SourceProperty } from './types';
import wire, { WIRE_CAPS } from '../pkjs/wire';

/** The properties the music subscription asks for. Artwork is asked for only by a face that wants art. */
export const MUSIC_PROPERTIES = ['title', 'artist', 'playing'];

/** The property that carries the album art, as an `image`. */
export const ARTWORK_PROPERTY = 'artwork';

/** The track the watch clears its panel to, with nothing playing. */
export const NO_TRACK: MusicTrack = { title: '', artist: '', playing: false };

/** The track the watch clears its panel to while no plugin on the phone serves now playing. */
export const NO_PLUGIN_TRACK: MusicTrack = { ...NO_TRACK, noPlugin: true };

/** The Pebble app's own music plugin, which sends a lone question mark for a line the phone does not know. */
const BUILT_IN_MUSIC_UUID = '00000000-0000-0000-0001-000000000003';

/**
 * One line of the track as the watch can draw it.
 *
 * A line that held characters outside ASCII and kept no letter or digit through the fold is sent
 * empty, since all that is left is the question marks the fold put in. The built-in plugin's lone
 * question mark is its own marker for a missing line, so it is sent empty too. Any other line goes as
 * written, so a title of `!!!` or `...` stays, and so does a lone `?` from another plugin.
 */
function watchLine(property: SourceProperty | undefined, fromBuiltIn: boolean): string {
  const words = text(property, 'long');

  if (words === undefined || (fromBuiltIn && words.trim() === '?')) {
    return '';
  }

  const ascii = wire.toAscii(words, WIRE_CAPS.MUSIC_TEXT_MAX);
  // a tab or a line break is still ASCII, so only a character past it counts as folded
  const folded = /[\u0080-\uffff]/.test(words);

  return folded && !/[A-Za-z0-9]/.test(ascii) ? '' : ascii;
}

// the last art read and what it was read from, so an update carrying the same art again, as every
// pause and every progress tick does, hands back the same art without decoding it again
let lastArt: { from: unknown[]; art: MusicArtwork | null } | null = null;

/** What art is read from: the size asked for and the image's own size and text, compared before any decoding. */
function artSource(property: SourceProperty | undefined, size: ImageSize): unknown[] {
  const shape = property && typeof property === 'object' && property.image && typeof property.image === 'object' ? property.image : null;

  return shape ? [size.w, size.h, shape.width, shape.height, shape.palette, shape.pixels] : [size.w, size.h];
}

/**
 * The album art the watch can take, or null for none.
 *
 * The art has to fit the size the face asked for and the watch's own cap, since the face sized its
 * inbox and its panel for that. Art past either is read as none rather than cut, since a plugin that
 * ignored the size would otherwise fill the inbox or overrun the panel. Art the same as the last is
 * handed back as the same object, so the feature can tell it is unchanged without packing it.
 */
function watchArt(property: SourceProperty | undefined, size: ImageSize): MusicArtwork | null {
  const from = artSource(property, size);

  if (lastArt && lastArt.from.length === from.length && lastArt.from.every((part, index) => part === from[index])) {
    return lastArt.art;
  }

  const art = image(property);
  const fits = Boolean(art) && (art as MusicArtwork).width <= Math.min(size.w, WIRE_CAPS.MUSIC_ART_SIDE_MAX) && (art as MusicArtwork).height <= Math.min(size.h, WIRE_CAPS.MUSIC_ART_SIDE_MAX);

  lastArt = { from, art: fits ? (art as MusicArtwork) : null };
  return lastArt.art;
}

/**
 * Turns one music plugin update into the track the watch shows.
 *
 * The title and the artist prefer the `longText`, since the plugin guide sizes a `shortText` at about
 * 7 characters and the watch holds 32. An update with no instance is nothing playing.
 *
 * @param envelope The update, which may be missing or carry anything.
 * @param artSize The size the face asked for album art at, or undefined for a face that wants none.
 * @return The track, or the empty one for nothing playing. With an art size it carries the art, or
 *   null for none.
 */
export function trackFromUpdate(envelope: SourceEnvelope | null | undefined, artSize?: ImageSize): MusicTrack {
  const properties = firstProperties(envelope);

  if (!properties) {
    return artSize ? { ...NO_TRACK, art: null } : { ...NO_TRACK };
  }

  const fromBuiltIn = uuidKey(envelope?.pluginUuid) === BUILT_IN_MUSIC_UUID;
  const track: MusicTrack = {
    title: watchLine(properties.title, fromBuiltIn),
    artist: watchLine(properties.artist, fromBuiltIn),
    playing: flag(properties.playing) === true,
  };

  if (artSize) {
    track.art = watchArt(properties[ARTWORK_PROPERTY], artSize);
  }

  return track;
}

/** The now playing page hook's notes. No store plugin serves music yet, so the no plugin note names none. */
export const MUSIC_TEXTS: PluginSourceTexts = {
  notStandard: (pluginName) => `${pluginName} sends music this watchface cannot read. Pick another music plugin under Preferred Sources in the Pebble app.`,
  permissionDenied: 'This watchface needs Music to show what your phone is playing. Allow it for this watchface in the Pebble app.',
  noPlugin: 'Now playing needs a music plugin. The Pebble app has one built in on Android. Turn on plugins in the Pebble app under Settings, Plugins, or update the Pebble app.',
};

/**
 * Everything the now playing feature reads the plugin with, which plugin-sources/index hands it on a
 * face built with `PLUGIN_MUSIC`.
 */
export const musicPlugins: MusicPlugins = {
  driver: createReadingDriver({
    category: 'music',
    item: 'track',
    properties: MUSIC_PROPERTIES,
    imageProperties: [ARTWORK_PROPERTY],
    requestKey: 'MUSIC_REQUEST',
    fromUpdate: trackFromUpdate,
    empty: NO_TRACK,
    noPlugin: NO_PLUGIN_TRACK,
    standard: MUSIC_STANDARD,
    texts: MUSIC_TEXTS,
  }),
};

export default { trackFromUpdate, ARTWORK_PROPERTY, MUSIC_PROPERTIES, MUSIC_TEXTS, NO_PLUGIN_TRACK, NO_TRACK };
