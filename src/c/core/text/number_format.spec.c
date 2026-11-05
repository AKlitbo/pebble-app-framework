/**
 * @file number_format.spec.c
 * @brief Host tests for the number formatters: thousands separators, dashes for no reading,
 * hundredths, and signed percents.
 *
 * The separator placement, the leading sign, and the buffer guard are the parts that
 * bite. A slip shows a step count with a stray apostrophe, a price or change that lost its
 * minus, or smashes the buffer.
 */
#include "unity.h"

#include <limits.h>

#include "text/number_format.h"

void setUp(void) {}
void tearDown(void) {}

/** @brief A five digit count must split into "20'358", the whole reason the helper exists. */
void test_number_group_inserts_separators(void)
{
    char buffer[24];

    number_group(buffer, sizeof(buffer), 20358);

    TEST_ASSERT_EQUAL_STRING("20'358", buffer);
}

/** @brief Under a thousand there is no group to break, so a stray separator must not appear. */
void test_number_group_below_thousand_has_no_separator(void)
{
    char buffer[24];

    number_group(buffer, sizeof(buffer), 999);

    TEST_ASSERT_EQUAL_STRING("999", buffer);
}

/** @brief Exactly one thousand is the first place a separator belongs, so "1'000" must round trip. */
void test_number_group_separates_exactly_one_thousand(void)
{
    char buffer[24];

    number_group(buffer, sizeof(buffer), 1000);

    TEST_ASSERT_EQUAL_STRING("1'000", buffer);
}

/** @brief A negative value must keep its sign ahead of the digits or a below zero reading looks positive. */
void test_number_group_keeps_negative_sign(void)
{
    char buffer[24];

    number_group(buffer, sizeof(buffer), -1234);

    TEST_ASSERT_EQUAL_STRING("-1'234", buffer);
}

/** @brief A seven digit value must carry two separators, proving the grouping repeats not just fires once. */
void test_number_group_multiple_groups(void)
{
    char buffer[24];

    number_group(buffer, sizeof(buffer), 1234567);

    TEST_ASSERT_EQUAL_STRING("1'234'567", buffer);
}

/** @brief The most negative int must format without tripping undefined behaviour on the sign flip. */
void test_number_group_handles_int_min(void)
{
    char buffer[24];

    number_group(buffer, sizeof(buffer), INT_MIN);

    TEST_ASSERT_EQUAL_STRING("-2'147'483'648", buffer);
}

/** @brief A tiny buffer must truncate cleanly and stay terminated rather than overrun the caller. */
void test_number_group_truncates_into_small_buffer(void)
{
    char buffer[3];

    number_group(buffer, sizeof(buffer), 20358);

    TEST_ASSERT_EQUAL_STRING("20", buffer);
}

/** @brief A real reading goes through the caller's format, which is the everyday case. */
void test_fmt_int_or_dash_formats_a_reading(void)
{
    char buffer[16];

    fmt_int_or_dash(buffer, sizeof(buffer), 42, "%d%%");

    TEST_ASSERT_EQUAL_STRING("42%", buffer);
}

/**
 * @brief A negative reading is the store saying it has nothing, and must draw as dashes.
 *
 * Every panel fed by the phone starts out with no reading, so getting this wrong puts a -1 on
 * screen where a humidity or a pressure belongs.
 */
void test_fmt_int_or_dash_draws_dashes_for_no_data(void)
{
    char buffer[16];

    fmt_int_or_dash(buffer, sizeof(buffer), -1, "%d%%");

    TEST_ASSERT_EQUAL_STRING("--", buffer);
}

/** @brief A real zero is a reading and not an absence, so it must not read as dashes. */
void test_fmt_int_or_dash_keeps_a_real_zero(void)
{
    char buffer[16];

    fmt_int_or_dash(buffer, sizeof(buffer), 0, "%d%%");

    TEST_ASSERT_EQUAL_STRING("0%", buffer);
}

/** @brief Any negative reads as no data and not just the -1 the stores happen to use. */
void test_fmt_int_or_dash_treats_every_negative_as_no_data(void)
{
    char buffer[16];

    fmt_int_or_dash(buffer, sizeof(buffer), -1000, "%d");

    TEST_ASSERT_EQUAL_STRING("--", buffer);
}

/** @brief A plain price, the everyday case the rest are corners of. */
void test_fmt_hundredths_writes_two_decimals(void)
{
    char buffer[16];

    fmt_hundredths(buffer, sizeof(buffer), 26174);

    TEST_ASSERT_EQUAL_STRING("261.74", buffer);
}

/**
 * @brief A value under one unit keeps its minus, which is the whole reason the sign is pulled out.
 *
 * -50 cents has a whole part of zero, and zero has no sign to print. Let the whole part carry it
 * and the watchlist shows a stock down 50 cents as up 50 cents.
 */
void test_fmt_hundredths_keeps_the_sign_under_one_unit(void)
{
    char buffer[16];

    fmt_hundredths(buffer, sizeof(buffer), -50);

    TEST_ASSERT_EQUAL_STRING("-0.50", buffer);
}

/** @brief The fraction is padded, so nine cents is .09 and not .9. */
void test_fmt_hundredths_pads_the_fraction(void)
{
    char buffer[16];

    fmt_hundredths(buffer, sizeof(buffer), 909);

    TEST_ASSERT_EQUAL_STRING("9.09", buffer);
}

/**
 * @brief The most negative int prints its real value rather than garbage.
 *
 * A stock price arrives as an int32 off the wire, so a corrupt saved strip can hold INT_MIN.
 * abs() has no int answer for it, and the price slot read as nonsense.
 */
void test_fmt_hundredths_handles_int_min(void)
{
    char buffer[16];

    fmt_hundredths(buffer, sizeof(buffer), INT_MIN);

    TEST_ASSERT_EQUAL_STRING("-21474836.48", buffer);
}

/** @brief A gain wears a plus so the direction reads without needing the colour. */
void test_fmt_pct_signed_marks_a_gain(void)
{
    char buffer[16];

    fmt_pct_signed(buffer, sizeof(buffer), 125);

    TEST_ASSERT_EQUAL_STRING("+1.25%", buffer);
}

/** @brief A loss under one percent keeps its minus, same trap as the price. */
void test_fmt_pct_signed_marks_a_small_loss(void)
{
    char buffer[16];

    fmt_pct_signed(buffer, sizeof(buffer), -47);

    TEST_ASSERT_EQUAL_STRING("-0.47%", buffer);
}

/** @brief The most negative int prints as a real percentage, same trap as the price. */
void test_fmt_pct_signed_handles_int_min(void)
{
    char buffer[16];

    fmt_pct_signed(buffer, sizeof(buffer), INT_MIN);

    TEST_ASSERT_EQUAL_STRING("-21474836.48%", buffer);
}

/** @brief Flat is neither up nor down, so it wears no sign at all. */
void test_fmt_pct_signed_leaves_flat_unsigned(void)
{
    char buffer[16];

    fmt_pct_signed(buffer, sizeof(buffer), 0);

    TEST_ASSERT_EQUAL_STRING("0.00%", buffer);
}

int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_number_group_inserts_separators);
    RUN_TEST(test_number_group_below_thousand_has_no_separator);
    RUN_TEST(test_number_group_separates_exactly_one_thousand);
    RUN_TEST(test_number_group_keeps_negative_sign);
    RUN_TEST(test_number_group_multiple_groups);
    RUN_TEST(test_number_group_handles_int_min);
    RUN_TEST(test_number_group_truncates_into_small_buffer);
    RUN_TEST(test_fmt_int_or_dash_formats_a_reading);
    RUN_TEST(test_fmt_int_or_dash_draws_dashes_for_no_data);
    RUN_TEST(test_fmt_int_or_dash_keeps_a_real_zero);
    RUN_TEST(test_fmt_int_or_dash_treats_every_negative_as_no_data);
    RUN_TEST(test_fmt_hundredths_writes_two_decimals);
    RUN_TEST(test_fmt_hundredths_keeps_the_sign_under_one_unit);
    RUN_TEST(test_fmt_hundredths_pads_the_fraction);
    RUN_TEST(test_fmt_hundredths_handles_int_min);
    RUN_TEST(test_fmt_pct_signed_marks_a_gain);
    RUN_TEST(test_fmt_pct_signed_marks_a_small_loss);
    RUN_TEST(test_fmt_pct_signed_handles_int_min);
    RUN_TEST(test_fmt_pct_signed_leaves_flat_unsigned);

    return UNITY_END();
}
