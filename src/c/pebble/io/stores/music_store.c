/**
 * @file music_store.c
 * @brief The active music store: holds what the phone is playing, owns the appmessage now playing
 * channel, and asks the phone again at launch and whenever the link comes back.
 *
 * @ingroup lib_stores
 */
#include "io/stores/music_store.h"

#include "io/appmessage/appmessage.h"
#include "io/appmessage/appmessage_features.h"
#include "io/stores/system_store.h"
#include "wire/music_track.h"

// everything below is built only for a face with the now playing keys. any other face gets the
// public calls as stubs, so its code runs nothing and it reads as nothing playing
#if defined(APPMESSAGE_HAS_MUSIC)

/**
 * @brief Delay before the first ask after launch, in ms.
 *
 * It fires from the event loop so appmessage is open by then, and lands after the phone battery's
 * first ask so the two are not fighting over the outbox at boot.
 */
#define MUSIC_FIRST_ASK_MS 1300

static MusicTrack s_track;    ///< What the phone is playing, zeroed for nothing
static void (*s_cb)(void);    ///< Called whenever the track changes, so the face can redraw
static AppTimer *s_ask_timer; ///< The first ask after launch, while it waits

/**
 * @brief Keep a track and tell the face, unless it reads as the track already held.
 *
 * @param title The title, or NULL for none.
 * @param artist The artist, or NULL for none.
 * @param playing True while it plays.
 */
static void set_track(const char *title, const char *artist, bool playing)
{
    if (music_track_set(&s_track, title, artist, playing) && s_cb)
    {
        s_cb();
    }
}

/**
 * @brief Now playing channel. The text lives only for this call, so the track copies it.
 *
 * @param title The title, empty for none.
 * @param artist The artist, empty for none.
 * @param playing True while it plays.
 */
static void on_music(const char *title, const char *artist, bool playing)
{
    set_track(title, artist, playing);
}

/**
 * @brief The first ask after launch.
 *
 * @param data The timer context (unused).
 */
static void first_ask(void *data)
{
    s_ask_timer = NULL;
    appmessage_request_music();
}

/**
 * @brief The phone link really dropped or came back. A drop clears the track, since the watch can no
 * longer know it, and a return asks for it again.
 */
static void on_link(void)
{
    if (system_store_bluetooth())
    {
        appmessage_request_music();
    }
    else
    {
        set_track(NULL, NULL, false);
    }
}

#endif

// --- public API ---

void music_store_subscribe(void (*cb)(void))
{
#if defined(APPMESSAGE_HAS_MUSIC)
    s_cb = cb;
#else
    (void)cb;
#endif
}

void music_store_init(MusicConfig cfg, const MusicSeed *seed)
{
#if defined(APPMESSAGE_HAS_MUSIC)
    s_track = (MusicTrack){0};

    if (seed)
    {
        music_track_set(&s_track, seed->title, seed->artist, seed->playing);
    }

    // only a live store takes its channel and the link, as stores.md and store_poll_start set out
    if (!cfg.live)
    {
        appmessage_on_music(NULL);
        system_store_remove_link_listener(on_link);
        // a first ask still waiting is called off, so the store never asks
        if (s_ask_timer)
        {
            app_timer_cancel(s_ask_timer);
            s_ask_timer = NULL;
        }
        return;
    }

    appmessage_on_music(on_music);
    system_store_add_link_listener(on_link);

    if (!s_ask_timer)
    {
        s_ask_timer = app_timer_register(MUSIC_FIRST_ASK_MS, first_ask, NULL);
    }
#else
    (void)cfg;
    (void)seed;
#endif
}

const char *music_store_title(void)
{
#if defined(APPMESSAGE_HAS_MUSIC)
    return s_track.title;
#else
    return "";
#endif
}

const char *music_store_artist(void)
{
#if defined(APPMESSAGE_HAS_MUSIC)
    return s_track.artist;
#else
    return "";
#endif
}

bool music_store_playing(void)
{
#if defined(APPMESSAGE_HAS_MUSIC)
    return s_track.playing;
#else
    return false;
#endif
}

bool music_store_has_track(void)
{
#if defined(APPMESSAGE_HAS_MUSIC)
    return music_track_has(&s_track);
#else
    return false;
#endif
}
