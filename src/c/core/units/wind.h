/**
 * @file wind.h
 * @brief Pure wind-speed conversions and unit labels, no SDK behind them.
 *
 * @ingroup lib_core
 */
#pragma once

/**
 * @addtogroup lib_core
 * @{
 */

/**
 * @brief Which unit a wind speed reads out in.
 *
 * KMH is zero so a raw setting byte maps straight across and no unsigned range
 * check ever compares below zero.
 */
typedef enum
{
    WIND_UNIT_KMH = 0,  ///< kilometres per hour
    WIND_UNIT_MPH,      ///< miles per hour
    WIND_UNIT_KTS,      ///< knots
    WIND_UNIT_MS,       ///< metres per second
    WIND_UNIT_COUNT     ///< how many units there are, not a unit itself
} WindUnit;

/**
 * @brief Convert a km/h wind speed into the chosen unit.
 *
 * Integer maths, truncated. An unknown unit falls back to km/h.
 *
 * @param kmh The wind speed in km/h.
 * @param unit The unit to convert into.
 * @return The wind speed in the chosen unit.
 */
int wind_from_kmh(int kmh, WindUnit unit);

/**
 * @brief The short label for a wind unit.
 *
 * @param unit The unit to label.
 * @return "KM/H" / "MPH" / "KTS" / "M/S", km/h for an unknown unit.
 */
const char *wind_unit_label(WindUnit unit);

/** @} */
