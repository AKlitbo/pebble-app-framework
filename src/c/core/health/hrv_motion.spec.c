/**
 * @file hrv_motion.spec.c
 * @brief Host tests for telling whether the wearer kept still through a burst.
 *
 * A face that asks for readings at rest only gets one when this says still, so a score that counts
 * the pull of gravity as movement would throw every burst away. The check that drops a burst early
 * has to wait until the burst cannot come back under, or one scratch costs a reading. Too few samples has to count as still, or a burst is
 * dropped before the accelerometer has said anything.
 */
#include "unity.h"

#include "health/hrv_motion.h"

void setUp(void) {}
void tearDown(void) {}

/** @brief A watch lying still at a tilt reads the same every sample, so gravity alone scores 0. */
void test_a_still_tilted_watch_scores_nothing(void)
{
    HrvMotion motion;
    hrv_motion_reset(&motion);
    for (int sample = 0; sample < 30; sample++)
    {
        hrv_motion_push(&motion, 300, -200, -930);
    }

    int result = hrv_motion_score(&motion);

    TEST_ASSERT_EQUAL_INT(0, result);
}

/** @brief Each sample moving 10, 20, and 30 on the three axes adds up to 60 a sample. */
void test_scores_the_movement_between_samples(void)
{
    HrvMotion motion;
    hrv_motion_reset(&motion);
    for (int sample = 0; sample <= 20; sample++)
    {
        int16_t step = (int16_t)(sample % 2 == 0 ? 0 : 1);
        hrv_motion_push(&motion, (int16_t)(step * 10), (int16_t)(step * -20), (int16_t)(-1000 + step * 30));
    }

    int result = hrv_motion_score(&motion);

    TEST_ASSERT_EQUAL_INT(60, result);
}

/** @brief Fewer than HRV_MOTION_MIN_SAMPLES moves give no score, so one jolt cannot decide a burst. */
void test_too_few_samples_give_no_score(void)
{
    HrvMotion motion;
    hrv_motion_reset(&motion);
    hrv_motion_push(&motion, 0, 0, -1000);
    hrv_motion_push(&motion, 900, 0, -1000);

    int result = hrv_motion_score(&motion);

    TEST_ASSERT_EQUAL_INT(-1, result);
}

/** @brief A big jolt in the first samples is not taken as moving, since too few are in to say. */
void test_too_few_samples_count_as_still(void)
{
    HrvMotion motion;
    hrv_motion_reset(&motion);
    hrv_motion_push(&motion, 0, 0, -1000);
    hrv_motion_push(&motion, 900, 0, -1000);

    bool result = hrv_motion_over(&motion, 60);

    TEST_ASSERT_FALSE(result);
}

/** @brief A score right on the limit still counts as still, and one over it as moving. */
void test_moving_starts_just_over_the_limit(void)
{
    HrvMotion at_limit;
    HrvMotion over_limit;
    hrv_motion_reset(&at_limit);
    hrv_motion_reset(&over_limit);
    for (int sample = 0; sample <= HRV_MOTION_MIN_SAMPLES; sample++)
    {
        int16_t side = (int16_t)(sample % 2 == 0 ? 0 : 1);
        hrv_motion_push(&at_limit, (int16_t)(side * 60), 0, -1000);
        hrv_motion_push(&over_limit, (int16_t)(side * (61)), 0, -1000);
    }

    bool still = hrv_motion_over(&at_limit, 60);
    bool moving = hrv_motion_over(&over_limit, 60);

    TEST_ASSERT_FALSE(still);
    TEST_ASSERT_TRUE(moving);
}

/**
 * @brief Walking for two seconds then sitting still for the rest of a burst is not dropped.
 *
 * Judging the average two seconds in would drop a burst that ends up averaging under the limit, so
 * the check waits until the movement already added up is more than the whole burst could hold.
 */
void test_an_early_scratch_can_still_pass(void)
{
    HrvMotion motion;
    hrv_motion_reset(&motion);
    for (int sample = 0; sample <= 20; sample++)
    {
        hrv_motion_push(&motion, (int16_t)(sample % 2 == 0 ? 0 : 500), 0, -1000);
    }

    bool over = hrv_motion_over(&motion, 60);
    bool cannot = hrv_motion_cannot_pass(&motion, 60, 900);

    TEST_ASSERT_TRUE(over);
    TEST_ASSERT_FALSE(cannot);
}

/** @brief Once the movement is past what the longest burst could hold at the limit, it cannot pass. */
void test_cannot_pass_once_the_sum_is_past_the_whole_burst(void)
{
    HrvMotion motion;
    hrv_motion_reset(&motion);
    for (int sample = 0; sample <= 200; sample++)
    {
        hrv_motion_push(&motion, (int16_t)(sample % 2 == 0 ? 0 : 300), 0, -1000);
    }

    bool result = hrv_motion_cannot_pass(&motion, 60, 900);

    TEST_ASSERT_TRUE(result);
}

/** @brief The first sample after a reset has nothing to measure from, so a burst does not inherit the last one's tilt. */
void test_a_reset_forgets_the_last_sample(void)
{
    HrvMotion motion;
    hrv_motion_reset(&motion);
    hrv_motion_push(&motion, 1000, 1000, 1000);
    hrv_motion_reset(&motion);
    for (int sample = 0; sample <= HRV_MOTION_MIN_SAMPLES; sample++)
    {
        hrv_motion_push(&motion, 0, 0, -1000);
    }

    int result = hrv_motion_score(&motion);

    TEST_ASSERT_EQUAL_INT(0, result);
}

/** Unity needs each test naming, so a new one above is added here too. */
int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_a_still_tilted_watch_scores_nothing);
    RUN_TEST(test_scores_the_movement_between_samples);
    RUN_TEST(test_too_few_samples_give_no_score);
    RUN_TEST(test_too_few_samples_count_as_still);
    RUN_TEST(test_moving_starts_just_over_the_limit);
    RUN_TEST(test_an_early_scratch_can_still_pass);
    RUN_TEST(test_cannot_pass_once_the_sum_is_past_the_whole_burst);
    RUN_TEST(test_a_reset_forgets_the_last_sample);

    return UNITY_END();
}
