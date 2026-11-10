/**
 * @file plugin_source.spec.c
 * @brief Host tests for the framework's plugin source schema, built with both kinds on and their
 * defaults at the longest the watch keeps.
 *
 * settings.c builds its field table from PLUGIN_SOURCE_FIELDS, so this file builds the same one. What
 * is worth pinning is that a default at the limit still builds and is kept whole, that each kind's
 * field rides its own key, and that a save skips the write only when flash already holds the choices.
 * A skip with nothing on flash would leave the key empty, and the watch would count as fresh on every
 * launch. The defaults that have to stop the build sit in tests/c/spec/stops/.
 */
#include "unity.h"

#include <stdint.h>

/// stand-ins for the SDK's message keys, which the field table names by address
uint32_t MESSAGE_KEY_WEATHER_PROVIDER = 10;
uint32_t MESSAGE_KEY_CALENDAR_SOURCE = 11;

#define PLUGIN_WEATHER 1
#define HAS_MESSAGE_KEY_WEATHER_PROVIDER 1
#define PLUGIN_CALENDAR 1
#define HAS_MESSAGE_KEY_CALENDAR_SOURCE 1
// 11 and 7 characters, the most each buffer keeps with its end
#define PLUGIN_SOURCE_WEATHER_DEFAULT "weatherabcd"
#define PLUGIN_SOURCE_CALENDAR_DEFAULT "calenda"

#include "system/settings/plugin_source.h"
#include "text/cstring_fit.h"

#include <string.h>

void setUp(void) {}
void tearDown(void) {}

static const SettingField s_fields[] = { PLUGIN_SOURCE_FIELDS };

/** @brief An 11 character weather default is kept whole, as the defaults pass writes it, rather than cut to fit. */
void test_weather_default_at_the_limit_is_kept_whole(void)
{
    PluginSourceSettings settings = {0};

    cstring_fit((char *)&settings + s_fields[0].offset, s_fields[0].default_str, s_fields[0].size);

    TEST_ASSERT_EQUAL_STRING("weatherabcd", settings.weather);
}

/** @brief A 7 character calendar default is kept whole too. */
void test_calendar_default_at_the_limit_is_kept_whole(void)
{
    PluginSourceSettings settings = {0};

    cstring_fit((char *)&settings + s_fields[1].offset, s_fields[1].default_str, s_fields[1].size);

    TEST_ASSERT_EQUAL_STRING("calenda", settings.calendar);
}

/** @brief Each kind's field rides its own select key, or a save of one source would land in the other's buffer. */
void test_each_field_rides_its_own_key(void)
{
    size_t result = sizeof(s_fields) / sizeof(s_fields[0]);

    TEST_ASSERT_EQUAL_size_t(2, result);
    TEST_ASSERT_EQUAL_PTR(&MESSAGE_KEY_WEATHER_PROVIDER, s_fields[0].message_key);
    TEST_ASSERT_EQUAL_PTR(&MESSAGE_KEY_CALENDAR_SOURCE, s_fields[1].message_key);
    TEST_ASSERT_EQUAL_UINT16(13, s_fields[1].offset);
}

/**
 * @brief With nothing known to be on flash the save writes, even with the choices on their defaults.
 *
 * A fresh watch holds the defaults. Skipping that write would leave the key empty, so every launch
 * would count as fresh and ask the phone to restore everything again.
 */
void test_write_needed_with_nothing_on_flash(void)
{
    PluginSourceSettings now = { .version = 1, .weather = "openmeteo", .calendar = "ical" };
    PluginSourceSettings on_flash = now;

    bool result = plugin_source_write_needed(&now, &on_flash, false);

    TEST_ASSERT_TRUE(result);
}

/** @brief A face save that leaves the choices alone writes nothing more to flash. */
void test_write_skipped_when_flash_holds_the_choices(void)
{
    PluginSourceSettings now = { .version = 1, .weather = "openmeteo", .calendar = "ical" };
    PluginSourceSettings on_flash = now;

    bool result = plugin_source_write_needed(&now, &on_flash, true);

    TEST_ASSERT_FALSE(result);
}

/** @brief A new pick is written, or a reset of the Pebble app would bring the old one back. */
void test_write_needed_after_a_new_pick(void)
{
    PluginSourceSettings on_flash = { .version = 1, .weather = "openmeteo", .calendar = "ical" };
    PluginSourceSettings now = on_flash;
    strcpy(now.weather, "plugin");

    bool result = plugin_source_write_needed(&now, &on_flash, true);

    TEST_ASSERT_TRUE(result);
}

int main(void)
{
    UNITY_BEGIN();
    RUN_TEST(test_weather_default_at_the_limit_is_kept_whole);
    RUN_TEST(test_calendar_default_at_the_limit_is_kept_whole);
    RUN_TEST(test_each_field_rides_its_own_key);
    RUN_TEST(test_write_needed_with_nothing_on_flash);
    RUN_TEST(test_write_skipped_when_flash_holds_the_choices);
    RUN_TEST(test_write_needed_after_a_new_pick);
    return UNITY_END();
}
