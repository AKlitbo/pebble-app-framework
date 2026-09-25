/**
 * @file forecast_age.h
 * @brief How much of a forecast strip has already gone by, so a strip that stays on the watch
 * after a missed fetch shows what is still to come rather than hours and days already over.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdint.h>

/**
 * @addtogroup lib_core
 * @{
 */

/**
 * @brief How many of an hourly strip's columns are over.
 *
 * A column is over once its whole step has gone by, so the column holding the current hour stays.
 *
 * @param seconds_into_strip Seconds from the start of the first column to now. Zero or less means
 *   the strip has not started yet.
 * @param step_hours Hours between columns.
 * @param count How many columns the strip holds.
 * @return How many columns from the front are over, at most @p count.
 */
uint8_t forecast_hours_past(int32_t seconds_into_strip, uint8_t step_hours, uint8_t count);

/**
 * @brief How many of a daily strip's columns are days before today.
 *
 * @param days_since_arrival Whole days from the day the strip arrived to today.
 * @param first_day_ahead Days from the arrival day to the strip's first column, 0 when the strip
 *   starts on the day it arrived.
 * @param count How many columns the strip holds.
 * @return How many columns from the front are before today, at most @p count.
 */
uint8_t forecast_days_past(int days_since_arrival, uint8_t first_day_ahead, uint8_t count);

/** @} */
