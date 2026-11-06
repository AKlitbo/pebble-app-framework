/**
 * @file hr_day.spec.c
 * @brief Host tests for today's heart rate by the hour.
 *
 * A panel draws these straight onto the screen. A slip shows as a bar in the wrong hour, a low of 0
 * from an hour that had no readings, or a day average pulled toward the quiet hours. Each looks
 * plausible on the wrist, so where a reading lands, what counts as none, and how the day's figures
 * weigh the hours are each pinned.
 */
#include "unity.h"

#include "health/hr_day.h"

void setUp(void) {}
void tearDown(void) {}

/** @brief An hour's bar is the average of its readings, rounded to the nearest beat. */
void test_hour_avg_rounds_to_the_nearest_beat(void)
{
    HrDay day;
    hr_day_clear(&day);
    hr_day_add(&day, 9, 70);
    hr_day_add(&day, 9, 71);

    int result = hr_day_hour_avg(&day, 9);

    TEST_ASSERT_EQUAL_INT(71, result);
}

/** @brief An hour with no readings answers none, so the chart leaves a gap rather than a bar at 0. */
void test_hour_avg_is_none_for_an_empty_hour(void)
{
    HrDay day;
    hr_day_clear(&day);
    hr_day_add(&day, 9, 70);

    int result = hr_day_hour_avg(&day, 10);

    TEST_ASSERT_EQUAL_INT(-1, result);
}

/** @brief A reading of 0 is the watch having none, so it never drags an hour's low down to 0. */
void test_add_leaves_out_a_missing_reading(void)
{
    HrDay day;
    hr_day_clear(&day);
    hr_day_add(&day, 9, 70);
    hr_day_add(&day, 9, 0);

    int low = 0;
    int avg = 0;
    int high = 0;
    hr_day_stats(&day, &low, &avg, &high);

    TEST_ASSERT_EQUAL_INT(70, low);
    TEST_ASSERT_EQUAL_INT(70, avg);
}

/** @brief An hour outside the day is left out rather than written past the end of the table. */
void test_add_leaves_out_an_hour_outside_the_day(void)
{
    HrDay day;
    hr_day_clear(&day);
    hr_day_add(&day, 24, 80);
    hr_day_add(&day, -1, 80);

    int low = 0;
    int avg = 0;
    int high = 0;
    hr_day_stats(&day, &low, &avg, &high);

    TEST_ASSERT_EQUAL_INT(-1, avg);
}

/** @brief The day's low and high come from single readings, not from the hourly averages. */
void test_stats_take_the_lowest_and_highest_reading(void)
{
    HrDay day;
    hr_day_clear(&day);
    hr_day_add(&day, 3, 52);
    hr_day_add(&day, 3, 60);
    hr_day_add(&day, 18, 90);
    hr_day_add(&day, 18, 140);

    int low = 0;
    int avg = 0;
    int high = 0;
    hr_day_stats(&day, &low, &avg, &high);

    TEST_ASSERT_EQUAL_INT(52, low);
    TEST_ASSERT_EQUAL_INT(140, high);
}

/**
 * @brief The day's average weighs every reading the same.
 *
 * An hour of steady readings and an hour with one reading in it would give 85 if the hours were
 * averaged, which overstates a day spent mostly at 70.
 */
void test_stats_weigh_each_reading_rather_than_each_hour(void)
{
    HrDay day;
    hr_day_clear(&day);
    hr_day_add(&day, 8, 70);
    hr_day_add(&day, 8, 70);
    hr_day_add(&day, 8, 70);
    hr_day_add(&day, 12, 100);

    int low = 0;
    int avg = 0;
    int high = 0;
    hr_day_stats(&day, &low, &avg, &high);

    TEST_ASSERT_EQUAL_INT(78, avg);
}

/** @brief A day with nothing in it answers none for all three, so the panel shows dashes. */
void test_stats_are_none_for_an_empty_day(void)
{
    HrDay day;
    hr_day_clear(&day);

    int low = 0;
    int avg = 0;
    int high = 0;
    hr_day_stats(&day, &low, &avg, &high);

    TEST_ASSERT_EQUAL_INT(-1, low);
    TEST_ASSERT_EQUAL_INT(-1, avg);
    TEST_ASSERT_EQUAL_INT(-1, high);
}

/** @brief A full hour stops taking readings rather than wrapping its count back to 0. */
void test_add_stops_at_a_full_hour(void)
{
    HrDay day;
    hr_day_clear(&day);
    for (int reading = 0; reading < 300; reading++)
    {
        hr_day_add(&day, 5, 255);
    }

    int result = hr_day_hour_avg(&day, 5);

    TEST_ASSERT_EQUAL_INT(255, result);
}

int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_hour_avg_rounds_to_the_nearest_beat);
    RUN_TEST(test_hour_avg_is_none_for_an_empty_hour);
    RUN_TEST(test_add_leaves_out_a_missing_reading);
    RUN_TEST(test_add_leaves_out_an_hour_outside_the_day);
    RUN_TEST(test_stats_take_the_lowest_and_highest_reading);
    RUN_TEST(test_stats_weigh_each_reading_rather_than_each_hour);
    RUN_TEST(test_stats_are_none_for_an_empty_day);
    RUN_TEST(test_add_stops_at_a_full_hour);

    return UNITY_END();
}
