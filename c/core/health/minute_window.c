/**
 * @file minute_window.c
 * @brief Where a run of minute records lands in a window that ends at a given minute.
 *
 * @ingroup lib_core
 */
#include "health/minute_window.h"

int minute_window_first_slot(time_t first_min, time_t end_min, int minutes)
{
    return (int)(first_min - end_min) + minutes - 1;
}
