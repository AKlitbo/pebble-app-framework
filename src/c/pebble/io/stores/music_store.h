/**
 * @file music_store.h
 * @brief Active music store: what the phone is playing, as a Pebble app music plugin reports it.
 *
 * It holds the title and the artist, up to 32 characters each, and whether the track plays. Nothing
 * is saved to flash, since a song from an hour ago is worse than none. It clears when the phone
 * drops, and the store asks the phone again when the link comes back and once at launch.
 *
 * The text is ASCII, since the phone folds each line to it before sending. A line in a script with
 * no ASCII form arrives empty.
 *
 * A face that started the phone's music feature as `music.withArtwork({ w, h })` also gets the album
 * art, as a GBitmap from music_store_artwork(). The store holds one bitmap at a time, up to 100 by
 * 100 pixels at 4 bits each, and frees it when the art changes, clears, or the phone drops, and in
 * music_store_deinit().
 *
 * The phone also says when no plugin on it serves now playing, such as with plugins off in the
 * Pebble app or on an iPhone. The store then reads as nothing playing, and music_store_no_plugin()
 * says why, so a face can show its own words in place of its empty state.
 *
 * It is built only for a face that declares MUSIC_TITLE, MUSIC_ARTIST, MUSIC_PLAYING, and
 * MUSIC_REQUEST, which the build allows only with `PLUGIN_MUSIC` in the appinfo's defines. On any
 * other face it does nothing and reads as nothing playing.
 *
 * @ingroup lib_stores
 */
#pragma once
#include <pebble.h>

/**
 * @addtogroup lib_stores
 * @{
 */

/**
 * @brief The rules a face hands the store.
 */
typedef struct
{
    bool live; ///< True takes the phone's readings and asks for them. False just keeps the seed for screenshots
} MusicConfig;

/**
 * @brief Optional prefill, or pinned state when live = false.
 */
typedef struct
{
    const char *title;  ///< The song's title, or NULL for none
    const char *artist; ///< Who it is by, or NULL for none
    bool playing;       ///< True while it plays
} MusicSeed;

/**
 * @brief Start the store with its rules. Pass seed = NULL for normal use.
 *
 * A live store listens for the phone link through the system store, so the face starts that one live
 * too.
 *
 * @param cfg The rules.
 * @param seed Optional prefill, or NULL.
 */
void music_store_init(MusicConfig cfg, const MusicSeed *seed);

/** @brief Hand it the function to call when the track changes (the screen redraw). */
void music_store_subscribe(void (*cb)(void));

/** @brief The song's title, or an empty string for none. */
const char *music_store_title(void);

/** @brief Who it is by, or an empty string for none. */
const char *music_store_artist(void);

/** @brief True while the track plays, and false while it is paused or nothing is playing. */
bool music_store_playing(void);

/**
 * @brief Whether there is a track to show, paused or playing.
 *
 * @return False for nothing playing, with the phone away, with no plugin serving it, or on a face
 *   built without the music keys.
 */
bool music_store_has_track(void);

/**
 * @brief The track's album art, as a 4-bit palettized bitmap.
 *
 * The store owns it. It stays valid until the store calls the face back with a change, so a face
 * reads it again on every redraw rather than keeping it.
 *
 * @return The art, or NULL for none, such as a track with no art, an iPhone, the phone away, or a
 *   face built without the album art key.
 */
const GBitmap *music_store_artwork(void);

/**
 * @brief Frees the album art the store holds. Call it from the face's deinit.
 */
void music_store_deinit(void);

/**
 * @brief Whether the phone said no plugin on it serves now playing.
 *
 * It holds from the phone's word until a track or a clear arrives or the phone drops.
 *
 * @return True while the phone reports no plugin. False otherwise, and on a face built without the
 *   music keys.
 */
bool music_store_no_plugin(void);

/** @} */
