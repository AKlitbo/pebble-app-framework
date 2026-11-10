/**
 * Specs for the plugin now playing mapping.
 *
 * An update from a music plugin has to reach the watch as text its fonts can draw. The parts worth
 * pinning are the folding to ASCII and the cut to the watch's length, a title with no ASCII form
 * turning empty rather than into a row of question marks, and nothing playing clearing the panel.
 * The fixtures follow the Pebble app's own Music plugin, which sends each line as both texts and
 * playing as a boolean beside its words.
 */

import { describe, test, expect } from 'vitest';
import { trackFromUpdate } from './music';
import { declaresStandard, MUSIC_STANDARD } from './standard';
import type { PluginSummary, SourceEnvelope } from './types';

const MUSIC_UUID = '00000000-0000-0000-0001-000000000003';

/** One update with the track playing or paused, each line sent as both texts. */
function update(title: string, artist: string, playing = true): SourceEnvelope {
  const lines = (words: string) => ({ shortText: { text: words }, longText: { text: words } });

  return {
    pluginUuid: MUSIC_UUID,
    instances: [{ instanceId: 'track', properties: { title: lines(title), artist: lines(artist), playing: { boolean: { value: playing }, shortText: { text: playing ? 'Playing' : 'Paused' } } } }],
  };
}

describe('trackFromUpdate', () => {
  /** The three values are all the watch's panel draws, so each has to land where the watch reads it. */
  test('reads the title, the artist, and whether it plays', () => {
    const result = trackFromUpdate(update('Clocks', 'Coldplay', false));

    expect(result).toEqual({ title: 'Clocks', artist: 'Coldplay', playing: false });
  });

  /** The watch fonts carry ASCII alone, so an accent would draw as a box. */
  test('folds accented letters to plain ones', () => {
    const result = trackFromUpdate(update('Café del Mar', 'Beyoncé'));

    expect(result).toEqual({ title: 'Cafe del Mar', artist: 'Beyonce', playing: true });
  });

  /** The watch keeps 32 characters, and a longer line would be cut wherever its buffer ran out. */
  test('cuts a long title to 32 characters', () => {
    const result = trackFromUpdate(update('A Very Long Song Title That Keeps Going', 'Band'));

    expect(result.title).toBe('A Very Long Song Title That Keep');
  });

  /** A title in a script with no ASCII form would show as a row of question marks, so it goes as the empty state. */
  test('sends a line with no ASCII form left as empty', () => {
    const result = trackFromUpdate(update('夜に駆ける', 'YOASOBI'));

    expect(result).toEqual({ title: '', artist: 'YOASOBI', playing: true });
  });

  /** The built-in plugin sends a question mark for a line the phone does not know, which is nothing to show. */
  test('sends the plugin\'s question mark for an unknown line as empty', () => {
    const result = trackFromUpdate(update('Song', '?'));

    expect(result.artist).toBe('');
  });

  /** A title made only of punctuation is a real title, and blanking it would show nothing playing while it plays. */
  test.each([['!!!'], ['...'], ['??']])('sends an ASCII title of %s as written', (title) => {
    const result = trackFromUpdate(update(title, 'Band'));

    expect(result.title).toBe(title);
  });

  /** A tab or a line break is still ASCII, so a punctuation title carrying one is not blanked as if it were another script. */
  test('keeps a punctuation title that carries a tab', () => {
    const result = trackFromUpdate(update('\t!!!', 'Band'));

    expect(result.title).toBe('?!!!');
  });

  /** Only the built-in plugin uses a lone question mark as its marker, so from another plugin it is a title like any other. */
  test('sends a lone question mark from another plugin as written', () => {
    const envelope = { ...update('?', 'Band'), pluginUuid: 'a-spotify-plugin' };

    const result = trackFromUpdate(envelope);

    expect(result.title).toBe('?');
  });

  /** A line mixing scripts keeps what folds, so a title with a few Latin letters still shows them. */
  test('keeps the readable part of a line with some characters outside ASCII', () => {
    const result = trackFromUpdate(update('Live 東京', 'Band'));

    expect(result.title).toBe('Live ??');
  });

  /** A plugin serving only the short text, as a Spotify one may, still has its words read. */
  test('reads a line sent only as short text', () => {
    const envelope: SourceEnvelope = { instances: [{ properties: { title: { shortText: { text: 'Clocks' } }, playing: { boolean: { value: true } } } }] };

    const result = trackFromUpdate(envelope);

    expect(result).toEqual({ title: 'Clocks', artist: '', playing: true });
  });

  /** Nothing playing comes as an update with no instance, and the watch has to clear its panel. */
  test('reads an update with no instance as nothing playing', () => {
    const result = trackFromUpdate({ pluginUuid: MUSIC_UUID, instances: [] });

    expect(result).toEqual({ title: '', artist: '', playing: false });
  });

  /** A playing flag sent only as text says nothing the face can trust, so the panel shows paused. */
  test('reads a playing flag with no boolean as paused', () => {
    const envelope: SourceEnvelope = { instances: [{ properties: { title: { longText: { text: 'Clocks' } }, playing: { shortText: { text: 'Playing' } } } }] };

    const result = trackFromUpdate(envelope);

    expect(result.playing).toBe(false);
  });

  /** Nothing off the phone is trusted, so a missing or odd update reads as nothing playing rather than throwing. */
  test.each([['a missing update', undefined], ['an update with no list', {}], ['an instance with no properties', { instances: [{}] }]])('reads %s as nothing playing', (_label, envelope) => {
    const result = trackFromUpdate(envelope as SourceEnvelope | undefined);

    expect(result).toEqual({ title: '', artist: '', playing: false });
  });
});

describe('MUSIC_STANDARD', () => {
  /** The Pebble app's own plugin is the one Android wearers have, so it must never read as one the face cannot use. */
  test('passes the built-in Music plugin', () => {
    const music: PluginSummary = {
      uuid: MUSIC_UUID,
      name: 'Music',
      sources: [{ category: 'music', items: ['track'], properties: { title: ['shortText', 'longText'], artist: ['shortText', 'longText'], album: ['shortText', 'longText'], playing: ['boolean', 'shortText'], artwork: ['image'] } }],
    };

    const result = declaresStandard(music, 'music', 'track', MUSIC_STANDARD);

    expect(result).toBe(true);
  });

  /** A plugin with no playing flag leaves the play and pause glyph guessing, so the page has to say so. */
  test('fails a plugin without playing', () => {
    const noFlag: PluginSummary = { uuid: 'odd', name: 'Odd', sources: [{ category: 'music', items: ['track'], properties: { title: ['shortText'], artist: ['shortText'] } }] };

    const result = declaresStandard(noFlag, 'music', 'track', MUSIC_STANDARD);

    expect(result).toBe(false);
  });
});
