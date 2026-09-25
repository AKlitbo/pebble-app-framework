/**
 * @file step_hours.spec.c
 * @brief Host tests for the step chart's hour arithmetic.
 *
 * It encodes a timing detail of the watch rather than plain maths: an hour settles a minute later
 * than you would guess.
 */
#include "unity.h"

#include "health/step_hours.h"

void setUp(void) {}
void tearDown(void) {}

/** @brief A minute into the hour, everything before it has settled. */
void test_past_the_first_minute_settles_the_hour_before(void)
{
    int result = step_hours_settled(9, 1);

    TEST_ASSERT_EQUAL_INT(9, result);
}

/** @brief On the rollover minute the hour just gone is held back, since its last record is late. */
void test_on_the_rollover_minute_the_hour_just_gone_is_held(void)
{
    int result = step_hours_settled(9, 0);

    TEST_ASSERT_EQUAL_INT(8, result);
}

/** @brief Midnight's first minute has no earlier hour to hold back, and must not go negative. */
void test_midnight_first_minute_floors_at_zero(void)
{
    int result = step_hours_settled(0, 0);

    TEST_ASSERT_EQUAL_INT(0, result);
}

/** @brief The last hour of the day settles like any other. */
void test_last_hour_settles_like_the_rest(void)
{
    int result = step_hours_settled(23, 30);

    TEST_ASSERT_EQUAL_INT(23, result);
}

int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_past_the_first_minute_settles_the_hour_before);
    RUN_TEST(test_on_the_rollover_minute_the_hour_just_gone_is_held);
    RUN_TEST(test_midnight_first_minute_floors_at_zero);
    RUN_TEST(test_last_hour_settles_like_the_rest);

    return UNITY_END();
}
