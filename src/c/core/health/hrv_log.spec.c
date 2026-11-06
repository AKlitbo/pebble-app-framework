/**
 * @file hrv_log.spec.c
 * @brief Host tests for the HRV readings kept for a face's panels.
 *
 * The panels read this straight onto the screen, so a slip shows as a chart in the wrong order,
 * yesterday's hours drawn as today's, or a walking number averaged in with the resting ones. Each
 * of those looks plausible on the wrist, so the order, the day change, what counts as resting,
 * and when a night starts over are each pinned.
 */
#include "unity.h"

#include "health/hrv_log.h"

/** The day the readings below are taken on, counting from any fixed day. */
#define DAY 20400

/** Minutes from a fixed point, so a reading at a minute of the day has a matching time. */
#define AT(day, minute) ((uint32_t)(day) * 1440u + (uint32_t)(minute))

void setUp(void) {}
void tearDown(void) {}

/** @brief A score at the still limit is still, and just over it is busy, so the two rows split where the wearer set them. */
void test_still_splits_from_busy_at_the_limit(void)
{
    HrvState still = hrv_log_state_of(60, 0, 60, 10);
    HrvState busy = hrv_log_state_of(61, 0, 60, 10);

    TEST_ASSERT_EQUAL_INT(HRV_STATE_STILL, still);
    TEST_ASSERT_EQUAL_INT(HRV_STATE_BUSY, busy);
}

/**
 * @brief A busy wrist with no steps is busy, not walking.
 *
 * A mouse and keyboard scored 267 on a Time 2 with no steps at all, which a wrist score alone took
 * for a walk.
 */
void test_a_busy_wrist_without_steps_is_not_walking(void)
{
    HrvState result = hrv_log_state_of(267, 0, 60, 10);

    TEST_ASSERT_EQUAL_INT(HRV_STATE_BUSY, result);
}

/** @brief The face's walking step count makes a walk whatever the wrist did, and one fewer does not. */
void test_steps_decide_walking(void)
{
    HrvState walking = hrv_log_state_of(30, 15, 60, 15);
    HrvState not_walking = hrv_log_state_of(30, 14, 60, 15);

    TEST_ASSERT_EQUAL_INT(HRV_STATE_WALKING, walking);
    TEST_ASSERT_EQUAL_INT(HRV_STATE_STILL, not_walking);
}

/** @brief A burst with no score and no steps known counts as still, since nothing said it moved. */
void test_nothing_known_counts_as_still(void)
{
    HrvState result = hrv_log_state_of(-1, -1, 60, 10);

    TEST_ASSERT_EQUAL_INT(HRV_STATE_STILL, result);
}

/** @brief Not walking, the level a face gets by default, keeps still and busy bursts and leaves out walking ones. */
void test_not_walking_leaves_out_only_walking(void)
{
    bool still = hrv_log_counts(HRV_STATE_STILL, HRV_COUNT_NOT_WALKING);
    bool busy = hrv_log_counts(HRV_STATE_BUSY, HRV_COUNT_NOT_WALKING);
    bool walking = hrv_log_counts(HRV_STATE_WALKING, HRV_COUNT_NOT_WALKING);

    TEST_ASSERT_TRUE(still);
    TEST_ASSERT_TRUE(busy);
    TEST_ASSERT_FALSE(walking);
}

/** @brief The still level keeps only still bursts, and any keeps every one. */
void test_still_and_any_levels(void)
{
    bool busy_when_still = hrv_log_counts(HRV_STATE_BUSY, HRV_COUNT_STILL);
    bool walking_when_any = hrv_log_counts(HRV_STATE_WALKING, HRV_COUNT_ANY);

    TEST_ASSERT_FALSE(busy_when_still);
    TEST_ASSERT_TRUE(walking_when_any);
}

/** @brief The history hands back the newest first, so a chart drawn from it runs the right way. */
void test_history_reads_newest_first(void)
{
    HrvLog log;
    hrv_log_reset(&log);
    hrv_log_add(&log, 33, AT(DAY, 900), DAY, 900, HRV_STATE_STILL, false);
    hrv_log_add(&log, 51, AT(DAY, 905), DAY, 905, HRV_STATE_BUSY, false);
    int ms = 0;
    uint32_t at = 0;
    uint8_t flags = 0;

    bool found = hrv_log_get(&log, 0, &ms, &at, &flags);

    TEST_ASSERT_TRUE(found);
    TEST_ASSERT_EQUAL_INT(51, ms);
    TEST_ASSERT_EQUAL_UINT32(AT(DAY, 905), at);
    TEST_ASSERT_EQUAL_INT(HRV_STATE_BUSY, flags & HRV_LOG_STATE_MASK);
}

/** @brief Past the last slot the oldest reading goes, so the history is always the latest HRV_LOG_SLOTS. */
void test_history_drops_the_oldest_when_full(void)
{
    HrvLog log;
    hrv_log_reset(&log);
    for (int reading = 0; reading <= HRV_LOG_SLOTS; reading++)
    {
        hrv_log_add(&log, 10 + reading, AT(DAY, 600 + reading * 5), DAY, 600 + reading * 5, HRV_STATE_STILL, false);
    }
    int ms = 0;
    uint32_t at = 0;
    uint8_t flags = 0;

    bool found = hrv_log_get(&log, HRV_LOG_SLOTS - 1, &ms, &at, &flags);
    int count = hrv_log_count(&log);

    TEST_ASSERT_TRUE(found);
    TEST_ASSERT_EQUAL_INT(11, ms);
    TEST_ASSERT_EQUAL_INT(HRV_LOG_SLOTS, count);
}

/** @brief Asking further back than the history goes finds nothing, so a chart leaves those slots empty. */
void test_history_past_the_readings_is_empty(void)
{
    HrvLog log;
    hrv_log_reset(&log);
    hrv_log_add(&log, 40, AT(DAY, 900), DAY, 900, HRV_STATE_STILL, false);
    int ms = 0;
    uint32_t at = 0;
    uint8_t flags = 0;

    bool result = hrv_log_get(&log, 1, &ms, &at, &flags);

    TEST_ASSERT_FALSE(result);
}

/** @brief Readings in the same hour average into it, rounded, which is what one bar of the day chart shows. */
void test_hour_averages_its_readings(void)
{
    HrvLog log;
    hrv_log_reset(&log);
    hrv_log_add(&log, 33, AT(DAY, 905), DAY, 905, HRV_STATE_STILL, false);
    hrv_log_add(&log, 51, AT(DAY, 917), DAY, 917, HRV_STATE_STILL, false);
    hrv_log_add(&log, 45, AT(DAY, 925), DAY, 925, HRV_STATE_BUSY, false);

    int result = hrv_log_hour_avg(&log, 15);

    TEST_ASSERT_EQUAL_INT(43, result);
}

/** @brief A walking reading stays out of the hours, or one walk to the kitchen lifts the day's average. */
void test_walking_stays_out_of_the_hours(void)
{
    HrvLog log;
    hrv_log_reset(&log);
    hrv_log_add(&log, 30, AT(DAY, 905), DAY, 905, HRV_STATE_STILL, false);
    hrv_log_add(&log, 54, AT(DAY, 910), DAY, 910, HRV_STATE_WALKING, false);

    int result = hrv_log_hour_avg(&log, 15);

    TEST_ASSERT_EQUAL_INT(30, result);
}

/** @brief A walking reading is still the latest walking one, which the Still vs Walking panel shows. */
void test_walking_is_kept_as_the_latest_walking(void)
{
    HrvLog log;
    hrv_log_reset(&log);
    hrv_log_add(&log, 54, AT(DAY, 910), DAY, 910, HRV_STATE_WALKING, false);
    int ms = 0;
    uint32_t at = 0;

    bool found = hrv_log_last(&log, HRV_STATE_WALKING, &ms, &at);
    bool still = hrv_log_last(&log, HRV_STATE_STILL, &ms, &at);

    TEST_ASSERT_TRUE(found);
    TEST_ASSERT_FALSE(still);
}

/** @brief The first reading of a new day clears yesterday's hours, so the chart never shows yesterday as today. */
void test_a_new_day_clears_the_hours(void)
{
    HrvLog log;
    hrv_log_reset(&log);
    hrv_log_add(&log, 40, AT(DAY, 1000), DAY, 1000, HRV_STATE_STILL, false);
    hrv_log_add(&log, 30, AT(DAY + 1, 300), DAY + 1, 300, HRV_STATE_STILL, false);

    int yesterday = hrv_log_hour_avg(&log, 16);
    int today = hrv_log_hour_avg(&log, 5);

    TEST_ASSERT_EQUAL_INT(-1, yesterday);
    TEST_ASSERT_EQUAL_INT(30, today);
}

/** @brief Rolling to a new day with no reading clears the hours too, for a chart drawn just after midnight. */
void test_rolling_the_day_clears_the_hours(void)
{
    HrvLog log;
    hrv_log_reset(&log);
    hrv_log_add(&log, 40, AT(DAY, 1000), DAY, 1000, HRV_STATE_STILL, false);

    bool rolled = hrv_log_roll_day(&log, DAY + 1);
    int result = hrv_log_hour_avg(&log, 16);

    TEST_ASSERT_TRUE(rolled);
    TEST_ASSERT_EQUAL_INT(-1, result);
}

/** @brief Today's summary gives the lowest and highest hour and the average of every reading, the three the 2x4 shows. */
void test_today_sums_up_the_hours(void)
{
    HrvLog log;
    hrv_log_reset(&log);
    hrv_log_add(&log, 27, AT(DAY, 935), DAY, 935, HRV_STATE_STILL, false);
    hrv_log_add(&log, 44, AT(DAY, 964), DAY, 964, HRV_STATE_BUSY, false);
    hrv_log_add(&log, 48, AT(DAY, 970), DAY, 970, HRV_STATE_BUSY, false);
    int low = 0;
    int avg = 0;
    int high = 0;

    hrv_log_today(&log, &low, &avg, &high);

    TEST_ASSERT_EQUAL_INT(27, low);
    TEST_ASSERT_EQUAL_INT(40, avg);
    TEST_ASSERT_EQUAL_INT(46, high);
}

/** @brief A day with no readings sums up to none, so the 2x4 shows dashes rather than zeros. */
void test_an_empty_day_sums_up_to_none(void)
{
    HrvLog log;
    hrv_log_reset(&log);
    int low = 0;
    int avg = 0;
    int high = 0;

    hrv_log_today(&log, &low, &avg, &high);

    TEST_ASSERT_EQUAL_INT(-1, low);
    TEST_ASSERT_EQUAL_INT(-1, avg);
    TEST_ASSERT_EQUAL_INT(-1, high);
}

/** @brief Readings taken asleep through one night average together, which is the Night HRV figure. */
void test_night_averages_the_readings_asleep(void)
{
    HrvLog log;
    hrv_log_reset(&log);
    hrv_log_add(&log, 50, AT(DAY, 1380), DAY, 1380, HRV_STATE_STILL, true);
    hrv_log_add(&log, 44, AT(DAY + 1, 120), DAY + 1, 120, HRV_STATE_STILL, true);
    hrv_log_add(&log, 30, AT(DAY + 1, 600), DAY + 1, 600, HRV_STATE_STILL, false);

    int result = hrv_log_night_avg(&log);

    TEST_ASSERT_EQUAL_INT(47, result);
}

/** @brief The first reading asleep after a day awake starts a new night, so last night is not averaged into tonight. */
void test_a_new_night_starts_over(void)
{
    HrvLog log;
    hrv_log_reset(&log);
    hrv_log_add(&log, 50, AT(DAY, 120), DAY, 120, HRV_STATE_STILL, true);
    hrv_log_add(&log, 30, AT(DAY + 1, 120), DAY + 1, 120, HRV_STATE_STILL, true);

    int result = hrv_log_night_avg(&log);

    TEST_ASSERT_EQUAL_INT(30, result);
}

/**
 * @brief A reading taken asleep in the afternoon is a nap's, so it leaves last night's figure alone.
 *
 * A nap seven hours after waking is under the twelve hour gap, so it would have been averaged into
 * the night and changed Night HRV in the afternoon.
 */
void test_a_nap_stays_out_of_the_night(void)
{
    HrvLog log;
    hrv_log_reset(&log);
    hrv_log_add(&log, 50, AT(DAY, 1380), DAY, 1380, HRV_STATE_STILL, true);
    hrv_log_add(&log, 44, AT(DAY + 1, 415), DAY + 1, 415, HRV_STATE_STILL, true);
    hrv_log_add(&log, 70, AT(DAY + 1, 840), DAY + 1, 840, HRV_STATE_STILL, true);

    int result = hrv_log_night_avg(&log);

    TEST_ASSERT_EQUAL_INT(47, result);
}

/** @brief Sleep starting at 21:00 is the night's, the first minute the watch would not call a nap. */
void test_sleep_from_nine_in_the_evening_counts_for_the_night(void)
{
    HrvLog log;
    hrv_log_reset(&log);
    hrv_log_add(&log, 40, AT(DAY, 1260), DAY, 1260, HRV_STATE_STILL, true);

    int result = hrv_log_night_avg(&log);

    TEST_ASSERT_EQUAL_INT(40, result);
}

/** @brief A reading over 255 ms is kept as 255, so it fits its byte rather than wrapping to a small number. */
void test_a_large_reading_is_capped(void)
{
    HrvLog log;
    hrv_log_reset(&log);
    hrv_log_add(&log, 300, AT(DAY, 900), DAY, 900, HRV_STATE_STILL, false);
    int ms = 0;
    uint32_t at = 0;
    uint8_t flags = 0;

    hrv_log_get(&log, 0, &ms, &at, &flags);

    TEST_ASSERT_EQUAL_INT(HRV_LOG_MS_MAX, ms);
}

/** @brief The whole log fits one persist slot with its tag in front, or saving it to flash would fail. */
void test_the_log_fits_one_persist_slot(void)
{
    size_t result = sizeof(HrvLog) + 4;

    TEST_ASSERT_TRUE(result <= 256);
}

/** Unity needs each test naming, so a new one above is added here too. */
int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_still_splits_from_busy_at_the_limit);
    RUN_TEST(test_a_busy_wrist_without_steps_is_not_walking);
    RUN_TEST(test_steps_decide_walking);
    RUN_TEST(test_nothing_known_counts_as_still);
    RUN_TEST(test_not_walking_leaves_out_only_walking);
    RUN_TEST(test_still_and_any_levels);
    RUN_TEST(test_history_reads_newest_first);
    RUN_TEST(test_history_drops_the_oldest_when_full);
    RUN_TEST(test_history_past_the_readings_is_empty);
    RUN_TEST(test_hour_averages_its_readings);
    RUN_TEST(test_walking_stays_out_of_the_hours);
    RUN_TEST(test_walking_is_kept_as_the_latest_walking);
    RUN_TEST(test_a_new_day_clears_the_hours);
    RUN_TEST(test_rolling_the_day_clears_the_hours);
    RUN_TEST(test_today_sums_up_the_hours);
    RUN_TEST(test_an_empty_day_sums_up_to_none);
    RUN_TEST(test_night_averages_the_readings_asleep);
    RUN_TEST(test_a_new_night_starts_over);
    RUN_TEST(test_a_nap_stays_out_of_the_night);
    RUN_TEST(test_sleep_from_nine_in_the_evening_counts_for_the_night);
    RUN_TEST(test_a_large_reading_is_capped);
    RUN_TEST(test_the_log_fits_one_persist_slot);

    return UNITY_END();
}
