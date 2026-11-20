/**
 * @file settings_catalog.h
 * @brief The shared catalog of known settings. A `KNOWN_*` macro per setting bakes in its
 * neutral wire key, encoding, bounds, default, and side effects.
 *
 * A face subscribes to a known setting by placing its KNOWN_* entry in the face's
 * field table at the offset of the matching struct member, and by declaring the
 * setting's MESSAGE_KEY in the face's package.json. Face-only settings are declared
 * inline in the table instead, with an id of SETTING_COUNT or greater.
 *
 * A choice the face's own settings page lists, such as the theme, takes its
 * count from settings_page.h, which paf build writes into the sandbox from the page, and the
 * face passes the size of its own table so the build stops when the two disagree. A choice
 * the framework lists takes the framework's own count from setting_values.h, since the
 * watch can only draw the values its own enum names. A daily goal takes the page's count,
 * checked against the framework's goal table in health/goals.h.
 *
 * Every entry takes its default from the same header, so a fresh watch starts on the value
 * the settings page opens with. A setting the page does not show keeps the framework's own
 * default.
 *
 * @ingroup lib_settings
 */
#pragma once
#include <stddef.h>
#include "system/settings/settings.h"
#include "system/settings/setting_values.h"
#include "health/goals.h"
#include "settings_page.h"

/**
 * @addtogroup lib_settings
 * @{
 */

/**
 * @brief How many choices the settings page offers on a message key, worked out by the build.
 *
 * paf build reads the face's settings page and writes a count for every select, radio group, and
 * theme picker whose values are all whole numbers from 0 to 254. The count is the highest value
 * plus one, so a value retired from the middle of a list stays reserved. A key with no such control
 * on the page has no count, and naming it here stops the build with SETTINGS_COUNT_<key> undeclared.
 *
 * A face's own choice field takes its count the same way, as in
 * `.enum_count = SETTINGS_COUNT(APPEARANCE_NIGHT_THEME)`.
 *
 * @param key The message key without its MESSAGE_KEY_ prefix, such as APPEARANCE_THEME.
 * @return The count, as a number the compiler knows.
 */
#define SETTINGS_COUNT(key) SETTINGS_COUNT_##key

/** @cond */
#define SETTINGS_COUNT_TEXT_(x) #x
#define SETTINGS_COUNT_TEXT(x) SETTINGS_COUNT_TEXT_(x)
/** @endcond */

/**
 * @brief The page's count on a message key, checked against the size of the face's own table.
 *
 * The page lists the choices the wearer can pick, and the face's C draws them from a table of its
 * own, such as a theme enum. A choice on the page the table lacks draws nothing, and one in the table
 * the page lacks can never be picked, so the build stops when the two counts differ. The message
 * names the page's count and the table's. The count is the page's, the same as SETTINGS_COUNT.
 *
 * @code
 * .enum_count = SETTINGS_COUNT_CHECKED(APPEARANCE_NIGHT_THEME, THEME_COUNT),
 * @endcode
 *
 * @param key The message key without its MESSAGE_KEY_ prefix, such as APPEARANCE_THEME.
 * @param table_count How many entries the face's own table holds, such as its THEME_COUNT.
 * @return The page's count, as a number the compiler knows.
 */
#define SETTINGS_COUNT_CHECKED(key, table_count) \
    (SETTINGS_COUNT(key) + 0 * sizeof(struct { \
        _Static_assert(SETTINGS_COUNT(key) == (table_count), \
            "the settings page offers " SETTINGS_COUNT_TEXT(SETTINGS_COUNT(key)) " choices on " #key \
            ", but the table the face passed holds " SETTINGS_COUNT_TEXT(table_count)); \
        char unused; \
    }))

/**
 * @brief A text entry's offset and size, with a build stop when the member is not that size.
 *
 * A text entry writes a fixed number of bytes, so a member any shorter would have the text written
 * over whatever follows it. The size is named once, so the check and the bytes written always agree.
 *
 * @param blob The face's settings struct.
 * @param member The member that holds the text.
 * @param bytes How many bytes the entry writes.
 * @return The `.offset` and `.size` for the entry.
 */
#define SETTINGS_TEXT_FIELD(blob, member, bytes) \
    .offset = (offsetof(blob, member) + 0 * sizeof(struct { \
        _Static_assert(sizeof(((blob *)0)->member) == (bytes), \
            #blob "." #member " has to be " #bytes " bytes, the size its entry writes"); \
        char unused; \
    })), .size = (bytes)

/**
 * @brief The default the settings page opens with on a message key, worked out by the build.
 *
 * paf build writes one for every control on the page that opens on a value the watch can hold, as
 * the phone reads it: a toggle as 1 or 0, a choice or a whole number as its number, a colour as
 * 0xRRGGBB, and text as a string. A control with no default of its own gives what Clay opens it on.
 * A key a KNOWN_* entry keeps takes that entry's type, and the build stops on a page default that
 * does not fit it. A key with no default on the page has none, and naming it here stops the build
 * with SETTINGS_DEFAULT_<key> undeclared. The KNOWN_* entries fall back to the framework's own
 * default for a key the page does not show.
 *
 * A face's own field takes its default the same way, as in
 * `.default_num = SETTINGS_DEFAULT(APPEARANCE_NIGHT_THEME)` or
 * `.default_str = SETTINGS_DEFAULT(LAYOUT)`.
 *
 * @param key The message key without its MESSAGE_KEY_ prefix, such as CLOCK_DATE_FORMAT.
 * @return The default, as a number or a string the compiler knows.
 */
#define SETTINGS_DEFAULT(key) SETTINGS_DEFAULT_##key

/** @cond */
// the framework's own default for each shared setting, kept only when the page does not show it
#ifndef SETTINGS_DEFAULT_WEATHER_TEMPERATURE_UNIT
#define SETTINGS_DEFAULT_WEATHER_TEMPERATURE_UNIT 0
#endif
#ifndef SETTINGS_DEFAULT_CLOCK_DATE_FORMAT
#define SETTINGS_DEFAULT_CLOCK_DATE_FORMAT "%a %d %b"
#endif
#ifndef SETTINGS_DEFAULT_APPEARANCE_THEME
#define SETTINGS_DEFAULT_APPEARANCE_THEME 0
#endif
#ifndef SETTINGS_DEFAULT_HEALTH_STEPS_MODE
#define SETTINGS_DEFAULT_HEALTH_STEPS_MODE 0
#endif
#ifndef SETTINGS_DEFAULT_HEALTH_DISTANCE_UNIT
#define SETTINGS_DEFAULT_HEALTH_DISTANCE_UNIT 0
#endif
#ifndef SETTINGS_DEFAULT_CLOCK_TIME_FORMAT
#define SETTINGS_DEFAULT_CLOCK_TIME_FORMAT 0
#endif
#ifndef SETTINGS_DEFAULT_CONNECTION_BLUETOOTH_ICON
#define SETTINGS_DEFAULT_CONNECTION_BLUETOOTH_ICON 1
#endif
#ifndef SETTINGS_DEFAULT_APPEARANCE_QUIET_TIME_ICON
#define SETTINGS_DEFAULT_APPEARANCE_QUIET_TIME_ICON 0
#endif
#ifndef SETTINGS_DEFAULT_CONNECTION_VIBE_CONNECT
#define SETTINGS_DEFAULT_CONNECTION_VIBE_CONNECT 0
#endif
#ifndef SETTINGS_DEFAULT_CONNECTION_VIBE_DISCONNECT
#define SETTINGS_DEFAULT_CONNECTION_VIBE_DISCONNECT 0
#endif
#ifndef SETTINGS_DEFAULT_CLOCK_HOURLY_VIBE
#define SETTINGS_DEFAULT_CLOCK_HOURLY_VIBE 0
#endif
#ifndef SETTINGS_DEFAULT_BATTERY_DISPLAY
#define SETTINGS_DEFAULT_BATTERY_DISPLAY 0
#endif
#ifndef SETTINGS_DEFAULT_WEATHER_WIND_UNIT
#define SETTINGS_DEFAULT_WEATHER_WIND_UNIT 0
#endif
#ifndef SETTINGS_DEFAULT_HEALTH_GOAL_STEPS
#define SETTINGS_DEFAULT_HEALTH_GOAL_STEPS 2
#endif
#ifndef SETTINGS_DEFAULT_HEALTH_GOAL_DISTANCE
#define SETTINGS_DEFAULT_HEALTH_GOAL_DISTANCE 2
#endif
#ifndef SETTINGS_DEFAULT_HEALTH_GOAL_CALORIES
#define SETTINGS_DEFAULT_HEALTH_GOAL_CALORIES 3
#endif
#ifndef SETTINGS_DEFAULT_HEALTH_GOAL_ACTIVE
#define SETTINGS_DEFAULT_HEALTH_GOAL_ACTIVE 1
#endif
#ifndef SETTINGS_DEFAULT_HEALTH_GOAL_SLEEP
#define SETTINGS_DEFAULT_HEALTH_GOAL_SLEEP 2
#endif
#ifndef SETTINGS_DEFAULT_HEALTH_GOAL_HR
#define SETTINGS_DEFAULT_HEALTH_GOAL_HR 3
#endif
#ifndef SETTINGS_DEFAULT_HEALTH_GOAL_VIBE
#define SETTINGS_DEFAULT_HEALTH_GOAL_VIBE ""
#endif
#ifndef SETTINGS_DEFAULT_HEALTH_GOAL_VIBE_CUSTOM
#define SETTINGS_DEFAULT_HEALTH_GOAL_VIBE_CUSTOM ""
#endif
/** @endcond */

/**
 * @brief Setting definition for Temperature Unit (Celsius or Fahrenheit).
 *
 * Every face wires this the same way, so it takes no count. There are two units and there is
 * never going to be a third. Changing it converts the weather already on the watch and asks for
 * fresh weather in the new unit.
 *
 * @param off Offset into the face's settings struct.
 */
#define KNOWN_TEMPERATURE_UNIT(off) \
    { .id = SETTING_TEMPERATURE_UNIT, .message_key = &MESSAGE_KEY_WEATHER_TEMPERATURE_UNIT, \
      .type = SETTING_ENUM_U8, .offset = (off), .enum_count = 2, \
      .default_num = SETTINGS_DEFAULT(WEATHER_TEMPERATURE_UNIT), .affects_weather = true }

/**
 * @brief Setting definition for Date Format.
 *
 * The default is the one the settings page opens with, from SETTINGS_DEFAULT, so a fresh watch
 * shows the date the page says it does. paf build stops on a page default whose UTF-8 does not fit
 * the 16 bytes with its end. It reads the size from KNOWN_FIELDS in tools/pkjs/settings-page.ts,
 * which a spec checks against this file.
 *
 * It takes the struct and the member rather than an offset, so the build stops on a member that is
 * not exactly 16 bytes. A shorter one would have the date format written past its end.
 *
 * @param blob The face's settings struct.
 * @param member The `char[16]` member that holds the date format.
 */
#define KNOWN_DATE_FORMAT(blob, member) \
    { .id = SETTING_DATE_FORMAT, .message_key = &MESSAGE_KEY_CLOCK_DATE_FORMAT, \
      .type = SETTING_CSTRING, SETTINGS_TEXT_FIELD(blob, member, 16), \
      .default_str = SETTINGS_DEFAULT(CLOCK_DATE_FORMAT), .affects_layout = true }

/**
 * @brief Setting definition for Theme.
 *
 * The count is how many themes the settings page offers, from SETTINGS_COUNT. The face passes how
 * many its own theme table holds, and the build stops when the two differ, so a theme added to the
 * page and not to the C, or to the C and not the page, never reaches a watch.
 *
 * @param off Offset into the face's settings struct.
 * @param table_count How many themes the face's own table holds, such as its THEME_COUNT.
 */
#define KNOWN_THEME(off, table_count) \
    { .id = SETTING_THEME, .message_key = &MESSAGE_KEY_APPEARANCE_THEME, \
      .type = SETTING_ENUM_U8, .offset = (off), \
      .enum_count = SETTINGS_COUNT_CHECKED(APPEARANCE_THEME, table_count), \
      .default_num = SETTINGS_DEFAULT(APPEARANCE_THEME) }

/**
 * @brief Setting definition for Steps Mode.
 * @param off Offset into the face's settings struct.
 */
#define KNOWN_STEPS_MODE(off) \
    { .id = SETTING_STEPS_MODE, .message_key = &MESSAGE_KEY_HEALTH_STEPS_MODE, \
      .type = SETTING_ENUM_U8, .offset = (off), .enum_count = STEPS_MODE_COUNT, \
      .default_num = SETTINGS_DEFAULT(HEALTH_STEPS_MODE) }

/**
 * @brief Setting definition for Distance Unit.
 * @param off Offset into the face's settings struct.
 */
#define KNOWN_DISTANCE_UNIT(off) \
    { .id = SETTING_DISTANCE_UNIT, .message_key = &MESSAGE_KEY_HEALTH_DISTANCE_UNIT, \
      .type = SETTING_ENUM_U8, .offset = (off), .enum_count = DISTANCE_UNIT_COUNT, \
      .default_num = SETTINGS_DEFAULT(HEALTH_DISTANCE_UNIT) }

/**
 * @brief Setting definition for Time Format.
 * @param off Offset into the face's settings struct.
 */
#define KNOWN_TIME_FORMAT(off) \
    { .id = SETTING_TIME_FORMAT, .message_key = &MESSAGE_KEY_CLOCK_TIME_FORMAT, \
      .type = SETTING_ENUM_U8, .offset = (off), .enum_count = TIME_FORMAT_COUNT, \
      .default_num = SETTINGS_DEFAULT(CLOCK_TIME_FORMAT), .affects_layout = true }

/**
 * @brief Setting definition for Bluetooth Icon.
 * @param off Offset into the face's settings struct.
 */
#define KNOWN_BLUETOOTH_ICON(off) \
    { .id = SETTING_BLUETOOTH_ICON, .message_key = &MESSAGE_KEY_CONNECTION_BLUETOOTH_ICON, \
      .type = SETTING_BOOL, .offset = (off), .default_num = SETTINGS_DEFAULT(CONNECTION_BLUETOOTH_ICON) }

/**
 * @brief Setting definition for the Quiet Time Icon.
 * @param off Offset into the face's settings struct.
 */
#define KNOWN_QUIET_TIME_ICON(off) \
    { .id = SETTING_QUIET_TIME_ICON, .message_key = &MESSAGE_KEY_APPEARANCE_QUIET_TIME_ICON, \
      .type = SETTING_BOOL, .offset = (off), .default_num = SETTINGS_DEFAULT(APPEARANCE_QUIET_TIME_ICON) }

/**
 * @brief Setting definition for Bluetooth Vibe Connect.
 * @param off Offset into the face's settings struct.
 */
#define KNOWN_BLUETOOTH_VIBE_CONNECT(off) \
    { .id = SETTING_BLUETOOTH_VIBE_CONNECT, .message_key = &MESSAGE_KEY_CONNECTION_VIBE_CONNECT, \
      .type = SETTING_ENUM_U8, .offset = (off), .enum_count = VIBE_COUNT, \
      .default_num = SETTINGS_DEFAULT(CONNECTION_VIBE_CONNECT) }

/**
 * @brief Setting definition for Bluetooth Vibe Disconnect.
 * @param off Offset into the face's settings struct.
 */
#define KNOWN_BLUETOOTH_VIBE_DISCONNECT(off) \
    { .id = SETTING_BLUETOOTH_VIBE_DISCONNECT, .message_key = &MESSAGE_KEY_CONNECTION_VIBE_DISCONNECT, \
      .type = SETTING_ENUM_U8, .offset = (off), .enum_count = VIBE_COUNT, \
      .default_num = SETTINGS_DEFAULT(CONNECTION_VIBE_DISCONNECT) }

/**
 * @brief Setting definition for the Hourly Vibration (a VibeChoice fired at the top of each hour).
 * @param off Offset into the face's settings struct.
 */
#define KNOWN_HOURLY_VIBE(off) \
    { .id = SETTING_HOURLY_VIBE, .message_key = &MESSAGE_KEY_CLOCK_HOURLY_VIBE, \
      .type = SETTING_ENUM_U8, .offset = (off), .enum_count = VIBE_COUNT, \
      .default_num = SETTINGS_DEFAULT(CLOCK_HOURLY_VIBE) }

/**
 * @brief Setting definition for Battery Display (icon + percent / icon / percent).
 * @param off Offset into the face's settings struct.
 */
#define KNOWN_BATTERY_DISPLAY(off) \
    { .id = SETTING_BATTERY_DISPLAY, .message_key = &MESSAGE_KEY_BATTERY_DISPLAY, \
      .type = SETTING_ENUM_U8, .offset = (off), .enum_count = BATTERY_DISPLAY_COUNT, \
      .default_num = SETTINGS_DEFAULT(BATTERY_DISPLAY) }

/**
 * @brief Setting definition for Wind Unit, the WindUnit a wind speed reads out in.
 *
 * Kilometres per hour, then miles per hour, knots, and metres per second, the order the settings
 * page's row lists them. The default is the one the page opens with, from SETTINGS_DEFAULT, and
 * kilometres per hour on a page with no wind unit row. Read it with
 * `settings_u8(SETTING_WIND_UNIT)` and hand it to `wind_from_kmh` and `wind_unit_label`.
 *
 * @param off Offset into the face's settings struct.
 */
#define KNOWN_WIND_UNIT(off) \
    { .id = SETTING_WIND_UNIT, .message_key = &MESSAGE_KEY_WEATHER_WIND_UNIT, \
      .type = SETTING_ENUM_U8, .offset = (off), .enum_count = WIND_UNIT_COUNT, \
      .default_num = SETTINGS_DEFAULT(WEATHER_WIND_UNIT) }

/**
 * @brief Setting definition for the Step Goal, an index into goals_steps.
 *
 * The goal tables are the framework's, in `health/goals.h`, and the page's rows are the ones
 * `goal-rows.ts` builds. The count is the page's, from SETTINGS_COUNT, and the build stops when it
 * differs from the table, so a choice the page offers always has a goal behind it. Read it with
 * `goals_steps(settings_u8(SETTING_GOAL_STEPS))`. The other goal entries work the same way.
 *
 * @param off Offset into the face's settings struct.
 */
#define KNOWN_GOAL_STEPS(off) \
    { .id = SETTING_GOAL_STEPS, .message_key = &MESSAGE_KEY_HEALTH_GOAL_STEPS, \
      .type = SETTING_ENUM_U8, .offset = (off), \
      .enum_count = SETTINGS_COUNT_CHECKED(HEALTH_GOAL_STEPS, GOALS_STEPS_COUNT), \
      .default_num = SETTINGS_DEFAULT(HEALTH_GOAL_STEPS) }

/**
 * @brief Setting definition for the Distance Goal, an index into goals_distance_m.
 * @param off Offset into the face's settings struct.
 */
#define KNOWN_GOAL_DISTANCE(off) \
    { .id = SETTING_GOAL_DISTANCE, .message_key = &MESSAGE_KEY_HEALTH_GOAL_DISTANCE, \
      .type = SETTING_ENUM_U8, .offset = (off), \
      .enum_count = SETTINGS_COUNT_CHECKED(HEALTH_GOAL_DISTANCE, GOALS_DISTANCE_COUNT), \
      .default_num = SETTINGS_DEFAULT(HEALTH_GOAL_DISTANCE) }

/**
 * @brief Setting definition for the Calorie Goal, an index into goals_calories.
 * @param off Offset into the face's settings struct.
 */
#define KNOWN_GOAL_CALORIES(off) \
    { .id = SETTING_GOAL_CALORIES, .message_key = &MESSAGE_KEY_HEALTH_GOAL_CALORIES, \
      .type = SETTING_ENUM_U8, .offset = (off), \
      .enum_count = SETTINGS_COUNT_CHECKED(HEALTH_GOAL_CALORIES, GOALS_CALORIES_COUNT), \
      .default_num = SETTINGS_DEFAULT(HEALTH_GOAL_CALORIES) }

/**
 * @brief Setting definition for the Activity Goal, an index into goals_active_min.
 * @param off Offset into the face's settings struct.
 */
#define KNOWN_GOAL_ACTIVE(off) \
    { .id = SETTING_GOAL_ACTIVE, .message_key = &MESSAGE_KEY_HEALTH_GOAL_ACTIVE, \
      .type = SETTING_ENUM_U8, .offset = (off), \
      .enum_count = SETTINGS_COUNT_CHECKED(HEALTH_GOAL_ACTIVE, GOALS_ACTIVE_COUNT), \
      .default_num = SETTINGS_DEFAULT(HEALTH_GOAL_ACTIVE) }

/**
 * @brief Setting definition for the Sleep Goal, an index into goals_sleep_min.
 * @param off Offset into the face's settings struct.
 */
#define KNOWN_GOAL_SLEEP(off) \
    { .id = SETTING_GOAL_SLEEP, .message_key = &MESSAGE_KEY_HEALTH_GOAL_SLEEP, \
      .type = SETTING_ENUM_U8, .offset = (off), \
      .enum_count = SETTINGS_COUNT_CHECKED(HEALTH_GOAL_SLEEP, GOALS_SLEEP_COUNT), \
      .default_num = SETTINGS_DEFAULT(HEALTH_GOAL_SLEEP) }

/**
 * @brief Setting definition for the Heart Rate Limit, an index into goals_hr_limit.
 *
 * The page only has the Heart Rate Limit row when the face asks for it with `heartRate`, so a face
 * that places this without the row stops the build with SETTINGS_COUNT_HEALTH_GOAL_HR undeclared.
 *
 * @param off Offset into the face's settings struct.
 */
#define KNOWN_GOAL_HR(off) \
    { .id = SETTING_GOAL_HR, .message_key = &MESSAGE_KEY_HEALTH_GOAL_HR, \
      .type = SETTING_ENUM_U8, .offset = (off), \
      .enum_count = SETTINGS_COUNT_CHECKED(HEALTH_GOAL_HR, GOALS_HR_COUNT), \
      .default_num = SETTINGS_DEFAULT(HEALTH_GOAL_HR) }

/**
 * @brief Setting definition for the Goal Met Vibration, the pick vibe_goal plays.
 *
 * The pick is text, empty for None, a letter for a plain pulse or the wearer's own pattern, or a comma
 * list of milliseconds, as `goal_vibe_pattern.h` reads it. It keeps 64 bytes, room for the longest
 * option the page offers and its end, and goal-rows.spec.ts checks every option fits. A face keeps
 * this and KNOWN_GOAL_VIBE_CUSTOM in a schema of their own when its main struct has no room for them.
 *
 * It takes the struct and the member rather than an offset, so the build stops on a member that is
 * not exactly 64 bytes. A shorter one would have the pick written past its end.
 *
 * @param blob The face's settings struct.
 * @param member The `char[64]` member that holds the pick.
 */
#define KNOWN_GOAL_VIBE(blob, member) \
    { .id = SETTING_GOAL_VIBE, .message_key = &MESSAGE_KEY_HEALTH_GOAL_VIBE, \
      .type = SETTING_CSTRING, SETTINGS_TEXT_FIELD(blob, member, 64), \
      .default_str = SETTINGS_DEFAULT(HEALTH_GOAL_VIBE) }

/**
 * @brief Setting definition for the Custom Vibration Pattern, which vibe_goal plays when the pick is
 * Custom.
 *
 * It keeps 122 bytes, room for the 120 characters the page's box takes and the end of the text. Only a
 * face that offers Custom, with `custom` on its goal alert rows, has the box and places this.
 *
 * Like KNOWN_GOAL_VIBE, it takes the struct and the member, so the build stops on a member that is
 * not exactly 122 bytes.
 *
 * @param blob The face's settings struct.
 * @param member The `char[122]` member that holds the pattern.
 */
#define KNOWN_GOAL_VIBE_CUSTOM(blob, member) \
    { .id = SETTING_GOAL_VIBE_CUSTOM, .message_key = &MESSAGE_KEY_HEALTH_GOAL_VIBE_CUSTOM, \
      .type = SETTING_CSTRING, SETTINGS_TEXT_FIELD(blob, member, 122), \
      .default_str = SETTINGS_DEFAULT(HEALTH_GOAL_VIBE_CUSTOM) }

/** @} */
