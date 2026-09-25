/**
 * @file weather_store.c
 * @brief The active weather store: holds the readings, owns the appmessage weather channels,
 * and asks the phone for more whenever its turn on the face's cadence finds a poll due.
 *
 * @ingroup lib_stores
 */
#include "io/stores/weather_store.h"

#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include <limits.h>

#include "io/appmessage/appmessage.h"
#include "io/stores/store_cadence.h"
#include "io/stores/store_persist.h"
#include "io/stores/store_fetch.h"
#include "text/cstring_fit.h"
#include "weather/forecast_age.h"
#include "weather/weather_reading.h"

/**
 * @brief Delay before the first fetch after launch, in ms.
 *
 * It fires from the event loop so appmessage is open by then. The recurring poll then runs at the
 * configured interval.
 */
#define WEATHER_FIRST_POLL_MS 500

/**
 * @name Cold boot re-asks
 *
 * The phone JS can take several seconds to come up on a cold launch, so a first request that lands
 * before it is ready would leave the face blank until the next full poll (30 min). Until the first
 * reading arrives the store keeps asking on this short cadence, for a bounded number of tries, then
 * settles.
 * @{
 */
#define WEATHER_BOOT_RETRY_MS 3000 ///< Gap between the short re-asks, in ms
#define WEATHER_BOOT_RETRIES 8     ///< How many short re-asks a cold launch gets before settling
/** @} */

/**
 * @var s_state
 * @brief Every reading the store holds, laid out as the blob that gets persisted.
 */
static WeatherState s_state;
// the blob's size and where it ends are its saved format, so a relaunch after an update reads
// what the last version wrote. on the watch that is 204 bytes with the sync time last. a change
// that keeps the size still needs a new STORE_TAG_WEATHER, or an old blob reads as the new one
_Static_assert(sizeof(WeatherState) == 204, "weather state must keep its saved layout");
_Static_assert(offsetof(WeatherState, last_sync) == 200, "weather state must keep its saved layout");
_Static_assert(sizeof(s_state) <= PERSIST_DATA_MAX_LENGTH, "weather state must fit one persist key");

static void (*s_cb)(void);     ///< Called whenever a reading changes, so the face can redraw
static int s_boot_retries;     ///< Short cold-boot re-asks used so far, until the first reading lands

static StoreFetch s_fetch;   ///< The interval, the boot re-ask timer, and when the next poll is due. Live gates the cache too
static uint32_t s_persist_key; ///< The persist slot the face handed us for the saved reading
static bool s_dirty;           ///< A channel touched the state this inbox, so persist_flush writes it once
static bool s_changed;         ///< A channel touched the state this inbox, so the face repaints once at the end
static bool s_heard;           ///< The phone answered a weather request this launch, a failed fetch included
static uint32_t s_saved_sum;   ///< Sum of the reading last written, so a reply that changes nothing is not written again

// --- state writers (internal: only the channel handlers + the seed touch these) ---

/**
 * @brief Clear the reading back to no-data for every field.
 */
static void reset_state(void)
{
    s_state.temp = WEATHER_NO_TEMP;
    s_state.cond[0] = '\0';
    s_state.cond_label[0] = '\0';
    s_state.humidity = -1;
    s_state.wind_kmh = -1;
    s_state.wind_dir[0] = '\0';
    s_state.sunrise = -1;
    s_state.sunset = -1;
    s_state.uv = -1;
    s_state.temp_max = WEATHER_NO_TEMP;
    s_state.temp_min = WEATHER_NO_TEMP;
    s_state.precip_chance = -1;
    s_state.feels_like = WEATHER_NO_TEMP;
    s_state.pressure = -1;
    s_state.dew_point = WEATHER_NO_TEMP;
    s_state.forecast_day = 0;
    s_state.hourly.count = 0;
    s_state.hourly_first = 0;
    s_state.daily.count = 0;
    s_state.daily_first = 0;
    s_state.last_sync = 0;
}

/**
 * @brief Mark the reading as needing a save.
 *
 * A combined weather push fires several channel handlers in one inbox, so rather than each
 * writing the whole struct to flash, each just flags it dirty and `persist_flush` does one
 * write when the inbox is fully dispatched, which is one write per poll instead of one per
 * channel.
 */
static void mark_dirty(void)
{
    s_dirty = true;
}

/**
 * @brief The coalesced write, run once per inbox via the transport's inbox-complete hook.
 *
 * Only a live face writes, and this never runs from `reset_state`, so a failed fetch can't
 * stomp the last good reading.
 */
static void persist_flush(void)
{
    if (!s_dirty)
    {
        return;
    }
    if (!s_fetch.poll.live)
    {
        s_dirty = false;
        return;
    }

    // hold the dirty flag when the write does not land so the next inbox tries again rather than
    // leaving the cache quietly stale
    s_dirty = !store_save_changed(s_persist_key, &s_state, sizeof(s_state),
                                  STORE_READING_SIZE(s_state, last_sync), STORE_TAG_WEATHER, &s_saved_sum);
}

/**
 * @brief Runs once a whole inbound message is handled: one repaint for everything it brought,
 * then the save.
 *
 * The phone sends every weather channel in one message, and each one repainting on its own reran
 * every weather panel up to six times. A face working something out from several readings at
 * once, such as a layout that follows the sunset, also saw the new temperature beside the old sun
 * times until the next channel landed.
 */
static void inbox_done(void)
{
    if (s_changed)
    {
        s_changed = false;
        if (s_cb) s_cb();
    }

    persist_flush();
}

/**
 * @brief Prefill the whole store from a seed, for dev builds and screenshots.
 *
 * Copies the extra readings too, so a seeded face shows full weather rather than just the
 * temperature and condition. `s_cb` is still NULL at the point init calls this, so no redraw
 * fires here.
 *
 * @param seed The prefill to apply.
 */
static void apply_seed(const WeatherSeed *seed)
{
    s_state.temp = seed->temp;
    cstring_fit(s_state.cond, seed->cond ? seed->cond : "--", sizeof(s_state.cond));
    s_state.humidity = seed->humidity;
    s_state.wind_kmh = seed->wind_kmh;
    cstring_fit(s_state.wind_dir, seed->wind_dir ? seed->wind_dir : "", sizeof(s_state.wind_dir));
    cstring_fit(s_state.cond_label, seed->cond_label ? seed->cond_label : "", sizeof(s_state.cond_label));
    s_state.sunrise = seed->sunrise;
    s_state.sunset = seed->sunset;
    s_state.uv = seed->uv;
    s_state.temp_max = seed->temp_max;
    s_state.temp_min = seed->temp_min;
    s_state.precip_chance = seed->precip_chance;
    s_state.feels_like = seed->feels_like;
    s_state.pressure = seed->pressure;
    s_state.dew_point = seed->dew_point;

    // today's, or a screenshot would show dashes for the high, low, UV, and rain chance
    s_state.forecast_day = time_start_of_today();
    if (seed->forecast_hourly)
    {
        s_state.hourly = *seed->forecast_hourly;
    }
    if (seed->forecast_daily)
    {
        s_state.daily = *seed->forecast_daily;
    }
    s_state.last_sync = time(NULL);
    if (s_cb) s_cb();
}

// --- appmessage channel handlers (the store owns its own wiring) ---

/**
 * @brief The weather channel. The message holds every group the phone sent, and
 * weather_reading_apply keeps what it can. A failed fetch keeps the last good reading rather than
 * blanking, and it refreshes on the next poll that lands.
 *
 * @param msg The message, read straight off the inbox.
 */
static void on_weather(const WeatherMessage *msg)
{
    // any answer ends the launch re-asks, a failed fetch included. asking again every few seconds
    // would only start the same failing round on the phone
    if (msg->groups & WEATHER_GROUP_CURRENT)
    {
        s_heard = true;
    }

    // the clock broken apart here, since the reading's own code cannot call localtime. the midnight
    // is the SDK's, which the day checks below compare against. it is worked out first and the
    // broken-apart clock is copied, since the midnight lookup can reuse localtime's buffer
    time_t now = time(NULL);
    time_t day_start = time_start_of_today();
    struct tm at = *localtime(&now);
    WeatherClock clock = {
        .now = now, .day_start = day_start,
        .hour = (uint8_t)at.tm_hour, .minute = (uint8_t)at.tm_min, .second = (uint8_t)at.tm_sec,
        .wday = (uint8_t)at.tm_wday,
    };

    if (weather_reading_apply(&s_state, msg, &clock))
    {
        mark_dirty();
        s_changed = true;
    }
}

/**
 * @brief The wearer switched the temperature unit. The reading in hand converts to it so the face
 * never shows a Celsius number with an F beside it while the new fetch is on its way.
 *
 * @param fahrenheit True when the new unit is Fahrenheit.
 */
static void on_unit_changed(bool fahrenheit)
{
    weather_reading_convert(&s_state, fahrenheit);
    mark_dirty();
    s_changed = true;
}

// --- polling ---

/**
 * @brief The short boot re-ask, and only that.
 *
 * A cold launch can send its first request before the phone JS is up, and the reconnect refresh
 * only fires on a real disconnect to connect transition rather than on the initial connect, so
 * without this the face would sit blank until the next deadline came round. It re-asks on a short
 * cadence for a bounded number of tries, then stops and leaves the recurring poll to the cadence.
 *
 * @param data The timer context (unused).
 */
static void boot_fire(void *data)
{
    s_fetch.timer = NULL;

    // the phone already answered, so a request now would only start another round on it. checked
    // before sending, since a reply can land between two re-asks
    if (s_heard)
    {
        return;
    }
    appmessage_request_weather();

    // a restored reading, or out of tries, so the deadline takes over. a first ask lost before the
    // phone JS was up needs no retry here, since the phone fetches weather itself once it starts
    if (s_fetch.poll.poll_min <= 0 || s_state.last_sync != 0 || s_boot_retries >= WEATHER_BOOT_RETRIES)
    {
        return;
    }

    s_boot_retries++;
    s_fetch.timer = app_timer_register(WEATHER_BOOT_RETRY_MS, boot_fire, NULL);
}

/**
 * @brief The store's turn on the face's cadence: poll when the deadline has come round.
 */
static void cadence_poll(void)
{
    store_fetch_turn(&s_fetch, time(NULL));
}

// --- public API ---

void weather_store_subscribe(void (*cb)(void))
{
    s_cb = cb;
}

void weather_store_init(WeatherConfig cfg, const WeatherSeed *seed)
{
    s_fetch.poll.live = false; // only a live store goes live, see store_poll_set below
    s_fetch.request = appmessage_request_weather;
    s_fetch.first_ms = WEATHER_FIRST_POLL_MS;
    s_persist_key = cfg.persist_key;
    reset_state();
    // the live flag is the gate the cadence turn reads, so registering here is harmless either way
    store_cadence_register(cadence_poll);

    if (cfg.live)
    {
        // the store owns every weather channel and claims them here, so a face that turns polling on
        // later through reconfigure still gets the reply to its poll. a face seeding fixtures passes
        // live = false and stays unsubscribed, so a real push cannot overwrite it
        appmessage_on_weather(on_weather);
        appmessage_on_unit_changed(on_unit_changed);
        // one repaint and one save per inbox rather than one per channel handler
        appmessage_add_inbox_complete(inbox_done);
    }

    s_boot_retries = 0;  // fresh cold-boot re-ask budget
    s_heard = false;
    s_changed = false;

    if (seed)
    {
        apply_seed(seed);  // s_cb is NULL until the face subscribes so no redraw yet
    }
    else if (cfg.live)
    {
        // restore the last good reading so a relaunch shows it right away. s_cb is still NULL
        // so no redraw fires here, but the first paint (window push) re-pulls every readout.
        // the 500ms first poll then refreshes it in the background
        if (store_restore_reading(s_persist_key, &s_state, sizeof(s_state), STORE_READING_SIZE(s_state, last_sync),
                                  STORE_TAG_WEATHER, &s_saved_sum))
        {
            // the counts come back off flash and index the draw loops, so pin them to what the
            // arrays actually hold before anything reads them
            if (s_state.hourly.count > WEATHER_FORECAST_COLS)
            {
                s_state.hourly.count = 0;
            }
            if (s_state.daily.count > WEATHER_FORECAST_COLS)
            {
                s_state.daily.count = 0;
            }

            // the strings come back off flash too, so each gets an end of its own before it is printed
            s_state.cond[sizeof(s_state.cond) - 1] = '\0';
            s_state.cond_label[sizeof(s_state.cond_label) - 1] = '\0';
            s_state.wind_dir[sizeof(s_state.wind_dir) - 1] = '\0';
        }
    }

    // one fetch shortly after launch so the face is not blank while the first deadline is still
    // coming, re-asked on a short cadence until the phone answers. poll_min 0 disables polling,
    // matching reconfigure. this is store_fetch_start written out, since the first timer runs the
    // boot re-asks rather than a plain fetch, and a callback slot in StoreFetch for it would cost
    // bytes on every store
    bool polling = store_poll_set(&s_fetch.poll, cfg.poll_min, cfg.live, time(NULL));
    store_fetch_stop(&s_fetch);
    if (polling)
    {
        s_fetch.timer = app_timer_register(WEATHER_FIRST_POLL_MS, boot_fire, NULL);
    }
}

void weather_store_reconfigure(WeatherConfig cfg)
{
    // a store with no reading catches up right away, and one holding a reading waits for its
    // deadline. the catch-up is a single ask rather than the boot re-asks, since those stop once
    // the phone has answered at all, a failed answer included
    store_fetch_reconfigure(&s_fetch, cfg.poll_min, cfg.live, time(NULL), s_state.last_sync == 0);
}

int         weather_store_temp(void)          { return s_state.temp; }
/**
 * @brief Whether the high, low, UV, and rain chance are today's.
 *
 * They are only good for the day they came. For some providers they ride on a second request, and
 * when only that one fails the rest of the reading keeps landing, so without this yesterday's high
 * and low would show as today's.
 */
static bool forecast_today(void)
{
    return s_state.forecast_day != 0 && s_state.forecast_day == time_start_of_today();
}

const char *weather_store_cond(void)          { return s_state.cond; }
const char *weather_store_cond_label(void)    { return s_state.cond_label; }
int         weather_store_humidity(void)      { return s_state.humidity; }
int         weather_store_wind_kmh(void)      { return s_state.wind_kmh; }
const char *weather_store_wind_dir(void)      { return s_state.wind_dir; }
int         weather_store_sunrise(void)       { return s_state.sunrise; }
int         weather_store_sunset(void)        { return s_state.sunset; }
int         weather_store_uv(void)            { return forecast_today() ? s_state.uv : -1; }
int         weather_store_temp_max(void)      { return forecast_today() ? s_state.temp_max : WEATHER_NO_TEMP; }
int         weather_store_temp_min(void)      { return forecast_today() ? s_state.temp_min : WEATHER_NO_TEMP; }
int         weather_store_precip_chance(void) { return forecast_today() ? s_state.precip_chance : -1; }
int         weather_store_feels_like(void)    { return s_state.feels_like; }
int         weather_store_pressure(void)      { return s_state.pressure; }
int         weather_store_dew_point(void)     { return s_state.dew_point; }

const WeatherHourly *weather_store_forecast_hourly(void)
{
    // the hours already over come off the strip itself, since nothing reads them again. a seeded
    // store holds fixtures for a pinned clock, so only a live one ages its strip
    WeatherHourly *strip = &s_state.hourly;
    if (s_fetch.poll.live && s_state.hourly_first != 0)
    {
        uint8_t over = forecast_hours_past((int32_t)(time(NULL) - s_state.hourly_first), strip->step_hours,
                                           strip->count);
        if (over != 0)
        {
            strip->count -= over;
            strip->base_hour = (uint8_t)((strip->base_hour + over * strip->step_hours) % 24);
            memmove(strip->col, strip->col + over, sizeof(strip->col[0]) * strip->count);
            s_state.hourly_first += (time_t)over * strip->step_hours * SECONDS_PER_HOUR;
        }
    }
    return strip;
}

const WeatherDaily *weather_store_forecast_daily(void)
{
    WeatherDaily *strip = &s_state.daily;
    if (s_fetch.poll.live && s_state.daily_first != 0)
    {
        // whole days from the first column to today, rounded so a day the clocks change still counts as one
        time_t today = time_start_of_today();
        int days = (int)((today - s_state.daily_first + SECONDS_PER_DAY / 2) / SECONDS_PER_DAY);
        uint8_t over = forecast_days_past(days, strip->count);
        if (over != 0)
        {
            strip->count -= over;
            strip->base_weekday = (uint8_t)((strip->base_weekday + over) % 7);
            memmove(strip->col, strip->col + over, sizeof(strip->col[0]) * strip->count);
            s_state.daily_first = today;
        }
    }
    return strip;
}

int weather_store_age_s(void)
{
    return s_state.last_sync ? (int)(time(NULL) - s_state.last_sync) : -1;
}
