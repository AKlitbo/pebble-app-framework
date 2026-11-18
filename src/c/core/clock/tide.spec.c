/**
 * @file tide.spec.c
 * @brief Host tests for the tidal rise and fall.
 *
 * The shape matters more than any one reading here, so the cases worth pinning are the ones a plain
 * sawtooth would get wrong or never be asked: that the turns really flatten out, that the level
 * never leaves 0..100, and that a negative minute count wraps instead of running the maths on a
 * negative remainder. The 24h50m drift is the other half of it, since a tide that came back at the
 * same clock time every day would be the one thing a tide never does. How long each end lasts,
 * where high water sits, and how far the level moves in a minute are pinned too, since the integer
 * maths gets all three wrong easily and a face drawing the water shows every one of them.
 *
 * Every minute of one cycle is pinned against a table of the rounded curve. tide_level only reads
 * where its count lands in the cycle, so those 745 minutes are every answer it can give. The shape
 * cases above check the table's curve on their own, so they still say something when the curve is
 * changed on purpose and the table written again.
 */
#include "unity.h"

#include "clock/tide.h"

void setUp(void) {}
void tearDown(void) {}

// a solar day, for checking the tide against the clock rather than against itself
#define MINUTES_PER_DAY 1440

// the level at each minute of the cycle from dead low, the curve 100 * (3t^2 - 2t^3) rounded to the
// nearest point, with t the folded climb over the period
static const int LEVEL_BY_MINUTE[TIDE_PERIOD_MIN] = {
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5,
    5, 5, 5, 5, 6, 6, 6, 6, 7, 7, 7, 7, 7, 8, 8, 8, 8, 9, 9, 9, 9, 10, 10, 10, 10,
    11, 11, 11, 11, 12, 12, 12, 12, 13, 13, 13, 14, 14, 14, 14, 15, 15, 15, 16, 16, 16, 17, 17, 17, 17,
    18, 18, 18, 19, 19, 19, 20, 20, 20, 21, 21, 21, 22, 22, 22, 23, 23, 23, 24, 24, 24, 25, 25, 26, 26,
    26, 27, 27, 27, 28, 28, 28, 29, 29, 30, 30, 30, 31, 31, 31, 32, 32, 33, 33, 33, 34, 34, 34, 35, 35,
    36, 36, 36, 37, 37, 38, 38, 38, 39, 39, 39, 40, 40, 41, 41, 41, 42, 42, 43, 43, 43, 44, 44, 45, 45,
    45, 46, 46, 47, 47, 47, 48, 48, 49, 49, 49, 50, 50, 51, 51, 52, 52, 52, 53, 53, 54, 54, 54, 55, 55,
    56, 56, 56, 57, 57, 58, 58, 58, 59, 59, 60, 60, 60, 61, 61, 61, 62, 62, 63, 63, 63, 64, 64, 65, 65,
    65, 66, 66, 67, 67, 67, 68, 68, 68, 69, 69, 70, 70, 70, 71, 71, 71, 72, 72, 73, 73, 73, 74, 74, 74,
    75, 75, 75, 76, 76, 76, 77, 77, 77, 78, 78, 78, 79, 79, 79, 80, 80, 80, 81, 81, 81, 82, 82, 82, 83,
    83, 83, 84, 84, 84, 85, 85, 85, 85, 86, 86, 86, 87, 87, 87, 87, 88, 88, 88, 89, 89, 89, 89, 90, 90,
    90, 90, 91, 91, 91, 91, 92, 92, 92, 92, 92, 93, 93, 93, 93, 94, 94, 94, 94, 94, 95, 95, 95, 95, 95,
    96, 96, 96, 96, 96, 96, 97, 97, 97, 97, 97, 97, 97, 98, 98, 98, 98, 98, 98, 98, 98, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
    98, 98, 98, 98, 98, 98, 98, 98, 97, 97, 97, 97, 97, 97, 97, 96, 96, 96, 96, 96, 96, 95, 95, 95, 95,
    95, 94, 94, 94, 94, 94, 93, 93, 93, 93, 92, 92, 92, 92, 92, 91, 91, 91, 91, 90, 90, 90, 90, 89, 89,
    89, 89, 88, 88, 88, 87, 87, 87, 87, 86, 86, 86, 85, 85, 85, 85, 84, 84, 84, 83, 83, 83, 82, 82, 82,
    81, 81, 81, 80, 80, 80, 79, 79, 79, 78, 78, 78, 77, 77, 77, 76, 76, 76, 75, 75, 75, 74, 74, 74, 73,
    73, 73, 72, 72, 71, 71, 71, 70, 70, 70, 69, 69, 68, 68, 68, 67, 67, 67, 66, 66, 65, 65, 65, 64, 64,
    63, 63, 63, 62, 62, 61, 61, 61, 60, 60, 60, 59, 59, 58, 58, 58, 57, 57, 56, 56, 56, 55, 55, 54, 54,
    54, 53, 53, 52, 52, 52, 51, 51, 50, 50, 49, 49, 49, 48, 48, 47, 47, 47, 46, 46, 45, 45, 45, 44, 44,
    43, 43, 43, 42, 42, 41, 41, 41, 40, 40, 39, 39, 39, 38, 38, 38, 37, 37, 36, 36, 36, 35, 35, 34, 34,
    34, 33, 33, 33, 32, 32, 31, 31, 31, 30, 30, 30, 29, 29, 28, 28, 28, 27, 27, 27, 26, 26, 26, 25, 25,
    24, 24, 24, 23, 23, 23, 22, 22, 22, 21, 21, 21, 20, 20, 20, 19, 19, 19, 18, 18, 18, 17, 17, 17, 17,
    16, 16, 16, 15, 15, 15, 14, 14, 14, 14, 13, 13, 13, 12, 12, 12, 12, 11, 11, 11, 11, 10, 10, 10, 10,
    9, 9, 9, 9, 8, 8, 8, 8, 7, 7, 7, 7, 7, 6, 6, 6, 6, 5, 5, 5, 5, 5, 5, 4, 4,
    4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
};

/**
 * @brief Reads the level for every minute of one cycle.
 *
 * @param start A minute count where the cycle sits at dead low.
 * @param levels Where each minute's level goes, TIDE_PERIOD_MIN of them.
 */
static void read_cycle(int32_t start, int levels[TIDE_PERIOD_MIN])
{
    for (int32_t offset = 0; offset < TIDE_PERIOD_MIN; offset++)
    {
        levels[offset] = tide_level(start + offset);
    }
}

/** @brief The count starts at dead low, which is what the rest of the cases are measured from. */
void test_starts_at_low_water(void)
{
    int result = tide_level(0);

    TEST_ASSERT_EQUAL_INT(0, result);
}

/** @brief A full period on the water is back where it started, or the cycle never closes and the level walks away over a week. */
void test_returns_to_low_water_after_one_period(void)
{
    int result = tide_level(TIDE_PERIOD_MIN);

    TEST_ASSERT_EQUAL_INT(0, result);
}

/** @brief High water lands halfway through, and it reaches the top of the range. */
void test_reaches_high_water_midway(void)
{
    int result = tide_level(TIDE_PERIOD_MIN / 2 + 1);

    TEST_ASSERT_EQUAL_INT(100, result);
}

/** @brief The level is a level: nothing in the cycle may fall outside 0..100. */
void test_stays_within_range_across_the_cycle(void)
{
    int lowest = 100;
    int highest = 0;

    for (int32_t minute = 0; minute < TIDE_PERIOD_MIN; minute++)
    {
        int level = tide_level(minute);
        lowest = level < lowest ? level : lowest;
        highest = level > highest ? level : highest;
    }

    TEST_ASSERT_EQUAL_INT(0, lowest);
    TEST_ASSERT_EQUAL_INT(100, highest);
}

/**
 * @brief High water holds about as long as low water.
 *
 * Working the level out in two rounded-down steps left it on 0 for 41 minutes a cycle and on 100
 * for only 4, so a face drawing the water showed a high tide that barely arrived before it turned.
 * The two can never match exactly. Low water is centred on a whole minute, so it spans an odd
 * number of them, and high water on the half minute at 372.5, so it spans an even number.
 */
void test_holds_high_water_as_long_as_low_water(void)
{
    int at_low = 0;
    int at_high = 0;

    for (int32_t minute = 0; minute < TIDE_PERIOD_MIN; minute++)
    {
        int level = tide_level(minute);
        at_low += level == 0;
        at_high += level == 100;
    }

    TEST_ASSERT_EQUAL_INT(31, at_low);
    TEST_ASSERT_EQUAL_INT(30, at_high);
}

/**
 * @brief High water sits centred on the turn, halfway through the cycle at minute 372.5.
 *
 * Counting the minutes at 100 says nothing about where they fall. Rounding off centre still gives
 * the right count with high water a couple of minutes late, out of step with `tide_rising`.
 */
void test_centres_high_water_on_the_turn(void)
{
    int before = tide_level(357);
    int first = tide_level(358);
    int last = tide_level(387);
    int after = tide_level(388);

    TEST_ASSERT_EQUAL_INT(99, before);
    TEST_ASSERT_EQUAL_INT(100, first);
    TEST_ASSERT_EQUAL_INT(100, last);
    TEST_ASSERT_EQUAL_INT(99, after);
}

/**
 * @brief The level moves at most one point from one minute to the next.
 *
 * A face redraws the water every minute, and a jump of two points is a pixel or more on a small
 * waterline, which shows as the water hopping rather than creeping.
 */
void test_moves_at_most_one_point_a_minute(void)
{
    int biggest = 0;

    for (int32_t minute = 0; minute < TIDE_PERIOD_MIN; minute++)
    {
        int step = tide_level(minute + 1) - tide_level(minute);
        step = step < 0 ? -step : step;
        biggest = step > biggest ? step : biggest;
    }

    TEST_ASSERT_EQUAL_INT(1, biggest);
}

/** @brief The same point in a later cycle reads the same, so the water does not wander. */
void test_repeats_every_period(void)
{
    int first = tide_level(200);
    int later = tide_level(200 + TIDE_PERIOD_MIN * 9);

    TEST_ASSERT_EQUAL_INT(first, later);
}

/**
 * @brief The tide stands almost still at the turn and runs fastest halfway through.
 *
 * This is the case a straight ramp fails. Without it the water would crawl up the sand at one
 * constant rate, which is the tell that nothing real is behind it.
 */
void test_moves_slower_at_the_turn_than_at_mid_tide(void)
{
    int at_turn = tide_level(20) - tide_level(0);
    int at_middle = tide_level(TIDE_PERIOD_MIN / 4 + 20) - tide_level(TIDE_PERIOD_MIN / 4);

    TEST_ASSERT_TRUE(at_turn < at_middle);
}

/** @brief It floods over the first half, and the direction is what the arrow on the face draws. */
void test_rising_through_the_first_half(void)
{
    bool result = tide_rising(TIDE_PERIOD_MIN / 4);

    TEST_ASSERT_TRUE(result);
}

/** @brief And ebbs back over the second, since an arrow stuck one way round is worse than none at all. */
void test_falling_through_the_second_half(void)
{
    bool result = tide_rising((TIDE_PERIOD_MIN * 3) / 4);

    TEST_ASSERT_FALSE(result);
}

/**
 * @brief Low water comes back 24h50m later, not 24h.
 *
 * Two periods run fifty minutes past a solar day, which is the drift that makes a tide walk
 * around the clock over a fortnight.
 */
void test_low_water_drifts_fifty_minutes_later_each_day(void)
{
    int result = tide_level(MINUTES_PER_DAY + 50);

    TEST_ASSERT_EQUAL_INT(0, result);
    TEST_ASSERT_EQUAL_INT(MINUTES_PER_DAY + 50, TIDE_PERIOD_MIN * 2);
}

/** @brief Every minute of a cycle lands on the exact rounded curve, so the waterline sits on the pixel it should all day. */
void test_matches_the_curve_every_minute_of_the_cycle(void)
{
    int levels[TIDE_PERIOD_MIN];

    read_cycle(0, levels);

    TEST_ASSERT_EQUAL_INT_ARRAY(LEVEL_BY_MINUTE, levels, TIDE_PERIOD_MIN);
}

/**
 * @brief A count from before the epoch reads the same curve.
 *
 * C leaves a negative remainder for a negative dividend, so an unguarded modulo would put the
 * water below the beach.
 */
void test_matches_the_curve_on_a_cycle_before_the_epoch(void)
{
    int levels[TIDE_PERIOD_MIN];

    read_cycle(-TIDE_PERIOD_MIN, levels);

    TEST_ASSERT_EQUAL_INT_ARRAY(LEVEL_BY_MINUTE, levels, TIDE_PERIOD_MIN);
}

/** @brief The first whole cycle a 32-bit count holds reads the same curve. -2147483360 sits at dead low. */
void test_matches_the_curve_on_the_lowest_whole_cycle(void)
{
    int levels[TIDE_PERIOD_MIN];

    read_cycle(-2147483360, levels);

    TEST_ASSERT_EQUAL_INT_ARRAY(LEVEL_BY_MINUTE, levels, TIDE_PERIOD_MIN);
}

/** @brief The last whole cycle a 32-bit count holds reads the same curve. 2147482615 sits at dead low. */
void test_matches_the_curve_on_the_highest_whole_cycle(void)
{
    int levels[TIDE_PERIOD_MIN];

    read_cycle(2147482615, levels);

    TEST_ASSERT_EQUAL_INT_ARRAY(LEVEL_BY_MINUTE, levels, TIDE_PERIOD_MIN);
}

/**
 * @brief The very ends of a 32-bit count read the curve, since finding the phase is where an
 * overflow would show. INT32_MIN lands 457 minutes into a cycle and INT32_MAX 287.
 */
void test_matches_the_curve_at_both_ends_of_the_count(void)
{
    int lowest = tide_level(INT32_MIN);
    int highest = tide_level(INT32_MAX);

    TEST_ASSERT_EQUAL_INT(LEVEL_BY_MINUTE[457], lowest);
    TEST_ASSERT_EQUAL_INT(LEVEL_BY_MINUTE[287], highest);
}

int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_starts_at_low_water);
    RUN_TEST(test_returns_to_low_water_after_one_period);
    RUN_TEST(test_reaches_high_water_midway);
    RUN_TEST(test_stays_within_range_across_the_cycle);
    RUN_TEST(test_holds_high_water_as_long_as_low_water);
    RUN_TEST(test_centres_high_water_on_the_turn);
    RUN_TEST(test_moves_at_most_one_point_a_minute);
    RUN_TEST(test_repeats_every_period);
    RUN_TEST(test_moves_slower_at_the_turn_than_at_mid_tide);
    RUN_TEST(test_rising_through_the_first_half);
    RUN_TEST(test_falling_through_the_second_half);
    RUN_TEST(test_low_water_drifts_fifty_minutes_later_each_day);
    RUN_TEST(test_matches_the_curve_every_minute_of_the_cycle);
    RUN_TEST(test_matches_the_curve_on_a_cycle_before_the_epoch);
    RUN_TEST(test_matches_the_curve_on_the_lowest_whole_cycle);
    RUN_TEST(test_matches_the_curve_on_the_highest_whole_cycle);
    RUN_TEST(test_matches_the_curve_at_both_ends_of_the_count);

    return UNITY_END();
}
