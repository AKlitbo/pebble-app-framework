/**
 * @file wx_label.spec.c
 * @brief Host tests for the short word a small slot shows for the sky.
 *
 * The token is the word, so the work is only the night suffix and the edges: a token with no
 * suffix, no token at all, and a slot too small for the word.
 */
#include "unity.h"

#include "weather/wx_label.h"

void setUp(void) {}
void tearDown(void) {}

/** @brief A night token shows the same word as its day one, or a small slot reads PCLDY_NIGHT. */
void test_wx_label_short_drops_the_night_suffix(void)
{
    char out[16];

    wx_label_short(out, sizeof(out), "PCLDY_NIGHT");

    TEST_ASSERT_EQUAL_STRING("PCLDY", out);
}

/** @brief A day token is its own word. */
void test_wx_label_short_keeps_a_day_token(void)
{
    char out[16];

    wx_label_short(out, sizeof(out), "SUNNY");

    TEST_ASSERT_EQUAL_STRING("SUNNY", out);
}

/** @brief No token at all reads UNKNOWN, as the lookup this replaced did, rather than a blank slot. */
void test_wx_label_short_reads_a_missing_token_as_unknown(void)
{
    char out[16];

    wx_label_short(out, sizeof(out), NULL);

    TEST_ASSERT_EQUAL_STRING("UNKNOWN", out);
}

/** @brief A slot too small for the word gets as much as fits, never a write past its end. */
void test_wx_label_short_stops_at_the_room_it_has(void)
{
    char out[4];

    wx_label_short(out, sizeof(out), "STORM_NIGHT");

    TEST_ASSERT_EQUAL_STRING("STO", out);
}

/** @brief A token that is only the suffix is kept whole, since there is no day word to strip it back to. */
void test_wx_label_short_keeps_a_bare_suffix(void)
{
    char out[16];

    wx_label_short(out, sizeof(out), "_NIGHT");

    TEST_ASSERT_EQUAL_STRING("_NIGHT", out);
}

int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_wx_label_short_drops_the_night_suffix);
    RUN_TEST(test_wx_label_short_keeps_a_day_token);
    RUN_TEST(test_wx_label_short_reads_a_missing_token_as_unknown);
    RUN_TEST(test_wx_label_short_stops_at_the_room_it_has);
    RUN_TEST(test_wx_label_short_keeps_a_bare_suffix);

    return UNITY_END();
}
