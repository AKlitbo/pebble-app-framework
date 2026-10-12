/**
 * @file weather_reading.c
 * @brief Turns one weather message into the reading a store keeps.
 *
 * @ingroup lib_core
 */
#include "weather/weather_reading.h"

#include <limits.h>

#include "math/scale.h"
#include "text/cstring_fit.h"

#define SECONDS_PER_READING_HOUR 3600  ///< Seconds in an hour, for placing a strip's first column
#define SECONDS_PER_READING_DAY  86400 ///< Seconds in a day, for placing a strip's first day
#define MINUTES_PER_READING_DAY  1440  ///< Minutes in a day, the range a sunrise or sunset is held to
#define TEMP_LOWEST  (-99) ///< The lowest temperature kept, the most a three digit label shows below zero
#define TEMP_HIGHEST 199   ///< The highest temperature kept, the most a three digit label shows

/** A number the message left out, as the store's own no-data value. */
static int or_none(int value, int none)
{
    return value == INT_MIN ? none : value;
}

/**
 * A temperature held to TEMP_LOWEST to TEMP_HIGHEST, so a wild one cannot run past a three digit
 * label or overflow the current temperature's int16, or no data for one the message left out. The
 * store's own no-data value counts as left out too, since clamping it would turn it into a real -99.
 *
 * @param value The temperature from the message, or INT_MIN when it left one out.
 * @return The temperature held to the range, or WEATHER_NO_TEMP.
 */
static int temp_or_none(int value)
{
    return (value == INT_MIN || value == WEATHER_NO_TEMP) ? WEATHER_NO_TEMP
                                                           : clamp_int(value, TEMP_LOWEST, TEMP_HIGHEST);
}

/** A time of day in minutes, or -1 for one the message left out or one no clock can read. */
static int16_t day_minute_or_none(int value)
{
    return (value >= 0 && value < MINUTES_PER_READING_DAY) ? (int16_t)value : -1;
}

bool weather_reading_apply(WeatherState *state, const WeatherMessage *msg, const WeatherClock *clock)
{
    bool kept = false;

    // a failed fetch still answers, but its temperature is not a reading, so the last good one stays
    if ((msg->groups & WEATHER_GROUP_CURRENT) && msg->ok)
    {
        state->temp = (int16_t)temp_or_none(msg->temp);
        cstring_fit(state->cond, msg->cond ? msg->cond : "--", sizeof(state->cond));
        cstring_fit(state->cond_label, msg->cond_label ? msg->cond_label : "", sizeof(state->cond_label));
        kept = true;
    }

    if (msg->groups & WEATHER_GROUP_EXTRA)
    {
        state->humidity = or_none(msg->humidity, -1);
        state->wind_kmh = or_none(msg->wind_kmh, -1);
        cstring_fit(state->wind_dir, msg->wind_dir ? msg->wind_dir : "", sizeof(state->wind_dir));
        state->sunrise = day_minute_or_none(msg->sunrise);
        state->sunset = day_minute_or_none(msg->sunset);
        kept = true;
    }

    if (msg->groups & WEATHER_GROUP_FORECAST)
    {
        state->uv = or_none(msg->uv, -1);
        state->temp_max = temp_or_none(msg->temp_max);
        state->temp_min = temp_or_none(msg->temp_min);
        state->precip_chance = or_none(msg->precip_chance, -1);
        state->forecast_day = clock->day_start;
        kept = true;
    }

    if (msg->groups & WEATHER_GROUP_AIR)
    {
        state->feels_like = temp_or_none(msg->feels_like);
        state->pressure = or_none(msg->pressure, -1);
        state->dew_point = temp_or_none(msg->dew_point);
        kept = true;
    }

    // the decoders only write a strip that reads clean, so a bad one leaves the last good row
    // each strip that reads clean records where its first column starts, which says later how much
    // of it has gone by. the first hourly column is the hour with its base hour nearest now, up to
    // 12 hours behind or 11 ahead. the first daily column is the day with its weekday nearest today,
    // up to 3 days either way, so a late evening strip that starts tomorrow is whole until then.
    // a strip that lands late starts behind the clock, and reading it as nearly a whole cycle ahead
    // would mean it never ages
    if (msg->hourly && weather_hourly_decode(msg->hourly, msg->hourly_len, &state->hourly))
    {
        int ahead = (state->hourly.base_hour - clock->hour + 36) % 24 - 12;
        state->hourly_first = clock->now - clock->minute * 60 - clock->second +
                              (time_t)ahead * SECONDS_PER_READING_HOUR;
        kept = true;
    }

    if (msg->daily && weather_daily_decode(msg->daily, msg->daily_len, &state->daily))
    {
        int ahead = (state->daily.base_weekday - clock->wday + 10) % 7 - 3;
        state->daily_first = clock->day_start + (time_t)ahead * SECONDS_PER_READING_DAY;
        kept = true;
    }

    if (kept)
    {
        state->last_sync = clock->now;
    }

    return kept;
}

/** Divides to the nearest whole number. Neither a fifth nor a ninth lands on a half, so nothing ties. */
static int div_nearest(int numerator, int denominator)
{
    return (numerator + (numerator < 0 ? -denominator : denominator) / 2) / denominator;
}

/** One temperature in the other unit, or no data left as it is. */
static int convert_temp(int value, bool to_fahrenheit)
{
    if (value == WEATHER_NO_TEMP)
    {
        return value;
    }

    int converted = to_fahrenheit ? div_nearest(value * 9, 5) + 32 : div_nearest((value - 32) * 5, 9);
    return clamp_int(converted, TEMP_LOWEST, TEMP_HIGHEST);
}

void weather_reading_convert(WeatherState *state, bool to_fahrenheit)
{
    state->temp = (int16_t)convert_temp(state->temp, to_fahrenheit);
    state->temp_max = convert_temp(state->temp_max, to_fahrenheit);
    state->temp_min = convert_temp(state->temp_min, to_fahrenheit);
    state->feels_like = convert_temp(state->feels_like, to_fahrenheit);
    state->dew_point = convert_temp(state->dew_point, to_fahrenheit);

    for (uint8_t i = 0; i < state->hourly.count && i < WEATHER_FORECAST_COLS; i++)
    {
        state->hourly.col[i].temp = (int16_t)convert_temp(state->hourly.col[i].temp, to_fahrenheit);
    }

    for (uint8_t i = 0; i < state->daily.count && i < WEATHER_FORECAST_COLS; i++)
    {
        state->daily.col[i].temp_max = (int16_t)convert_temp(state->daily.col[i].temp_max, to_fahrenheit);
        state->daily.col[i].temp_min = (int16_t)convert_temp(state->daily.col[i].temp_min, to_fahrenheit);
    }
}
