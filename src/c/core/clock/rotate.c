/**
 * @file rotate.c
 * @brief Working out which one is up from the clock.
 *
 * @ingroup lib_core
 */
#include "rotate.h"

int rotate_index(int year, int yday, int hour, int minute, int interval_min, int count)
{
    if (count <= 0)
    {
        return 0;
    }

    if (interval_min <= 0)
    {
        return 0;
    }

    // a plain running count of minutes that only has to climb as time passes. the days-in-a-year
    // figure is a round 366 rather than the real length, which leaves one longer step across a
    // non-leap new year. for a rotation that is just one more move, never a repeat
    long minutes = (((long)year * 366 + yday) * 24 + hour) * 60 + minute;
    long bucket = minutes / interval_min;

    // normalise in case the clock is before 1900 and the minute count comes out negative
    return (int)(((bucket % count) + count) % count);
}
