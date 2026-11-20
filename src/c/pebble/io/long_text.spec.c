/**
 * @file long_text.spec.c
 * @brief Host tests for the face's long text setting, the text too long for the settings blob.
 *
 * The phone sends the text on every save, and the watch sends it back in the settings reply so the
 * page reopens on it. What is worth pinning is the deciding: an unchanged save has to leave the face
 * alone, or every save rebuilds it and refetches whatever follows a settings change, a changed one has
 * to reach the receiver, and the reply has to carry what the provider writes, cut to the cap. A setting
 * that comes after the transport opened, or whose cap a buffer cannot hold, would lose every reply or
 * every save, so it has to be refused, and so does one missing its provider or its receiver.
 */
#include "unity.h"

#include "io/long_text.h"

#include <string.h>

/** The cap a face with two persist keys of text gives, each half, the bar between them, and the end. */
#define CAP 502

/** The key a face names, any value the SDK might hand it. */
#define KEY 10042

static char s_held[2048];      ///< What the fake provider writes
static char s_received[2048];  ///< What the fake receiver last got
static int  s_receives;        ///< How many times the receiver ran

/** Writes the held text the way a face's provider does, cut to the buffer it is handed. */
static void provide(char *out, size_t size)
{
    strncpy(out, s_held, size);
}

/** Fills the whole buffer with no end of its own, which the setting has to end. */
static void provide_brim(char *out, size_t size)
{
    memset(out, 'a', size);
}

/** Keeps what arrived and counts the call. */
static void receive(const char *text)
{
    strncpy(s_received, text, sizeof(s_received) - 1);
    s_receives++;
}

static LongText slot;

void setUp(void)
{
    slot = (LongText){0};
    memset(s_held, 0, sizeof(s_held));
    memset(s_received, 0, sizeof(s_received));
    s_receives = 0;
}

void tearDown(void) {}

/** @brief A setting made before the transport opens keeps the key and cap the face named, so the reply is sized for it. */
void test_set_before_open_keeps_the_key_and_cap(void)
{
    bool taken = long_text_set(&slot, KEY, CAP, provide, receive, false);

    TEST_ASSERT_TRUE(taken);
    TEST_ASSERT_EQUAL_UINT32(KEY, slot.key);
    TEST_ASSERT_EQUAL_UINT16(CAP, slot.cap);
}

/**
 * @brief A setting made after the transport opened is refused and the earlier one stays, since the
 * outbox was sized without it and every settings reply would go out empty.
 */
void test_set_after_open_is_refused(void)
{
    long_text_set(&slot, KEY, CAP, provide, receive, false);

    bool result = long_text_set(&slot, KEY + 1, 900, provide, receive, true);

    TEST_ASSERT_FALSE(result);
    TEST_ASSERT_EQUAL_UINT32(KEY, slot.key);
    TEST_ASSERT_EQUAL_UINT16(CAP, slot.cap);
}

/**
 * @brief A cap of 0 has no room for the end of the text, and one past the most would put a buffer
 * too big for the stack there on every send, so both are refused and the slot holds no setting.
 */
void test_set_with_a_cap_outside_the_range_is_refused(void)
{
    bool none = long_text_set(&slot, KEY, 0, provide, receive, false);
    bool past = long_text_set(&slot, KEY, LONG_TEXT_CAP_MAX + 1, provide, receive, false);

    TEST_ASSERT_FALSE(none);
    TEST_ASSERT_FALSE(past);
    TEST_ASSERT_EQUAL_UINT16(0, slot.cap);
}

/** @brief The largest cap is taken, so a face can use all of the room the stack buffer allows. */
void test_set_takes_the_largest_cap(void)
{
    bool result = long_text_set(&slot, KEY, LONG_TEXT_CAP_MAX, provide, receive, false);

    TEST_ASSERT_TRUE(result);
}

/**
 * @brief Without a provider every save would count as a change and rewrite every schema, and without
 * a receiver nothing would keep what the page sends, so a setting missing either is refused.
 */
void test_set_without_a_provider_or_a_receiver_is_refused(void)
{
    bool no_provider = long_text_set(&slot, KEY, CAP, NULL, receive, false);
    bool no_receiver = long_text_set(&slot, KEY, CAP, provide, NULL, false);

    TEST_ASSERT_FALSE(no_provider);
    TEST_ASSERT_FALSE(no_receiver);
    TEST_ASSERT_EQUAL_UINT16(0, slot.cap);
}

/** @brief A text whose cap fills the outbox to the byte beside the rest of the reply still fits. */
void test_fits_a_text_that_fills_the_outbox_exactly(void)
{
    bool result = long_text_fits(509, 491, 1000, 600);

    TEST_ASSERT_TRUE(result);
}

/** @brief One byte past the outbox would send every settings reply empty, so it does not fit. */
void test_does_not_fit_a_text_one_byte_past_the_outbox(void)
{
    bool result = long_text_fits(509, 492, 1000, 600);

    TEST_ASSERT_FALSE(result);
}

/** @brief An inbox that cannot hold the text alone drops every save carrying it, so it does not fit. */
void test_does_not_fit_a_text_the_inbox_cannot_hold(void)
{
    bool result = long_text_fits(509, 100, 8000, 508);

    TEST_ASSERT_FALSE(result);
}

/** @brief A changed text reaches the receiver whole and counts as a change, so the face stores it and redraws. */
void test_a_changed_text_reaches_the_receiver(void)
{
    long_text_set(&slot, KEY, CAP, provide, receive, false);
    strcpy(s_held, "~3 1a2b3c|0");

    bool result = long_text_arrived(&slot, "~3 4d5e6f|1");

    TEST_ASSERT_TRUE(result);
    TEST_ASSERT_EQUAL_INT(1, s_receives);
    TEST_ASSERT_EQUAL_STRING("~3 4d5e6f|1", s_received);
}

/** @brief The page sends the text with every save, so one that matches what the face holds changes nothing. */
void test_an_unchanged_text_is_left_alone(void)
{
    long_text_set(&slot, KEY, CAP, provide, receive, false);
    strcpy(s_held, "~3 1a2b3c|0");

    bool result = long_text_arrived(&slot, "~3 1a2b3c|0");

    TEST_ASSERT_FALSE(result);
    TEST_ASSERT_EQUAL_INT(0, s_receives);
}

/**
 * @brief Only as much as the cap holds is compared, so a text longer than the face can keep, whose kept
 * part matches, does not count as a change on every save.
 */
void test_a_longer_text_whose_kept_part_matches_is_left_alone(void)
{
    long_text_set(&slot, KEY, 8, provide, receive, false);
    strcpy(s_held, "abcdefg");

    bool result = long_text_arrived(&slot, "abcdefgh and more");

    TEST_ASSERT_FALSE(result);
}

/** @brief A slot with no setting takes nothing, so a stray message on a key cannot reach a receiver. */
void test_an_empty_slot_takes_no_text(void)
{
    bool result = long_text_arrived(&slot, "anything");

    TEST_ASSERT_FALSE(result);
}

/** @brief The reply carries what the provider writes, so the page reopens on the face's own text. */
void test_held_is_what_the_provider_writes(void)
{
    long_text_set(&slot, KEY, CAP, provide, receive, false);
    strcpy(s_held, "~3 1a2b3c|0");
    char result[CAP];

    long_text_held(&slot, result);

    TEST_ASSERT_EQUAL_STRING("~3 1a2b3c|0", result);
}

/** @brief A provider that fills the buffer to the brim still hands back an ended text, cut to the cap. */
void test_held_is_ended_inside_the_cap(void)
{
    long_text_set(&slot, KEY, 6, provide_brim, receive, false);
    char result[6];

    long_text_held(&slot, result);

    TEST_ASSERT_EQUAL_STRING("aaaaa", result);
}

int main(void)
{
    UNITY_BEGIN();
    RUN_TEST(test_set_before_open_keeps_the_key_and_cap);
    RUN_TEST(test_set_after_open_is_refused);
    RUN_TEST(test_set_with_a_cap_outside_the_range_is_refused);
    RUN_TEST(test_set_takes_the_largest_cap);
    RUN_TEST(test_set_without_a_provider_or_a_receiver_is_refused);
    RUN_TEST(test_fits_a_text_that_fills_the_outbox_exactly);
    RUN_TEST(test_does_not_fit_a_text_one_byte_past_the_outbox);
    RUN_TEST(test_does_not_fit_a_text_the_inbox_cannot_hold);
    RUN_TEST(test_a_changed_text_reaches_the_receiver);
    RUN_TEST(test_an_unchanged_text_is_left_alone);
    RUN_TEST(test_a_longer_text_whose_kept_part_matches_is_left_alone);
    RUN_TEST(test_an_empty_slot_takes_no_text);
    RUN_TEST(test_held_is_what_the_provider_writes);
    RUN_TEST(test_held_is_ended_inside_the_cap);
    return UNITY_END();
}
