/**
 * @file system_store.c
 * @brief The active system store: holds the battery + bluetooth state and subscribes to the
 * battery and connection services itself. The alarm is read through on demand.
 *
 * @ingroup lib_stores
 */
#include "io/stores/system_store.h"

#include "io/link_change.h"
#if defined(SYSTEM_STORE_LINK_LISTENERS)
#include "io/callback_list.h"
#endif

/**
 * @var s_state
 * @brief The battery and bluetooth readings the store holds.
 */
static struct
{
    int  battery_level;       ///< Battery charge, in percent
    bool charging;            ///< Whether the watch is charging
    LinkState link;           ///< The phone link as last read. The first reading only seeds. Later changes can buzz
} s_state;

static bool s_live;               ///< False pins the seeded values so screenshots stay put
static time_t s_seed_alarm;       ///< The pinned alarm used while not live
static void (*s_cb)(void);        ///< Called whenever a reading changes, so the face can redraw
static BtVibePolicy s_vibe;       ///< What to buzz when the phone connects or drops
static void (*s_reconnect)(void); ///< Fired on a real change from disconnected to connected

#if defined(SYSTEM_STORE_LINK_LISTENERS)
/// Room for the stores that listen for the link, phone battery and now playing
#define LINK_LISTENERS_MAX 2

static CallbackListFn s_link_listener_entries[LINK_LISTENERS_MAX]; ///< The stores listening for the link, in the order they were added
static CallbackList s_link_listeners = {s_link_listener_entries, LINK_LISTENERS_MAX, 0}; ///< The list over that storage
#endif

/**
 * @brief Save the battery reading and notify.
 *
 * @param level Battery level from 0 to 100.
 * @param charging True when plugged in.
 */
static void set_battery(int level, bool charging)
{
    s_state.battery_level = level;
    s_state.charging = charging;
    if (s_cb) s_cb();
}

/**
 * @brief Save the bluetooth state, buzzing the face's policy on a real transition, and notify.
 *
 * @param connected True when the phone link is up.
 */
static void set_bluetooth(bool connected)
{
    // the new state goes in first, so a reconnect handler that reads the store sees it connected.
    // the first reading only seeds it
    LinkChange change = link_change_read(&s_state.link, connected);

    // hand a real transition to the face's policy
    if (change != LINK_SAME && s_vibe)
    {
        s_vibe(connected);
    }

    // the phone app just came back. let the face catch up its phone-backed readouts now instead
    // of waiting out each store's poll
    if (change == LINK_RECONNECTED && s_reconnect)
    {
        s_reconnect();
    }

#if defined(SYSTEM_STORE_LINK_LISTENERS)
    // the stores that only hold what the phone just said clear on a drop and ask again on a return
    if (change != LINK_SAME)
    {
        callback_list_fire(&s_link_listeners);
    }
#endif

    if (s_cb) s_cb();
}

// --- service handlers ---

/**
 * @brief Battery service handler: unpack the reading and save it.
 *
 * @param state The battery reading the service handed over.
 */
static void on_battery(BatteryChargeState state)
{
    set_battery(state.charge_percent, state.is_charging);
}

/**
 * @brief Connection service handler: save the phone link state.
 *
 * @param connected True when the phone link just came up.
 */
static void on_connection(bool connected)
{
    set_bluetooth(connected);
}

// --- public API ---

void system_store_subscribe(void (*cb)(void))
{
    s_cb = cb;
}

void system_store_on_reconnect(void (*cb)(void))
{
    s_reconnect = cb;
}

#if defined(SYSTEM_STORE_LINK_LISTENERS)
void system_store_add_link_listener(void (*listener)(void))
{
    // a full list means a store never hears the link change, so say so
    if (!callback_list_add(&s_link_listeners, listener))
    {
        APP_LOG(APP_LOG_LEVEL_ERROR, "link listener list full, dropping a listener");
    }
}
#endif

void system_store_init(SystemConfig cfg, const SystemSeed *seed)
{
    s_state.battery_level = 0;
    s_state.charging = false;
    s_state.link = (LinkState){0};
    s_vibe = cfg.vibe;
    s_live = cfg.live;
    s_seed_alarm = 0;

    if (seed)
    {
        // write straight to state so a pinned bluetooth value never trips the vibe guard
        s_state.battery_level = seed->battery;
        s_state.charging = seed->charging;
        s_state.link.connected = seed->bluetooth;
        s_seed_alarm = seed->next_alarm;
    }

    if (cfg.live)
    {
        // both services fire their current reading via the peeks below so the store holds
        // real state immediately. the first bluetooth reading is swallowed so no startup buzz
        battery_state_service_subscribe(on_battery);
        on_battery(battery_state_service_peek());

        connection_service_subscribe((ConnectionHandlers){
            .pebble_app_connection_handler = on_connection,
        });
        on_connection(connection_service_peek_pebble_app_connection());
    }
}

void system_store_deinit(void)
{
    battery_state_service_unsubscribe();
    connection_service_unsubscribe();
}

int  system_store_battery(void)   { return s_state.battery_level; }
bool system_store_charging(void)  { return s_state.charging; }
bool system_store_bluetooth(void) { return s_state.link.connected; }

bool system_store_next_alarm(time_t *out)
{
    *out = 0;

    if (!s_live)
    {
        *out = s_seed_alarm;
        return s_seed_alarm != 0;
    }

    // a platform without the alarm service defines this away to 0, which never touches out and
    // so leaves the reading at no alarm
    return alarm_service_peek_next(out);
}
