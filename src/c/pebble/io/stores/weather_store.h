/**
 * @file weather_store.h
 * @brief Active weather store. It owns the appmessage weather channels and its place on the
 * shared cadence, so a face just hands it the rules (live / poll interval), optionally
 * seeds it, then reads the values and subscribes for repaints. The phone data flows straight
 * in and nobody wires it.
 *
 * @ingroup lib_stores
 */
#pragma once
#include <pebble.h>

#include "wire/weather_wire.h"

/**
 * @addtogroup lib_stores
 * @{
 */

/**
 * @brief The rules a face hands the store, built from its own settings so the store names no
 * SETTING_*.
 */
typedef struct
{
    bool     live;        ///< True subscribes the channels and polls. False just keeps the fake data for screenshots
    int      poll_min;    ///< Minutes between weather requests (e.g. 10, 20, 30)
    uint32_t persist_key; ///< Slot for the last good reading so the face owns the key instead of the store
} WeatherConfig;

/**
 * @brief Optional prefill: shown until the first real reading lands, or pinned when
 * live = false.
 */
typedef struct
{
    int16_t     temp;      ///< Reading in the user's unit, WEATHER_NO_TEMP for none
    const char *cond;      ///< Short word for the sky like "SUNNY"
    int         humidity;  ///< Percent, -1 for none
    int         wind_kmh;  ///< Wind in km/h, -1 for none
    const char *wind_dir;  ///< Wind direction like "NW", empty for none
    const char *cond_label; ///< The sky in words like "Partly Cloudy", NULL or empty for none
    int16_t     sunrise;   ///< Sunrise as minutes past midnight, -1 for none
    int16_t     sunset;    ///< Sunset as minutes past midnight, -1 for none
    int         uv;        ///< UV index, -1 for none
    int         temp_max;  ///< Today's high, WEATHER_NO_TEMP for none
    int         temp_min;  ///< Today's low, WEATHER_NO_TEMP for none
    int         precip_chance; ///< Chance of rain in percent, -1 for none
    int         feels_like;    ///< How warm it feels, WEATHER_NO_TEMP for none
    int         pressure;      ///< Sea level pressure in hPa, -1 for none
    int         dew_point;     ///< Dew point temperature, WEATHER_NO_TEMP for none
    const WeatherHourly *forecast_hourly; ///< Optional hourly strip, NULL for none
    const WeatherDaily  *forecast_daily;  ///< Optional 7 day strip, NULL for none
} WeatherSeed;

/// A WeatherSeed with every optional reading already set to its no-data value. Spread it and
/// override only what you have, so a partial seed still reads as "--" instead of a bogus 0.
/// @code
/// WeatherSeed seed = WEATHER_SEED_EMPTY;
/// seed.temp = 23;
/// seed.cond = "SUNNY";
/// @endcode
#define WEATHER_SEED_EMPTY ((WeatherSeed){                       \
    .temp = WEATHER_NO_TEMP, .cond = "",                         \
    .humidity = -1, .wind_kmh = -1, .wind_dir = "",             \
    .cond_label = NULL, .sunrise = -1, .sunset = -1, .uv = -1,   \
    .temp_max = WEATHER_NO_TEMP, .temp_min = WEATHER_NO_TEMP,   \
    .precip_chance = -1,                                         \
    .feels_like = WEATHER_NO_TEMP, .pressure = -1,               \
    .dew_point = WEATHER_NO_TEMP,                                \
    .forecast_hourly = NULL, .forecast_daily = NULL })

/**
 * @brief Start the store with its rules. Pass seed = NULL for normal use.
 *
 * @param cfg The rules (live / poll interval).
 * @param seed Optional prefill, or NULL.
 */
void weather_store_init(WeatherConfig cfg, const WeatherSeed *seed);

/**
 * @brief Re-apply the rules (e.g. the poll interval changed). Moves the next poll to the new
 * interval, and switching the store off here stops it asking the phone.
 *
 * @param cfg The new rules.
 */
void weather_store_reconfigure(WeatherConfig cfg);

/** @brief Hand it the function to call when the weather changes (the screen redraw). */
void weather_store_subscribe(void (*cb)(void));

/** @brief The temperature reading in the user's unit, or WEATHER_NO_TEMP if we have not got one yet. */
int         weather_store_temp(void);

/** @brief The short word for the sky, or empty if we have not got one yet. */
const char *weather_store_cond(void);

/**
 * @brief The sky in words, such as "Partly Cloudy", for a face that declares WEATHER_CONDITION_LABEL.
 *
 * @return The label, or empty when the phone sent none.
 */
const char *weather_store_cond_label(void);

/** @brief The humidity in percent, or -1 if we have not got one yet. */
int         weather_store_humidity(void);

/** @brief The wind speed in km/h, or -1 if we have not got one yet. */
int         weather_store_wind_kmh(void);

/** @brief The wind direction like "NW", or empty if we have not got one yet. */
const char *weather_store_wind_dir(void);

/** @brief Sunrise as minutes past midnight, or -1 if we have not got one yet. */
int weather_store_sunrise(void);

/** @brief Sunset as minutes past midnight, or -1 if we have not got one yet. */
int weather_store_sunset(void);

/** @brief How warm it feels, or WEATHER_NO_TEMP if we have not got one yet. */
int         weather_store_feels_like(void);

/** @brief The sea level pressure in hPa, or -1 if we have not got one yet. */
int         weather_store_pressure(void);

/** @brief The dew point temperature, or WEATHER_NO_TEMP if we have not got one yet. */
int         weather_store_dew_point(void);

/** @brief Today's UV index, or -1 if we have not got one yet or the day it came is over. */
int         weather_store_uv(void);

/** @brief Today's high, or WEATHER_NO_TEMP if we have not got one yet or the day it came is over. */
int         weather_store_temp_max(void);

/** @brief Today's low, or WEATHER_NO_TEMP if we have not got one yet or the day it came is over. */
int         weather_store_temp_min(void);

/** @brief Today's chance of rain in percent, or -1 if we have not got one yet or the day it came is over. */
int         weather_store_precip_chance(void);

/**
 * @brief The hourly forecast strip, starting at the hour now.
 *
 * A strip can outlive the fetch that brought it, when only the forecast half of a later fetch
 * fails. Columns whose hour is over come off the front as it is read, and `base_hour` moves with
 * them, so a column is never labelled with an hour already gone.
 *
 * @return The strip. `count` is 0 until a reading lands, or once every column is over.
 */
const WeatherHourly *weather_store_forecast_hourly(void);

/**
 * @brief The daily forecast strip, starting today.
 *
 * Days before today come off the front as it is read, and `base_weekday` moves with them.
 *
 * @return The strip. `count` is 0 until a reading lands, or once every day is over.
 */
const WeatherDaily *weather_store_forecast_daily(void);

/** @brief How many seconds since the last reading turned up, or -1 if we have none. */
int weather_store_age_s(void);

/** @} */
