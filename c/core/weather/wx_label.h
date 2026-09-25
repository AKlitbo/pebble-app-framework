/**
 * @file wx_label.h
 * @brief The short word a small slot shows for the sky, from the condition token the phone sends.
 *
 * The token is already the short word, such as "PCLDY" or "SUNNY". A token after dark carries a
 * "_NIGHT" suffix so the watch can pick a night icon, and the word drops it, since a small slot
 * reads the same by day and by night. The full words, such as "Partly Cloudy", come from the
 * phone as WEATHER_CONDITION_LABEL.
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
 * @brief Writes the short word for a condition token, without its "_NIGHT" suffix.
 *
 * @param out Where the word goes.
 * @param n The room in @p out, terminator included.
 * @param condition The token, such as "PCLDY_NIGHT". NULL or empty writes "UNKNOWN".
 */
void wx_label_short(char *out, size_t n, const char *condition);

/** @} */
