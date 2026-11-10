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
 * A choice the face's own settings page lists, the theme and the header font, takes its
 * count from settings_page.h, which paf build writes into the sandbox from the page, and the
 * face passes the size of its own table so the build stops when the two disagree. A choice
 * the framework lists takes the framework's own count from setting_values.h, since the
 * watch can only draw the values its own enum names.
 *
 * Every entry takes its default from the same header, so a fresh watch starts on the value
 * the settings page opens with. A setting the page does not show keeps the framework's own
 * default.
 *
 * @ingroup lib_settings
 */
#pragma once
#include "system/settings/settings.h"
#include "system/settings/setting_values.h"
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
#define SETTINGS_DEFAULT_CLOCK_DATE_FORMAT "%Y.%m%d"
#endif
#ifndef SETTINGS_DEFAULT_APPEARANCE_THEME
#define SETTINGS_DEFAULT_APPEARANCE_THEME 0
#endif
#ifndef SETTINGS_DEFAULT_APPEARANCE_HEADER_FONT
#define SETTINGS_DEFAULT_APPEARANCE_HEADER_FONT 0
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
 * @param off Offset into the face's settings struct.
 */
#define KNOWN_DATE_FORMAT(off) \
    { .id = SETTING_DATE_FORMAT, .message_key = &MESSAGE_KEY_CLOCK_DATE_FORMAT, \
      .type = SETTING_CSTRING, .offset = (off), .size = 16, \
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
 * @brief Setting definition for Header Font, an index into the face's own header font table.
 *
 * The count is how many fonts the settings page offers, from SETTINGS_COUNT. The face passes how
 * many its own font table holds, and the build stops when the two differ.
 *
 * @param off Offset into the face's settings struct.
 * @param table_count How many fonts the face's own header font table holds.
 */
#define KNOWN_HEADER_FONT(off, table_count) \
    { .id = SETTING_HEADER_FONT, .message_key = &MESSAGE_KEY_APPEARANCE_HEADER_FONT, \
      .type = SETTING_ENUM_U8, .offset = (off), \
      .enum_count = SETTINGS_COUNT_CHECKED(APPEARANCE_HEADER_FONT, table_count), \
      .default_num = SETTINGS_DEFAULT(APPEARANCE_HEADER_FONT) }

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

/** @} */
