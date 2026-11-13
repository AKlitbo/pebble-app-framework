/**
 * @file music_art.spec.c
 * @brief Host tests for reading now playing art off the wire.
 *
 * The art comes off a phone and becomes a bitmap the watch draws, so the length check is what
 * matters. A run shorter than its header says draws whatever memory follows the message, and one
 * past the caps would not fit the bitmap the store allocates. The row copy is pinned too, since a
 * bitmap can pad its rows wider than the art's.
 */
#include "unity.h"

#include <string.h>

#include "wire/music_art.h"

void setUp(void) {}
void tearDown(void) {}

// a 3 by 2 picture in two colours, so each row takes two bytes and the last nibble is padding
static const uint8_t ART_3X2[] = {3, 2, 2, 0xC0, 0xFF, 0x01, 0x00, 0x10, 0x10};

/** @brief Art whose length matches its header reads, and points at its palette and its rows. */
void test_art_that_matches_its_header_reads(void)
{
    MusicArt art;

    bool result = music_art_read(ART_3X2, sizeof(ART_3X2), &art);

    TEST_ASSERT_TRUE(result);
    TEST_ASSERT_EQUAL_UINT8(3, art.width);
    TEST_ASSERT_EQUAL_UINT8(2, art.height);
    TEST_ASSERT_EQUAL_UINT8(2, art.colours);
    TEST_ASSERT_EQUAL_UINT8(0xC0, art.palette[0]);
    TEST_ASSERT_EQUAL_UINT8(0x01, art.pixels[0]);
    TEST_ASSERT_EQUAL_UINT16(2, art.row_bytes);
}

/** @brief The phone's marker for no art reads as none, so the store clears the art it holds. */
void test_no_art_marker_reads_as_none(void)
{
    const uint8_t none[] = {0, 0, 0};
    MusicArt art;

    bool result = music_art_read(none, sizeof(none), &art);

    TEST_ASSERT_FALSE(result);
}

/** @brief A run one byte short would draw the last pixels out of whatever follows the message. */
void test_a_short_run_is_refused(void)
{
    MusicArt art;

    bool result = music_art_read(ART_3X2, sizeof(ART_3X2) - 1, &art);

    TEST_ASSERT_FALSE(result);
}

/** @brief A run with bytes left over means the two sides disagree on the layout, so none of it is trusted. */
void test_a_long_run_is_refused(void)
{
    uint8_t longer[sizeof(ART_3X2) + 1];
    memcpy(longer, ART_3X2, sizeof(ART_3X2));
    longer[sizeof(ART_3X2)] = 0;
    MusicArt art;

    bool result = music_art_read(longer, sizeof(longer), &art);

    TEST_ASSERT_FALSE(result);
}

/** @brief More colours than a 4-bit pixel can name would overrun the palette the store allocates. */
void test_too_many_colours_are_refused(void)
{
    const uint8_t art_bytes[] = {1, 1, 17};
    MusicArt art;

    bool result = music_art_read(art_bytes, sizeof(art_bytes), &art);

    TEST_ASSERT_FALSE(result);
}

/** @brief A side past the cap is larger than any face sized its inbox and panel for. */
void test_a_side_past_the_cap_is_refused(void)
{
    const uint8_t art_bytes[] = {MUSIC_ART_SIDE_MAX + 1, 1, 1, 0xC0};
    MusicArt art;

    bool result = music_art_read(art_bytes, sizeof(art_bytes), &art);

    TEST_ASSERT_FALSE(result);
}

/** @brief A header with no bytes behind it is no art rather than a read past the end. */
void test_a_run_shorter_than_the_header_is_refused(void)
{
    MusicArt art;

    bool result = music_art_read(ART_3X2, 2, &art);

    TEST_ASSERT_FALSE(result);
}

/** @brief Each row lands at the start of the bitmap's own row, so a wider stride leaves the padding alone. */
void test_rows_copy_to_the_bitmap_stride(void)
{
    MusicArt art;
    music_art_read(ART_3X2, sizeof(ART_3X2), &art);
    uint8_t bitmap[8];
    memset(bitmap, 0xEE, sizeof(bitmap));

    music_art_copy_rows(&art, bitmap, 4);

    const uint8_t expected[8] = {0x01, 0x00, 0xEE, 0xEE, 0x10, 0x10, 0xEE, 0xEE};
    TEST_ASSERT_EQUAL_UINT8_ARRAY(expected, bitmap, sizeof(expected));
}

int main(void)
{
    UNITY_BEGIN();
    RUN_TEST(test_art_that_matches_its_header_reads);
    RUN_TEST(test_no_art_marker_reads_as_none);
    RUN_TEST(test_a_short_run_is_refused);
    RUN_TEST(test_a_long_run_is_refused);
    RUN_TEST(test_too_many_colours_are_refused);
    RUN_TEST(test_a_side_past_the_cap_is_refused);
    RUN_TEST(test_a_run_shorter_than_the_header_is_refused);
    RUN_TEST(test_rows_copy_to_the_bitmap_stride);
    return UNITY_END();
}
