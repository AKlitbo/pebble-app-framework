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
#include "wire/music_art.h"
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
static bool s_no_plugin;      ///< True while the phone reports no plugin serving now playing
static bool s_no_plugin_next; ///< What the phone said about no plugin for the music message on its way
static void (*s_cb)(void);    ///< Called whenever the track changes, so the face can redraw
static AppTimer *s_ask_timer; ///< The first ask or release after launch, while it waits

#if defined(APPMESSAGE_HAS_MUSIC_ART)
static GBitmap *s_art; ///< The album art, or NULL for none

/**
 * @brief Frees the art the store holds, if any.
 *
 * @return True when there was art to free.
 */
static bool drop_art(void)
{
    if (!s_art)
    {
        return false;
    }

    gbitmap_destroy(s_art);
    s_art = NULL;
    return true;
}

/**
 * @brief Builds a bitmap from art read off the wire.
 *
 * The palette always holds all 16 entries a 4-bit pixel can name, with the ones the phone left out
 * see-through, so a stray index draws nothing rather than reading past the colours. The bitmap frees
 * its palette when it is destroyed.
 *
 * @param art The art, checked by music_art_read.
 * @return The bitmap, or NULL when the heap has no room for it.
 */
static GBitmap *art_bitmap(const MusicArt *art)
{
    GColor *palette = malloc(sizeof(GColor) * MUSIC_ART_COLOURS_MAX);
    if (!palette)
    {
        return NULL;
    }

    for (int index = 0; index < MUSIC_ART_COLOURS_MAX; index++)
    {
        palette[index] = index < art->colours ? (GColor){.argb = art->palette[index]} : GColorClear;
    }

    GBitmap *bitmap = gbitmap_create_blank_with_palette(GSize(art->width, art->height), GBitmapFormat4BitPalette, palette, true);
    if (!bitmap)
    {
        free(palette);
        return NULL;
    }

    music_art_copy_rows(art, gbitmap_get_data(bitmap), gbitmap_get_bytes_per_row(bitmap));
    return bitmap;
}

/**
 * @brief Album art channel. Art that does not read clean, or the phone's marker for none, clears the
 * art held, since it belonged to an earlier track.
 *
 * @param buf The art as the phone packed it.
 * @param len How many bytes there are.
 */
static void on_music_art(const uint8_t *buf, uint16_t len)
{
    MusicArt art;
    bool changed = drop_art();

    if (music_art_read(buf, len, &art))
    {
        // a heap with no room leaves the art clear, which the face draws as no art
        s_art = art_bitmap(&art);
        changed = changed || s_art != NULL;
    }

    if (changed && s_cb)
    {
        s_cb();
    }
}
#endif

/**
 * @brief Keep a track and tell the face, unless it reads as the track already held.
 *
 * @param title The title, or NULL for none.
 * @param artist The artist, or NULL for none.
 * @param playing True while it plays.
 * @param no_plugin True while no plugin on the phone serves now playing.
 * @param art_dropped True when the caller freed the art just before, which the face has to hear
 *   about even when the track reads the same.
 */
static void set_track(const char *title, const char *artist, bool playing, bool no_plugin, bool art_dropped)
{
    bool changed = music_track_set(&s_track, title, artist, playing) || art_dropped;

    changed = changed || s_no_plugin != no_plugin;
    s_no_plugin = no_plugin;

    if (changed && s_cb)
    {
        s_cb();
    }
}

/**
 * @brief The no plugin word for the music message on its way, which the transport hands over just
 * before the message itself.
 *
 * @param no_plugin True while no plugin on the phone serves now playing.
 */
static void on_music_no_plugin(bool no_plugin)
{
    s_no_plugin_next = no_plugin;
}

/**
 * @brief Now playing channel. The text lives only for this call, so the track copies it. It takes the
 * no plugin word that came with the same message, and lets it go, so a later message without one
 * reads as a plugin serving.
 *
 * @param title The title, empty for none.
 * @param artist The artist, empty for none.
 * @param playing True while it plays.
 */
static void on_music(const char *title, const char *artist, bool playing)
{
    bool no_plugin = s_no_plugin_next;

    s_no_plugin_next = false;
    set_track(title, artist, playing, no_plugin, false);
}

/**
 * @brief The first word after launch from a store that is not live, telling the phone the face no
 * longer shows this, so it ends its subscription.
 *
 * @param data The timer context (unused).
 */
static void first_release(void *data)
{
    s_ask_timer = NULL;
    appmessage_release_music();
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
#if defined(APPMESSAGE_HAS_MUSIC_ART)
        // the art is gone even when the track was already clear, so the face hears of it either way
        // and never draws a bitmap that was freed
        bool art_dropped = drop_art();
#else
        bool art_dropped = false;
#endif
        set_track(NULL, NULL, false, false, art_dropped);
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
    s_no_plugin = false;
    s_no_plugin_next = false;
#if defined(APPMESSAGE_HAS_MUSIC_ART)
    drop_art();
#endif

    if (seed)
    {
        music_track_set(&s_track, seed->title, seed->artist, seed->playing);
    }

    // only a live store takes its channel and the link, as stores.md and store_poll_start set out
    if (!cfg.live)
    {
        appmessage_on_music(NULL);
        appmessage_on_music_no_plugin(NULL);
        appmessage_on_music_art(NULL);
        system_store_remove_link_listener(on_link);
        // a first ask still waiting is called off, so the store never asks. it tells the phone the
        // face no longer shows this instead, once appmessage is open, since a phone that subscribed
        // for an earlier layout keeps the subscription across its restarts
        if (s_ask_timer)
        {
            app_timer_cancel(s_ask_timer);
        }
        s_ask_timer = app_timer_register(MUSIC_FIRST_ASK_MS, first_release, NULL);
        return;
    }

    appmessage_on_music_no_plugin(on_music_no_plugin);
    appmessage_on_music(on_music);
#if defined(APPMESSAGE_HAS_MUSIC_ART)
    appmessage_on_music_art(on_music_art);
#endif
    system_store_add_link_listener(on_link);

    // a release still waiting from a not live start is replaced, so the phone hears the ask
    if (s_ask_timer)
    {
        app_timer_cancel(s_ask_timer);
    }
    s_ask_timer = app_timer_register(MUSIC_FIRST_ASK_MS, first_ask, NULL);
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

bool music_store_no_plugin(void)
{
#if defined(APPMESSAGE_HAS_MUSIC)
    return s_no_plugin;
#else
    return false;
#endif
}

const GBitmap *music_store_artwork(void)
{
#if defined(APPMESSAGE_HAS_MUSIC_ART)
    return s_art;
#else
    return NULL;
#endif
}

void music_store_deinit(void)
{
#if defined(APPMESSAGE_HAS_MUSIC_ART)
    appmessage_on_music_art(NULL);
    drop_art();
#endif
}
