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

/** A number the message left out, as the store's own no-data value. */
static int or_none(int value, int none)
{
    return value == INT_MIN ? none : value;
}

bool weather_reading_apply(WeatherState *state, const WeatherMessage *msg, time_t now)
{
    bool kept = false;

    // a failed fetch still answers, but its temperature is not a reading, so the last good one
    // stays. only a real one is clamped, so a corrupt value cannot overflow the int16 or draw absurd
    if ((msg->groups & WEATHER_GROUP_CURRENT) && msg->ok)
    {
        state->temp = (int16_t)clamp_int(msg->temp, -99, 199);
        cstring_fit(state->cond, msg->cond ? msg->cond : "--", sizeof(state->cond));
        kept = true;
    }

    if (msg->groups & WEATHER_GROUP_EXTRA)
    {
        state->humidity = or_none(msg->humidity, -1);
        state->wind_kmh = or_none(msg->wind_kmh, -1);
        cstring_fit(state->wind_dir, msg->wind_dir ? msg->wind_dir : "", sizeof(state->wind_dir));
        cstring_fit(state->sunrise, msg->sunrise ? msg->sunrise : "", sizeof(state->sunrise));
        cstring_fit(state->sunset, msg->sunset ? msg->sunset : "", sizeof(state->sunset));
        kept = true;
    }

    if (msg->groups & WEATHER_GROUP_FORECAST)
    {
        state->uv = or_none(msg->uv, -1);
        state->temp_max = or_none(msg->temp_max, WEATHER_NO_TEMP);
        state->temp_min = or_none(msg->temp_min, WEATHER_NO_TEMP);
        state->precip_chance = or_none(msg->precip_chance, -1);
        kept = true;
    }

    if (msg->groups & WEATHER_GROUP_AIR)
    {
        state->feels_like = or_none(msg->feels_like, WEATHER_NO_TEMP);
        state->pressure = or_none(msg->pressure, -1);
        state->dew_point = or_none(msg->dew_point, WEATHER_NO_TEMP);
        kept = true;
    }

    // the decoders only write a strip that reads clean, so a bad one leaves the last good row
    if (msg->hourly && weather_hourly_decode(msg->hourly, msg->hourly_len, &state->hourly))
    {
        kept = true;
    }

    if (msg->daily && weather_daily_decode(msg->daily, msg->daily_len, &state->daily))
    {
        kept = true;
    }

    if (kept)
    {
        state->last_sync = now;
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
    return clamp_int(converted, -99, 199);
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
