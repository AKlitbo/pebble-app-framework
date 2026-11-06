/**
 * @file hr_day.h
 * @brief Today's heart rate by the hour, for a panel that charts the day with its low, average,
 * and high.
 *
 * The health store fills it from the watch's minute log at launch and from each new reading after.
 * Plain C with no SDK, so its specs run on a PC. The caller passes the hour already worked out, so
 * a clock change is decided once, where the clock is read.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdbool.h>
#include <stdint.h>

/**
 * @addtogroup lib_core
 * @{
 */

#define HR_DAY_HOURS 24 ///< Today's hours from midnight

/** @brief The readings that landed in one hour. */
typedef struct
{
    uint16_t sum;   ///< The readings added together
    uint8_t  count; ///< How many readings, or 0 for an hour with none
    uint8_t  low;   ///< The lowest reading
    uint8_t  high;  ///< The highest reading
} HrHour;

/** @brief Today's heart rate, one entry an hour from midnight. */
typedef struct
{
    HrHour hours[HR_DAY_HOURS]; ///< Each hour's readings, midnight first
} HrDay;

/**
 * @brief Empties the day, for a new day or a fresh start.
 *
 * @param day The day to empty.
 */
void hr_day_clear(HrDay *day);

/**
 * @brief Adds one reading to its hour.
 *
 * A reading of 0 or less means the watch had none and is left out, and one over 255 is kept as
 * 255. An hour that has taken 255 readings stops taking more, which a reading a minute never
 * reaches.
 *
 * @param day The day to add to.
 * @param hour The hour of the day the reading was taken in, 0 to 23. Anything else is left out.
 * @param bpm The reading in beats per minute.
 */
void hr_day_add(HrDay *day, int hour, int bpm);

/**
 * @brief The average of one hour's readings.
 *
 * @param day The day to read.
 * @param hour The hour of the day, 0 to 23.
 * @return The average rounded to the nearest beat, or -1 for an hour with no readings.
 */
int hr_day_hour_avg(const HrDay *day, int hour);

/**
 * @brief The day's lowest and highest readings, and the average of every reading so far.
 *
 * The average weighs each reading the same, so an hour with more readings counts for more than a
 * quiet one.
 *
 * @param day The day to read.
 * @param low Where the lowest goes, or -1 with no readings yet.
 * @param avg Where the average goes, or -1 with no readings yet.
 * @param high Where the highest goes, or -1 with no readings yet.
 */
void hr_day_stats(const HrDay *day, int *low, int *avg, int *high);

/** @} */
