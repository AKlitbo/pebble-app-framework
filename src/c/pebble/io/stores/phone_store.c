/**
 * @file phone_store.c
 * @brief The active phone store: holds the phone's battery level, owns the appmessage phone battery
 * channel, and asks the phone again at launch and whenever the link comes back.
 *
 * @ingroup lib_stores
 */
#include "io/stores/phone_store.h"

#include "io/appmessage/appmessage.h"
#include "io/appmessage/appmessage_features.h"
#include "io/stores/system_store.h"

// everything below is built only for a face with the phone battery keys. any other face gets the
// public calls as stubs, so its code runs nothing and its level reads as none
#if defined(APPMESSAGE_HAS_PHONE)

/**
 * @brief Delay before the first ask after launch, in ms.
 *
 * It fires from the event loop so appmessage is open by then, and lands after the weather, stock,
 * and calendar first fetches so it is not fighting them over the outbox at boot.
 */
#define PHONE_FIRST_ASK_MS 1200

static int s_battery = PHONE_NO_LEVEL; ///< The phone's level, or PHONE_NO_LEVEL for none
static void (*s_cb)(void);              ///< Called whenever the level changes, so the face can redraw
static AppTimer *s_ask_timer;           ///< The first ask or release after launch, while it waits

/**
 * @brief Keep a level and tell the face, unless it is the level already held.
 *
 * @param level The level from 0 to 100, or PHONE_NO_LEVEL.
 */
static void set_battery(int level)
{
    if (level == s_battery)
    {
        return;
    }

    s_battery = level;
    if (s_cb) s_cb();
}

/**
 * @brief Phone battery channel. The transport has already read the level off the wire.
 *
 * @param level The level from 0 to 100, or PHONE_NO_LEVEL.
 */
static void on_phone_battery(int level)
{
    set_battery(level);
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
    appmessage_release_phone();
}

/**
 * @brief The first ask after launch.
 *
 * @param data The timer context (unused).
 */
static void first_ask(void *data)
{
    s_ask_timer = NULL;
    appmessage_request_phone();
}

/**
 * @brief The phone link really dropped or came back. A drop clears the level, since the watch can no
 * longer know it, and a return asks for it again.
 */
static void on_link(void)
{
    if (system_store_bluetooth())
    {
        appmessage_request_phone();
    }
    else
    {
        set_battery(PHONE_NO_LEVEL);
    }
}

#endif

// --- public API ---

void phone_store_subscribe(void (*cb)(void))
{
#if defined(APPMESSAGE_HAS_PHONE)
    s_cb = cb;
#else
    (void)cb;
#endif
}

void phone_store_init(PhoneConfig cfg, const PhoneSeed *seed)
{
#if defined(APPMESSAGE_HAS_PHONE)
    s_battery = seed ? phone_level_read(seed->battery) : PHONE_NO_LEVEL;

    // only a live store takes its channel and the link, as stores.md and store_poll_start set out
    if (!cfg.live)
    {
        appmessage_on_phone_battery(NULL);
        system_store_remove_link_listener(on_link);
        // a first ask still waiting is called off, so the store never asks. it tells the phone the
        // face no longer shows this instead, once appmessage is open, since a phone that subscribed
        // for an earlier layout keeps the subscription across its restarts
        if (s_ask_timer)
        {
            app_timer_cancel(s_ask_timer);
        }
        s_ask_timer = app_timer_register(PHONE_FIRST_ASK_MS, first_release, NULL);
        return;
    }

    appmessage_on_phone_battery(on_phone_battery);
    system_store_add_link_listener(on_link);

    // a release still waiting from a not live start is replaced, so the phone hears the ask
    if (s_ask_timer)
    {
        app_timer_cancel(s_ask_timer);
    }
    s_ask_timer = app_timer_register(PHONE_FIRST_ASK_MS, first_ask, NULL);
#else
    (void)cfg;
    (void)seed;
#endif
}

int phone_store_battery(void)
{
#if defined(APPMESSAGE_HAS_PHONE)
    return s_battery;
#else
    return PHONE_NO_LEVEL;
#endif
}
