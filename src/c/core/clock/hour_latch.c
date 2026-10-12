/**
 * @file hour_latch.c
 * @brief The hourly buzz latch, host-testable off-device.
 *
 * @ingroup lib_core
 */
#include "clock/hour_latch.h"

time_t hour_latch_start(time_t now, int tm_min, int tm_sec)
{
    return now - tm_min * 60 - tm_sec;
}

bool hour_latch_take(HourLatch *latch, int tick_min, time_t start)
{
    if (tick_min != 0 || start == latch->last_start)
    {
        return false;
    }

    latch->last_start = start;
    return true;
}

void hour_latch_seed(HourLatch *latch, time_t start)
{
    latch->last_start = start;
}
