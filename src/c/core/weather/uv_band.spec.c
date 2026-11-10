/**
 * @file uv_band.spec.c
 * @brief Host tests for the UV risk band.
 *
 * The edges are what is worth pinning. Each band ends on a number the wearer reads off the
 * screen, so an off-by-one shows a 3 as LOW or an 11 as VERY HIGH and nothing else looks wrong.
 * The no-reading band matters too, since the store hands back -1 before its first reading and a
 * face prints the name straight after the dashes.
 */
#include "unity.h"

#include <string.h>

#include "weather/uv_band.h"

void setUp(void) {}
void tearDown(void) {}

/** @brief The store's -1 for no reading is no band, not LOW. */
void test_uv_band_negative_is_none(void)
{
    UvBand result = uv_band(-1);

    TEST_ASSERT_EQUAL_INT(UV_BAND_NONE, result);
}

/** @brief A 0 is a real reading at night, so it is LOW and not no reading. */
void test_uv_band_zero_is_low(void)
{
    UvBand result = uv_band(0);

    TEST_ASSERT_EQUAL_INT(UV_BAND_LOW, result);
}

/** @brief Each band ends on its last number and the next starts one above, or a reading lands a band out. */
void test_uv_band_edges(void)
{
    UvBand two = uv_band(2);
    UvBand three = uv_band(3);
    UvBand five = uv_band(5);
    UvBand six = uv_band(6);
    UvBand seven = uv_band(7);
    UvBand eight = uv_band(8);
    UvBand ten = uv_band(10);
    UvBand eleven = uv_band(11);

    TEST_ASSERT_EQUAL_INT(UV_BAND_LOW, two);
    TEST_ASSERT_EQUAL_INT(UV_BAND_MODERATE, three);
    TEST_ASSERT_EQUAL_INT(UV_BAND_MODERATE, five);
    TEST_ASSERT_EQUAL_INT(UV_BAND_HIGH, six);
    TEST_ASSERT_EQUAL_INT(UV_BAND_HIGH, seven);
    TEST_ASSERT_EQUAL_INT(UV_BAND_VERY_HIGH, eight);
    TEST_ASSERT_EQUAL_INT(UV_BAND_VERY_HIGH, ten);
    TEST_ASSERT_EQUAL_INT(UV_BAND_EXTREME, eleven);
}

/** @brief The scale has no top, so a reading well past 11 still reads EXTREME. */
void test_uv_band_far_past_eleven_is_extreme(void)
{
    UvBand result = uv_band(16);

    TEST_ASSERT_EQUAL_INT(UV_BAND_EXTREME, result);
}

/** @brief No reading names nothing, so a face printing the name after its dashes adds no stray word. */
void test_uv_band_none_names_are_empty(void)
{
    const char *name = uv_band_name(UV_BAND_NONE);
    const char *short_name = uv_band_short_name(UV_BAND_NONE);

    TEST_ASSERT_EQUAL_STRING("", name);
    TEST_ASSERT_EQUAL_STRING("", short_name);
}

/** @brief The two tables line up with the bands, so a 9 reads VERY HIGH in full and V.HIGH short. */
void test_uv_band_names_match_their_band(void)
{
    const char *name = uv_band_name(uv_band(9));
    const char *short_name = uv_band_short_name(uv_band(9));

    TEST_ASSERT_EQUAL_STRING("VERY HIGH", name);
    TEST_ASSERT_EQUAL_STRING("V.HIGH", short_name);
}

/** @brief A short name runs at most six letters, or it spills out of the small slot it is for. */
void test_uv_band_short_names_fit_six_letters(void)
{
    size_t longest = 0;
    for (int band = UV_BAND_NONE; band <= UV_BAND_EXTREME; band++)
    {
        size_t length = strlen(uv_band_short_name((UvBand)band));
        if (length > longest)
        {
            longest = length;
        }
    }

    TEST_ASSERT_LESS_OR_EQUAL_size_t(6, longest);
}

/** @brief A number cast to a band past the table gets an empty name rather than a read off its end. */
void test_uv_band_value_past_the_enum_names_nothing(void)
{
    const char *name = uv_band_name((UvBand)(UV_BAND_EXTREME + 1));
    const char *short_name = uv_band_short_name((UvBand)-1);

    TEST_ASSERT_EQUAL_STRING("", name);
    TEST_ASSERT_EQUAL_STRING("", short_name);
}

int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_uv_band_negative_is_none);
    RUN_TEST(test_uv_band_zero_is_low);
    RUN_TEST(test_uv_band_edges);
    RUN_TEST(test_uv_band_far_past_eleven_is_extreme);
    RUN_TEST(test_uv_band_none_names_are_empty);
    RUN_TEST(test_uv_band_names_match_their_band);
    RUN_TEST(test_uv_band_short_names_fit_six_letters);
    RUN_TEST(test_uv_band_value_past_the_enum_names_nothing);

    return UNITY_END();
}
