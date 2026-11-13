/**
 * @file phone_level.spec.c
 * @brief Host tests for reading the phone's battery level off the wire.
 *
 * The level comes off a phone, so the edges are what matter. A level read as is past either end
 * draws a battery bar past full or below empty, and a no reading taken as a level shows -1% on a
 * face that only checks for the marker. The no plugin marker has to survive the read, or a face can
 * never say plugins are off.
 */
#include "unity.h"

#include "wire/phone_level.h"

void setUp(void) {}
void tearDown(void) {}

/** @brief A level in range is what the readout shows, so it comes through untouched. */
void test_a_level_in_range_reads_as_sent(void)
{
    int result = phone_level_read(84);

    TEST_ASSERT_EQUAL_INT(84, result);
}

/** @brief The phone's marker for no reading stays the marker, so the readout shows its placeholder. */
void test_the_no_reading_marker_reads_as_no_reading(void)
{
    int result = phone_level_read(-1);

    TEST_ASSERT_EQUAL_INT(PHONE_NO_LEVEL, result);
}

/** @brief Any other negative is no reading too, rather than a level a bar would draw backwards. */
void test_a_negative_reads_as_no_reading(void)
{
    int result = phone_level_read(-40);

    TEST_ASSERT_EQUAL_INT(PHONE_NO_LEVEL, result);
}

/** @brief The no plugin marker stays the marker, so the store can tell no plugin from no reading yet. */
void test_the_no_plugin_marker_reads_as_no_plugin(void)
{
    int result = phone_level_read(-2);

    TEST_ASSERT_EQUAL_INT(WIRE_NO_PLUGIN, result);
}

/** @brief A negative past the no plugin marker is plain no reading, so only the one value says no plugin. */
void test_a_negative_past_the_marker_reads_as_no_reading(void)
{
    int result = phone_level_read(-3);

    TEST_ASSERT_EQUAL_INT(PHONE_NO_LEVEL, result);
}

/** @brief A level past 100 reads as full, so a bar never runs past its end. */
void test_a_level_past_full_reads_as_full(void)
{
    int result = phone_level_read(250);

    TEST_ASSERT_EQUAL_INT(100, result);
}

/** @brief An empty phone is a real reading at 0, not the no reading marker. */
void test_zero_is_a_real_level(void)
{
    int result = phone_level_read(0);

    TEST_ASSERT_EQUAL_INT(0, result);
}

int main(void)
{
    UNITY_BEGIN();
    RUN_TEST(test_a_level_in_range_reads_as_sent);
    RUN_TEST(test_the_no_reading_marker_reads_as_no_reading);
    RUN_TEST(test_a_negative_reads_as_no_reading);
    RUN_TEST(test_the_no_plugin_marker_reads_as_no_plugin);
    RUN_TEST(test_a_negative_past_the_marker_reads_as_no_reading);
    RUN_TEST(test_a_level_past_full_reads_as_full);
    RUN_TEST(test_zero_is_a_real_level);
    return UNITY_END();
}
