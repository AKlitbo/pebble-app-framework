/**
 * @file readouts.c
 * @brief Text formatters shared by the faces, bound to the engine's text-slots.
 *
 * @ingroup lib_ui
 */
#include "ui/readouts.h"

#include <stdio.h>
#include <string.h>

#include "clock/beats.h"
#include "io/stores/time_store.h"
#include "io/stores/health_store.h"
#include "io/stores/weather_store.h"
#include "io/stores/location_store.h"
#include "system/settings/settings.h"
#include "system/settings/setting_values.h"
#include "system/units/units.h"
#include "text/text_case.h"
#include "weather/wx_label.h"

void readout_time(char *out, size_t n)
{
    uint8_t time_format = settings_u8(SETTING_TIME_FORMAT);

    // swatch .beats replaces the clock
    if (time_format == TIME_FORMAT_BEATS)
    {
        snprintf(out, n, "@%03d", units_swatch_beats());
        return;
    }

    // 24 -> 12 -> System
    bool h24 = (time_format == TIME_FORMAT_24H)
        || (time_format == TIME_FORMAT_SYSTEM && clock_is_24h_style());

    strftime(out, n, h24 ? "%H:%M" : "%I:%M", time_store_tm());

    // the no-lead 12-hour clock is the same reading with its padding zero taken off. it is
    // trimmed here rather than asking strftime for %l, which is a POSIX extension this SDK's
    // library is not guaranteed to carry
    if (time_format == TIME_FORMAT_12H_NO_LEAD && out[0] == '0')
    {
        memmove(out, out + 1, strlen(out));
    }
}

void readout_meridiem(char *out, size_t n)
{
    uint8_t time_format = settings_u8(SETTING_TIME_FORMAT);

    // AM/PM only makes sense on a 12-hour clock (either of the explicit twelves, or System when
    // the watch isn't in 24h mode). empty otherwise so it never shows on 24h/.beats
    bool h12 = (time_format == TIME_FORMAT_12H)
        || (time_format == TIME_FORMAT_12H_NO_LEAD)
        || (time_format == TIME_FORMAT_SYSTEM && !clock_is_24h_style());

    if (h12)
    {
        snprintf(out, n, "%s", time_store_tm()->tm_hour < 12 ? "AM" : "PM");
    }
    else
    {
        out[0] = '\0';
    }
}

void readout_date(char *out, size_t n)
{
    const char *format = settings_str(SETTING_DATE_FORMAT);

    // strftime first, which copies the .beats token through untouched because it owns no braces.
    // filling the reading in afterwards keeps the token out of a format string strftime parses
    if (strftime(out, n, format, time_store_tm()) == 0)
    {
        // a date too long for the buffer leaves whatever strftime managed behind it with no
        // terminator, and the two passes below would read and write past the end looking for one
        out[0] = '\0';
        return;
    }

    // reading the beat means breaking the clock apart, so only a format with a token to fill
    // pays for it. this runs on every repaint and two of the date formats carry a token
    if (beats_has_token(format))
    {
        beats_expand_token(out, units_swatch_beats());
    }

    text_to_upper(out);
}

bool readout_date_shows_beats(void)
{
    return beats_has_token(settings_str(SETTING_DATE_FORMAT));
}

void readout_hr(char *out, size_t n)
{
    int hr = health_store_hr();
    if (hr > 0)
    {
        snprintf(out, n, "%d", hr);
    }
    else
    {
        snprintf(out, n, "--");
    }
}

void readout_steps(char *out, size_t n)
{
    // no reading yet, or Health is off. the distance falls back to 0 rather than -1, so the steps
    // count is what tells a quiet day from no data in either mode
    uint8_t mode = settings_u8(SETTING_STEPS_MODE);
    if (health_store_steps() < 0)
    {
        snprintf(out, n, "--");
    }
    else if (mode == STEPS_MODE_MILES || mode == STEPS_MODE_KM)
    {
        units_format_distance(out, n, health_store_distance_m(), mode == STEPS_MODE_MILES);
    }
    else
    {
        snprintf(out, n, "%d", health_store_steps());
    }
}

void readout_weather_temp(char *out, size_t n)
{
    // the store hands back a whole number already in the user's unit
    // WEATHER_NO_TEMP means we have not got a reading yet
    // the unit letter goes on the end so it reads like "23C" or "73F"
    int temp = weather_store_temp();
    if (temp == WEATHER_NO_TEMP)
    {
        snprintf(out, n, "--");
        return;
    }

    snprintf(out, n, "%d%c", temp, settings_u8(SETTING_TEMPERATURE_UNIT) ? 'F' : 'C');
}

void readout_weather_cond(char *out, size_t n)
{
    const char *cond = weather_store_cond();
    if (cond[0] == '\0')
    {
        snprintf(out, n, "--");
        return;
    }

    // the token is the word already, less its night suffix
    wx_label_short(out, n, cond);
}

void readout_lat(char *out, size_t n)
{
    const char *lat = location_store_lat();
    snprintf(out, n, "%s", lat[0] ? lat : "--");
}

void readout_lon(char *out, size_t n)
{
    const char *lon = location_store_lon();
    snprintf(out, n, "%s", lon[0] ? lon : "--");
}
