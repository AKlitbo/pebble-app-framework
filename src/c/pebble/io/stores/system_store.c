/**
 * @file system_store.c
 * @brief The active system store: holds the battery + bluetooth state and subscribes to the
 * battery and connection services itself. The alarm is read through on demand.
 *
 * @ingroup lib_stores
 */
#include "io/stores/system_store.h"

/**
 * @var s_state
 * @brief The battery and bluetooth readings the store holds.
 */
static struct
{
    int  battery_level;       ///< Battery charge, in percent
    bool charging;            ///< Whether the watch is charging
    bool bluetooth_connected; ///< Whether the phone is connected
} s_state;

static bool s_bt_initialized;     ///< The first bluetooth reading only seeds. Later changes can buzz
static bool s_live;               ///< False pins the seeded values so screenshots stay put
static time_t s_seed_alarm;       ///< The pinned alarm used while not live
static void (*s_cb)(void);        ///< Called whenever a reading changes, so the face can redraw
static BtVibePolicy s_vibe;       ///< What to buzz when the phone connects or drops
static void (*s_reconnect)(void); ///< Fired on a real change from disconnected to connected

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
    // the new state goes in first, so a reconnect handler that reads the store sees it connected
    bool was_connected = s_state.bluetooth_connected;
    s_state.bluetooth_connected = connected;

    // hand a real transition to the face's policy. the first reading only seeds the state
    if (s_bt_initialized && was_connected != connected && s_vibe)
    {
        s_vibe(connected);
    }

    // the phone app just came back. let the face catch up its phone-backed readouts now instead
    // of waiting out each store's poll. the first reading only seeds, so this skips at launch
    if (s_bt_initialized && !was_connected && connected && s_reconnect)
    {
        s_reconnect();
    }

    s_bt_initialized = true;
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

void system_store_init(SystemConfig cfg, const SystemSeed *seed)
{
    s_state.battery_level = 0;
    s_state.charging = false;
    s_state.bluetooth_connected = false;
    s_bt_initialized = false;
    s_vibe = cfg.vibe;
    s_live = cfg.live;
    s_seed_alarm = 0;

    if (seed)
    {
        // write straight to state so a pinned bluetooth value never trips the vibe guard
        s_state.battery_level = seed->battery;
        s_state.charging = seed->charging;
        s_state.bluetooth_connected = seed->bluetooth;
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
bool system_store_bluetooth(void) { return s_state.bluetooth_connected; }

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
