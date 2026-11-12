/**
 * @file plugin_source.spec.c
 * @brief Host tests for the framework's plugin source schema, built with every kind on and their
 * defaults at the longest the watch keeps.
 *
 * settings.c builds its field table from PLUGIN_SOURCE_FIELDS, so this file builds the same one. What
 * is worth pinning is that a default at the limit still builds and is kept whole, that each kind's
 * field rides its own key, and that a save skips the write only when flash already holds the choices.
 * A skip with nothing on flash would leave the key empty, and the watch would count as fresh on every
 * launch. The stock buffer is appended, so a blob saved before it has to read with the stock choice
 * on its default and the other two as saved. The defaults that have to stop the build sit in
 * tests/c/spec/stops/.
 */
#include "unity.h"

#include <stdint.h>

/// stand-ins for the SDK's message keys, which the field table names by address
uint32_t MESSAGE_KEY_WEATHER_PROVIDER = 10;
uint32_t MESSAGE_KEY_CALENDAR_SOURCE = 11;
uint32_t MESSAGE_KEY_STOCK_PROVIDER = 12;

#define PLUGIN_WEATHER 1
#define HAS_MESSAGE_KEY_WEATHER_PROVIDER 1
#define PLUGIN_CALENDAR 1
#define HAS_MESSAGE_KEY_CALENDAR_SOURCE 1
#define PLUGIN_STOCKS 1
#define HAS_MESSAGE_KEY_STOCK_PROVIDER 1
// 11, 7, and 13 characters, the most each buffer keeps with its end
#define PLUGIN_SOURCE_WEATHER_DEFAULT "weatherabcd"
#define PLUGIN_SOURCE_CALENDAR_DEFAULT "calenda"
#define PLUGIN_SOURCE_STOCK_DEFAULT "stockabcdefgh"

#include "system/settings/plugin_source.h"
#include "text/cstring_fit.h"

#include <string.h>

void setUp(void) {}
void tearDown(void) {}

static const SettingField s_fields[] = { PLUGIN_SOURCE_FIELDS };

/** Gives every field its default the way settings.c does before a read, with the rest of the blob cleared. */
static void apply_defaults(PluginSourceSettings *settings)
{
    memset(settings, 0, sizeof(*settings));

    for (size_t i = 0; i < sizeof(s_fields) / sizeof(s_fields[0]); i++)
    {
        cstring_fit((char *)settings + s_fields[i].offset, s_fields[i].default_str, s_fields[i].size);
    }
}

/**
 * Reads a saved blob over the defaults the way settings.c does. A size under the first release's or
 * over the struct is refused, and a shorter blob leaves the bytes past its end on their defaults.
 */
static bool read_saved(PluginSourceSettings *settings, const uint8_t *saved, size_t size)
{
    if (size < PLUGIN_SOURCE_FIRST_SIZE || size > sizeof(*settings))
    {
        return false;
    }

    memcpy(settings, saved, size);
    return true;
}

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

/** @brief A 13 character stock default, as long as `alphavantage` and one more, is kept whole too. */
void test_stock_default_at_the_limit_is_kept_whole(void)
{
    PluginSourceSettings settings = {0};

    cstring_fit((char *)&settings + s_fields[2].offset, s_fields[2].default_str, s_fields[2].size);

    TEST_ASSERT_EQUAL_STRING("stockabcdefgh", settings.stock);
}

/** @brief Each kind's field rides its own select key, or a save of one source would land in another's buffer. */
void test_each_field_rides_its_own_key(void)
{
    size_t result = sizeof(s_fields) / sizeof(s_fields[0]);

    TEST_ASSERT_EQUAL_size_t(3, result);
    TEST_ASSERT_EQUAL_PTR(&MESSAGE_KEY_WEATHER_PROVIDER, s_fields[0].message_key);
    TEST_ASSERT_EQUAL_PTR(&MESSAGE_KEY_CALENDAR_SOURCE, s_fields[1].message_key);
    TEST_ASSERT_EQUAL_PTR(&MESSAGE_KEY_STOCK_PROVIDER, s_fields[2].message_key);
    TEST_ASSERT_EQUAL_UINT16(13, s_fields[1].offset);
    TEST_ASSERT_EQUAL_UINT16(21, s_fields[2].offset);
}

/**
 * @brief A version 1 blob, saved before the stock buffer, reads with the stock choice on its default.
 *
 * The watch keeps the blob through a face update. Turning that save away would drop the wearer's
 * weather and calendar picks, and reading the stock choice out of it would send back bytes past its end.
 */
void test_version_1_blob_reads_with_stock_on_its_default(void)
{
    uint8_t saved[21] = {0};
    saved[0] = 1;
    memcpy(&saved[1], "plugin", 7);
    memcpy(&saved[13], "plugin", 7);
    PluginSourceSettings settings;
    apply_defaults(&settings);

    bool result = read_saved(&settings, saved, sizeof(saved));

    TEST_ASSERT_TRUE(result);
    TEST_ASSERT_EQUAL_UINT8(1, settings.version);
    TEST_ASSERT_EQUAL_STRING("plugin", settings.weather);
    TEST_ASSERT_EQUAL_STRING("plugin", settings.calendar);
    TEST_ASSERT_EQUAL_STRING("stockabcdefgh", settings.stock);
}

/** @brief A version 2 blob brings the stock pick back, or a reset of the Pebble app would lose it. */
void test_version_2_blob_round_trips_the_stock_choice(void)
{
    PluginSourceSettings before = { .version = PLUGIN_SOURCE_VERSION, .weather = "openmeteo", .calendar = "ical", .stock = "plugin" };
    uint8_t saved[sizeof(PluginSourceSettings)];
    memcpy(saved, &before, sizeof(saved));
    PluginSourceSettings after;
    apply_defaults(&after);

    bool result = read_saved(&after, saved, sizeof(saved));

    TEST_ASSERT_TRUE(result);
    TEST_ASSERT_EQUAL_UINT8(2, after.version);
    TEST_ASSERT_EQUAL_STRING("plugin", after.stock);
    TEST_ASSERT_EQUAL_STRING("openmeteo", after.weather);
    TEST_ASSERT_EQUAL_STRING("ical", after.calendar);
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
    RUN_TEST(test_stock_default_at_the_limit_is_kept_whole);
    RUN_TEST(test_each_field_rides_its_own_key);
    RUN_TEST(test_version_1_blob_reads_with_stock_on_its_default);
    RUN_TEST(test_version_2_blob_round_trips_the_stock_choice);
    RUN_TEST(test_write_needed_with_nothing_on_flash);
    RUN_TEST(test_write_skipped_when_flash_holds_the_choices);
    RUN_TEST(test_write_needed_after_a_new_pick);
    return UNITY_END();
}
