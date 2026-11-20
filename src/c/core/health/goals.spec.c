/**
 * @file goals.spec.c
 * @brief Host tests for the daily goal tables.
 *
 * goal-rows.spec.ts checks every table against the page's, entry by entry and in order, so the
 * lookups need no copy of that here. What is left to pin is the one lookup that does arithmetic,
 * sleep turning hours into minutes, and the fallback that keeps a damaged index from reading past a
 * table.
 */
#include "unity.h"

#include "health/goals.h"

void setUp(void) {}
void tearDown(void) {}

/** @brief The 8 hour choice reads as 480 minutes, or a sleep bar would fill after 8 minutes. */
void test_goals_sleep_min_hands_back_minutes(void)
{
    int result = goals_sleep_min(2);

    TEST_ASSERT_EQUAL_INT(480, result);
}

/** @brief A damaged index past the end gives the first goal rather than whatever sits after the table. */
void test_goals_steps_falls_back_to_the_first_goal_past_the_end(void)
{
    int result = goals_steps(GOALS_STEPS_COUNT);

    TEST_ASSERT_EQUAL_INT(5000, result);
}

int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_goals_sleep_min_hands_back_minutes);
    RUN_TEST(test_goals_steps_falls_back_to_the_first_goal_past_the_end);

    return UNITY_END();
}
