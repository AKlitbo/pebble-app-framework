/**
 * @file weather_wire.h
 * @brief The forecast strips as the phone packs them, and the readers that unpack them.
 *
 * Both strips are a short header then a run of fixed-width columns, so unlike the agenda and the
 * watchlist the whole length is known before any of it is read. That makes one check up front
 * enough, where those two have to check at every step, and it is why these two fill the caller's
 * strip as they go rather than handing over a finished copy.
 *
 * The packer on the other side is lib/ts/pkjs/wire.ts, and the two have to agree exactly.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdbool.h>
#include <stdint.h>

/**
 * @addtogroup lib_core
 * @{
 */

// WEATHER_NO_TEMP and WEATHER_FORECAST_COLS are generated from the phone's cap table, so the two
// sides of the strip cannot drift. The marker has to sit outside the real range, since a
// temperature can be negative and zero is a reading. The 2x4 panel stacks two rows of four, which
// is what the column count is sized for
#include "wire/wire_caps.g.h"

/** @brief One hourly forecast column: a sky code plus a temperature (WEATHER_NO_TEMP for none). */
typedef struct
{
    uint8_t code;  ///< Sky code that picks an icon from the shared list (255 means unknown)
    int16_t temp;  ///< Temperature in the user's unit
} WeatherHourCol;

/** @brief One daily forecast column: a sky code plus the day's high and low. */
typedef struct
{
    uint8_t code;     ///< Sky code that picks an icon from the shared list (255 means unknown)
    int16_t temp_max; ///< The day's high in the user's unit
    int16_t temp_min; ///< The day's low in the user's unit
} WeatherDayCol;

/** @brief The hourly strip. count is 0 until a reading lands. */
typedef struct
{
    uint8_t        count;       ///< How many columns are filled (0 means none yet)
    uint8_t        base_hour;   ///< Hour of day of the first column (0 to 23)
    uint8_t        step_hours;  ///< Hours between columns
    WeatherHourCol col[WEATHER_FORECAST_COLS]; ///< The hourly columns, filled up to count
} WeatherHourly;

/** @brief The 7-day strip. count is 0 until a reading lands. */
typedef struct
{
    uint8_t       count;         ///< How many columns are filled (0 means none yet)
    uint8_t       base_weekday;  ///< Weekday of the first column (0 means Sunday)
    WeatherDayCol col[WEATHER_FORECAST_COLS]; ///< The daily columns, filled up to count
} WeatherDaily;

/**
 * @brief Unpacks an hourly forecast off the wire.
 *
 * Layout is [count][base_hour][step_hours] then per column [code][temp int16 LE]. A count past
 * what the strip holds is pinned to it rather than walking off the end.
 *
 * @param buf The raw wire bytes.
 * @param len How many bytes there are.
 * @param[out] out Receives the strip. Untouched unless this returns true: everything that can turn
 *   a message away is settled before the first byte of it is written.
 * @return Whether the run read clean.
 */
bool weather_hourly_decode(const uint8_t *buf, uint16_t len, WeatherHourly *out);

/**
 * @brief Unpacks a 7-day forecast off the wire.
 *
 * Layout is [count][base_weekday] then per column [code][max int16 LE][min int16 LE]. A count past
 * what the strip holds is pinned to it rather than walking off the end.
 *
 * @param buf The raw wire bytes.
 * @param len How many bytes there are.
 * @param[out] out Receives the strip. Untouched unless this returns true: everything that can turn
 *   a message away is settled before the first byte of it is written.
 * @return Whether the run read clean.
 */
bool weather_daily_decode(const uint8_t *buf, uint16_t len, WeatherDaily *out);

/** @} */
