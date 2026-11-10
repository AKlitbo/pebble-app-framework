/**
 * @file plugin_source.h
 * @brief The struct the framework keeps the weather and calendar source choice in, for a face built
 * with a plugin define, and the checks that decide which of the two it keeps.
 *
 * The watch never reads the choice. It stores what the settings page saves and sends it back when the
 * phone asks for the watch's settings, so a wearer who picked the Pebble app's plugin still has it
 * after the Pebble app is reinstalled. settings.c builds its schema from PLUGIN_SOURCE_FIELDS and
 * walks it after the face's own, on SETTINGS_PLUGIN_SOURCE_KEY, so the face writes no field of its own
 * for it. A save skips the write while flash already holds the choices.
 *
 * A kind keeps its choice when its define is on and the face declares its select key. The build
 * refuses the select key beside a plugin only providers list, so a plugin only kind keeps nothing.
 * The build also writes each kept kind's default as PLUGIN_SOURCE_WEATHER_DEFAULT or
 * PLUGIN_SOURCE_CALENDAR_DEFAULT, from the face's providers list, so the watch's default is always
 * the settings page's. The build stops when the face's own picker does not offer it, or when the
 * page opens on another source.
 *
 * @ingroup lib_settings
 */
#pragma once
#include "system/settings/settings.h"

#include <stddef.h>
#include <string.h>

/**
 * @addtogroup lib_settings
 * @{
 */

/// 1 when the watch keeps the weather source choice, for a face with PLUGIN_WEATHER and WEATHER_PROVIDER
#if defined(PLUGIN_WEATHER) && PLUGIN_WEATHER && defined(HAS_MESSAGE_KEY_WEATHER_PROVIDER)
#define PLUGIN_SOURCE_KEEPS_WEATHER 1
#else
#define PLUGIN_SOURCE_KEEPS_WEATHER 0
#endif

/// 1 when the watch keeps the calendar source choice, for a face with PLUGIN_CALENDAR and CALENDAR_SOURCE
#if defined(PLUGIN_CALENDAR) && PLUGIN_CALENDAR && defined(HAS_MESSAGE_KEY_CALENDAR_SOURCE)
#define PLUGIN_SOURCE_KEEPS_CALENDAR 1
#else
#define PLUGIN_SOURCE_KEEPS_CALENDAR 0
#endif

/// The watch keeps at least one source choice, so the framework's schema joins the chain
#define PLUGIN_SOURCE_KEEPS_ANY (PLUGIN_SOURCE_KEEPS_WEATHER || PLUGIN_SOURCE_KEEPS_CALENDAR)

/**
 * @brief The size of the weather source buffer. `weatherapi` is the longest value the settings page
 * saves, and its 10 characters plus its end leave one byte spare.
 */
#define PLUGIN_SOURCE_WEATHER_LEN 12

/**
 * @brief The size of the calendar source buffer. `plugin` is the longest value the settings page
 * saves, and its 6 characters plus its end leave one byte spare.
 */
#define PLUGIN_SOURCE_CALENDAR_LEN 8

#define PLUGIN_SOURCE_VERSION    1   ///< The schema's version, raised by one with each appended field
#define PLUGIN_SOURCE_FIRST_SIZE 21  ///< The struct's size in its first release, which never changes

/**
 * @brief The saved choices, version byte first.
 *
 * Both buffers are always there, whichever kinds the face keeps. A face that turns its second kind on
 * in a later release then reads the same saved blob, and the new kind starts on its default.
 */
typedef struct
{
    uint8_t version;                            ///< The schema version this blob was saved at
    char    weather[PLUGIN_SOURCE_WEATHER_LEN];   ///< What the weather's Data Source select saved
    char    calendar[PLUGIN_SOURCE_CALENDAR_LEN]; ///< What the Calendar Source select saved
} PluginSourceSettings;

// a saved choice is read back from these offsets, so moving a field would read the other kind's
// bytes into it after an update. a new field goes on the end
_Static_assert(offsetof(PluginSourceSettings, weather) == 1, "the weather source moved, so older saves would read wrong");
_Static_assert(offsetof(PluginSourceSettings, calendar) == 13, "the calendar source moved, so older saves would read wrong");

#if PLUGIN_SOURCE_KEEPS_WEATHER
#ifndef PLUGIN_SOURCE_WEATHER_DEFAULT
#error "PLUGIN_WEATHER keeps the weather source on the watch, so it needs PLUGIN_SOURCE_WEATHER_DEFAULT. Build the face with paf build, which writes it from the providers list"
#endif
// the "" in front makes anything but a string literal stop the build
_Static_assert(sizeof("" PLUGIN_SOURCE_WEATHER_DEFAULT) > 1 && sizeof("" PLUGIN_SOURCE_WEATHER_DEFAULT) <= PLUGIN_SOURCE_WEATHER_LEN,
               "the default weather source has to be 1 to 11 characters, which is as much as the watch keeps");
#endif

#if PLUGIN_SOURCE_KEEPS_CALENDAR
#ifndef PLUGIN_SOURCE_CALENDAR_DEFAULT
#error "PLUGIN_CALENDAR keeps the calendar source on the watch, so it needs PLUGIN_SOURCE_CALENDAR_DEFAULT. Build the face with paf build, which writes it from the providers list"
#endif
_Static_assert(sizeof("" PLUGIN_SOURCE_CALENDAR_DEFAULT) > 1 && sizeof("" PLUGIN_SOURCE_CALENDAR_DEFAULT) <= PLUGIN_SOURCE_CALENDAR_LEN,
               "the default calendar source has to be 1 to 7 characters, which is as much as the watch keeps");
#endif

/**
 * @brief The field the framework keeps the weather source in, with a comma after it, or nothing when
 * the watch keeps no weather choice.
 *
 * It is a face-only text field, so it has no typed read. Its default is the one the build wrote from
 * the face's providers list, which is the settings page's own default. So a watch that never got a
 * save sends back the choice the phone would make anyway.
 */
#if PLUGIN_SOURCE_KEEPS_WEATHER
#define PLUGIN_SOURCE_WEATHER_FIELD \
    { .id = SETTING_COUNT, .message_key = &MESSAGE_KEY_WEATHER_PROVIDER, .type = SETTING_CSTRING, \
      .offset = offsetof(PluginSourceSettings, weather), .size = PLUGIN_SOURCE_WEATHER_LEN, \
      .default_str = PLUGIN_SOURCE_WEATHER_DEFAULT },
#else
#define PLUGIN_SOURCE_WEATHER_FIELD
#endif

/**
 * @brief The field the framework keeps the calendar source in, with a comma after it, or nothing when
 * the watch keeps no calendar choice. It works as the weather one does.
 */
#if PLUGIN_SOURCE_KEEPS_CALENDAR
#define PLUGIN_SOURCE_CALENDAR_FIELD \
    { .id = SETTING_COUNT, .message_key = &MESSAGE_KEY_CALENDAR_SOURCE, .type = SETTING_CSTRING, \
      .offset = offsetof(PluginSourceSettings, calendar), .size = PLUGIN_SOURCE_CALENDAR_LEN, \
      .default_str = PLUGIN_SOURCE_CALENDAR_DEFAULT },
#else
#define PLUGIN_SOURCE_CALENDAR_FIELD
#endif

/// The framework schema's whole field table, for inside its braces
#define PLUGIN_SOURCE_FIELDS PLUGIN_SOURCE_WEATHER_FIELD PLUGIN_SOURCE_CALENDAR_FIELD

/**
 * @brief Whether a save has to write the choices to flash.
 *
 * settings_save writes every schema on every save, and the choices only change when the wearer picks
 * another source. So the write is skipped while the choices match what flash holds. With nothing known
 * to be on flash it always writes, even when the choices are still the defaults. Skipping that write
 * would leave the key empty, and the watch would count as fresh on every launch.
 *
 * @param now The choices as they are now.
 * @param on_flash The choices as they were last loaded or written.
 * @param on_flash_known Whether @p on_flash is really what flash holds. False when the key was empty
 *   at launch, or was dropped for a blob the watch could not read.
 * @return True when the save has to write.
 */
static inline bool plugin_source_write_needed(const PluginSourceSettings *now, const PluginSourceSettings *on_flash,
                                              bool on_flash_known)
{
    return !on_flash_known || memcmp(now, on_flash, sizeof(*now)) != 0;
}

/** @} */
