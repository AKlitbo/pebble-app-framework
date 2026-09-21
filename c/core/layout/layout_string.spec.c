/**
 * @file layout_string.spec.c
 * @brief Host tests for reading a layout string.
 *
 * This decides whether an alternate layout is real, so both ways of getting it wrong show on the
 * watch. Say yes to an empty one and the face swaps to a blank screen at dusk. Say no to a good
 * one and the layout the user built never appears at all.
 *
 * The "0" sentinel is the case worth pinning hardest. A cleared grid is sent as that rather than
 * as an empty string, because an empty cstring is skipped on the way in and would never reach the
 * watch to clear anything.
 */
#include "unity.h"

#include "layout/layout_string.h"

void setUp(void) {}
void tearDown(void) {}

// as many module numbers as a face's catalog might hold, which is all this needs to know
#define TYPES 40

/** @brief A real layout reads as having blocks, which is the case everything else is measured against. */
void test_a_placed_block_counts(void)
{
    bool result = layout_has_any_block("2,0,0,2,2;12,0,2,2,1", TYPES);

    TEST_ASSERT_TRUE(result);
}

/** @brief The sentinel a cleared grid is sent as reads as empty, or clearing one would never take. */
void test_the_cleared_sentinel_is_empty(void)
{
    bool result = layout_has_any_block("0", TYPES);

    TEST_ASSERT_FALSE(result);
}

/** @brief An empty string is empty too, which is what an unset layout looks like on a fresh install. */
void test_an_empty_string_is_empty(void)
{
    bool result = layout_has_any_block("", TYPES);

    TEST_ASSERT_FALSE(result);
}

/** @brief NULL is empty rather than a crash, since a corrupt blob can hand over anything. */
void test_null_is_empty(void)
{
    bool result = layout_has_any_block(0, TYPES);

    TEST_ASSERT_FALSE(result);
}

/** @brief A module number the catalog does not have is junk, not something to place. */
void test_a_module_past_the_catalog_does_not_count(void)
{
    bool result = layout_has_any_block("99,0,0,2,2", TYPES);

    TEST_ASSERT_FALSE(result);
}

/** @brief A good record after a junk one still counts, so one bad entry cannot hide the rest. */
void test_a_later_record_is_still_found(void)
{
    bool result = layout_has_any_block("99,0,0,2,2;3,1,0,2,1", TYPES);

    TEST_ASSERT_TRUE(result);
}

/** @brief Module 0 is the no-module marker, so a record naming it places nothing. */
void test_module_zero_does_not_count(void)
{
    bool result = layout_has_any_block("0,0,0,2,2", TYPES);

    TEST_ASSERT_FALSE(result);
}

/** @brief Whatever a corrupt blob left behind reads as empty rather than running off the end. */
void test_junk_is_empty(void)
{
    bool result = layout_has_any_block(";;;,,,", TYPES);

    TEST_ASSERT_FALSE(result);
}

int main(void)
{
    UNITY_BEGIN();
    RUN_TEST(test_a_placed_block_counts);
    RUN_TEST(test_the_cleared_sentinel_is_empty);
    RUN_TEST(test_an_empty_string_is_empty);
    RUN_TEST(test_null_is_empty);
    RUN_TEST(test_a_module_past_the_catalog_does_not_count);
    RUN_TEST(test_a_later_record_is_still_found);
    RUN_TEST(test_module_zero_does_not_count);
    RUN_TEST(test_junk_is_empty);
    return UNITY_END();
}
