/**
 * @file settings_catalog.spec.c
 * @brief Host tests for the shared entries, which take their counts and defaults from the page, and
 * the wind unit entry, which a face moves onto from a field of its own.
 *
 * paf build writes a SETTINGS_COUNT_<KEY> for each choice on the face's settings page and a
 * SETTINGS_DEFAULT_<KEY> for each default the page opens with. KNOWN_THEME and KNOWN_HEADER_FONT
 * clamp to the count once it matches the table the face passes. What is worth pinning is that a
 * matching count builds, with no warning on the way, and lands in the field the clamp reads, that a
 * default the page gives lands in the field a fresh watch starts from, and that a setting the page
 * does not show keeps the framework's own default. The counts that have to stop the build sit in
 * tests/c/spec/stops/.
 *
 * A face that kept the wind unit in a field of its own, four units with km/h first, swaps it for
 * KNOWN_WIND_UNIT on the same key, so the entry has to clamp and default the same way or a saved unit
 * would change on the wearer's watch.
 */
#define SETTINGS_COUNT_APPEARANCE_THEME 4
#define SETTINGS_COUNT_APPEARANCE_HEADER_FONT 8
#define SETTINGS_DEFAULT_APPEARANCE_THEME 3
#define SETTINGS_DEFAULT_CLOCK_DATE_FORMAT "%a %d %b"
#define SETTINGS_DEFAULT_CONNECTION_VIBE_CONNECT 2

#include "unity.h"

#include "system/settings/settings_catalog.h"

uint32_t MESSAGE_KEY_APPEARANCE_THEME = 1;
uint32_t MESSAGE_KEY_APPEARANCE_HEADER_FONT = 2;
uint32_t MESSAGE_KEY_WEATHER_WIND_UNIT = 3;
uint32_t MESSAGE_KEY_CLOCK_DATE_FORMAT = 4;
uint32_t MESSAGE_KEY_CONNECTION_BLUETOOTH_ICON = 5;
uint32_t MESSAGE_KEY_CONNECTION_VIBE_CONNECT = 6;

void setUp(void) {}
void tearDown(void) {}

/** @brief The theme count is the page's, so the watch takes the last theme the page offers and nothing past it. */
void test_known_theme_takes_the_page_count(void)
{
    static const SettingField fields[] = { KNOWN_THEME(0, 4) };

    uint8_t result = fields[0].enum_count;

    TEST_ASSERT_EQUAL_UINT8(4, result);
}

/** @brief The header font count is the page's, so the watch takes the last font the page offers and nothing past it. */
void test_known_header_font_takes_the_page_count(void)
{
    static const SettingField fields[] = { KNOWN_HEADER_FONT(1, 8) };

    uint8_t result = fields[0].enum_count;

    TEST_ASSERT_EQUAL_UINT8(8, result);
}

/**
 * @brief A saved unit keeps its meaning, so the four units from km/h up all read back, and a fresh
 * watch on a page that gives no wind unit default starts on km/h.
 */
void test_known_wind_unit_keeps_the_four_units_with_kmh_first(void)
{
    static const SettingField fields[] = { KNOWN_WIND_UNIT(2) };

    const SettingField *result = &fields[0];

    TEST_ASSERT_EQUAL_PTR(&MESSAGE_KEY_WEATHER_WIND_UNIT, result->message_key);
    TEST_ASSERT_EQUAL_INT(SETTING_ENUM_U8, result->type);
    TEST_ASSERT_EQUAL_UINT8(4, result->enum_count);
    TEST_ASSERT_EQUAL_UINT32(0, result->default_num);
}

/** @brief A fresh watch starts on the theme the page opens with, not on the first one in the table. */
void test_known_theme_takes_the_page_default(void)
{
    static const SettingField fields[] = { KNOWN_THEME(0, 4) };

    uint32_t result = fields[0].default_num;

    TEST_ASSERT_EQUAL_UINT32(3, result);
}

/** @brief A fresh watch shows the date the page says it does, so the two can never start out different. */
void test_known_date_format_takes_the_page_default(void)
{
    static const SettingField fields[] = { KNOWN_DATE_FORMAT(0) };

    const char *result = fields[0].default_str;

    TEST_ASSERT_EQUAL_STRING("%a %d %b", result);
}

/** @brief A framework list takes the page's default as well as the framework's count. */
void test_known_vibe_takes_the_page_default(void)
{
    static const SettingField fields[] = { KNOWN_BLUETOOTH_VIBE_CONNECT(0) };

    uint32_t result = fields[0].default_num;

    TEST_ASSERT_EQUAL_UINT32(2, result);
}

/** @brief A face whose page has no Bluetooth icon toggle still shows the icon, the framework's own default. */
void test_known_bluetooth_icon_keeps_its_own_default_off_the_page(void)
{
    static const SettingField fields[] = { KNOWN_BLUETOOTH_ICON(0) };

    uint32_t result = fields[0].default_num;

    TEST_ASSERT_EQUAL_UINT32(1, result);
}

int main(void)
{
    UNITY_BEGIN();
    RUN_TEST(test_known_theme_takes_the_page_count);
    RUN_TEST(test_known_header_font_takes_the_page_count);
    RUN_TEST(test_known_wind_unit_keeps_the_four_units_with_kmh_first);
    RUN_TEST(test_known_theme_takes_the_page_default);
    RUN_TEST(test_known_date_format_takes_the_page_default);
    RUN_TEST(test_known_vibe_takes_the_page_default);
    RUN_TEST(test_known_bluetooth_icon_keeps_its_own_default_off_the_page);
    return UNITY_END();
}
