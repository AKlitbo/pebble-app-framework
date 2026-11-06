/**
 * @file hrv_run.spec.c
 * @brief Host tests for turning the watch's beat gaps into an RMSSD reading.
 *
 * The answer is a square root of an average, so an off-by-one in the count or the rounding gives a
 * number that still looks plausible on the wrist. The beat rules matter just as much. A missed beat
 * left in reads as a jump of hundreds of ms and swamps the real variation, and a rule too strict
 * drops a heart rate that really moved and never gives an answer again. When a run ends decides
 * whether a reading shows up at all, so the quiet and full endings are each pinned, along with a
 * gap of 0 that must not end one. When to ask the watch again is pinned too, since asking too
 * often costs a call a minute on a watch with no sensor, and never asking leaves a wearer who turns
 * heart rate back on with dashes.
 */
#include "unity.h"

#include "health/hrv_run.h"

void setUp(void) {}
void tearDown(void) {}

/**
 * Pushes gaps that take turns between two values, one a second from @p start_sec, and hands back
 * the last push's result.
 */
static int push_alternating(HrvRun *run, uint16_t first_ms, uint16_t second_ms, int count, uint32_t start_sec)
{
    int result = -1;

    for (int beat = 0; beat < count; beat++)
    {
        uint16_t gap = beat % 2 == 0 ? first_ms : second_ms;
        result = hrv_run_push(run, gap, start_sec + (uint32_t)beat);
    }

    return result;
}

/** @brief Gaps that differ by 10 each time have an RMSSD of exactly 10. */
void test_steady_differences_give_that_difference(void)
{
    HrvRun run;
    hrv_run_reset(&run);
    push_alternating(&run, 1000, 1010, 21, 1);

    int result = hrv_run_finish(&run);

    TEST_ASSERT_EQUAL_INT(10, result);
}

/**
 * @brief Differences of 31 and 40 have a mean square of 1280.5, which has a root of 35.78 and shows as 36.
 *
 * Truncating instead would read low on every reading that is not a whole square.
 */
void test_rounds_the_root_to_the_nearest(void)
{
    HrvRun run;
    hrv_run_reset(&run);
    uint16_t gap = 800;
    hrv_run_push(&run, gap, 1);
    for (int beat = 1; beat <= 20; beat++)
    {
        gap = beat % 2 == 1 ? gap + 31 : gap - 40;
        hrv_run_push(&run, gap, 1 + (uint32_t)beat);
    }

    int result = hrv_run_finish(&run);

    TEST_ASSERT_EQUAL_INT(36, result);
}

/**
 * @brief Eleven differences of 1 and nine of 2 have a mean of 2.35 and a root of 1.53, so it shows as 2.
 *
 * Rounding the mean to 2 first and then the root reads 1, which is what rounding twice gets wrong.
 */
void test_rounds_once_not_twice(void)
{
    HrvRun run;
    hrv_run_reset(&run);
    uint16_t gap = 1000;
    hrv_run_push(&run, gap, 1);
    for (int beat = 1; beat <= 20; beat++)
    {
        uint16_t step = beat <= 11 ? 1 : 2;
        gap = beat % 2 == 1 ? gap + step : gap - step;
        hrv_run_push(&run, gap, 1 + (uint32_t)beat);
    }

    int result = hrv_run_finish(&run);

    TEST_ASSERT_EQUAL_INT(2, result);
}

/** @brief A run short of HRV_DIFFS_MIN gives no answer, since a handful of beats says nothing. */
void test_too_few_beats_give_no_reading(void)
{
    HrvRun run;
    hrv_run_reset(&run);
    push_alternating(&run, 1000, 1010, 20, 1);

    int result = hrv_run_finish(&run);

    TEST_ASSERT_EQUAL_INT(-1, result);
}

/**
 * @brief A gap of 0 is the watch with no reading for one beat, so it is dropped and the run carries on.
 *
 * Ending the run on it instead would throw away a burst partway through, often short of the 20
 * differences a reading needs.
 */
void test_a_gap_of_zero_drops_one_beat(void)
{
    HrvRun run;
    hrv_run_reset(&run);
    push_alternating(&run, 1000, 1010, 11, 1);
    int dropped = hrv_run_push(&run, 0, 12);
    push_alternating(&run, 1010, 1000, 11, 13);

    int result = hrv_run_finish(&run);

    TEST_ASSERT_EQUAL_INT(-1, dropped);
    TEST_ASSERT_EQUAL_INT(10, result);
}

/**
 * @brief A gap outside a heart rate of 30 to 200 is noise, and the good gaps on either side of it are
 * not neighbours.
 *
 * The 1000 before the noise and the 1040 after it would make a difference of 40, which is the
 * missing beat talking rather than the heart. Left in, it lifts the reading above 10.
 */
void test_drops_a_gap_out_of_range(void)
{
    HrvRun run;
    hrv_run_reset(&run);
    push_alternating(&run, 1000, 1010, 11, 1);
    hrv_run_push(&run, 250, 12);
    hrv_run_push(&run, 2100, 13);
    hrv_run_push(&run, 1040, 14);
    push_alternating(&run, 1050, 1040, 10, 15);

    int result = hrv_run_finish(&run);

    TEST_ASSERT_EQUAL_INT(10, result);
}

/**
 * @brief A missed beat reads as one gap twice as long, and dropping it keeps the reading at 10.
 *
 * Left in, the two differences of about 1000 around it would lift the reading to over 200.
 */
void test_drops_a_missed_beat(void)
{
    HrvRun run;
    hrv_run_reset(&run);
    push_alternating(&run, 1000, 1010, 11, 1);
    hrv_run_push(&run, 2010, 12);
    push_alternating(&run, 1010, 1000, 11, 13);

    int result = hrv_run_finish(&run);

    TEST_ASSERT_EQUAL_INT(10, result);
}

/**
 * @brief A heart rate that really moved costs one dropped gap, then carries on from its new pace.
 *
 * Measuring every gap at the new pace against the old one would drop them all, and no reading
 * would come again until the run was thrown away.
 */
void test_carries_on_at_a_new_pace(void)
{
    HrvRun run;
    hrv_run_reset(&run);
    push_alternating(&run, 1000, 1010, 11, 1);
    hrv_run_push(&run, 700, 12);
    push_alternating(&run, 700, 710, 11, 13);

    int result = hrv_run_finish(&run);

    TEST_ASSERT_EQUAL_INT(10, result);
}

/** @brief A beat after a quiet pause hands back the run before it, which belongs to the last burst. */
void test_a_beat_after_a_pause_finishes_the_run_before_it(void)
{
    HrvRun run;
    hrv_run_reset(&run);
    push_alternating(&run, 1000, 1010, 21, 1);

    int result = hrv_run_push(&run, 1000, 21 + HRV_QUIET_SEC);

    TEST_ASSERT_EQUAL_INT(10, result);
}

/** @brief A beat a second after the last one carries the run on rather than ending it. */
void test_a_beat_without_a_pause_hands_back_nothing(void)
{
    HrvRun run;
    hrv_run_reset(&run);
    push_alternating(&run, 1000, 1010, 21, 1);

    int result = hrv_run_push(&run, 1010, 22);

    TEST_ASSERT_EQUAL_INT(-1, result);
}

/** @brief The run goes quiet only once HRV_QUIET_SEC pass with no beat, so a timer can finish it. */
void test_quiet_after_the_pause_and_not_before(void)
{
    HrvRun run;
    hrv_run_reset(&run);
    push_alternating(&run, 1000, 1010, 5, 100);

    bool early = hrv_run_quiet(&run, 104 + HRV_QUIET_SEC - 1);
    bool late = hrv_run_quiet(&run, 104 + HRV_QUIET_SEC);

    TEST_ASSERT_FALSE(early);
    TEST_ASSERT_TRUE(late);
}

/**
 * @brief A clock set back a few seconds by the phone is no pause, so the run carries on.
 *
 * Read as a wrapped difference it is a pause of over a century, and the burst is cut short.
 */
void test_a_clock_set_back_is_not_a_pause(void)
{
    HrvRun run;
    hrv_run_reset(&run);
    push_alternating(&run, 1000, 1010, 5, 100);

    bool result = hrv_run_quiet(&run, 101);

    TEST_ASSERT_FALSE(result);
}

/** @brief An empty run is never quiet, or a timer would finish nothing over and over. */
void test_an_empty_run_is_not_quiet(void)
{
    HrvRun run;
    hrv_run_reset(&run);

    bool result = hrv_run_quiet(&run, 100000);

    TEST_ASSERT_FALSE(result);
}

/** @brief A run that reaches HRV_DIFFS_FULL hands back its answer on that beat, so a long burst still gives readings. */
void test_a_full_run_finishes_itself(void)
{
    HrvRun run;
    hrv_run_reset(&run);
    push_alternating(&run, 1000, 1010, HRV_DIFFS_FULL, 1);

    int result = hrv_run_push(&run, 1000, HRV_DIFFS_FULL + 1);

    TEST_ASSERT_EQUAL_INT(10, result);
}

/**
 * @brief The gap that fills a run starts the next, so a long burst loses no difference between runs.
 *
 * Started empty instead, the next run would need one more gap, and a short burst after a full run
 * would fall short of a reading more often.
 */
void test_a_full_run_carries_its_last_gap_into_the_next(void)
{
    HrvRun run;
    hrv_run_reset(&run);
    push_alternating(&run, 1000, 1010, HRV_DIFFS_FULL + 1, 1);
    push_alternating(&run, 1010, 1000, HRV_DIFFS_MIN, HRV_DIFFS_FULL + 2);

    int result = hrv_run_finish(&run);

    TEST_ASSERT_EQUAL_INT(10, result);
}

/** @brief A short period still keeps a reading for half an hour, so it does not blink out between bursts. */
void test_stale_after_half_an_hour_for_a_short_period(void)
{
    bool kept = hrv_reading_stale(1000, 1000 + 1800, 300);
    bool dropped = hrv_reading_stale(1000, 1000 + 1801, 300);

    TEST_ASSERT_FALSE(kept);
    TEST_ASSERT_TRUE(dropped);
}

/** @brief A long period keeps a reading for three periods, so one missed burst does not clear it. */
void test_stale_after_three_long_periods(void)
{
    bool kept = hrv_reading_stale(1000, 1000 + 2700, 900);
    bool dropped = hrv_reading_stale(1000, 1000 + 2701, 900);

    TEST_ASSERT_FALSE(kept);
    TEST_ASSERT_TRUE(dropped);
}

/** @brief A clock set back since the reading keeps it up, rather than clearing a fresh one straight away. */
void test_a_clock_set_back_does_not_make_a_reading_stale(void)
{
    bool result = hrv_reading_stale(5000, 4990, 300);

    TEST_ASSERT_FALSE(result);
}

/** @brief A request the watch turned down is asked again once the wait has passed, for heart rate turned back on. */
void test_asks_again_after_a_refusal_once_the_wait_passes(void)
{
    bool result = hrv_should_ask(false, 1000, 1000, 1000 + 1801, 300);

    TEST_ASSERT_TRUE(result);
}

/** @brief A refusal is not asked again straight away, or a watch with no sensor is asked on every turn. */
void test_does_not_ask_again_straight_after_a_refusal(void)
{
    bool result = hrv_should_ask(false, 1000, 1000, 1000 + 60, 300);

    TEST_ASSERT_FALSE(result);
}

/** @brief A request bringing in gaps is left alone, since asking again restarts the sensor. */
void test_does_not_ask_while_gaps_arrive(void)
{
    bool result = hrv_should_ask(true, 1000 + 1700, 1000, 1000 + 1801, 300);

    TEST_ASSERT_FALSE(result);
}

/** @brief A taken request with no gap for the whole wait has lapsed, so it is asked for again. */
void test_asks_again_when_a_taken_request_brings_no_gaps(void)
{
    bool result = hrv_should_ask(true, 1000, 1000, 1000 + 1801, 300);

    TEST_ASSERT_TRUE(result);
}

/** @brief A hold ends once HRV_HOLD_MAX_SEC pass, so a run that never fills cannot keep the sensor on. */
void test_a_hold_is_over_after_its_cap(void)
{
    bool early = hrv_hold_over(1000, 1000 + HRV_HOLD_MAX_SEC - 1);
    bool late = hrv_hold_over(1000, 1000 + HRV_HOLD_MAX_SEC);

    TEST_ASSERT_FALSE(early);
    TEST_ASSERT_TRUE(late);
}

/** @brief A clock set back during a hold reads as no time passed, rather than ending it at once. */
void test_a_clock_set_back_does_not_end_a_hold(void)
{
    bool result = hrv_hold_over(1000, 990);

    TEST_ASSERT_FALSE(result);
}

/** @brief A finished run says how many differences went into it, which the tuning panel shows as the beats kept. */
void test_a_finished_run_keeps_its_count(void)
{
    HrvRun run;
    hrv_run_reset(&run);
    push_alternating(&run, 1000, 1010, 26, 1);

    hrv_run_finish(&run);

    TEST_ASSERT_EQUAL_UINT16(25, run.finished_diffs);
    TEST_ASSERT_EQUAL_UINT16(0, run.diffs);
}

/** Unity needs each test naming, so a new one above is added here too. */
int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_steady_differences_give_that_difference);
    RUN_TEST(test_rounds_the_root_to_the_nearest);
    RUN_TEST(test_rounds_once_not_twice);
    RUN_TEST(test_too_few_beats_give_no_reading);
    RUN_TEST(test_a_gap_of_zero_drops_one_beat);
    RUN_TEST(test_drops_a_gap_out_of_range);
    RUN_TEST(test_drops_a_missed_beat);
    RUN_TEST(test_carries_on_at_a_new_pace);
    RUN_TEST(test_a_beat_after_a_pause_finishes_the_run_before_it);
    RUN_TEST(test_a_beat_without_a_pause_hands_back_nothing);
    RUN_TEST(test_quiet_after_the_pause_and_not_before);
    RUN_TEST(test_a_clock_set_back_is_not_a_pause);
    RUN_TEST(test_an_empty_run_is_not_quiet);
    RUN_TEST(test_a_full_run_finishes_itself);
    RUN_TEST(test_a_finished_run_keeps_its_count);
    RUN_TEST(test_a_full_run_carries_its_last_gap_into_the_next);
    RUN_TEST(test_stale_after_half_an_hour_for_a_short_period);
    RUN_TEST(test_stale_after_three_long_periods);
    RUN_TEST(test_a_clock_set_back_does_not_make_a_reading_stale);
    RUN_TEST(test_asks_again_after_a_refusal_once_the_wait_passes);
    RUN_TEST(test_does_not_ask_again_straight_after_a_refusal);
    RUN_TEST(test_does_not_ask_while_gaps_arrive);
    RUN_TEST(test_asks_again_when_a_taken_request_brings_no_gaps);
    RUN_TEST(test_a_hold_is_over_after_its_cap);
    RUN_TEST(test_a_clock_set_back_does_not_end_a_hold);

    return UNITY_END();
}
