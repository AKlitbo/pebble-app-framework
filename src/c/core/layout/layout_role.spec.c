/**
 * @file layout_role.spec.c
 * @brief Host tests for which layout wins.
 *
 * Two ways this breaks and neither shows up in review. Swap the order of the two tests and Quiet
 * Time never wins, which looks like the setting doing nothing at all. Drop one of the "is a layout
 * assigned" guards and a trigger with nothing behind it takes the screen and draws an empty grid,
 * which looks like the watchface crashed.
 *
 * The falling through is the part worth pinning hardest. It is what lets someone set up Quiet Time
 * on its own without also having to build a night grid.
 */
#include "unity.h"

#include "layout/layout_role.h"

void setUp(void) {}
void tearDown(void) {}

/** @brief Quiet Time beats the night schedule, so a quiet night gets the quiet grid and not the night one. */
void test_quiet_wins_over_night(void)
{
    LayoutRole result = layout_role_pick(true, true, true, true);

    TEST_ASSERT_EQUAL_INT(LAYOUT_ROLE_QUIET, result);
}

/** @brief Quiet Time with no grid assigned hands the screen to night rather than blanking it. */
void test_quiet_with_no_layout_falls_through_to_night(void)
{
    LayoutRole result = layout_role_pick(true, false, true, true);

    TEST_ASSERT_EQUAL_INT(LAYOUT_ROLE_NIGHT, result);
}

/** @brief And with neither assigned it lands on day, which always has a grid. */
void test_neither_assigned_falls_through_to_day(void)
{
    LayoutRole result = layout_role_pick(true, false, true, false);

    TEST_ASSERT_EQUAL_INT(LAYOUT_ROLE_DAY, result);
}

/** @brief Night still wins while Quiet Time is off, or adding Quiet Time would have broken the night swap. */
void test_night_wins_while_quiet_is_off(void)
{
    LayoutRole result = layout_role_pick(false, true, true, true);

    TEST_ASSERT_EQUAL_INT(LAYOUT_ROLE_NIGHT, result);
}

/** @brief A night with no grid assigned reads as day, which is how it behaved before Quiet Time existed. */
void test_night_with_no_layout_is_day(void)
{
    LayoutRole result = layout_role_pick(false, false, true, false);

    TEST_ASSERT_EQUAL_INT(LAYOUT_ROLE_DAY, result);
}

/** @brief Quiet Time on its own is enough, so nobody has to build a night grid to use it. */
void test_quiet_alone_wins(void)
{
    LayoutRole result = layout_role_pick(true, true, false, false);

    TEST_ASSERT_EQUAL_INT(LAYOUT_ROLE_QUIET, result);
}

/** @brief Nothing firing is the ordinary case, and it has to be the day grid. */
void test_nothing_firing_is_day(void)
{
    LayoutRole result = layout_role_pick(false, true, false, true);

    TEST_ASSERT_EQUAL_INT(LAYOUT_ROLE_DAY, result);
}

int main(void)
{
    UNITY_BEGIN();
    RUN_TEST(test_quiet_wins_over_night);
    RUN_TEST(test_quiet_with_no_layout_falls_through_to_night);
    RUN_TEST(test_neither_assigned_falls_through_to_day);
    RUN_TEST(test_night_wins_while_quiet_is_off);
    RUN_TEST(test_night_with_no_layout_is_day);
    RUN_TEST(test_quiet_alone_wins);
    RUN_TEST(test_nothing_firing_is_day);
    return UNITY_END();
}
