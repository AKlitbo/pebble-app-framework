/**
 * @file cstring_fit.spec.c
 * @brief Host tests for copying a string into a fixed buffer and telling whether it moved.
 *
 * A settings field is a fixed buffer, and the phone sends the whole page on every save, so what
 * decides whether a setting counts as changed is whether the copy would leave the buffer reading
 * the same. Getting that wrong either re-reacts to a setting nobody touched, which spends a
 * provider's quota on a colour change, or reports no change when the value really did move, which
 * leaves the watch on the old one.
 */
#include "unity.h"

#include "text/cstring_fit.h"

/** A field wide enough for five characters and the terminator. */
#define FIELD 6

void setUp(void) {}
void tearDown(void) {}

/** @brief A string that fits has to land whole, or the field holds something the user never typed. */
void test_a_string_that_fits_is_copied_whole(void)
{
    char field[FIELD] = "";

    cstring_fit(field, "abc", sizeof(field));

    TEST_ASSERT_EQUAL_STRING("abc", field);
}

/** @brief A string too long keeps only what fits, and the terminator has to survive the trim. */
void test_a_string_too_long_is_cut_to_the_buffer(void)
{
    char field[FIELD] = "";

    cstring_fit(field, "abcdefgh", sizeof(field));

    TEST_ASSERT_EQUAL_STRING("abcde", field);
}

/** @brief A NULL empties the field rather than leaving whatever was there. */
void test_a_null_empties_the_field(void)
{
    char field[FIELD] = "abc";

    cstring_fit(field, NULL, sizeof(field));

    TEST_ASSERT_EQUAL_STRING("", field);
}

/** @brief The same string is no change, which is what stops a save re-reacting to a setting nobody touched. */
void test_the_same_string_is_not_a_change(void)
{
    bool result = cstring_fit_same("abc", "abc", FIELD);

    TEST_ASSERT_TRUE(result);
}

/** @brief A different string is a change, or the watch keeps the old value with no way to notice. */
void test_a_different_string_is_a_change(void)
{
    bool result = cstring_fit_same("abc", "abd", FIELD);

    TEST_ASSERT_FALSE(result);
}

/**
 * @brief A value longer than the field is measured the way it would be stored, not in full.
 *
 * The field already holds the trimmed form, so comparing the whole incoming string would call it
 * a change on every save. For a weather key that means a provider call each time the user touches
 * any setting at all.
 */
void test_an_over_long_value_matching_the_trimmed_field_is_not_a_change(void)
{
    bool result = cstring_fit_same("abcde", "abcdefgh", FIELD);

    TEST_ASSERT_TRUE(result);
}

/** @brief An over-long value that differs inside what would be kept is still a change. */
void test_an_over_long_value_differing_inside_the_buffer_is_a_change(void)
{
    bool result = cstring_fit_same("abcde", "abcXefgh", FIELD);

    TEST_ASSERT_FALSE(result);
}

/** @brief A shorter string is a change even though it matches as far as it goes. */
void test_a_shorter_string_is_a_change(void)
{
    bool result = cstring_fit_same("abc", "ab", FIELD);

    TEST_ASSERT_FALSE(result);
}

/** @brief Filling the field exactly is the boundary the trim is measured against. */
void test_a_value_filling_the_field_exactly_is_not_a_change(void)
{
    bool result = cstring_fit_same("abcde", "abcde", FIELD);

    TEST_ASSERT_TRUE(result);
}

/** @brief Emptying a field the user cleared has to read as a change, or the old value stays. */
void test_clearing_a_filled_field_is_a_change(void)
{
    bool result = cstring_fit_same("abc", "", FIELD);

    TEST_ASSERT_FALSE(result);
}

/** @brief A field with nowhere to write cannot move, so nothing counts as a change to it. */
void test_a_zero_sized_field_never_changes(void)
{
    bool result = cstring_fit_same("", "abc", 0);

    TEST_ASSERT_TRUE(result);
}

/** @brief A zero-sized buffer must not be written to at all, since there is not even room for a terminator. */
void test_a_zero_sized_field_is_left_alone(void)
{
    char guard[2] = {'x', 'y'};

    cstring_fit(guard, "abc", 0);

    TEST_ASSERT_EQUAL_CHAR('x', guard[0]);
}

/** Unity needs each test naming, so a new one above is added here too. */
int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_a_string_that_fits_is_copied_whole);
    RUN_TEST(test_a_string_too_long_is_cut_to_the_buffer);
    RUN_TEST(test_a_null_empties_the_field);
    RUN_TEST(test_the_same_string_is_not_a_change);
    RUN_TEST(test_a_different_string_is_a_change);
    RUN_TEST(test_an_over_long_value_matching_the_trimmed_field_is_not_a_change);
    RUN_TEST(test_an_over_long_value_differing_inside_the_buffer_is_a_change);
    RUN_TEST(test_a_shorter_string_is_a_change);
    RUN_TEST(test_a_value_filling_the_field_exactly_is_not_a_change);
    RUN_TEST(test_clearing_a_filled_field_is_a_change);
    RUN_TEST(test_a_zero_sized_field_never_changes);
    RUN_TEST(test_a_zero_sized_field_is_left_alone);

    return UNITY_END();
}
