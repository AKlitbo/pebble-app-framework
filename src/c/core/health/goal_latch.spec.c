/**
 * @file goal_latch.spec.c
 * @brief Host tests for the goal-met latch.
 *
 * The face asks the latch on every health reading, which can be once a second during an HRV burst,
 * so the latch is all that stands between the wearer and a buzz on every reading past a goal. The
 * rules worth pinning are the ones that decide whether a buzz happens at all. A goal only cheers once
 * a reading below it has been seen that day, so a goal met before the face opened and yesterday's
 * total just after midnight both stay quiet. Each goal cheers once a day, a missing reading or goal
 * never cheers, and a changed target only counts on the next ask. The face skips the latch while the
 * Goal Met Vibration is None, so the specs that leave gaps between asks stand for that too.
 */
#include "unity.h"

#include "health/goal_latch.h"

// a monday and the tuesday after it, as tm_yday
#define MONDAY 100
#define TUESDAY 101

// the framework's default goals: 10,000 steps, 2,000 kcal, 5 km, and 30 minutes
static const int DEFAULT_TARGETS[GOAL_LATCH_COUNT] = {10000, 2000, 5000, 30};

/** @brief A latch that has seen monday morning, with every goal still ahead. */
static GoalLatch monday_morning(void)
{
    GoalLatch latch = GOAL_LATCH_EMPTY;
    const int morning[GOAL_LATCH_COUNT] = {1200, 300, 900, 4};

    goal_latch_update(&latch, MONDAY, morning, DEFAULT_TARGETS);

    return latch;
}

void setUp(void) {}
void tearDown(void) {}

/** @brief Opening the face in the evening on goals met that afternoon must stay quiet. */
void test_goal_latch_update_stays_quiet_on_goals_past_at_the_first_look(void)
{
    GoalLatch latch = GOAL_LATCH_EMPTY;
    const int readings[GOAL_LATCH_COUNT] = {12000, 2100, 6000, 45};

    uint8_t result = goal_latch_update(&latch, MONDAY, readings, DEFAULT_TARGETS);

    TEST_ASSERT_EQUAL_UINT8(0, result);
}

/** @brief A goal already past at the first look stays quiet as its reading climbs on, since it was met before the face opened. */
void test_goal_latch_update_stays_quiet_as_a_goal_past_at_the_first_look_climbs(void)
{
    GoalLatch latch = GOAL_LATCH_EMPTY;
    const int first[GOAL_LATCH_COUNT] = {12000, 300, 900, 4};
    const int next[GOAL_LATCH_COUNT] = {12100, 300, 900, 4};
    goal_latch_update(&latch, MONDAY, first, DEFAULT_TARGETS);

    uint8_t result = goal_latch_update(&latch, MONDAY, next, DEFAULT_TARGETS);

    TEST_ASSERT_EQUAL_UINT8(0, result);
}

/** @brief The reading that reaches the goal is the one that cheers, or the goal passes with no buzz. */
void test_goal_latch_update_reports_a_goal_as_it_is_met(void)
{
    GoalLatch latch = monday_morning();
    const int readings[GOAL_LATCH_COUNT] = {10000, 300, 900, 4};

    uint8_t result = goal_latch_update(&latch, MONDAY, readings, DEFAULT_TARGETS);

    TEST_ASSERT_EQUAL_UINT8(GOAL_LATCH_BIT(GOAL_LATCH_STEPS), result);
}

/** @brief Every reading past a goal must not buzz again, or the wrist buzzes once a second during an HRV burst. */
void test_goal_latch_update_reports_each_goal_once_a_day(void)
{
    GoalLatch latch = monday_morning();
    const int met[GOAL_LATCH_COUNT] = {10000, 300, 900, 4};
    const int later[GOAL_LATCH_COUNT] = {14000, 300, 900, 4};
    goal_latch_update(&latch, MONDAY, met, DEFAULT_TARGETS);

    uint8_t result = goal_latch_update(&latch, MONDAY, later, DEFAULT_TARGETS);

    TEST_ASSERT_EQUAL_UINT8(0, result);
}

/** @brief Two goals met on one reading come back together, so the face plays one buzz for both. */
void test_goal_latch_update_reports_goals_met_together_at_once(void)
{
    GoalLatch latch = monday_morning();
    const int readings[GOAL_LATCH_COUNT] = {10500, 300, 5200, 4};

    uint8_t result = goal_latch_update(&latch, MONDAY, readings, DEFAULT_TARGETS);

    TEST_ASSERT_EQUAL_UINT8(GOAL_LATCH_BIT(GOAL_LATCH_STEPS) | GOAL_LATCH_BIT(GOAL_LATCH_DISTANCE), result);
}

/** @brief A goal met on monday cheers again on tuesday, or each goal would only ever buzz once. */
void test_goal_latch_update_clears_the_marks_on_a_new_day(void)
{
    GoalLatch latch = monday_morning();
    const int monday_met[GOAL_LATCH_COUNT] = {10000, 300, 900, 4};
    const int tuesday_morning[GOAL_LATCH_COUNT] = {200, 50, 100, 1};
    const int tuesday_met[GOAL_LATCH_COUNT] = {10000, 300, 900, 4};
    goal_latch_update(&latch, MONDAY, monday_met, DEFAULT_TARGETS);
    goal_latch_update(&latch, TUESDAY, tuesday_morning, DEFAULT_TARGETS);

    uint8_t result = goal_latch_update(&latch, TUESDAY, tuesday_met, DEFAULT_TARGETS);

    TEST_ASSERT_EQUAL_UINT8(GOAL_LATCH_BIT(GOAL_LATCH_STEPS), result);
}

/**
 * @brief A heart rate event at 00:00:20 asks while the store still holds monday's 12,000 steps, since
 * it reads activity once a minute. That total must neither buzz nor mark the goal, or tuesday's real
 * 10,000 steps would pass in silence.
 */
void test_goal_latch_update_still_reports_a_goal_after_yesterdays_total_lands_past_midnight(void)
{
    GoalLatch latch = monday_morning();
    const int monday_met[GOAL_LATCH_COUNT] = {10000, 300, 900, 4};
    const int monday_total[GOAL_LATCH_COUNT] = {12000, 300, 900, 4};
    const int tuesday_first_minute[GOAL_LATCH_COUNT] = {40, 5, 30, 1};
    const int tuesday_met[GOAL_LATCH_COUNT] = {10200, 300, 900, 4};
    goal_latch_update(&latch, MONDAY, monday_met, DEFAULT_TARGETS);
    goal_latch_update(&latch, TUESDAY, monday_total, DEFAULT_TARGETS);
    goal_latch_update(&latch, TUESDAY, tuesday_first_minute, DEFAULT_TARGETS);

    uint8_t result = goal_latch_update(&latch, TUESDAY, tuesday_met, DEFAULT_TARGETS);

    TEST_ASSERT_EQUAL_UINT8(GOAL_LATCH_BIT(GOAL_LATCH_STEPS), result);
}

/** @brief Yesterday's total landing past midnight must not buzz a goal tuesday has not met. */
void test_goal_latch_update_stays_quiet_on_yesterdays_total_past_midnight(void)
{
    GoalLatch latch = monday_morning();
    const int monday_total[GOAL_LATCH_COUNT] = {12000, 2400, 7000, 50};

    uint8_t result = goal_latch_update(&latch, TUESDAY, monday_total, DEFAULT_TARGETS);

    TEST_ASSERT_EQUAL_UINT8(0, result);
}

/** @brief Raising a goal already met does not open it again, so the wearer gets no second buzz that day. */
void test_goal_latch_update_keeps_a_raised_goal_met(void)
{
    GoalLatch latch = monday_morning();
    const int met[GOAL_LATCH_COUNT] = {10000, 300, 900, 4};
    const int raised[GOAL_LATCH_COUNT] = {15000, 2000, 5000, 30};
    const int below_raised[GOAL_LATCH_COUNT] = {12000, 300, 900, 4};
    const int past_raised[GOAL_LATCH_COUNT] = {15000, 300, 900, 4};
    goal_latch_update(&latch, MONDAY, met, DEFAULT_TARGETS);
    goal_latch_update(&latch, MONDAY, below_raised, raised);

    uint8_t result = goal_latch_update(&latch, MONDAY, past_raised, raised);

    TEST_ASSERT_EQUAL_UINT8(0, result);
}

/** @brief Lowering a goal below today's reading cheers on the next ask, since the latch only moves when asked. */
void test_goal_latch_update_reports_a_lowered_goal_on_the_next_ask(void)
{
    GoalLatch latch = monday_morning();
    const int readings[GOAL_LATCH_COUNT] = {8000, 300, 900, 4};
    const int lowered[GOAL_LATCH_COUNT] = {7500, 2000, 5000, 30};
    goal_latch_update(&latch, MONDAY, readings, DEFAULT_TARGETS);

    uint8_t result = goal_latch_update(&latch, MONDAY, readings, lowered);

    TEST_ASSERT_EQUAL_UINT8(GOAL_LATCH_BIT(GOAL_LATCH_STEPS), result);
}

/** @brief Steps, calories, and active minutes read -1 with no reading yet, which never meets a goal. */
void test_goal_latch_update_skips_a_missing_reading(void)
{
    GoalLatch latch = monday_morning();
    const int readings[GOAL_LATCH_COUNT] = {-1, -1, 900, -1};

    uint8_t result = goal_latch_update(&latch, MONDAY, readings, DEFAULT_TARGETS);

    TEST_ASSERT_EQUAL_UINT8(0, result);
}

/**
 * @brief The health store reads a missing distance as 0. That must not count as a reading below the
 * goal, or a distance met hours before the face opened would buzz once the real reading arrived.
 */
void test_goal_latch_update_does_not_count_a_missing_distance_as_below_the_goal(void)
{
    GoalLatch latch = GOAL_LATCH_EMPTY;
    const int missing[GOAL_LATCH_COUNT] = {-1, -1, 0, -1};
    const int arrived[GOAL_LATCH_COUNT] = {-1, -1, 6000, -1};
    goal_latch_update(&latch, MONDAY, missing, DEFAULT_TARGETS);

    uint8_t result = goal_latch_update(&latch, MONDAY, arrived, DEFAULT_TARGETS);

    TEST_ASSERT_EQUAL_UINT8(0, result);
}

/**
 * @brief A face opened with no step reading yet that then reads 11,000 met the goal hours ago, so it
 * must stay quiet rather than buzz the moment the reading arrives.
 */
void test_goal_latch_update_stays_quiet_on_a_late_reading_already_past_the_goal(void)
{
    GoalLatch latch = GOAL_LATCH_EMPTY;
    const int first[GOAL_LATCH_COUNT] = {-1, -1, 0, -1};
    const int arrived[GOAL_LATCH_COUNT] = {11000, -1, 0, -1};
    goal_latch_update(&latch, MONDAY, first, DEFAULT_TARGETS);

    uint8_t result = goal_latch_update(&latch, MONDAY, arrived, DEFAULT_TARGETS);

    TEST_ASSERT_EQUAL_UINT8(0, result);
}

/** @brief A goal of 0 is one the face does not keep, so its reading never buzzes however far it climbs. */
void test_goal_latch_update_skips_a_goal_with_no_target(void)
{
    GoalLatch latch = GOAL_LATCH_EMPTY;
    const int targets[GOAL_LATCH_COUNT] = {10000, 0, 5000, 30};
    const int morning[GOAL_LATCH_COUNT] = {1200, 100, 900, 4};
    const int evening[GOAL_LATCH_COUNT] = {1200, 2500, 900, 4};
    goal_latch_update(&latch, MONDAY, morning, targets);

    uint8_t result = goal_latch_update(&latch, MONDAY, evening, targets);

    TEST_ASSERT_EQUAL_UINT8(0, result);
}

/**
 * @brief The face skips the latch while the pick is None. A goal met then cheers late, on the first ask
 * after the wearer picks a buzz again the same day.
 */
void test_goal_latch_update_reports_a_goal_met_while_it_was_not_asked(void)
{
    GoalLatch latch = monday_morning();
    const int after_none[GOAL_LATCH_COUNT] = {11000, 300, 900, 4};

    uint8_t result = goal_latch_update(&latch, MONDAY, after_none, DEFAULT_TARGETS);

    TEST_ASSERT_EQUAL_UINT8(GOAL_LATCH_BIT(GOAL_LATCH_STEPS), result);
}

/**
 * @brief A face on None since launch has never asked, so a goal met before the wearer picks a buzz
 * stays quiet on the first ask after it.
 */
void test_goal_latch_update_stays_quiet_on_the_first_ask_after_none_since_launch(void)
{
    GoalLatch latch = GOAL_LATCH_EMPTY;
    const int readings[GOAL_LATCH_COUNT] = {11000, 300, 900, 4};

    uint8_t result = goal_latch_update(&latch, MONDAY, readings, DEFAULT_TARGETS);

    TEST_ASSERT_EQUAL_UINT8(0, result);
}

/**
 * @brief A face relaunched 50 steps short of its goal asks once at startup, before the health store
 * calls back. The reading below the goal is then on record, so the next reading past it still cheers.
 * Without that first ask the next reading would be the first look, already past the goal, and the
 * day's buzz would be lost.
 */
void test_goal_latch_update_reports_a_goal_met_just_after_the_startup_ask(void)
{
    GoalLatch latch = GOAL_LATCH_EMPTY;
    const int startup[GOAL_LATCH_COUNT] = {9950, 300, 900, 4};
    const int next[GOAL_LATCH_COUNT] = {10040, 300, 900, 4};
    goal_latch_update(&latch, MONDAY, startup, DEFAULT_TARGETS);

    uint8_t result = goal_latch_update(&latch, MONDAY, next, DEFAULT_TARGETS);

    TEST_ASSERT_EQUAL_UINT8(GOAL_LATCH_BIT(GOAL_LATCH_STEPS), result);
}

int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_goal_latch_update_stays_quiet_on_goals_past_at_the_first_look);
    RUN_TEST(test_goal_latch_update_stays_quiet_as_a_goal_past_at_the_first_look_climbs);
    RUN_TEST(test_goal_latch_update_reports_a_goal_as_it_is_met);
    RUN_TEST(test_goal_latch_update_reports_each_goal_once_a_day);
    RUN_TEST(test_goal_latch_update_reports_goals_met_together_at_once);
    RUN_TEST(test_goal_latch_update_clears_the_marks_on_a_new_day);
    RUN_TEST(test_goal_latch_update_still_reports_a_goal_after_yesterdays_total_lands_past_midnight);
    RUN_TEST(test_goal_latch_update_stays_quiet_on_yesterdays_total_past_midnight);
    RUN_TEST(test_goal_latch_update_keeps_a_raised_goal_met);
    RUN_TEST(test_goal_latch_update_reports_a_lowered_goal_on_the_next_ask);
    RUN_TEST(test_goal_latch_update_skips_a_missing_reading);
    RUN_TEST(test_goal_latch_update_does_not_count_a_missing_distance_as_below_the_goal);
    RUN_TEST(test_goal_latch_update_stays_quiet_on_a_late_reading_already_past_the_goal);
    RUN_TEST(test_goal_latch_update_skips_a_goal_with_no_target);
    RUN_TEST(test_goal_latch_update_reports_a_goal_met_while_it_was_not_asked);
    RUN_TEST(test_goal_latch_update_stays_quiet_on_the_first_ask_after_none_since_launch);
    RUN_TEST(test_goal_latch_update_reports_a_goal_met_just_after_the_startup_ask);

    return UNITY_END();
}
