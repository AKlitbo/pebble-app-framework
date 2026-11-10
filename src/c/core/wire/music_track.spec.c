/**
 * @file music_track.spec.c
 * @brief Host tests for taking in the track the phone sent.
 *
 * The text comes off a phone, so a line longer than the buffer has to be cut and still end. A track
 * that did not change has to say so, or every repeat from a polling plugin would wake the face to
 * redraw. And the empty message the phone sends for nothing playing has to read as no track, so
 * the face shows its empty state rather than a blank line.
 */
#include "unity.h"

#include <string.h>

#include "wire/music_track.h"

void setUp(void) {}
void tearDown(void) {}

/** @brief A new track is taken in whole and reads as a change, so the face redraws for it. */
void test_a_new_track_is_taken_and_changes(void)
{
    MusicTrack track = {0};

    bool result = music_track_set(&track, "Clocks", "Coldplay", true);

    TEST_ASSERT_TRUE(result);
    TEST_ASSERT_EQUAL_STRING("Clocks", track.title);
    TEST_ASSERT_EQUAL_STRING("Coldplay", track.artist);
    TEST_ASSERT_TRUE(track.playing);
}

/** @brief The same track again changes nothing, so a repeat never wakes the face. */
void test_the_same_track_again_is_no_change(void)
{
    MusicTrack track = {0};
    music_track_set(&track, "Clocks", "Coldplay", true);

    bool result = music_track_set(&track, "Clocks", "Coldplay", true);

    TEST_ASSERT_FALSE(result);
}

/** @brief A pause of the same track is a change, or the glyph would show playing through the silence. */
void test_a_pause_is_a_change(void)
{
    MusicTrack track = {0};
    music_track_set(&track, "Clocks", "Coldplay", true);

    bool result = music_track_set(&track, "Clocks", "Coldplay", false);

    TEST_ASSERT_TRUE(result);
    TEST_ASSERT_FALSE(track.playing);
}

/** @brief A line past the buffer is cut to fit and ends, so a long title never runs into the memory after it. */
void test_a_long_title_is_cut_and_ends(void)
{
    MusicTrack track = {0};
    char sent[MUSIC_TEXT_LEN + 20];
    memset(sent, 'a', sizeof(sent) - 1);
    sent[sizeof(sent) - 1] = '\0';

    music_track_set(&track, sent, "", true);

    TEST_ASSERT_EQUAL_INT(MUSIC_TEXT_LEN - 1, (int)strlen(track.title));
}

/** @brief The same long title again matches what was kept of it, so a repeat of it is no change either. */
void test_the_same_long_title_again_is_no_change(void)
{
    MusicTrack track = {0};
    char sent[MUSIC_TEXT_LEN + 20];
    memset(sent, 'a', sizeof(sent) - 1);
    sent[sizeof(sent) - 1] = '\0';
    music_track_set(&track, sent, "", true);

    bool result = music_track_set(&track, sent, "", true);

    TEST_ASSERT_FALSE(result);
}

/** @brief The empty message for nothing playing clears the track, so the face shows its empty state. */
void test_the_empty_message_clears_the_track(void)
{
    MusicTrack track = {0};
    music_track_set(&track, "Clocks", "Coldplay", true);

    music_track_set(&track, "", "", false);

    TEST_ASSERT_FALSE(music_track_has(&track));
}

/** @brief A line the phone left out reads as empty rather than leaving the old one behind. */
void test_a_missing_line_reads_as_empty(void)
{
    MusicTrack track = {0};
    music_track_set(&track, "Clocks", "Coldplay", true);

    music_track_set(&track, "Clocks", NULL, true);

    TEST_ASSERT_EQUAL_STRING("", track.artist);
}

/** @brief A track with only an artist still has something to show, since a title can be one with no ASCII form. */
void test_an_artist_alone_is_a_track(void)
{
    MusicTrack track = {0};
    music_track_set(&track, "", "YOASOBI", true);

    bool result = music_track_has(&track);

    TEST_ASSERT_TRUE(result);
}

int main(void)
{
    UNITY_BEGIN();
    RUN_TEST(test_a_new_track_is_taken_and_changes);
    RUN_TEST(test_the_same_track_again_is_no_change);
    RUN_TEST(test_a_pause_is_a_change);
    RUN_TEST(test_a_long_title_is_cut_and_ends);
    RUN_TEST(test_the_same_long_title_again_is_no_change);
    RUN_TEST(test_the_empty_message_clears_the_track);
    RUN_TEST(test_a_missing_line_reads_as_empty);
    RUN_TEST(test_an_artist_alone_is_a_track);
    return UNITY_END();
}
