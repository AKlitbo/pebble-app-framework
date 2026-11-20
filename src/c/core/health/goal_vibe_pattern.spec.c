/**
 * @file goal_vibe_pattern.spec.c
 * @brief Host tests for the Goal Met Vibration pick and pattern reader.
 *
 * The wearer types the Custom pattern by hand, so the reader takes whatever arrives. What is worth
 * pinning is what it does with text it did not expect: any separator, a step outside what the
 * firmware plays, more steps than the buffer holds, and a run of digits long enough to wrap a
 * number. The pick's first character picks the buzz, and the empty pick is None, which the face
 * reads before it asks the latch anything.
 */
#include "unity.h"

#include "health/goal_vibe_pattern.h"

// a marker the reader never writes, to show a slot was left alone
#define UNTOUCHED 0xDEADBEEFu

void setUp(void) {}
void tearDown(void) {}

/** @brief None is the empty pick, and it must play nothing and keep the face off the latch. */
void test_goal_vibe_pattern_kind_reads_empty_as_none(void)
{
    GoalVibeKind result = goal_vibe_pattern_kind("");

    TEST_ASSERT_EQUAL_INT(GOAL_VIBE_KIND_NONE, result);
}

/** @brief A face that never placed the setting reads no pick at all, which is None too. */
void test_goal_vibe_pattern_kind_reads_null_as_none(void)
{
    GoalVibeKind result = goal_vibe_pattern_kind(NULL);

    TEST_ASSERT_EQUAL_INT(GOAL_VIBE_KIND_NONE, result);
}

/** @brief S, L, and D are the watch's own pulses, so each plays its pulse rather than reading as a list. */
void test_goal_vibe_pattern_kind_reads_the_pulse_letters(void)
{
    GoalVibeKind result[3] = {goal_vibe_pattern_kind("S"), goal_vibe_pattern_kind("L"), goal_vibe_pattern_kind("D")};

    TEST_ASSERT_EQUAL_INT(GOAL_VIBE_KIND_SHORT, result[0]);
    TEST_ASSERT_EQUAL_INT(GOAL_VIBE_KIND_LONG, result[1]);
    TEST_ASSERT_EQUAL_INT(GOAL_VIBE_KIND_DOUBLE, result[2]);
}

/** @brief C plays the wearer's own pattern, or Custom would play nothing. */
void test_goal_vibe_pattern_kind_reads_c_as_custom(void)
{
    GoalVibeKind result = goal_vibe_pattern_kind("C");

    TEST_ASSERT_EQUAL_INT(GOAL_VIBE_KIND_CUSTOM, result);
}

/** @brief A fanfare is its own list of milliseconds, so anything else reads as a list. */
void test_goal_vibe_pattern_kind_reads_a_list(void)
{
    GoalVibeKind result = goal_vibe_pattern_kind("50,50,250");

    TEST_ASSERT_EQUAL_INT(GOAL_VIBE_KIND_LIST, result);
}

/** @brief A plain list reads in order, buzz first. */
void test_goal_vibe_pattern_parse_reads_a_comma_list(void)
{
    uint32_t steps[GOAL_VIBE_PATTERN_MAX];

    int result = goal_vibe_pattern_parse("100,80,300", steps, GOAL_VIBE_PATTERN_MAX);

    TEST_ASSERT_EQUAL_INT(3, result);
    TEST_ASSERT_EQUAL_UINT32(100, steps[0]);
    TEST_ASSERT_EQUAL_UINT32(80, steps[1]);
    TEST_ASSERT_EQUAL_UINT32(300, steps[2]);
}

/** @brief A wearer who types spaces, a full stop, or two commas still gets the rhythm they meant. */
void test_goal_vibe_pattern_parse_takes_any_separator(void)
{
    uint32_t steps[GOAL_VIBE_PATTERN_MAX];

    int result = goal_vibe_pattern_parse(" 100, 80.,,300 ms", steps, GOAL_VIBE_PATTERN_MAX);

    TEST_ASSERT_EQUAL_INT(3, result);
    TEST_ASSERT_EQUAL_UINT32(100, steps[0]);
    TEST_ASSERT_EQUAL_UINT32(80, steps[1]);
    TEST_ASSERT_EQUAL_UINT32(300, steps[2]);
}

/** @brief A step under 10 ms is raised to 10, so a typed 0 still takes a moment rather than vanishing. */
void test_goal_vibe_pattern_parse_raises_a_short_step(void)
{
    uint32_t steps[GOAL_VIBE_PATTERN_MAX];

    int result = goal_vibe_pattern_parse("0,5", steps, GOAL_VIBE_PATTERN_MAX);

    TEST_ASSERT_EQUAL_INT(2, result);
    TEST_ASSERT_EQUAL_UINT32(10, steps[0]);
    TEST_ASSERT_EQUAL_UINT32(10, steps[1]);
}

/** @brief A step over 10 seconds is cut to 10 seconds, the most the firmware plays. */
void test_goal_vibe_pattern_parse_cuts_a_long_step(void)
{
    uint32_t steps[GOAL_VIBE_PATTERN_MAX];

    int result = goal_vibe_pattern_parse("10001,60000", steps, GOAL_VIBE_PATTERN_MAX);

    TEST_ASSERT_EQUAL_INT(2, result);
    TEST_ASSERT_EQUAL_UINT32(10000, steps[0]);
    TEST_ASSERT_EQUAL_UINT32(10000, steps[1]);
}

/**
 * @brief Twenty nines would wrap a 32-bit number round to something short. The step reads as the
 * longest one instead, and the step after it is untouched.
 */
void test_goal_vibe_pattern_parse_holds_a_long_run_of_digits_to_the_longest_step(void)
{
    uint32_t steps[GOAL_VIBE_PATTERN_MAX];

    int result = goal_vibe_pattern_parse("99999999999999999999,200", steps, GOAL_VIBE_PATTERN_MAX);

    TEST_ASSERT_EQUAL_INT(2, result);
    TEST_ASSERT_EQUAL_UINT32(10000, steps[0]);
    TEST_ASSERT_EQUAL_UINT32(200, steps[1]);
}

/** @brief Steps past the buffer's room are dropped, and nothing is written past its end. */
void test_goal_vibe_pattern_parse_drops_steps_past_the_cap(void)
{
    uint32_t steps[GOAL_VIBE_PATTERN_MAX + 1];
    steps[GOAL_VIBE_PATTERN_MAX] = UNTOUCHED;
    const char *text = "11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,"
                       "31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52";

    int result = goal_vibe_pattern_parse(text, steps, GOAL_VIBE_PATTERN_MAX);

    TEST_ASSERT_EQUAL_INT(GOAL_VIBE_PATTERN_MAX, result);
    TEST_ASSERT_EQUAL_UINT32(50, steps[GOAL_VIBE_PATTERN_MAX - 1]);
    TEST_ASSERT_EQUAL_HEX32(UNTOUCHED, steps[GOAL_VIBE_PATTERN_MAX]);
}

/** @brief A list with no numbers plays nothing rather than a buzz of whatever the buffer held. */
void test_goal_vibe_pattern_parse_finds_nothing_in_a_list_without_numbers(void)
{
    uint32_t steps[GOAL_VIBE_PATTERN_MAX];

    int result = goal_vibe_pattern_parse("on, off, on", steps, GOAL_VIBE_PATTERN_MAX);

    TEST_ASSERT_EQUAL_INT(0, result);
}

/**
 * @brief A face that offers Custom with no pattern entry reads the pattern as empty text, so Custom
 * stays quiet rather than buzzing an empty rhythm.
 */
void test_goal_vibe_pattern_parse_finds_nothing_in_empty_text(void)
{
    uint32_t steps[GOAL_VIBE_PATTERN_MAX];

    int result = goal_vibe_pattern_parse("", steps, GOAL_VIBE_PATTERN_MAX);

    TEST_ASSERT_EQUAL_INT(0, result);
}

/** @brief A face with no Custom pattern setting reads NULL, which plays nothing. */
void test_goal_vibe_pattern_parse_finds_nothing_in_null(void)
{
    uint32_t steps[GOAL_VIBE_PATTERN_MAX];

    int result = goal_vibe_pattern_parse(NULL, steps, GOAL_VIBE_PATTERN_MAX);

    TEST_ASSERT_EQUAL_INT(0, result);
}

int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_goal_vibe_pattern_kind_reads_empty_as_none);
    RUN_TEST(test_goal_vibe_pattern_kind_reads_null_as_none);
    RUN_TEST(test_goal_vibe_pattern_kind_reads_the_pulse_letters);
    RUN_TEST(test_goal_vibe_pattern_kind_reads_c_as_custom);
    RUN_TEST(test_goal_vibe_pattern_kind_reads_a_list);
    RUN_TEST(test_goal_vibe_pattern_parse_reads_a_comma_list);
    RUN_TEST(test_goal_vibe_pattern_parse_takes_any_separator);
    RUN_TEST(test_goal_vibe_pattern_parse_raises_a_short_step);
    RUN_TEST(test_goal_vibe_pattern_parse_cuts_a_long_step);
    RUN_TEST(test_goal_vibe_pattern_parse_holds_a_long_run_of_digits_to_the_longest_step);
    RUN_TEST(test_goal_vibe_pattern_parse_drops_steps_past_the_cap);
    RUN_TEST(test_goal_vibe_pattern_parse_finds_nothing_in_a_list_without_numbers);
    RUN_TEST(test_goal_vibe_pattern_parse_finds_nothing_in_empty_text);
    RUN_TEST(test_goal_vibe_pattern_parse_finds_nothing_in_null);

    return UNITY_END();
}
