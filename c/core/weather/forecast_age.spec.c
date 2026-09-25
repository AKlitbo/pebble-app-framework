/**
 * @file forecast_age.spec.c
 * @brief Host tests for how much of a forecast strip has gone by.
 *
 * A strip stays on the watch when only the forecast half of a fetch fails, while the current
 * reading keeps updating. Counting what is over is what stops a 10 PM face labelling its columns
 * 2 PM and 4 PM, so the edges worth pinning are the column still under way and the clamp.
 */
#include "unity.h"

#include "weather/forecast_age.h"

void setUp(void) {}
void tearDown(void) {}

/** @brief A column in progress still shows, or the strip loses the hour it is in. */
void test_forecast_hours_past_keeps_the_column_under_way(void)
{
    uint8_t result = forecast_hours_past(3599, 1, 16);

    TEST_ASSERT_EQUAL_UINT8(0, result);
}

/** @brief Once a column's whole hour is over it drops, so the row starts at the hour now. */
void test_forecast_hours_past_drops_a_finished_column(void)
{
    uint8_t result = forecast_hours_past(3600, 1, 16);

    TEST_ASSERT_EQUAL_UINT8(1, result);
}

/** @brief A two-hour step counts over its own span, not hour by hour. */
void test_forecast_hours_past_counts_in_steps(void)
{
    uint8_t result = forecast_hours_past(5 * 3600, 2, 8);

    TEST_ASSERT_EQUAL_UINT8(2, result);
}

/** @brief A strip whose first column is still to come has nothing over. */
void test_forecast_hours_past_before_the_strip_starts(void)
{
    uint8_t result = forecast_hours_past(-1800, 1, 16);

    TEST_ASSERT_EQUAL_UINT8(0, result);
}

/** @brief A strip older than all its columns is over whole, never more than it holds. */
void test_forecast_hours_past_stops_at_the_count(void)
{
    uint8_t result = forecast_hours_past(40 * 3600, 1, 16);

    TEST_ASSERT_EQUAL_UINT8(16, result);
}

/** @brief A daily strip that starts today has no day over, or today's column goes missing. */
void test_forecast_days_past_keeps_today(void)
{
    uint8_t result = forecast_days_past(0, 8);

    TEST_ASSERT_EQUAL_UINT8(0, result);
}

/** @brief A strip whose first day was yesterday drops yesterday, so the row starts on today. */
void test_forecast_days_past_drops_yesterday(void)
{
    uint8_t result = forecast_days_past(1, 8);

    TEST_ASSERT_EQUAL_UINT8(1, result);
}

/** @brief A strip whose first day is still to come loses nothing, so a late evening strip that opens on tomorrow stays whole. */
void test_forecast_days_past_before_the_strip_starts(void)
{
    uint8_t result = forecast_days_past(-1, 8);

    TEST_ASSERT_EQUAL_UINT8(0, result);
}

/** @brief A strip older than all its days is over whole, never more than it holds. */
void test_forecast_days_past_stops_at_the_count(void)
{
    uint8_t result = forecast_days_past(20, 8);

    TEST_ASSERT_EQUAL_UINT8(8, result);
}

int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_forecast_hours_past_keeps_the_column_under_way);
    RUN_TEST(test_forecast_hours_past_drops_a_finished_column);
    RUN_TEST(test_forecast_hours_past_counts_in_steps);
    RUN_TEST(test_forecast_hours_past_before_the_strip_starts);
    RUN_TEST(test_forecast_hours_past_stops_at_the_count);
    RUN_TEST(test_forecast_days_past_keeps_today);
    RUN_TEST(test_forecast_days_past_drops_yesterday);
    RUN_TEST(test_forecast_days_past_before_the_strip_starts);
    RUN_TEST(test_forecast_days_past_stops_at_the_count);

    return UNITY_END();
}
