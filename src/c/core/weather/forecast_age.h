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
 * @param days_since_first Whole days from the strip's first day to today. Zero or less means the
 *   strip starts today or later.
 * @param count How many columns the strip holds.
 * @return How many columns from the front are before today, at most @p count.
 */
uint8_t forecast_days_past(int days_since_first, uint8_t count);

/** @} */
