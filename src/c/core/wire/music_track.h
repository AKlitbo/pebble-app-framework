/**
 * @file music_track.h
 * @brief What the phone is playing, as the watch holds it, and taking a new one in.
 *
 * The phone sends `MUSIC_TITLE` and `MUSIC_ARTIST` as ASCII text of up to 32 characters, and
 * `MUSIC_PLAYING` as 1 or 0, all three in one message. Nothing playing is both lines empty and
 * playing off. The text comes off a phone, so a line longer than the buffer is cut to fit and always
 * ends in a terminator.
 *
 * The sender on the other side is ts/plugin-sources/music.ts, through the now playing feature.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdbool.h>

// MUSIC_TEXT_LEN is generated from the phone's cap table, so the two sides cannot drift
#include "wire/wire_caps.g.h"

/**
 * @addtogroup lib_core
 * @{
 */

/**
 * @brief One track. Zeroed is nothing playing.
 */
typedef struct
{
    char title[MUSIC_TEXT_LEN];  ///< The song's title, or empty for none
    char artist[MUSIC_TEXT_LEN]; ///< Who it is by, or empty for none
    bool playing;                ///< True while it plays, false while paused or with nothing playing
} MusicTrack;

/**
 * @brief Takes in the track the phone sent, and says whether anything changed.
 *
 * A message holding the same track as before changes nothing, so the face is not woken to redraw
 * what it already shows.
 *
 * @param track The track the store holds. Updated to the new one.
 * @param title The title as sent, or NULL for none.
 * @param artist The artist as sent, or NULL for none.
 * @param playing True while it plays.
 * @return True when the track reads differently now.
 */
bool music_track_set(MusicTrack *track, const char *title, const char *artist, bool playing);

/**
 * @brief Whether there is a track to show, which is a title or an artist.
 *
 * A paused track still counts, so a face can show it with a pause glyph.
 *
 * @param track The track the store holds.
 * @return False only for nothing playing.
 */
bool music_track_has(const MusicTrack *track);

/** @} */
