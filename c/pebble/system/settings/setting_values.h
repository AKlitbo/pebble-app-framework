/**
 * @file setting_values.h
 * @brief Named values for the multi-choice settings.
 *
 * The wire format and Clay config encode these as bare integers. C branches read
 * them by name instead. The order mirrors each setting's config.js option list,
 * and the trailing *_COUNT marker feeds the schema's enum_count so the limit
 * can't drift from the values.
 *
 * @ingroup lib_settings
 */
#pragma once

/**
 * @addtogroup lib_settings
 * @{
 */

/**
 * @brief SETTING_TIME_FORMAT choices.
 */
typedef enum
{
    TIME_FORMAT_SYSTEM      = 0,  ///< Follows the watch's own 12 or 24 hour setting
    TIME_FORMAT_12H         = 1,  ///< 12 hour with a leading zero like 06:30
    TIME_FORMAT_24H         = 2,  ///< 24 hour clock
    TIME_FORMAT_BEATS       = 3,  ///< Swatch Internet Time, offered as .beats on the settings page
    TIME_FORMAT_12H_NO_LEAD = 4,  ///< 12 hour without a leading zero like 6:30
    TIME_FORMAT_COUNT             ///< How many choices this setting has
} TimeFormat;

/**
 * @brief SETTING_STEPS_MODE choices.
 */
typedef enum
{
    STEPS_MODE_STEPS = 0,  ///< Shows the raw step count
    STEPS_MODE_MILES = 1,  ///< Shows the distance walked, in miles
    STEPS_MODE_KM    = 2,  ///< Shows the distance walked, in kilometres
    STEPS_MODE_COUNT       ///< How many choices this setting has
} StepsMode;

/**
 * @brief SETTING_DISTANCE_UNIT choices. The standalone Distance panel picks its own unit
 * separate from the Steps panel's STEPS_MODE.
 */
typedef enum
{
    DISTANCE_UNIT_KM    = 0,  ///< Kilometres
    DISTANCE_UNIT_MILES = 1,  ///< Miles
    DISTANCE_UNIT_COUNT       ///< How many choices this setting has
} DistanceUnit;

/**
 * @brief Bluetooth connect/disconnect vibe pattern choices.
 */
typedef enum
{
    VIBE_NONE   = 0,  ///< No vibration
    VIBE_SHORT  = 1,  ///< A single short pulse
    VIBE_LONG   = 2,  ///< A single long pulse
    VIBE_DOUBLE = 3,  ///< Two short pulses
    VIBE_COUNT        ///< How many choices this setting has
} VibeChoice;

/**
 * @brief SETTING_BATTERY_DISPLAY choices: what the battery readout shows.
 */
typedef enum
{
    BATTERY_DISPLAY_BOTH    = 0,  ///< Icon and percent
    BATTERY_DISPLAY_ICON    = 1,  ///< Icon only
    BATTERY_DISPLAY_PERCENT = 2,  ///< Percent only
    BATTERY_DISPLAY_COUNT         ///< How many choices this setting has
} BatteryDisplay;

/** @} */
