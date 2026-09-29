/**
 * @file zone_setting.spec.c
 * @brief Host tests for reading a time zone setting.
 *
 * The phone sends the zone as minutes then a comma and the name, and an empty setting once the
 * wearer clears the picker. Telling empty apart from UTC is the part worth pinning, since reading
 * empty as zero minutes showed a clock for a place nobody picked.
 */
#include "unity.h"

#include "clock/zone_setting.h"

void setUp(void) {}
void tearDown(void) {}

/** @brief A cleared picker is no zone, not UTC, or the panel shows a clock nobody asked for. */
void test_an_empty_setting_is_no_zone(void)
{
    bool result = zone_setting_is_set("");

    TEST_ASSERT_FALSE(result);
}

/** @brief A setting that was never read in is no zone either, rather than a crash. */
void test_a_missing_setting_is_no_zone(void)
{
    bool result = zone_setting_is_set(NULL);

    TEST_ASSERT_FALSE(result);
}

/** @brief UTC itself is a real zone, so zero minutes with a name still counts as set. */
void test_utc_is_a_zone(void)
{
    bool result = zone_setting_is_set("0,UTC");

    TEST_ASSERT_TRUE(result);
}

/** @brief The minutes stop at the comma, or the name's digits would run into the offset. */
void test_reads_the_minutes_before_the_comma(void)
{
    int16_t result = zone_setting_offset("330,Kolkata");

    TEST_ASSERT_EQUAL_INT(330, result);
}

/** @brief A zone behind UTC keeps its sign, or a New York clock runs ten hours fast. */
void test_reads_a_zone_behind_utc(void)
{
    int16_t result = zone_setting_offset("-300,New York");

    TEST_ASSERT_EQUAL_INT(-300, result);
}

/** @brief The name keeps its own commas, so a caller can still cut the city off the region. */
void test_the_label_is_everything_after_the_first_comma(void)
{
    const char *result = zone_setting_label("60,Paris, Ile-de-France, France");

    TEST_ASSERT_EQUAL_STRING("Paris, Ile-de-France, France", result);
}

/** @brief A setting with no comma has no name, so the label is empty rather than the offset. */
void test_a_setting_with_no_comma_has_no_label(void)
{
    const char *result = zone_setting_label("60");

    TEST_ASSERT_EQUAL_STRING("", result);
}

int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_an_empty_setting_is_no_zone);
    RUN_TEST(test_a_missing_setting_is_no_zone);
    RUN_TEST(test_utc_is_a_zone);
    RUN_TEST(test_reads_the_minutes_before_the_comma);
    RUN_TEST(test_reads_a_zone_behind_utc);
    RUN_TEST(test_the_label_is_everything_after_the_first_comma);
    RUN_TEST(test_a_setting_with_no_comma_has_no_label);

    return UNITY_END();
}
