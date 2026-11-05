/**
 * @file cstring_fit.spec.c
 * @brief Host tests for copying text into a fixed buffer, telling whether it moved, and checking a
 * saved string before it is used.
 *
 * A settings field is a fixed buffer, and the phone sends the whole page on every save, so what
 * decides whether a setting counts as changed is whether the copy would leave the buffer reading
 * the same. Getting that wrong either re-reacts to a setting nobody touched, which spends a
 * provider's quota on a colour change, or reports no change when the value really did move, which
 * leaves the watch on the old one.
 *
 * The copy of length-prefixed text from the phone has to stop at the watch's room whatever length
 * the phone wrote, and the check on a saved string has to tell damage from a real empty value. A
 * slip in either writes past a buffer or puts a saved setting back to its default on the next boot.
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

/** @brief Text that fits arrives whole and terminated. */
void test_copy_bounded_copies_what_fits(void)
{
    const uint8_t src[] = { 'A', 'A', 'P', 'L' };
    char dst[12];

    copy_bounded(dst, sizeof(dst), src, sizeof(src));

    TEST_ASSERT_EQUAL_STRING("AAPL", dst);
}

/** @brief Text longer than the room takes what fits and still ends terminated. */
void test_copy_bounded_cuts_what_does_not_fit(void)
{
    const uint8_t src[] = { 'A', 'B', 'C', 'D', 'E', 'F' };
    char dst[4];

    copy_bounded(dst, sizeof(dst), src, sizeof(src));

    TEST_ASSERT_EQUAL_STRING("ABC", dst);
}

/** @brief Filling the buffer exactly must still leave room for the terminator. */
void test_copy_bounded_keeps_room_for_the_terminator(void)
{
    const uint8_t src[] = { 'A', 'B', 'C', 'D' };
    char dst[5];

    copy_bounded(dst, sizeof(dst), src, sizeof(src));

    TEST_ASSERT_EQUAL_STRING("ABCD", dst);
    TEST_ASSERT_EQUAL_CHAR('\0', dst[4]);
}

/** @brief Nothing to copy still terminates, so the caller never reads stale bytes. */
void test_copy_bounded_terminates_an_empty_copy(void)
{
    const uint8_t src[] = { 'X' };
    char dst[4] = { 'o', 'l', 'd', '\0' };

    copy_bounded(dst, sizeof(dst), src, 0);

    TEST_ASSERT_EQUAL_STRING("", dst);
}

/**
 * @brief A buffer with no room at all must be left alone rather than filled.
 *
 * This is the one worth having. cap is a byte and cap - 1 promotes to int, so a cap of zero would
 * come out as -1, the compare against it would be true whatever the length, and the copy would run
 * 255 bytes over a buffer that had no room for one. Nothing passes zero today, which is exactly
 * why it needs saying out loud somewhere that fails when it stops being true.
 */
void test_copy_bounded_writes_nothing_when_there_is_no_room(void)
{
    const uint8_t src[] = { 'A', 'B', 'C' };
    char dst[4] = { 1, 2, 3, 4 };

    copy_bounded(dst, 0, src, sizeof(src));

    TEST_ASSERT_EQUAL_CHAR(1, dst[0]);
    TEST_ASSERT_EQUAL_CHAR(2, dst[1]);
    TEST_ASSERT_EQUAL_CHAR(3, dst[2]);
    TEST_ASSERT_EQUAL_CHAR(4, dst[3]);
}

/** @brief A buffer with room for only a terminator gets one and nothing else. */
void test_copy_bounded_handles_room_for_only_a_terminator(void)
{
    const uint8_t src[] = { 'A', 'B' };
    char dst[2] = { 'x', 'y' };

    copy_bounded(dst, 1, src, sizeof(src));

    TEST_ASSERT_EQUAL_STRING("", dst);
    TEST_ASSERT_EQUAL_CHAR('y', dst[1]);  // nothing past its own room
}

/** @brief Plain text that ends inside its room is worth keeping. */
void test_cstring_is_clean_accepts_plain_text(void)
{
    char s[32] = "London";

    bool result = cstring_is_clean(s, sizeof(s));

    TEST_ASSERT_TRUE(result);
}

/**
 * @brief A place name spelled with an umlaut is text, not damage.
 *
 * The one that matters. UTF-8 puts bytes above 0x7E in a name like Zurich, and a range test that
 * only trusts plain ASCII throws the whole name away, resets the field to its default and saves
 * that back. The user picks a city and it works, but next boot it is London again. Sao Paulo
 * drifts four hours doing it.
 */
void test_cstring_is_clean_accepts_utf8(void)
{
    char s[32] = "Z\xC3\xBCrich";  // Zurich with the umlaut, UTF-8

    bool result = cstring_is_clean(s, sizeof(s));

    TEST_ASSERT_TRUE(result);
}

/** @brief A control byte is what a damaged blob reads like, so it is not worth keeping. */
void test_cstring_is_clean_refuses_a_control_byte(void)
{
    char s[32] = "Lon\x01" "don";

    bool result = cstring_is_clean(s, sizeof(s));

    TEST_ASSERT_FALSE(result);
}

/** @brief DEL sits above the control block but is no more text than the ones below it. */
void test_cstring_is_clean_refuses_del(void)
{
    char s[32] = "Lon\x7F" "don";

    bool result = cstring_is_clean(s, sizeof(s));

    TEST_ASSERT_FALSE(result);
}

/** @brief Space is the first real character, so it must not be taken for a control byte. */
void test_cstring_is_clean_accepts_a_space(void)
{
    char s[32] = "New York";

    bool result = cstring_is_clean(s, sizeof(s));

    TEST_ASSERT_TRUE(result);
}

/**
 * @brief An empty setting whose default is empty is its value, not damage.
 *
 * Reading it as damage healed it on every launch, so the whole settings blob went back to flash
 * every time the face opened.
 */
void test_cstring_setting_is_clean_keeps_an_empty_default(void)
{
    char s[8] = "";

    bool result = cstring_setting_is_clean(s, sizeof(s), "");

    TEST_ASSERT_TRUE(result);
}

/** @brief An empty setting with a real default is what a wiped blob reads like, so it is healed. */
void test_cstring_setting_is_clean_refuses_empty_with_a_real_default(void)
{
    char s[8] = "";

    bool result = cstring_setting_is_clean(s, sizeof(s), "0");

    TEST_ASSERT_FALSE(result);
}

/** @brief Damage is still damage when the default is empty, so a control byte is refused. */
void test_cstring_setting_is_clean_refuses_damage_with_an_empty_default(void)
{
    char s[8] = "a\x01";

    bool result = cstring_setting_is_clean(s, sizeof(s), "");

    TEST_ASSERT_FALSE(result);
}

/** @brief An empty string says nothing, so there is nothing to keep. */
void test_cstring_is_clean_refuses_an_empty_string(void)
{
    char s[32] = "";

    bool result = cstring_is_clean(s, sizeof(s));

    TEST_ASSERT_FALSE(result);
}

/**
 * @brief A string that never ends inside its room is not a string.
 *
 * Reading it would run on past the field into whatever the blob keeps next door.
 */
void test_cstring_is_clean_refuses_one_that_never_ends(void)
{
    char s[4] = { 'a', 'b', 'c', 'd' };  // no terminator anywhere in it

    bool result = cstring_is_clean(s, sizeof(s));

    TEST_ASSERT_FALSE(result);
}

/** @brief Ending on the last byte it has room for is still ending, so it counts. */
void test_cstring_is_clean_accepts_ending_on_the_last_byte(void)
{
    char s[4] = { 'a', 'b', 'c', '\0' };

    bool result = cstring_is_clean(s, sizeof(s));

    TEST_ASSERT_TRUE(result);
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
    RUN_TEST(test_copy_bounded_copies_what_fits);
    RUN_TEST(test_copy_bounded_cuts_what_does_not_fit);
    RUN_TEST(test_copy_bounded_keeps_room_for_the_terminator);
    RUN_TEST(test_copy_bounded_terminates_an_empty_copy);
    RUN_TEST(test_copy_bounded_writes_nothing_when_there_is_no_room);
    RUN_TEST(test_copy_bounded_handles_room_for_only_a_terminator);
    RUN_TEST(test_cstring_is_clean_accepts_plain_text);
    RUN_TEST(test_cstring_is_clean_accepts_utf8);
    RUN_TEST(test_cstring_is_clean_refuses_a_control_byte);
    RUN_TEST(test_cstring_is_clean_refuses_del);
    RUN_TEST(test_cstring_is_clean_accepts_a_space);
    RUN_TEST(test_cstring_setting_is_clean_keeps_an_empty_default);
    RUN_TEST(test_cstring_setting_is_clean_refuses_empty_with_a_real_default);
    RUN_TEST(test_cstring_setting_is_clean_refuses_damage_with_an_empty_default);
    RUN_TEST(test_cstring_is_clean_refuses_an_empty_string);
    RUN_TEST(test_cstring_is_clean_refuses_one_that_never_ends);
    RUN_TEST(test_cstring_is_clean_accepts_ending_on_the_last_byte);

    return UNITY_END();
}
