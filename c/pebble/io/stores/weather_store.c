/**
 * @file weather_store.c
 * @brief The active weather store: holds the readings, owns the appmessage weather channels,
 * and asks the phone for more whenever its turn on the face's cadence finds a poll due.
 *
 * @ingroup lib_stores
 */
#include "io/stores/weather_store.h"

#include <stdio.h>
#include <time.h>
#include <limits.h>

#include "io/appmessage/appmessage.h"
#include "io/stores/store_cadence.h"
#include "io/stores/store_persist.h"
#include "io/stores/store_poll.h"
#include "text/cstring_fit.h"

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
static struct
{
    uint8_t tag;          ///< STORE_TAG_WEATHER, so a restore can tell this blob from another shape
    int16_t temp;         ///< Current temperature in the user's unit (WEATHER_NO_TEMP when none)
    char   cond[32];      ///< Short word for the sky, such as "SUNNY"
    int    humidity;      ///< Percent humidity, -1 when none
    int    wind_kmh;      ///< Wind speed in km/h, -1 when none
    char   wind_dir[4];   ///< Wind direction like "NW"
    char   sunrise[8];    ///< Sunrise time like "06:30"
    char   sunset[8];     ///< Sunset time like "21:30"
    int    uv;            ///< UV index (-1 when none)
    int    temp_max;      ///< Today's high (WEATHER_NO_TEMP when none)
    int    temp_min;      ///< Today's low (WEATHER_NO_TEMP when none)
    int    precip_chance; ///< Percent chance of precip (-1 when none)
    int    feels_like;    ///< Apparent temperature (WEATHER_NO_TEMP when none)
    int    pressure;      ///< Surface pressure in hPa (-1 when none)
    int    dew_point;     ///< Dew point temperature (WEATHER_NO_TEMP when none)
    WeatherHourly hourly; ///< The hourly forecast strip (`count` 0 when none)
    WeatherDaily  daily;  ///< The 7-day forecast strip (`count` 0 when none)
    time_t last_sync;     ///< When the last reading landed, or 0 for never
} s_state;
_Static_assert(sizeof(s_state) <= PERSIST_DATA_MAX_LENGTH, "weather state must fit one persist key");

static void (*s_cb)(void);     ///< Called whenever a reading changes, so the face can redraw
static AppTimer *s_timer;      ///< The short boot re-ask only. The recurring poll rides the cadence
static int s_poll_min;         ///< Minutes between recurring polls. 0 or less means no recurring poll
static time_t s_next_poll;     ///< Wall-clock second the next recurring poll is due
static int s_boot_retries;     ///< Short cold-boot re-asks used so far, until the first reading lands
static bool s_live;            ///< True on a live face, so the cache is worth reading and writing and the cadence turn runs
static uint32_t s_persist_key; ///< The persist slot the face handed us for the saved reading
static bool s_dirty;           ///< A channel touched the state this inbox, so persist_flush writes it once

// --- state writers (internal: only the channel handlers + the seed touch these) ---

/**
 * @brief Clear the reading back to no-data for every field.
 */
static void reset_state(void)
{
    s_state.temp = WEATHER_NO_TEMP;
    s_state.cond[0] = '\0';
    s_state.humidity = -1;
    s_state.wind_kmh = -1;
    s_state.wind_dir[0] = '\0';
    s_state.sunrise[0] = '\0';
    s_state.sunset[0] = '\0';
    s_state.uv = -1;
    s_state.temp_max = WEATHER_NO_TEMP;
    s_state.temp_min = WEATHER_NO_TEMP;
    s_state.precip_chance = -1;
    s_state.feels_like = WEATHER_NO_TEMP;
    s_state.pressure = -1;
    s_state.dew_point = WEATHER_NO_TEMP;
    s_state.hourly.count = 0;
    s_state.daily.count = 0;
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
 * @brief The shared tail every channel handler runs after it writes.
 *
 * Stamps the sync time, flags the cache dirty, and repaints, which keeps the six handlers from
 * each spelling it out.
 */
static void mark_synced(void)
{
    s_state.last_sync = time(NULL);
    mark_dirty();
    if (s_cb) s_cb();
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
    if (!s_live)
    {
        s_dirty = false;
        return;
    }

    // hold the dirty flag when the write does not land so the next inbox tries again rather than
    // leaving the cache quietly stale
    s_dirty = !store_save(s_persist_key, &s_state, sizeof(s_state), STORE_TAG_WEATHER);
}

/**
 * @brief Save the current temperature and condition, and mark the reading synced.
 *
 * @param temp The temperature in the user's unit.
 * @param cond The condition token, or NULL for "--".
 */
static void set_current(int temp, const char *cond)
{
    s_state.temp = (int16_t)temp;
    cstring_fit(s_state.cond, cond ? cond : "--", sizeof(s_state.cond));
    mark_synced();
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
    cstring_fit(s_state.sunrise, seed->sunrise ? seed->sunrise : "", sizeof(s_state.sunrise));
    cstring_fit(s_state.sunset, seed->sunset ? seed->sunset : "", sizeof(s_state.sunset));
    s_state.uv = seed->uv;
    s_state.temp_max = seed->temp_max;
    s_state.temp_min = seed->temp_min;
    s_state.precip_chance = seed->precip_chance;
    s_state.feels_like = seed->feels_like;
    s_state.pressure = seed->pressure;
    s_state.dew_point = seed->dew_point;
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
 * @brief Current weather channel. A NULL condition means the fetch failed (network drop,
 * provider outage, no location) so we keep the last good reading rather than blanking. It
 * refreshes on the next poll that lands, and survives a relaunch via the cache.
 *
 * @param temp The temperature in the user's unit (ignored when cond is NULL).
 * @param cond The condition token, or NULL on failure.
 */
static void on_weather(int temp, const char *cond)
{
    if (!cond)
    {
        return;
    }
    set_current(temp, cond);
}

/**
 * @brief Extra weather channel (humidity / wind / sun). Absent values arrive as -1 / "".
 */
static void on_extra(int humidity, int wind_kmh, const char *dir, const char *sunrise, const char *sunset)
{
    s_state.humidity = humidity;
    s_state.wind_kmh = wind_kmh;
    cstring_fit(s_state.wind_dir, dir ? dir : "", sizeof(s_state.wind_dir));
    cstring_fit(s_state.sunrise, sunrise ? sunrise : "", sizeof(s_state.sunrise));
    cstring_fit(s_state.sunset, sunset ? sunset : "", sizeof(s_state.sunset));
    mark_synced();
}

/**
 * @brief Forecast channel (uv / hi-lo / precip). The transport hands absent fields as INT_MIN,
 * so map those back to the store's own no-data values (temps get their own sentinel).
 */
static void on_forecast(int uv, int temp_max, int temp_min, int precip_chance)
{
    s_state.uv = (uv == INT_MIN) ? -1 : uv;
    s_state.temp_max = (temp_max == INT_MIN) ? WEATHER_NO_TEMP : temp_max;
    s_state.temp_min = (temp_min == INT_MIN) ? WEATHER_NO_TEMP : temp_min;
    s_state.precip_chance = (precip_chance == INT_MIN) ? -1 : precip_chance;
    mark_synced();
}

/**
 * @brief Air channel (feels-like / pressure / dew point). Absent fields arrive as INT_MIN,
 * mapped back to the store's no-data values (temps get their own sentinel).
 */
static void on_air(int feels_like, int pressure, int dew_point)
{
    s_state.feels_like = (feels_like == INT_MIN) ? WEATHER_NO_TEMP : feels_like;
    s_state.pressure = (pressure == INT_MIN) ? -1 : pressure;
    s_state.dew_point = (dew_point == INT_MIN) ? WEATHER_NO_TEMP : dew_point;
    mark_synced();
}

/**
 * @brief Hourly forecast channel. Takes the strip the reader unpacked and puts it away.
 *
 * A message that does not read clean leaves the last good row where it is.
 */
static void on_forecast_hourly(const uint8_t *buf, uint16_t len)
{
    if (!weather_hourly_decode(buf, len, &s_state.hourly))
    {
        return;
    }

    mark_synced();
}

/**
 * @brief 7-day forecast channel. Takes the strip the reader unpacked and puts it away.
 *
 * A message that does not read clean leaves the last good row where it is.
 */
static void on_forecast_daily(const uint8_t *buf, uint16_t len)
{
    if (!weather_daily_decode(buf, len, &s_state.daily))
    {
        return;
    }

    mark_synced();
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
    s_timer = NULL;
    appmessage_request_weather();

    if (s_poll_min <= 0 || s_state.last_sync != 0 || s_boot_retries >= WEATHER_BOOT_RETRIES)
    {
        return;  // got a reading, or ran out of tries. the deadline has it from here
    }

    s_boot_retries++;
    s_timer = app_timer_register(WEATHER_BOOT_RETRY_MS, boot_fire, NULL);
}

/**
 * @brief Cancel the boot re-ask timer, if one is armed.
 */
static void stop_polling(void)
{
    if (s_timer)
    {
        app_timer_cancel(s_timer);
        s_timer = NULL;
    }
}

/**
 * @brief The store's turn on the face's cadence: poll when the deadline has come round.
 */
static void cadence_poll(void)
{
    if (!s_live)
    {
        return;
    }

    if (store_poll_due(s_poll_min, &s_next_poll, time(NULL)))
    {
        appmessage_request_weather();
    }
}

// --- public API ---

void weather_store_subscribe(void (*cb)(void))
{
    s_cb = cb;
}

void weather_store_init(WeatherConfig cfg, const WeatherSeed *seed)
{
    s_live = false; // only a live store goes live, see the guard below
    s_persist_key = cfg.persist_key;
    reset_state();
    s_poll_min = cfg.poll_min;
    s_next_poll = store_poll_next(s_poll_min > 0 ? s_poll_min : 1, time(NULL));
    // s_live is the gate the cadence turn reads, so registering here is harmless either way
    store_cadence_register(cadence_poll);

    if (cfg.live)
    {
        // the store owns every weather channel and claims them here, so a face that turns polling on
        // later through reconfigure still gets the reply to its poll. a face seeding fixtures passes
        // live = false and stays unsubscribed, so a real push cannot overwrite it
        appmessage_on_weather(on_weather);
        appmessage_on_weather_extra(on_extra);
        appmessage_on_weather_forecast(on_forecast);
        appmessage_on_weather_air(on_air);
        appmessage_on_weather_forecast_hourly(on_forecast_hourly);
        appmessage_on_weather_forecast_daily(on_forecast_daily);
        // one coalesced persist per inbox instead of one write per channel handler
        appmessage_on_inbox_complete(persist_flush);
    }

    s_boot_retries = 0;  // fresh cold-boot re-ask budget

    if (seed)
    {
        apply_seed(seed);  // s_cb is NULL until the face subscribes so no redraw yet
    }
    else if (cfg.live)
    {
        // restore the last good reading so a relaunch shows it right away. s_cb is still NULL
        // so no redraw fires here, but the first paint (window push) re-pulls every readout.
        // the 500ms first poll then refreshes it in the background
        if (store_restore(s_persist_key, &s_state, sizeof(s_state), STORE_TAG_WEATHER))
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
        }
    }

    if (cfg.live)
    {
        s_live = true;

        // one fetch shortly after launch so the face is not blank while the first deadline is
        // still coming. poll_min 0 disables polling, matching reconfigure
        stop_polling();
        if (s_poll_min > 0)
        {
            s_timer = app_timer_register(WEATHER_FIRST_POLL_MS, boot_fire, NULL);
        }
    }
}

void weather_store_reconfigure(WeatherConfig cfg)
{
    s_poll_min = cfg.poll_min;
    // s_live gates the cadence turn, so switching the store off here has to clear it
    s_live = cfg.live;

    // take the new interval from the next boundary on (no immediate fetch. a real interval change
    // is rare, and the reading in hand is still good)
    stop_polling();
    if (s_live && s_poll_min > 0)
    {
        s_next_poll = store_poll_next(s_poll_min, time(NULL));
    }
}

int         weather_store_temp(void)          { return s_state.temp; }
const char *weather_store_cond(void)          { return s_state.cond; }
int         weather_store_humidity(void)      { return s_state.humidity; }
int         weather_store_wind_kmh(void)      { return s_state.wind_kmh; }
const char *weather_store_wind_dir(void)      { return s_state.wind_dir; }
const char *weather_store_sunrise(void)       { return s_state.sunrise; }
const char *weather_store_sunset(void)        { return s_state.sunset; }
int         weather_store_uv(void)            { return s_state.uv; }
int         weather_store_temp_max(void)      { return s_state.temp_max; }
int         weather_store_temp_min(void)      { return s_state.temp_min; }
int         weather_store_precip_chance(void) { return s_state.precip_chance; }
int         weather_store_feels_like(void)    { return s_state.feels_like; }
int         weather_store_pressure(void)      { return s_state.pressure; }
int         weather_store_dew_point(void)     { return s_state.dew_point; }

const WeatherHourly *weather_store_forecast_hourly(void) { return &s_state.hourly; }
const WeatherDaily  *weather_store_forecast_daily(void)  { return &s_state.daily; }

int weather_store_age_s(void)
{
    return s_state.last_sync ? (int)(time(NULL) - s_state.last_sync) : -1;
}
