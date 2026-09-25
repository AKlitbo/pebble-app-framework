/**
 * @file weather_reading.h
 * @brief One weather message off the phone, and the reading it leaves behind.
 *
 * The phone sends weather as one message whose keys come in groups: the current temperature and
 * sky, the extras (humidity, wind, sun times), today's forecast, the air readings, and the two
 * packed strips. A face declares only the groups it shows, and the phone leaves out any value it
 * has none for. Everything that turns that message into the kept reading lives here, off the SDK,
 * so the rules for a group that arrives half filled can be tested on the host.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdbool.h>
#include <stdint.h>
#include <time.h>

#include "wire/weather_wire.h"

/**
 * @addtogroup lib_core
 * @{
 */

/// The current temperature and sky arrived
#define WEATHER_GROUP_CURRENT  (1u << 0)
/// At least one of the extras (humidity, wind, direction, sunrise, sunset) arrived
#define WEATHER_GROUP_EXTRA    (1u << 1)
/// At least one of today's forecast readings (UV, high, low, rain chance) arrived
#define WEATHER_GROUP_FORECAST (1u << 2)
/// At least one of the air readings (feels-like, pressure, dew point) arrived
#define WEATHER_GROUP_AIR      (1u << 3)

/**
 * @brief One weather message as the transport read it, before anything is kept.
 *
 * A group whose bit is clear left nothing in the message. Inside a group that did arrive, a number
 * the phone left out reads INT_MIN and a string reads NULL, which is the one way this message
 * marks a missing value. The strings and strips point into the message itself, so this only lives
 * as long as the inbox callback that built it.
 */
typedef struct
{
    uint8_t        groups;        ///< The WEATHER_GROUP_ bits for the groups that arrived
    bool           ok;            ///< The phone's fetch worked, so the current reading is real
    int            temp;          ///< The temperature in the user's unit
    const char    *cond;          ///< The sky word, such as "SUNNY"
    int            humidity;      ///< Percent humidity
    int            wind_kmh;      ///< Wind speed in km/h
    const char    *wind_dir;      ///< Wind direction, such as "NW"
    const char    *cond_label;    ///< The sky in words, such as "Partly Cloudy", or NULL for a face with no key for it
    int            sunrise;       ///< Sunrise as minutes past local midnight
    int            sunset;        ///< Sunset as minutes past local midnight
    int            uv;            ///< UV index
    int            temp_max;      ///< Today's high
    int            temp_min;      ///< Today's low
    int            precip_chance; ///< Percent chance of rain
    int            feels_like;    ///< How warm it feels
    int            pressure;      ///< Sea level pressure in hPa
    int            dew_point;     ///< Dew point temperature
    const uint8_t *hourly;        ///< The packed hourly strip, or NULL when none arrived
    uint16_t       hourly_len;    ///< Its length in bytes
    const uint8_t *daily;         ///< The packed daily strip, or NULL when none arrived
    uint16_t       daily_len;     ///< Its length in bytes
} WeatherMessage;

/**
 * @brief The weather a store keeps, laid out as the blob it saves to flash.
 *
 * The order and the types are the saved format, so a relaunch after an update reads what the last
 * version wrote. Changing either needs a new store tag.
 */
typedef struct
{
    uint8_t tag;          ///< The store's tag, so a restore can tell this blob from another shape
    int16_t temp;         ///< Current temperature in the user's unit (WEATHER_NO_TEMP when none)
    char   cond[32];      ///< Short word for the sky, such as "SUNNY"
    char   cond_label[20]; ///< The sky in words, such as "Partly Cloudy", empty when the phone sent none
    int    humidity;      ///< Percent humidity, -1 when none
    int    wind_kmh;      ///< Wind speed in km/h, -1 when none
    char   wind_dir[4];   ///< Wind direction like "NW"
    int16_t sunrise;      ///< Sunrise as minutes past local midnight, -1 when none
    int16_t sunset;       ///< Sunset as minutes past local midnight, -1 when none
    int    uv;            ///< UV index (-1 when none)
    int    temp_max;      ///< Today's high (WEATHER_NO_TEMP when none)
    int    temp_min;      ///< Today's low (WEATHER_NO_TEMP when none)
    int    precip_chance; ///< Percent chance of precip (-1 when none)
    int    feels_like;    ///< Apparent temperature (WEATHER_NO_TEMP when none)
    int    pressure;      ///< Sea level pressure in hPa (-1 when none)
    int    dew_point;     ///< Dew point temperature (WEATHER_NO_TEMP when none)
    time_t forecast_day;  ///< Local midnight of the day the high, low, UV, and rain chance came, or 0
    WeatherHourly hourly; ///< The hourly forecast strip (`count` 0 when none)
    time_t hourly_first;  ///< When the hourly strip's first column starts, or 0 when none came
    time_t daily_first;   ///< Local midnight of the daily strip's first day, or 0 when none came
    WeatherDaily  daily;  ///< The 7-day forecast strip (`count` 0 when none)
    time_t last_sync;     ///< When the last reading landed, or 0 for never
} WeatherState;

/**
 * @brief The watch's clock at the moment a message lands, broken apart.
 *
 * Taken apart by the store, since breaking a time_t apart means localtime and the SDK owns that.
 * The midnight has to be the SDK's own, from time_start_of_today, because working it back from the
 * hour and minute is an hour out on a day the clocks change.
 */
typedef struct
{
    time_t  now;       ///< The time the message landed
    time_t  day_start; ///< Local midnight of today
    uint8_t hour;      ///< The local hour, 0 to 23
    uint8_t minute;    ///< The local minute, 0 to 59
    uint8_t second;    ///< The local second, 0 to 59
    uint8_t wday;      ///< The local weekday, 0 for Sunday
} WeatherClock;

/**
 * @brief Put a message's readings into the kept weather.
 *
 * A group that did not arrive leaves its readings alone. One that did replaces all of them, and a
 * reading it left out becomes that reading's no-data value, -1 or WEATHER_NO_TEMP for the
 * temperatures. A failed fetch keeps the last good temperature and sky. A strip that does not
 * read clean keeps the last good row.
 *
 * Each strip that reads clean records where its first column starts, and the high, low, UV, and
 * rain chance record the day they came, so the store can tell later what has gone by.
 *
 * @param state The kept weather, updated in place.
 * @param msg The message.
 * @param clock The watch's clock as the message landed. Its time is stamped as the last sync when
 *   anything was kept.
 * @return Whether anything was kept, which is when the face needs a redraw and a save.
 */
bool weather_reading_apply(WeatherState *state, const WeatherMessage *msg, const WeatherClock *clock);

/**
 * @brief Convert every temperature in the kept weather to the other unit.
 *
 * Runs when the wearer switches units, so the reading in hand matches the new letter until the
 * phone's fetch in the new unit lands. Each value rounds to the nearest degree, and a reading with
 * no data stays that way.
 *
 * @param state The kept weather, converted in place.
 * @param to_fahrenheit True to go from Celsius to Fahrenheit, false for the other way.
 */
void weather_reading_convert(WeatherState *state, bool to_fahrenheit);

/** @} */
