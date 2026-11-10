/**
 * @file system_store.h
 * @brief Active system store: the watch's own battery, bluetooth and next-alarm state. It
 * subscribes to the battery and connection services itself and buzzes on a bluetooth change
 * through a policy the face installs (so the store never has to know about settings or buzzing).
 *
 * The alarm has no service to subscribe to, so it is read straight through on each call rather
 * than mirrored here.
 *
 * It holds the watch's one connection subscription. A Pebble app has a single connection handler,
 * and a second subscribe replaces the first, so a store that needs to hear the link adds itself as
 * a link listener here rather than subscribing on its own.
 *
 * @ingroup lib_stores
 */
#pragma once
#include <pebble.h>

/**
 * @addtogroup lib_stores
 * @{
 */

// the link listener list is built only for a face with a store that listens, which is phone battery
// or now playing. any other face builds the store without it, so its link handling runs as it
// always has
#if defined(HAS_MESSAGE_KEY_PHONE_REQUEST) || defined(HAS_MESSAGE_KEY_MUSIC_REQUEST)
#define SYSTEM_STORE_LINK_LISTENERS 1 ///< the face has a store that listens for the phone link
#endif

/**
 * @brief Called on a real bluetooth transition (a change, not the first reading), so the face
 * can buzz however its own settings say. NULL for a silent link change.
 *
 * @param connected True when the link just came up, false when it just dropped.
 */
typedef void (*BtVibePolicy)(bool connected);

/**
 * @brief The rules a face hands the store.
 */
typedef struct
{
    bool live;         ///< True subscribes the services and false just keeps the fake data for screenshots
    BtVibePolicy vibe; ///< Buzz policy for a bluetooth change, or NULL for silent
} SystemConfig;

/**
 * @brief Optional prefill, or pinned state when live = false.
 */
typedef struct
{
    int  battery;      ///< Battery level from 0 to 100
    bool charging;     ///< True when plugged in
    bool bluetooth;    ///< True when the phone link is up
    time_t next_alarm; ///< When the next alarm fires, or 0 for none
} SystemSeed;

/**
 * @brief Start the store with its rules. Pass seed = NULL for normal use.
 *
 * @param cfg The rules (live / vibe policy).
 * @param seed Optional prefill, or NULL.
 */
void system_store_init(SystemConfig cfg, const SystemSeed *seed);

/** @brief Stop tracking the battery + connection services. */
void system_store_deinit(void);

/** @brief Hand it the function to call when something changes (the screen redraw). */
void system_store_subscribe(void (*cb)(void));

/** @brief Hand it the function to call when the phone app link comes back after a drop. */
void system_store_on_reconnect(void (*cb)(void));

#if defined(SYSTEM_STORE_LINK_LISTENERS)
/**
 * @brief Adds a function to run whenever the phone link really drops or comes back.
 *
 * It runs after the face's buzz and its reconnect callback, and never for the first reading at
 * launch. It reads the link with system_store_bluetooth, which already holds the new state. Adding
 * the same function twice does nothing. The list exists only on a face with the phone battery or now
 * playing keys, whose stores add themselves from their init.
 *
 * @param listener The function to run. NULL is ignored.
 */
void system_store_add_link_listener(void (*listener)(void));
#endif

/** @brief How full the battery is from 0 to 100. */
int  system_store_battery(void);

/** @brief True while the watch is plugged in. */
bool system_store_charging(void);

/** @brief True when the phone link is up. */
bool system_store_bluetooth(void);

/**
 * @brief When the wearer's next enabled alarm fires.
 *
 * Read through to the alarm service on every call, since there is nothing to subscribe to. A
 * platform without the alarm API always reads as no alarm.
 *
 * @param[out] out Set to the alarm's UTC time, or 0 when there is none. Never NULL.
 * @return True when an enabled alarm is scheduled.
 */
bool system_store_next_alarm(time_t *out);

/** @} */
