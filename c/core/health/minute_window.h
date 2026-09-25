/**
 * @file minute_window.h
 * @brief Where a run of minute records lands in a window that ends at a given minute.
 *
 * @ingroup lib_core
 */
#pragma once
#include <time.h>

/**
 * @addtogroup lib_core
 * @{
 */

/**
 * @brief Where the first of a run of back to back minute records lands in a window.
 *
 * The window's last slot holds end_min and each slot before it holds the minute before. A record
 * older than the window lands below zero, one newer than its end lands past the last slot, and the
 * caller skips both.
 *
 * @param first_min The minute the first record belongs to, as minutes since the epoch.
 * @param end_min The minute the window's last slot holds, the same way.
 * @param minutes How many slots the window has.
 * @return The slot for the first record, which can fall outside 0 to minutes - 1.
 */
int minute_window_first_slot(time_t first_min, time_t end_min, int minutes);

/** @} */
