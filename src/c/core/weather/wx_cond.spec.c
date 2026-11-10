/**
 * @file wx_cond.spec.c
 * @brief Host tests for turning a condition token into its WxCond.
 *
 * A face indexes its own art by what this returns, so a wrong number draws the wrong sky and a
 * wrong unknown reads past the end of the face's table. What is worth pinning is the numbering the
 * forecast strips share, the night ending, every token that is close to a real one but is not, and
 * the WX_COND_EACH list a face builds its table from.
 */
#include "unity.h"

#include <stdbool.h>

#include "weather/wx_cond.h"

void setUp(void) {}
void tearDown(void) {}

/**
 * @brief The numbers are the forecast strips' codes, so a reorder draws the wrong sky in every
 * column of a watch built against the old list.
 */
void test_wx_cond_numbers_match_the_forecast_codes(void)
{
    TEST_ASSERT_EQUAL_INT(0, WX_COND_CLEAR);
    TEST_ASSERT_EQUAL_INT(1, WX_COND_PCLDY);
    TEST_ASSERT_EQUAL_INT(2, WX_COND_CLDY);
    TEST_ASSERT_EQUAL_INT(3, WX_COND_FOGGY);
    TEST_ASSERT_EQUAL_INT(4, WX_COND_DRZL);
    TEST_ASSERT_EQUAL_INT(5, WX_COND_FZDZ);
    TEST_ASSERT_EQUAL_INT(6, WX_COND_RAIN);
    TEST_ASSERT_EQUAL_INT(7, WX_COND_FZRN);
    TEST_ASSERT_EQUAL_INT(8, WX_COND_SNOW);
    TEST_ASSERT_EQUAL_INT(9, WX_COND_SHWR);
    TEST_ASSERT_EQUAL_INT(10, WX_COND_SNSH);
    TEST_ASSERT_EQUAL_INT(11, WX_COND_STRM);
    TEST_ASSERT_EQUAL_INT(12, WX_COND_COUNT);
    TEST_ASSERT_EQUAL_INT(255, WX_COND_UNKNOWN);
}

/** @brief Every token finds its own number, or a face shows one sky for another. */
void test_wx_cond_parse_finds_every_token(void)
{
    static const char *const tokens[] = {
        "CLEAR", "PCLDY", "CLDY", "FOGGY", "DRZL", "FZDZ", "RAIN", "FZRN", "SNOW", "SHWR", "SNSH", "STRM",
    };

    for (int i = 0; i < WX_COND_COUNT; i++)
    {
        WxCond result = wx_cond_parse(tokens[i], NULL);

        TEST_ASSERT_EQUAL_INT_MESSAGE(i, result, tokens[i]);
    }
}

/** @brief A night token is the same condition, with night set, so the face can pick its night art. */
void test_wx_cond_parse_reads_the_night_ending(void)
{
    bool night = false;

    WxCond result = wx_cond_parse("PCLDY_NIGHT", &night);

    TEST_ASSERT_EQUAL_INT(WX_COND_PCLDY, result);
    TEST_ASSERT_TRUE(night);
}

/** @brief A day token clears night, so a flag left over from the last parse never shows a moon by day. */
void test_wx_cond_parse_clears_night_for_a_day_token(void)
{
    bool night = true;

    WxCond result = wx_cond_parse("RAIN", &night);

    TEST_ASSERT_EQUAL_INT(WX_COND_RAIN, result);
    TEST_ASSERT_FALSE(night);
}

/**
 * @brief An empty token is unknown, so a face shows its not available art rather than a sky. The
 * store holds an empty token before the first reading.
 */
void test_wx_cond_parse_reads_an_empty_token_as_unknown(void)
{
    bool night = true;

    WxCond result = wx_cond_parse("", &night);

    TEST_ASSERT_EQUAL_INT(WX_COND_UNKNOWN, result);
    TEST_ASSERT_FALSE(night);
}

/** @brief No token at all is unknown rather than a read through a NULL pointer. */
void test_wx_cond_parse_reads_a_null_token_as_unknown(void)
{
    WxCond result = wx_cond_parse(NULL, NULL);

    TEST_ASSERT_EQUAL_INT(WX_COND_UNKNOWN, result);
}

/** @brief A token that only starts like a real one is unknown. A prefix match would read "RAINY" as rain. */
void test_wx_cond_parse_refuses_a_longer_token(void)
{
    WxCond result = wx_cond_parse("RAINY", NULL);

    TEST_ASSERT_EQUAL_INT(WX_COND_UNKNOWN, result);
}

/** @brief A token a real one starts with is unknown. A prefix match would read "CLD" as cloudy. */
void test_wx_cond_parse_refuses_a_shorter_token(void)
{
    WxCond result = wx_cond_parse("CLD", NULL);

    TEST_ASSERT_EQUAL_INT(WX_COND_UNKNOWN, result);
}

/** @brief The match minds case, the same as the icon lookup, so the art and the icon never disagree. */
void test_wx_cond_parse_minds_case(void)
{
    WxCond result = wx_cond_parse("rain", NULL);

    TEST_ASSERT_EQUAL_INT(WX_COND_UNKNOWN, result);
}

/**
 * @brief A token far longer than any row is unknown, and is never compared past the row's end. The
 * token comes off the phone, so its length is whatever the phone sent.
 */
void test_wx_cond_parse_refuses_a_long_token(void)
{
    bool night = true;

    WxCond result = wx_cond_parse("THUNDERSTORM_NIGHT", &night);

    TEST_ASSERT_EQUAL_INT(WX_COND_UNKNOWN, result);
    TEST_ASSERT_FALSE(night);
}

/** @brief The night ending on its own is no condition, since there is no day token in front of it. */
void test_wx_cond_parse_refuses_a_bare_night_ending(void)
{
    WxCond result = wx_cond_parse("_NIGHT", NULL);

    TEST_ASSERT_EQUAL_INT(WX_COND_UNKNOWN, result);
}

/** @brief A night token for a condition the list lacks is unknown, and does not set night. */
void test_wx_cond_parse_refuses_an_unknown_night_token(void)
{
    bool night = true;

    WxCond result = wx_cond_parse("DUST_NIGHT", &night);

    TEST_ASSERT_EQUAL_INT(WX_COND_UNKNOWN, result);
    TEST_ASSERT_FALSE(night);
}

/** @brief The dashes a face prints for no reading are not a condition, so they draw no sky. */
void test_wx_cond_parse_reads_dashes_as_unknown(void)
{
    WxCond result = wx_cond_parse("--", NULL);

    TEST_ASSERT_EQUAL_INT(WX_COND_UNKNOWN, result);
}

// the table a face builds, one row per condition named after it
#define NAME_ROW(name) [WX_COND_##name] = #name,

/**
 * @brief A table built from WX_COND_EACH has a row for every condition, each under its own number.
 * A list that skipped one would leave a hole a face reads as no art, and one out of order would
 * draw one sky for another.
 */
void test_wx_cond_each_fills_every_row_with_its_own_condition(void)
{
    static const char *const rows[WX_COND_COUNT] = {WX_COND_EACH(NAME_ROW)};

    for (int i = 0; i < WX_COND_COUNT; i++)
    {
        TEST_ASSERT_NOT_NULL(rows[i]);

        WxCond result = wx_cond_parse(rows[i], NULL);

        TEST_ASSERT_EQUAL_INT_MESSAGE(i, result, rows[i]);
    }
}

int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_wx_cond_numbers_match_the_forecast_codes);
    RUN_TEST(test_wx_cond_parse_finds_every_token);
    RUN_TEST(test_wx_cond_parse_reads_the_night_ending);
    RUN_TEST(test_wx_cond_parse_clears_night_for_a_day_token);
    RUN_TEST(test_wx_cond_parse_reads_an_empty_token_as_unknown);
    RUN_TEST(test_wx_cond_parse_reads_a_null_token_as_unknown);
    RUN_TEST(test_wx_cond_parse_refuses_a_longer_token);
    RUN_TEST(test_wx_cond_parse_refuses_a_shorter_token);
    RUN_TEST(test_wx_cond_parse_minds_case);
    RUN_TEST(test_wx_cond_parse_refuses_a_long_token);
    RUN_TEST(test_wx_cond_parse_refuses_a_bare_night_ending);
    RUN_TEST(test_wx_cond_parse_refuses_an_unknown_night_token);
    RUN_TEST(test_wx_cond_parse_reads_dashes_as_unknown);
    RUN_TEST(test_wx_cond_each_fills_every_row_with_its_own_condition);

    return UNITY_END();
}
