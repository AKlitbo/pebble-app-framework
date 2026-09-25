/**
 * @file forecast_age.c
 * @brief How much of a forecast strip has already gone by.
 *
 * @ingroup lib_core
 */
#include "weather/forecast_age.h"

#define SECONDS_PER_STRIP_HOUR 3600

uint8_t forecast_hours_past(int32_t seconds_into_strip, uint8_t step_hours, uint8_t count)
{
    if (seconds_into_strip <= 0 || step_hours == 0)
    {
        return 0;
    }

    int32_t over = seconds_into_strip / ((int32_t)step_hours * SECONDS_PER_STRIP_HOUR);
    return over < count ? (uint8_t)over : count;
}

uint8_t forecast_days_past(int days_since_arrival, uint8_t first_day_ahead, uint8_t count)
{
    int over = days_since_arrival - first_day_ahead;
    if (over <= 0)
    {
        return 0;
    }
    return over < count ? (uint8_t)over : count;
}
