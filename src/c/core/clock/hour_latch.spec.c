/**
 * @file hour_latch.spec.c
 * @brief Host tests for the hourly buzz latch.
 *
 * A face asks the latch on every tick, and more than one ticker can tick inside minute 0, so the
 * latch is the only thing between the wearer and a double buzz. The hour the clocks repeat when
 * they fall back has the same hour number as the one before it, so it is pinned on its own.
 */
#include "unity.h"

#include "clock/hour_latch.h"

// 2026-11-01 05:00:00 UTC, which is 01:00 daylight time in Toronto on the night the clocks fall back
#define FIRST_ONE_AM 1793509200
// an hour later the clocks fall back and read 01:00 again
#define SECOND_ONE_AM (FIRST_ONE_AM + 3600)

void setUp(void) {}
void tearDown(void) {}

/** @brief 10:23:45 began 23 minutes and 45 seconds earlier, at 10:00:00. */
void test_hour_latch_start_takes_off_the_minutes_and_seconds(void)
{
    time_t result = hour_latch_start(FIRST_ONE_AM + 1425, 23, 45);

    TEST_ASSERT_EQUAL_INT64(FIRST_ONE_AM, result);
}

/** @brief The first tick in minute 0 is the buzz, or the hour passes silently. */
void test_hour_latch_take_buzzes_the_first_tick_of_the_hour(void)
{
    HourLatch latch = HOUR_LATCH_EMPTY;

    bool result = hour_latch_take(&latch, 0, FIRST_ONE_AM);

    TEST_ASSERT_TRUE(result);
}

/** @brief A .beats tick landing in minute 0 after the minute tick must not buzz the hour again. */
void test_hour_latch_take_buzzes_an_hour_only_once(void)
{
    HourLatch latch = HOUR_LATCH_EMPTY;
    hour_latch_take(&latch, 0, FIRST_ONE_AM);

    bool result = hour_latch_take(&latch, 0, FIRST_ONE_AM);

    TEST_ASSERT_FALSE(result);
}

/** @brief A tick outside minute 0 never buzzes, or the watch buzzes every minute. */
void test_hour_latch_take_ignores_other_minutes(void)
{
    HourLatch latch = HOUR_LATCH_EMPTY;

    bool result = hour_latch_take(&latch, 1, FIRST_ONE_AM);

    TEST_ASSERT_FALSE(result);
}

/** @brief The repeated 01:00 in autumn shares its hour number with the first, but is its own hour. */
void test_hour_latch_take_buzzes_the_repeated_autumn_hour(void)
{
    HourLatch latch = HOUR_LATCH_EMPTY;
    hour_latch_take(&latch, 0, FIRST_ONE_AM);

    bool result = hour_latch_take(&latch, 0, SECOND_ONE_AM);

    TEST_ASSERT_TRUE(result);
}

/** @brief A face opened in minute 0 seeds its hour, so the tick sent on subscribe does not buzz again. */
void test_hour_latch_take_skips_a_seeded_hour(void)
{
    HourLatch latch = HOUR_LATCH_EMPTY;
    hour_latch_seed(&latch, FIRST_ONE_AM);

    bool result = hour_latch_take(&latch, 0, FIRST_ONE_AM);

    TEST_ASSERT_FALSE(result);
}

/** @brief Seeding one hour must not silence the next. */
void test_hour_latch_take_buzzes_the_hour_after_a_seed(void)
{
    HourLatch latch = HOUR_LATCH_EMPTY;
    hour_latch_seed(&latch, FIRST_ONE_AM);

    bool result = hour_latch_take(&latch, 0, SECOND_ONE_AM);

    TEST_ASSERT_TRUE(result);
}

int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_hour_latch_start_takes_off_the_minutes_and_seconds);
    RUN_TEST(test_hour_latch_take_buzzes_the_first_tick_of_the_hour);
    RUN_TEST(test_hour_latch_take_buzzes_an_hour_only_once);
    RUN_TEST(test_hour_latch_take_ignores_other_minutes);
    RUN_TEST(test_hour_latch_take_buzzes_the_repeated_autumn_hour);
    RUN_TEST(test_hour_latch_take_skips_a_seeded_hour);
    RUN_TEST(test_hour_latch_take_buzzes_the_hour_after_a_seed);

    return UNITY_END();
}
