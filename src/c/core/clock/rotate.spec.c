/**
 * @file rotate.spec.c
 * @brief Host tests for the timed rotation.
 *
 * The behaviour worth pinning is that the choice holds through a slot and steps by one when the
 * slot turns over, since a screen built on it would flicker between two on a boundary if it did not
 * hold, or sit on one forever if it did not step. The absolute choice for a given minute is
 * arbitrary for a shuffle, so the tests pin the relationships rather than a particular index.
 */
#include <stdbool.h>

#include "unity.h"

#include "clock/rotate.h"

void setUp(void) {}
void tearDown(void) {}

/** @brief The choice holds steady for the whole hour it is up, so the screen does not flicker mid-slot. */
void test_holds_through_the_slot(void)
{
    int result = rotate_index(125, 100, 5, 59, 60, 8);

    TEST_ASSERT_EQUAL_INT(rotate_index(125, 100, 5, 0, 60, 8), result);
}

/** @brief The next slot is the next one along, so every boundary is a change and never a repeat. */
void test_steps_by_one_on_the_boundary(void)
{
    int result = rotate_index(125, 100, 6, 0, 60, 8);

    TEST_ASSERT_EQUAL_INT((rotate_index(125, 100, 5, 0, 60, 8) + 1) % 8, result);
}

/** @brief After a full lap of count slots it is back where it started, so the cycle is exactly count long. */
void test_wraps_after_a_full_lap(void)
{
    int result = rotate_index(125, 100, 8, 0, 60, 8);

    TEST_ASSERT_EQUAL_INT(rotate_index(125, 100, 0, 0, 60, 8), result);
}

/** @brief A lap visits every one of the set, so none is ever skipped and none shown twice in a lap. */
void test_a_lap_visits_every_one(void)
{
    bool seen[8] = {false};

    for (int hour = 0; hour < 8; hour++)
    {
        seen[rotate_index(125, 100, hour, 0, 60, 8)] = true;
    }

    int count_seen = 0;
    for (int i = 0; i < 8; i++)
    {
        if (seen[i])
        {
            count_seen++;
        }
    }

    TEST_ASSERT_EQUAL_INT(8, count_seen);
}

/** @brief A daily rotation holds all day and turns at the date, not at the hour. */
void test_daily_turns_at_the_date(void)
{
    TEST_ASSERT_EQUAL_INT(rotate_index(125, 100, 1, 0, 1440, 8), rotate_index(125, 100, 23, 0, 1440, 8));
    TEST_ASSERT_EQUAL_INT((rotate_index(125, 100, 1, 0, 1440, 8) + 1) % 8, rotate_index(125, 101, 1, 0, 1440, 8));
}

/** @brief A quarter-hour rotation turns four times an hour, so :00 and :15 are different slots. */
void test_fifteen_minutes_turns_four_times_an_hour(void)
{
    int result = rotate_index(125, 100, 5, 15, 15, 8);

    TEST_ASSERT_EQUAL_INT((rotate_index(125, 100, 5, 0, 15, 8) + 1) % 8, result);
}

/** @brief A single palette is always itself, so a face with one theme never moves off it. */
void test_a_count_of_one_is_always_zero(void)
{
    int result = rotate_index(125, 100, 5, 30, 60, 1);

    TEST_ASSERT_EQUAL_INT(0, result);
}

/** @brief An interval of zero would divide by zero, so it answers the safe nothing-to-rotate index. */
void test_a_nonpositive_interval_is_zero(void)
{
    TEST_ASSERT_EQUAL_INT(0, rotate_index(125, 100, 5, 30, 0, 8));
    TEST_ASSERT_EQUAL_INT(0, rotate_index(125, 100, 5, 30, -15, 8));
}

int main(void)
{
    UNITY_BEGIN();
    RUN_TEST(test_holds_through_the_slot);
    RUN_TEST(test_steps_by_one_on_the_boundary);
    RUN_TEST(test_wraps_after_a_full_lap);
    RUN_TEST(test_a_lap_visits_every_one);
    RUN_TEST(test_daily_turns_at_the_date);
    RUN_TEST(test_fifteen_minutes_turns_four_times_an_hour);
    RUN_TEST(test_a_count_of_one_is_always_zero);
    RUN_TEST(test_a_nonpositive_interval_is_zero);
    return UNITY_END();
}
