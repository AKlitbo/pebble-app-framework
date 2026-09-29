/**
 * @file step_hours.c
 * @brief The hour arithmetic behind the step chart's buckets.
 *
 * @ingroup lib_core
 */
#include "health/step_hours.h"

int step_hours_settled(int cur_hour, int cur_min)
{
    int settled = (cur_min > 0) ? cur_hour : cur_hour - 1;

    // midnight's first minute would ask for the hour before the day started
    return (settled < 0) ? 0 : settled;
}
