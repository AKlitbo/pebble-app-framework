/**
 * @file settings_catalog_fallback.spec.c
 * @brief Host tests for the defaults the shared entries keep when the settings page does not show
 * their setting.
 *
 * A face whose page leaves a shared setting out gets no SETTINGS_DEFAULT_<KEY> for it, so the entry
 * falls back to the framework's own. The date format is worth pinning, since the settings builder
 * opens its Date Format on the same value, and a face that shows the date on the watch but leaves the
 * row off its page would otherwise start on a different date line from one that shows it.
 */
#include "unity.h"

#include "system/settings/settings_catalog.h"

uint32_t MESSAGE_KEY_CLOCK_DATE_FORMAT = 1;

void setUp(void) {}
void tearDown(void) {}

/** @brief A page with no Date Format starts the watch on the builder's own default, the weekday, day, and month. */
void test_known_date_format_falls_back_to_the_builder_default(void)
{
    static const SettingField fields[] = { KNOWN_DATE_FORMAT(0) };

    const char *result = fields[0].default_str;

    TEST_ASSERT_EQUAL_STRING("%a %d %b", result);
}

int main(void)
{
    UNITY_BEGIN();
    RUN_TEST(test_known_date_format_falls_back_to_the_builder_default);
    return UNITY_END();
}
