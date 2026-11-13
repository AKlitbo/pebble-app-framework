/**
 * @file wind.c
 * @brief Pure wind-speed conversions and unit labels, no SDK behind them.
 *
 * @ingroup lib_core
 */
#include "units/wind.h"

/**
 * @brief Scales a speed by a factor in thousandths and rounds to the nearest whole number.
 *
 * A half rounds away from zero, so a negative speed rounds the same way as its positive.
 *
 * @param kmh The speed in km/h.
 * @param per_thousand How many thousandths of the unit one km/h is.
 * @return The speed in the unit, rounded.
 */
static int scale_rounded(int kmh, int per_thousand)
{
    int scaled = kmh * per_thousand;

    return (scaled >= 0 ? scaled + 500 : scaled - 500) / 1000;
}

int wind_from_kmh(int kmh, WindUnit unit)
{
    switch (unit)
    {
        case WIND_UNIT_MPH: return scale_rounded(kmh, 621); // mph
        case WIND_UNIT_KTS: return scale_rounded(kmh, 540); // kts
        case WIND_UNIT_MS:  return scale_rounded(kmh, 278); // m/s
        default:            return kmh;                     // km/h
    }
}

const char *wind_unit_label(WindUnit unit)
{
    switch (unit)
    {
        case WIND_UNIT_MPH: return "MPH";
        case WIND_UNIT_KTS: return "KTS";
        case WIND_UNIT_MS:  return "M/S";
        default:            return "KM/H";
    }
}
