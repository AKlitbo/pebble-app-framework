/**
 * @file phone_store.h
 * @brief Active phone store: the phone's own battery, as a Pebble app plugin on the phone reports it.
 *
 * It is kept apart from the system store, which holds the watch's own battery and its link to the
 * phone. The level is not saved to flash, since a phone battery an hour old is worse than none. It
 * clears when the phone drops, since the watch can no longer know it, and the store asks the phone
 * again when the link comes back and once at launch.
 *
 * The phone also says when no plugin on it serves the battery, such as with plugins off in the
 * Pebble app. The level then reads as none, and phone_store_no_plugin() says why, so a face can show
 * its own words, such as "PLUGINS OFF", in place of the "--" that readout_phone_battery() writes.
 *
 * It is built only for a face that declares PHONE_BATTERY and PHONE_REQUEST, which the build allows
 * only with `PLUGIN_PHONE` in the appinfo's defines. On any other face it does nothing and the level
 * reads as none.
 *
 * @ingroup lib_stores
 */
#pragma once
#include <pebble.h>

#include "wire/phone_level.h"

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
} PhoneConfig;

/**
 * @brief Optional prefill, or pinned state when live = false.
 */
typedef struct
{
    int battery; ///< The phone's level from 0 to 100, -1 for none, or -2 for no plugin
} PhoneSeed;

/**
 * @brief Start the store with its rules. Pass seed = NULL for normal use.
 *
 * A live store listens for the phone link through the system store, so the face starts that one live
 * too.
 *
 * @param cfg The rules.
 * @param seed Optional prefill, or NULL.
 */
void phone_store_init(PhoneConfig cfg, const PhoneSeed *seed);

/** @brief Hand it the function to call when the level changes (the screen redraw). */
void phone_store_subscribe(void (*cb)(void));

/**
 * @brief The phone's battery level.
 *
 * @return The level from 0 to 100, or -1 when there is none, such as with the phone away, no plugin
 *   serving it, or a face built without the phone keys.
 */
int phone_store_battery(void);

/**
 * @brief Whether the phone said no plugin on it serves the battery.
 *
 * It holds from the phone's word until a level arrives or the phone drops. The phone sends it while
 * plugins are off in the Pebble app, while the Pebble app is from before plugins, or while it lists
 * no Phone plugin.
 *
 * @return True while the phone reports no plugin. False with a level, with no reading yet, with the
 *   phone away, or on a face built without the phone keys.
 */
bool phone_store_no_plugin(void);

/** @} */
