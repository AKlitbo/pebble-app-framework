/**
 * @file uv_band.c
 * @brief The risk band a UV index falls in, with a long and a short name for each.
 *
 * @ingroup lib_core
 */
#include "weather/uv_band.h"

/// How many bands there are, UV_BAND_NONE included
#define UV_BAND_COUNT (UV_BAND_EXTREME + 1)

UvBand uv_band(int uv)
{
    if (uv < 0)
    {
        return UV_BAND_NONE;
    }
    if (uv <= 2)
    {
        return UV_BAND_LOW;
    }
    if (uv <= 5)
    {
        return UV_BAND_MODERATE;
    }
    if (uv <= 7)
    {
        return UV_BAND_HIGH;
    }
    if (uv <= 10)
    {
        return UV_BAND_VERY_HIGH;
    }
    return UV_BAND_EXTREME;
}

/**
 * @brief Looks a band up in one of the name tables.
 *
 * A band is an enum, so a caller can still hand in any number. Anything outside the table gets
 * the empty name rather than a read past its end. The compare is unsigned, so a negative value
 * wraps to a big one and is turned away by the same check. A `band < 0` test on an enum the
 * compiler made unsigned would fail the watch build under -Werror.
 *
 * @param names The table, one name per band.
 * @param band The band.
 * @return The band's name, or an empty string.
 */
static const char *band_lookup(const char *const names[UV_BAND_COUNT], UvBand band)
{
    if ((unsigned)band >= UV_BAND_COUNT)
    {
        return "";
    }

    return names[band];
}

const char *uv_band_name(UvBand band)
{
    static const char *const names[UV_BAND_COUNT] = {
        "", "LOW", "MODERATE", "HIGH", "VERY HIGH", "EXTREME",
    };

    return band_lookup(names, band);
}

const char *uv_band_short_name(UvBand band)
{
    static const char *const names[UV_BAND_COUNT] = {
        "", "LOW", "MOD", "HIGH", "V.HIGH", "EXTRM",
    };

    return band_lookup(names, band);
}
