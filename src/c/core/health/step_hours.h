/**
 * @file step_hours.h
 * @brief The hour arithmetic behind the step chart's buckets.
 *
 * @ingroup lib_core
 */
#pragma once

/**
 * @addtogroup lib_core
 * @{
 */

/** How many hourly buckets a day holds. */
#define STEP_HOURS_PER_DAY 24

/**
 * @brief How many whole hours have settled, meaning they can never gain another step.
 *
 * The hour in progress never counts, nor does the hour just gone while the clock is on its first
 * minute: the watch writes a minute's record at the top of the minute after it, below the
 * watchface in priority, so on the rollover turn that last record is usually not there yet.
 *
 * @param cur_hour The hour now, 0 to 23.
 * @param cur_min The minute within that hour, 0 to 59.
 * @return How many hours have settled, so buckets below it are final.
 */
int step_hours_settled(int cur_hour, int cur_min);

/** @} */
