/**
 * @file number_format.h
 * @brief Pure number formatting, no SDK behind it.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stddef.h>

/**
 * @addtogroup lib_core
 * @{
 */

/**
 * @brief Format an integer with apostrophe thousands separators (e.g. 20358 -> "20'358").
 *
 * Negative values keep their leading sign. The Swiss-style apostrophe keeps big
 * counts readable on the small display.
 *
 * @param[out] buffer Output buffer.
 * @param size Buffer size.
 * @param value The value to format.
 */
void number_group(char *buffer, size_t size, int value);

/**
 * @brief Format an integer, or "--" when there is no reading yet.
 *
 * A negative value is the no-data marker the readouts share, so this is the one place that turns
 * "I have nothing" into something to draw. The format takes exactly one int, so "%d" or "%d%%".
 *
 * @param[out] buffer Output buffer.
 * @param size Buffer size.
 * @param value The reading, or a negative number for no data yet.
 * @param fmt The printf format applied when the value is there.
 */
void fmt_int_or_dash(char *buffer, size_t size, int value, const char *fmt);

/**
 * @brief Format hundredths as a two-decimal number, e.g. 26174 -> "261.74".
 *
 * Prices and the like ride the wire as whole hundredths so they never touch a float. The sign is
 * written out front rather than left to the whole part, which is what makes -50 read as "-0.50"
 * instead of losing its minus to a whole part of zero.
 *
 * @param[out] buffer Output buffer.
 * @param size Buffer size.
 * @param value The number times 100.
 */
void fmt_hundredths(char *buffer, size_t size, int value);

/**
 * @brief Format hundredths as a signed two-decimal percent, e.g. 125 -> "+1.25%".
 *
 * A gain takes a plus, a loss a minus, and flat takes neither. Same reason as fmt_hundredths for
 * writing the sign out front: a change under one percent has a whole part of zero and would lose
 * it otherwise.
 *
 * @param[out] buffer Output buffer.
 * @param size Buffer size.
 * @param value The percent times 100, signed.
 */
void fmt_pct_signed(char *buffer, size_t size, int value);

/** @} */
