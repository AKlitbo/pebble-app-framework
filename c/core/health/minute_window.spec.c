/**
 * @file minute_window.spec.c
 * @brief Host tests for placing minute records in the heart rate window.
 *
 * The watch's minute log runs behind the clock and can start late, so the backfill has to place
 * each record by its own minute rather than by how many came back. Placing them by count drew old
 * readings as recent ones, which is the bug these pin.
 */
#include "unity.h"

#include "health/minute_window.h"

/** The minute the window ends on, somewhere in 2026, and the window's length. */
#define END_MIN 29600000
#define MINUTES 60

void setUp(void) {}
void tearDown(void) {}

/** @brief A log that is up to date starts at the window's first slot. */
void test_a_log_that_is_up_to_date_fills_from_the_first_slot(void)
{
    int result = minute_window_first_slot(END_MIN - 59, END_MIN, MINUTES);

    TEST_ASSERT_EQUAL_INT(0, result);
}

/**
 * @brief A log twelve minutes behind ends twelve slots short of the window's end.
 *
 * Its 48 records start at the window's first minute, so the last one belongs at slot 47. Placing
 * them by count drew readings from 12 to 60 minutes ago as the last 48 minutes after a first launch.
 */
void test_a_log_twelve_minutes_behind_ends_twelve_slots_short(void)
{
    int first = minute_window_first_slot(END_MIN - 59, END_MIN, MINUTES);

    int result = first + 48 - 1;

    TEST_ASSERT_EQUAL_INT(47, result);
}

/** @brief A log that starts partway into the window lands that far in. */
void test_a_log_that_starts_late_lands_further_in(void)
{
    int result = minute_window_first_slot(END_MIN - 10, END_MIN, MINUTES);

    TEST_ASSERT_EQUAL_INT(49, result);
}

/** @brief A record older than the window lands below zero, so the caller skips it. */
void test_a_record_older_than_the_window_lands_below_zero(void)
{
    int result = minute_window_first_slot(END_MIN - 70, END_MIN, MINUTES);

    TEST_ASSERT_EQUAL_INT(-11, result);
}

int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_a_log_that_is_up_to_date_fills_from_the_first_slot);
    RUN_TEST(test_a_log_twelve_minutes_behind_ends_twelve_slots_short);
    RUN_TEST(test_a_log_that_starts_late_lands_further_in);
    RUN_TEST(test_a_record_older_than_the_window_lands_below_zero);

    return UNITY_END();
}
