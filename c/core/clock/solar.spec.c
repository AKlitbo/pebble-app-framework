/**
 * @file solar.spec.c
 * @brief Host tests for the day/night progress and the next sun event.
 *
 * The arithmetic is easy in the middle of the day and awkward at the edges, so the cases worth
 * pinning are the ones with a boundary or a midnight in them: night wrapping past midnight, the
 * moment on sunrise or sunset, and the three day-phases the next event has to tell apart. A missing
 * reading of -1 must never be treated as a real time.
 *
 * A high latitude summer sets after midnight, Reykjavik in June going down about 00:05 and up
 * about 03:00. Sunset then reads smaller than sunrise, and a day that assumes the opposite shows
 * the night scene all afternoon, so that case gets its own set of tests.
 */
#include "unity.h"

#include "clock/solar.h"

void setUp(void) {}
void tearDown(void) {}

// a day where the sun is up from 06:00 (360) to 18:00 (1080)
#define RISE 360
#define SET 1080

// a high latitude summer day, up at 03:00 (180) and down after midnight at 00:30 (30)
#define LATE_RISE 180
#define LATE_SET 30

/** @brief Noon is exactly halfway through a six-to-six day, the case the edges below are corners of. */
void test_day_midday_is_halfway(void)
{
    int result = solar_day_progress(RISE, SET, 720);

    TEST_ASSERT_EQUAL_INT(50, result);
}

/** @brief Before sunrise it is night, so day-progress has nothing to show. */
void test_day_before_sunrise_is_none(void)
{
    int result = solar_day_progress(RISE, SET, 300);

    TEST_ASSERT_EQUAL_INT(-1, result);
}

/** @brief After sunset it is night again, and past the end is not 100 but nothing. */
void test_day_after_sunset_is_none(void)
{
    int result = solar_day_progress(RISE, SET, 1200);

    TEST_ASSERT_EQUAL_INT(-1, result);
}

/** @brief A missing reading is not a time and must not be counted as midnight. */
void test_day_no_data_is_none(void)
{
    int result = solar_day_progress(-1, SET, 720);

    TEST_ASSERT_EQUAL_INT(-1, result);
}

/** @brief In daylight there is no night to show, or the face draws a night arc straight through the afternoon. */
void test_night_during_the_day_is_none(void)
{
    int result = solar_night_progress(RISE, SET, 720);

    TEST_ASSERT_EQUAL_INT(-1, result);
}

/** @brief The small hours wrap onto the night that began at yesterday's sunset, so midnight reads as halfway through rather than as no data. */
void test_night_after_midnight_wraps(void)
{
    int result = solar_night_progress(RISE, SET, 0);

    TEST_ASSERT_EQUAL_INT(50, result);
}

/** @brief Just after sunset the night has barely begun. */
void test_night_just_after_sunset_is_low(void)
{
    int result = solar_night_progress(RISE, SET, 1081);

    TEST_ASSERT_EQUAL_INT(0, result);
}

/** @brief Before sunrise, the next event is that sunrise, and its distance is the wait. */
void test_next_is_sunrise_while_dark(void)
{
    bool is_sunrise = false;

    int result = solar_next_event(RISE, SET, 300, &is_sunrise);

    TEST_ASSERT_EQUAL_INT(60, result);
    TEST_ASSERT_TRUE(is_sunrise);
}

/** @brief While the sun is up the next event is the sunset, since naming the wrong one puts a sunrise glyph on an afternoon countdown. */
void test_next_is_sunset_while_up(void)
{
    bool is_sunrise = true;

    int result = solar_next_event(RISE, SET, 720, &is_sunrise);

    TEST_ASSERT_EQUAL_INT(360, result);
    TEST_ASSERT_FALSE(is_sunrise);
}

/** @brief Once the sun has set, the next event is tomorrow's sunrise, counted across midnight. */
void test_next_is_tomorrows_sunrise_after_set(void)
{
    bool is_sunrise = false;

    int result = solar_next_event(RISE, SET, 1200, &is_sunrise);

    TEST_ASSERT_EQUAL_INT(600, result);
    TEST_ASSERT_TRUE(is_sunrise);
}

/** @brief With no data there is no event, and the caller's flag is left as it was. */
void test_next_no_data_is_none_and_leaves_the_flag(void)
{
    bool is_sunrise = false;

    int result = solar_next_event(RISE, -1, 720, &is_sunrise);

    TEST_ASSERT_EQUAL_INT(-1, result);
    TEST_ASSERT_FALSE(is_sunrise);
}

/**
 * @brief Midday under a sunset after midnight is daylight, where the maths that wants sunset last
 * read it as night all afternoon.
 */
void test_day_under_a_late_sunset_counts_midday(void)
{
    int result = solar_day_progress(LATE_RISE, LATE_SET, 720);

    TEST_ASSERT_EQUAL_INT(41, result);
}

/**
 * @brief Ten past midnight is still before the 00:30 sunset, so the sun is nearly down rather than
 * gone.
 */
void test_day_under_a_late_sunset_runs_past_midnight(void)
{
    int result = solar_day_progress(LATE_RISE, LATE_SET, 10);

    TEST_ASSERT_EQUAL_INT(98, result);
}

/** @brief Between the late sunset and sunrise it is dark, so there is no daylight to show. */
void test_day_under_a_late_sunset_is_none_in_the_short_night(void)
{
    int result = solar_day_progress(LATE_RISE, LATE_SET, 60);

    TEST_ASSERT_EQUAL_INT(-1, result);
}

/**
 * @brief The short night is only two and a half hours, so 01:00 is a fifth of the way through
 * rather than past the end.
 */
void test_night_under_a_late_sunset_uses_the_short_night(void)
{
    int result = solar_night_progress(LATE_RISE, LATE_SET, 60);

    TEST_ASSERT_EQUAL_INT(20, result);
}

/** @brief Midday under a late sunset has no night, or the moon is drawn in the daylight. */
void test_night_under_a_late_sunset_is_none_at_midday(void)
{
    int result = solar_night_progress(LATE_RISE, LATE_SET, 720);

    TEST_ASSERT_EQUAL_INT(-1, result);
}

/**
 * @brief At midday the next event is the sunset after midnight, not a sunrise fifteen hours off.
 */
void test_next_under_a_late_sunset_is_sunset_at_midday(void)
{
    bool is_sunrise = true;

    int result = solar_next_event(LATE_RISE, LATE_SET, 720, &is_sunrise);

    TEST_ASSERT_EQUAL_INT(750, result);
    TEST_ASSERT_FALSE(is_sunrise);
}

/** @brief In the short night the next event is the 03:00 sunrise. */
void test_next_under_a_late_sunset_is_sunrise_in_the_short_night(void)
{
    bool is_sunrise = false;

    int result = solar_next_event(LATE_RISE, LATE_SET, 60, &is_sunrise);

    TEST_ASSERT_EQUAL_INT(120, result);
    TEST_ASSERT_TRUE(is_sunrise);
}

/** @brief Just after sunrise the next event is the sunset nearly a whole day on. */
void test_next_under_a_late_sunset_is_sunset_just_after_sunrise(void)
{
    bool is_sunrise = true;

    int result = solar_next_event(LATE_RISE, LATE_SET, 200, &is_sunrise);

    TEST_ASSERT_EQUAL_INT(1270, result);
    TEST_ASSERT_FALSE(is_sunrise);
}

/**
 * @brief Sunrise and sunset on the same minute could be a polar day or a polar night, so the sun is
 * not guessed at.
 */
void test_day_with_equal_rise_and_set_is_none(void)
{
    int result = solar_day_progress(0, 0, 720);

    TEST_ASSERT_EQUAL_INT(-1, result);
}

/** @brief The night under equal sunrise and sunset is no data too, so the moon is not guessed. */
void test_night_with_equal_rise_and_set_is_none(void)
{
    int result = solar_night_progress(0, 0, 720);

    TEST_ASSERT_EQUAL_INT(-1, result);
}

/** @brief With equal sunrise and sunset there is no next event to count down to. */
void test_next_with_equal_rise_and_set_is_none(void)
{
    bool is_sunrise = false;

    int result = solar_next_event(0, 0, 720, &is_sunrise);

    TEST_ASSERT_EQUAL_INT(-1, result);
}

/**
 * @brief A reading past the end of the day is not a time, so it is no data rather than wrapped onto
 * tomorrow.
 */
void test_a_reading_past_the_day_is_none(void)
{
    int result = solar_day_progress(RISE, 1440, 720);

    TEST_ASSERT_EQUAL_INT(-1, result);
}

int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_day_midday_is_halfway);
    RUN_TEST(test_day_before_sunrise_is_none);
    RUN_TEST(test_day_after_sunset_is_none);
    RUN_TEST(test_day_no_data_is_none);
    RUN_TEST(test_night_during_the_day_is_none);
    RUN_TEST(test_night_after_midnight_wraps);
    RUN_TEST(test_night_just_after_sunset_is_low);
    RUN_TEST(test_next_is_sunrise_while_dark);
    RUN_TEST(test_next_is_sunset_while_up);
    RUN_TEST(test_next_is_tomorrows_sunrise_after_set);
    RUN_TEST(test_next_no_data_is_none_and_leaves_the_flag);
    RUN_TEST(test_day_under_a_late_sunset_counts_midday);
    RUN_TEST(test_day_under_a_late_sunset_runs_past_midnight);
    RUN_TEST(test_day_under_a_late_sunset_is_none_in_the_short_night);
    RUN_TEST(test_night_under_a_late_sunset_uses_the_short_night);
    RUN_TEST(test_night_under_a_late_sunset_is_none_at_midday);
    RUN_TEST(test_next_under_a_late_sunset_is_sunset_at_midday);
    RUN_TEST(test_next_under_a_late_sunset_is_sunrise_in_the_short_night);
    RUN_TEST(test_next_under_a_late_sunset_is_sunset_just_after_sunrise);
    RUN_TEST(test_day_with_equal_rise_and_set_is_none);
    RUN_TEST(test_night_with_equal_rise_and_set_is_none);
    RUN_TEST(test_next_with_equal_rise_and_set_is_none);
    RUN_TEST(test_a_reading_past_the_day_is_none);

    return UNITY_END();
}
