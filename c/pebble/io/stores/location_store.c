/**
 * @file location_store.c
 * @brief The active location store: holds the phone's coordinates and owns the appmessage
 * coords channel.
 *
 * @ingroup lib_stores
 */
#include "io/stores/location_store.h"
#include "io/stores/store_persist.h"

#include <stdio.h>
#include <string.h>

#include "io/appmessage/appmessage.h"
#include "wire/coords.h"
#include "text/cstring_fit.h"

/**
 * @var s_persist_key
 * @brief Where the last good fix is kept, handed in by the face.
 *
 * A relaunch, such as coming back from the timeline, shows the coords straight away rather than
 * blanking to "--". The face picks the slot, so it is the one place that knows which keys it has
 * already spent.
 */
static uint32_t s_persist_key;

/**
 * @var s_state
 * @brief The last fix, laid out as the blob that gets persisted.
 */
static struct
{
    uint8_t tag;  ///< STORE_TAG_LOCATION, so a restore can tell this blob from another shape
    char lat[20]; ///< Latitude as text, as the phone sent it
    char lon[20]; ///< Longitude as text, as the phone sent it
} s_state;
_Static_assert(sizeof(s_state) <= PERSIST_DATA_MAX_LENGTH, "location state must fit one persist key");

static void (*s_cb)(void); ///< Called whenever the coords change, so the face can redraw
static bool s_live;        ///< True on a live face, so the cache is worth reading and writing

/**
 * @brief Stash the coords so a relaunch can restore them.
 *
 * Only a live face writes, and only a real fix, so a dropped one can't stomp the last good
 * location.
 */
static void persist_save(void)
{
    if (s_live && coords_look_real(s_state.lat, s_state.lon))
    {
        store_save(s_persist_key, &s_state, sizeof(s_state), STORE_TAG_LOCATION);
    }
}

/**
 * @brief Save the latest coordinates and tell whoever is listening. Doubles as the coords
 * channel handler (its signature matches) and the seed writer.
 *
 * @param lat Latitude string, empty when unavailable.
 * @param lon Longitude string, empty when unavailable.
 */
static void set(const char *lat, const char *lon)
{
    char next_lat[sizeof(s_state.lat)];
    char next_lon[sizeof(s_state.lon)];
    cstring_fit(next_lat, lat ? lat : "", sizeof(next_lat));
    cstring_fit(next_lon, lon ? lon : "", sizeof(next_lon));

    // the phone sends the coords with every weather push and a wearer standing still sends the
    // same two strings each time, so an unmoved fix skips the write rather than wearing the flash
    if (strcmp(next_lat, s_state.lat) == 0 && strcmp(next_lon, s_state.lon) == 0)
    {
        return;
    }

    cstring_fit(s_state.lat, next_lat, sizeof(s_state.lat));
    cstring_fit(s_state.lon, next_lon, sizeof(s_state.lon));
    persist_save();
    if (s_cb) s_cb();
}

void location_store_subscribe(void (*cb)(void))
{
    s_cb = cb;
}

void location_store_init(LocationConfig cfg, const LocationSeed *seed)
{
    s_live = cfg.live;  // set before any set() so persist_save knows whether to write
    s_persist_key = cfg.persist_key;
    s_state.lat[0] = '\0';
    s_state.lon[0] = '\0';

    if (seed)
    {
        set(seed->lat, seed->lon);  // s_cb is NULL until the face subscribes so no redraw yet
    }
    else if (cfg.live)
    {
        // restore the last good fix so a relaunch shows it right away. s_cb is still NULL so no
        // redraw fires here, but the first paint (window push) re-pulls every readout
        store_restore(s_persist_key, &s_state, sizeof(s_state), STORE_TAG_LOCATION);
    }

    if (cfg.live)
    {
        appmessage_on_coords(set);  // the store owns its channel
    }
}

const char *location_store_lat(void) { return s_state.lat; }
const char *location_store_lon(void) { return s_state.lon; }
