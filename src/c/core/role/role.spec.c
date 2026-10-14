/**
 * @file role.spec.c
 * @brief Host tests for which of day, night, and Quiet Time wins.
 *
 * Swap the order of the first two checks and Quiet Time never wins, which looks like the setting
 * doing nothing at all. Drop one of the "is something assigned" guards and a trigger with nothing
 * behind it takes the screen and draws an empty look, which looks like the watchface crashed.
 * Neither failure shows up in review.
 *
 * The falling through is the part worth pinning hardest. It is what lets someone set up Quiet Time
 * on its own without also having to build a night look.
 */
#include "unity.h"

#include "role/role.h"

void setUp(void) {}
void tearDown(void) {}

/** @brief Quiet Time beats the night schedule, so a quiet night gets the quiet look, not the night one. */
void test_quiet_wins_over_night(void)
{
    Role result = role_pick(true, true, true, true);

    TEST_ASSERT_EQUAL_INT(ROLE_QUIET, result);
}

/** @brief Quiet Time with nothing assigned hands the screen to night rather than blanking it. */
void test_quiet_with_nothing_falls_through_to_night(void)
{
    Role result = role_pick(true, false, true, true);

    TEST_ASSERT_EQUAL_INT(ROLE_NIGHT, result);
}

/** @brief And with neither assigned it lands on day, which always has something. */
void test_neither_assigned_falls_through_to_day(void)
{
    Role result = role_pick(true, false, true, false);

    TEST_ASSERT_EQUAL_INT(ROLE_DAY, result);
}

/** @brief Night still wins while Quiet Time is off, so a face with no quiet look keeps its night swap. */
void test_night_wins_while_quiet_is_off(void)
{
    Role result = role_pick(false, true, true, true);

    TEST_ASSERT_EQUAL_INT(ROLE_NIGHT, result);
}

/**
 * @brief A night with nothing assigned falls through to day rather than drawing an empty look, so
 * turning on the night schedule before building a night look keeps the day one up.
 */
void test_night_with_nothing_is_day(void)
{
    Role result = role_pick(false, false, true, false);

    TEST_ASSERT_EQUAL_INT(ROLE_DAY, result);
}

/** @brief Quiet Time on its own is enough, so nobody has to build a night look to use it. */
void test_quiet_alone_wins(void)
{
    Role result = role_pick(true, true, false, false);

    TEST_ASSERT_EQUAL_INT(ROLE_QUIET, result);
}

/** @brief Nothing firing is the ordinary case, and it has to be the day look. */
void test_nothing_firing_is_day(void)
{
    Role result = role_pick(false, true, false, true);

    TEST_ASSERT_EQUAL_INT(ROLE_DAY, result);
}

int main(void)
{
    UNITY_BEGIN();
    RUN_TEST(test_quiet_wins_over_night);
    RUN_TEST(test_quiet_with_nothing_falls_through_to_night);
    RUN_TEST(test_neither_assigned_falls_through_to_day);
    RUN_TEST(test_night_wins_while_quiet_is_off);
    RUN_TEST(test_night_with_nothing_is_day);
    RUN_TEST(test_quiet_alone_wins);
    RUN_TEST(test_nothing_firing_is_day);
    return UNITY_END();
}
