/**
 * @file uv_band.h
 * @brief The risk band a UV index falls in, with a long and a short name for each.
 *
 * A bare UV number means little to most wearers, so a face shows the band beside it. The bands
 * are the WHO ones: 0 to 2 low, 3 to 5 moderate, 6 and 7 high, 8 to 10 very high, and 11 or more
 * extreme. Every face that asks gets the same band for the same number, so a 7 reads HIGH
 * wherever it shows.
 *
 * Pure arithmetic on a number, so there is no watch behind it. Reading the store is the caller's
 * job. A negative index is the weather store's "no reading", and it gets a band of its own with
 * empty names, so nothing prints beside the dashes.
 *
 * @ingroup lib_core
 */
#pragma once

/**
 * @addtogroup lib_core
 * @{
 */

/**
 * @brief The risk bands, lowest first.
 */
typedef enum
{
    UV_BAND_NONE,      ///< No reading, from a negative index
    UV_BAND_LOW,       ///< 0 to 2
    UV_BAND_MODERATE,  ///< 3 to 5
    UV_BAND_HIGH,      ///< 6 and 7
    UV_BAND_VERY_HIGH, ///< 8 to 10
    UV_BAND_EXTREME,   ///< 11 and up
} UvBand;

/**
 * @brief The band a UV index falls in.
 *
 * @param uv The index, such as `weather_store_uv()`. Anything below 0 is no reading.
 * @return The band, or UV_BAND_NONE for a negative index.
 */
UvBand uv_band(int uv);

/**
 * @brief The band's full name in capitals, such as "MODERATE" or "VERY HIGH".
 *
 * @param band The band.
 * @return The name, or an empty string for UV_BAND_NONE or a value outside the enum.
 */
const char *uv_band_name(UvBand band);

/**
 * @brief The band's short name in capitals, at most six letters, such as "MOD" or "V.HIGH".
 *
 * For a slot that has the number in front of the band and little room left after it.
 *
 * @param band The band.
 * @return The name, or an empty string for UV_BAND_NONE or a value outside the enum.
 */
const char *uv_band_short_name(UvBand band);

/** @} */
