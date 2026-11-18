/**
 * @file progress.spec.c
 * @brief Host tests for the hour, day, week, and year progress.
 *
 * A bar that reads 100% before the period is over, or that runs on the wrong length of year or
 * the wrong first day of the week, is wrong all day and looks fine in review. The boundaries
 * are what these tests pin down: the first and last second of each period, the week start the
 * wearer picked, the leap rule, and a late day in a leap year, where a year of seconds times 100
 * would overflow a 32 bit int.
 */
#include "unity.h"

#include "clock/progress.h"

void setUp(void) {}
void tearDown(void) {}

/** @brief The very start of an hour reads nothing done. */
void test_hour_pct_start_is_0(void)
{
    int result = progress_hour_pct(0, 0);

    TEST_ASSERT_EQUAL_INT(0, result);
}

/** @brief Half past is halfway through the hour, or every hour bar is off by the same amount. */
void test_hour_pct_half_past_is_50(void)
{
    int result = progress_hour_pct(30, 0);

    TEST_ASSERT_EQUAL_INT(50, result);
}

/** @brief The last second of an hour stays at 99, so the bar never reads full with time to go. */
void test_hour_pct_last_second_is_99(void)
{
    int result = progress_hour_pct(59, 59);

    TEST_ASSERT_EQUAL_INT(99, result);
}

/** @brief Seconds count towards the hour, so the bar does not sit still for a whole minute. */
void test_hour_pct_counts_seconds(void)
{
    // 14m 59s is 899s of 3600, which is 24.97 percent and rounds down to 24
    int result = progress_hour_pct(14, 59);

    TEST_ASSERT_EQUAL_INT(24, result);
}

/** @brief Midnight is the start of the day. */
void test_day_pct_midnight_is_0(void)
{
    int result = progress_day_pct(0, 0, 0);

    TEST_ASSERT_EQUAL_INT(0, result);
}

/** @brief Six in the morning is a quarter of the day, or the hours are weighted wrong. */
void test_day_pct_6am_is_25(void)
{
    int result = progress_day_pct(6, 0, 0);

    TEST_ASSERT_EQUAL_INT(25, result);
}

/** @brief Noon is half of the day. */
void test_day_pct_noon_is_50(void)
{
    int result = progress_day_pct(12, 0, 0);

    TEST_ASSERT_EQUAL_INT(50, result);
}

/** @brief The last second of the day stays at 99 rather than reading a finished day. */
void test_day_pct_last_second_is_99(void)
{
    int result = progress_day_pct(23, 59, 59);

    TEST_ASSERT_EQUAL_INT(99, result);
}

/** @brief The first day of the week starts at zero, whichever day that is. */
void test_week_pct_monday_start_on_monday_is_0(void)
{
    int result = progress_week_pct(1, 1, 0, 0, 0);

    TEST_ASSERT_EQUAL_INT(0, result);
}

/** @brief Thursday noon is 3.5 of 7 days into a Monday-first week. */
void test_week_pct_thursday_noon_monday_start_is_50(void)
{
    int result = progress_week_pct(4, 1, 12, 0, 0);

    TEST_ASSERT_EQUAL_INT(50, result);
}

/** @brief Sunday is the last day of a Monday-first week, so its last second sits at the far end. */
void test_week_pct_sunday_end_monday_start_is_99(void)
{
    int result = progress_week_pct(0, 1, 23, 59, 59);

    TEST_ASSERT_EQUAL_INT(99, result);
}

/** @brief Sunday morning is the start of the week when weeks begin on Sunday. */
void test_week_pct_sunday_start_on_sunday_is_0(void)
{
    int result = progress_week_pct(0, 0, 0, 0, 0);

    TEST_ASSERT_EQUAL_INT(0, result);
}

/** @brief The same Sunday is the tail of a Monday-first week, not its start. */
void test_week_pct_sunday_midnight_monday_start_is_85(void)
{
    // six whole days of seven is 85.7 percent
    int result = progress_week_pct(0, 1, 0, 0, 0);

    TEST_ASSERT_EQUAL_INT(85, result);
}

/** @brief Saturday noon in a Sunday-first week is 6.5 of 7 days. */
void test_week_pct_saturday_noon_sunday_start_is_92(void)
{
    int result = progress_week_pct(6, 0, 12, 0, 0);

    TEST_ASSERT_EQUAL_INT(92, result);
}

/** @brief The day count wraps round, so Sunday in a Monday-first week is day 7 rather than day 0. */
void test_week_day_sunday_in_monday_week_is_7(void)
{
    int result = progress_week_day(0, 1);

    TEST_ASSERT_EQUAL_INT(7, result);
}

/** @brief The day count starts at 1 on a Sunday that opens the week. */
void test_week_day_sunday_first_day_is_1(void)
{
    int result = progress_week_day(0, 0);

    TEST_ASSERT_EQUAL_INT(1, result);
}

/** @brief The day count starts at 1 on a Monday that opens the week. */
void test_week_day_monday_first_day_is_1(void)
{
    int result = progress_week_day(1, 1);

    TEST_ASSERT_EQUAL_INT(1, result);
}

/**
 * @brief A week start past Saturday wraps round to the weekday it lands on.
 *
 * A face that adds to the wearer's choice and never wraps it passes 8 for Monday. C keeps the sign of
 * a negative remainder, so a plain % 7 counted that Sunday as day 0 of 7.
 */
void test_week_day_start_past_saturday_wraps(void)
{
    int result = progress_week_day(0, 8);

    TEST_ASSERT_EQUAL_INT(7, result);
}

/** @brief A week start below Sunday wraps round too, so -1 starts the week on Saturday and Sunday is day 2. */
void test_week_day_start_below_sunday_wraps(void)
{
    int result = progress_week_day(0, -1);

    TEST_ASSERT_EQUAL_INT(2, result);
}

/** @brief New Year's Day at midnight is the start of the year. */
void test_year_pct_jan1_midnight_is_0(void)
{
    int result = progress_year_pct(2026, 0, 0, 0, 0);

    TEST_ASSERT_EQUAL_INT(0, result);
}

/** @brief Noon on 2 July is exactly half of a 365 day year. */
void test_year_pct_jul2_noon_2026_is_50(void)
{
    // yday 182 plus half a day is 182.5 of 365
    int result = progress_year_pct(2026, 182, 12, 0, 0);

    TEST_ASSERT_EQUAL_INT(50, result);
}

/** @brief A leap year is 366 days long, so the same date reads slightly less done. */
void test_year_pct_jul2_noon_2024_is_49(void)
{
    // 182.5 of 366 is 49.86 percent
    int result = progress_year_pct(2024, 182, 12, 0, 0);

    TEST_ASSERT_EQUAL_INT(49, result);
}

/** @brief The last second of a 365 day year stays at 99 rather than reading a finished year. */
void test_year_pct_last_second_is_99(void)
{
    int result = progress_year_pct(2026, 364, 23, 59, 59);

    TEST_ASSERT_EQUAL_INT(99, result);
}

/** @brief The last second of a leap year, on its 366th day, stays at 99 too. */
void test_year_pct_last_second_of_leap_year_is_99(void)
{
    int result = progress_year_pct(2024, 365, 23, 59, 59);

    TEST_ASSERT_EQUAL_INT(99, result);
}

/** @brief 2100 divides by 100 but not by 400, so it is not a leap year and runs 365 days. */
void test_year_pct_2100_is_not_leap(void)
{
    // 182.5 of 365 is exactly 50
    int result = progress_year_pct(2100, 182, 12, 0, 0);

    TEST_ASSERT_EQUAL_INT(50, result);
}

/** @brief 2000 divides by 400, so it is a leap year and runs 366 days. */
void test_year_pct_2000_is_leap(void)
{
    // 182.5 of 366 is 49.86 percent
    int result = progress_year_pct(2000, 182, 12, 0, 0);

    TEST_ASSERT_EQUAL_INT(49, result);
}

/** @brief A year of seconds times 100 runs past a 32 bit int, and must not wrap to a wrong percent. */
void test_year_pct_late_in_a_long_year_does_not_overflow(void)
{
    // 300 days of a 366 day year is 81.97 percent
    int result = progress_year_pct(2024, 300, 0, 0, 0);

    TEST_ASSERT_EQUAL_INT(81, result);
}

int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_hour_pct_start_is_0);
    RUN_TEST(test_hour_pct_half_past_is_50);
    RUN_TEST(test_hour_pct_last_second_is_99);
    RUN_TEST(test_hour_pct_counts_seconds);
    RUN_TEST(test_day_pct_midnight_is_0);
    RUN_TEST(test_day_pct_6am_is_25);
    RUN_TEST(test_day_pct_noon_is_50);
    RUN_TEST(test_day_pct_last_second_is_99);
    RUN_TEST(test_week_pct_monday_start_on_monday_is_0);
    RUN_TEST(test_week_pct_thursday_noon_monday_start_is_50);
    RUN_TEST(test_week_pct_sunday_end_monday_start_is_99);
    RUN_TEST(test_week_pct_sunday_start_on_sunday_is_0);
    RUN_TEST(test_week_pct_sunday_midnight_monday_start_is_85);
    RUN_TEST(test_week_pct_saturday_noon_sunday_start_is_92);
    RUN_TEST(test_week_day_sunday_in_monday_week_is_7);
    RUN_TEST(test_week_day_sunday_first_day_is_1);
    RUN_TEST(test_week_day_monday_first_day_is_1);
    RUN_TEST(test_week_day_start_past_saturday_wraps);
    RUN_TEST(test_week_day_start_below_sunday_wraps);
    RUN_TEST(test_year_pct_jan1_midnight_is_0);
    RUN_TEST(test_year_pct_jul2_noon_2026_is_50);
    RUN_TEST(test_year_pct_jul2_noon_2024_is_49);
    RUN_TEST(test_year_pct_last_second_is_99);
    RUN_TEST(test_year_pct_last_second_of_leap_year_is_99);
    RUN_TEST(test_year_pct_2100_is_not_leap);
    RUN_TEST(test_year_pct_2000_is_leap);
    RUN_TEST(test_year_pct_late_in_a_long_year_does_not_overflow);

    return UNITY_END();
}
