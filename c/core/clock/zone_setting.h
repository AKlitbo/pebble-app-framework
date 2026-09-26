/**
 * @file zone_setting.h
 * @brief Reads a time zone setting the way the phone sends it, the minutes ahead of UTC then a
 * comma and the place's name, as in "60,London". An empty setting means no zone is picked, which
 * is what the phone sends once the wearer clears the picker.
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

/**
 * @brief Whether the setting holds a zone at all.
 *
 * An empty one is no zone rather than UTC with no name, so a panel shows dashes for it rather
 * than a clock for a place nobody picked.
 *
 * @param value The setting, or NULL.
 * @return True when a zone is set.
 */
bool zone_setting_is_set(const char *value);

/**
 * @brief How many minutes the zone is ahead of UTC, negative for one behind.
 *
 * @param value The setting, or NULL.
 * @return The offset in minutes, or 0 when no zone is set.
 */
int16_t zone_setting_offset(const char *value);

/**
 * @brief The place's name, everything after the first comma.
 *
 * A name can carry commas of its own, as in "Paris, Ile-de-France, France", so a caller that wants
 * only the city cuts it at the next comma itself.
 *
 * @param value The setting, or NULL.
 * @return The name, or an empty string when the setting has none.
 */
const char *zone_setting_label(const char *value);

/** @} */
