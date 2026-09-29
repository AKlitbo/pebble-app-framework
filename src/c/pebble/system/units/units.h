/**
 * @file units.h
 * @brief Unit conversion and distance formatting helpers.
 *
 * @ingroup lib_system
 */
#pragma once
#include <pebble.h>

/**
 * @addtogroup lib_system
 * @{
 */

/**
 * @brief The current swatch internet time, in .beats.
 *
 * @return The current time in .beats (0 to 999).
 */
int units_swatch_beats(void);

/**
 * @brief Milliseconds until the next .beats boundary.
 *
 * @return Milliseconds remaining until the next boundary.
 */
uint32_t units_ms_until_next_beat(void);

/**
 * @brief Formats a distance as "N.N MI" or "N.N KM".
 *
 * @param[out] buffer Where the formatted distance is written.
 * @param size The size of `buffer`.
 * @param meters The distance, in metres.
 * @param miles Formats as miles if true, otherwise km.
 */
void units_format_distance(char *buffer, size_t size, int meters, bool miles);

/**
 * @brief Formats a distance as just "N.N", with no unit suffix, rounded to a tenth.
 *
 * Pair with `units_distance_unit` when the unit wants its own small-font slot.
 *
 * @param[out] buffer Where the formatted distance is written.
 * @param size The size of `buffer`.
 * @param meters The distance, in metres.
 * @param miles Formats as miles if true, otherwise km.
 */
void units_format_distance_value(char *buffer, size_t size, int meters, bool miles);

/**
 * @brief The unit label for the current distance mode, "MI" or "KM".
 *
 * @param miles Miles if true, otherwise km.
 * @return The unit label, held in static storage rather than allocated.
 */
const char *units_distance_unit(bool miles);

/** @} */
