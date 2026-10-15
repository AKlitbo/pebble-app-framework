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
    // figure is a round 366 rather than the real length, so crossing into a non-leap new year jumps
    // the counter by an extra day. the rotation skips ahead there rather than stepping by one, and
    // for a count that divides the jump it can land on the same one twice. one ragged boundary a year
    long minutes = (((long)year * 366 + yday) * 24 + hour) * 60 + minute;
    long bucket = minutes / interval_min;

    // normalise in case the clock is before 1900 and the minute count comes out negative
    return (int)(((bucket % count) + count) % count);
}
