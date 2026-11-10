/**
 * @file music_track.c
 * @brief Taking in the track the phone sent.
 *
 * @ingroup lib_core
 */
#include "wire/music_track.h"

#include "text/cstring_fit.h"

bool music_track_set(MusicTrack *track, const char *title, const char *artist, bool playing)
{
    const char *new_title = title ? title : "";
    const char *new_artist = artist ? artist : "";

    if (track->playing == playing && cstring_fit_same(track->title, new_title, sizeof(track->title)) &&
        cstring_fit_same(track->artist, new_artist, sizeof(track->artist)))
    {
        return false;
    }

    cstring_fit(track->title, new_title, sizeof(track->title));
    cstring_fit(track->artist, new_artist, sizeof(track->artist));
    track->playing = playing;
    return true;
}

bool music_track_has(const MusicTrack *track)
{
    return track->title[0] != '\0' || track->artist[0] != '\0';
}
