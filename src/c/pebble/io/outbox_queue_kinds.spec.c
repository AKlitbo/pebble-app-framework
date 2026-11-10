/**
 * @file outbox_queue_kinds.spec.c
 * @brief Host tests for the outbox on a face that compiles in every request kind.
 *
 * The queue and the failed set are sized from the kinds a face has. Short by one, a reconnect where
 * every request fails at once would drop the last one, and its store would sit on a stale or empty
 * reading until its next ask, which for the phone battery and now playing is the next reconnect.
 * This spec builds the outbox as a face with the phone battery and now playing keys sees it.
 */
#define HAS_MESSAGE_KEY_PHONE_BATTERY 1
#define HAS_MESSAGE_KEY_PHONE_REQUEST 1
#define HAS_MESSAGE_KEY_MUSIC_TITLE 1
#define HAS_MESSAGE_KEY_MUSIC_ARTIST 1
#define HAS_MESSAGE_KEY_MUSIC_PLAYING 1
#define HAS_MESSAGE_KEY_MUSIC_REQUEST 1

#include "unity.h"

#include "io/outbox_queue.h"

/** The retry budget a real request is queued with, matching REQUEST_RETRY_MAX in the transport. */
#define RETRIES 3

// every kind a face with all the keys sends, in the order a reconnect could queue them
static const OutboxKind ALL_KINDS[] = {OUTBOX_WEATHER, OUTBOX_SETTINGS, OUTBOX_FRESH, OUTBOX_STOCK, OUTBOX_CALENDAR, OUTBOX_PHONE, OUTBOX_MUSIC};
#define ALL_KIND_COUNT ((int)(sizeof(ALL_KINDS) / sizeof(ALL_KINDS[0])))

static OutboxQueue outbox;

void setUp(void)
{
    outbox = (OutboxQueue){0};
}

void tearDown(void) {}

/** @brief Every kind can wait at once with nothing in flight, so none is refused for want of room. */
void test_every_kind_fits_in_the_queue(void)
{
    int pushed = 0;

    for (int i = 0; i < ALL_KIND_COUNT; i++)
    {
        pushed += outbox_push(&outbox, ALL_KINDS[i], RETRIES) ? 1 : 0;
    }

    TEST_ASSERT_EQUAL_INT(ALL_KIND_COUNT, pushed);
}

/**
 * @brief Every kind failing at once is all kept for the retry, and all of it goes back on the next pass.
 *
 * A phone that is waking up nacks each request in turn, so the whole set can fail in one pass.
 */
void test_every_kind_failing_at_once_is_all_kept(void)
{
    for (int i = 0; i < ALL_KIND_COUNT; i++)
    {
        outbox_push(&outbox, ALL_KINDS[i], RETRIES);
    }
    while (outbox.queue_len > 0)
    {
        outbox_take_head(&outbox);
        outbox_hold_failed(&outbox, outbox_release(&outbox));
    }

    int result = outbox_retry_pass(&outbox);

    TEST_ASSERT_EQUAL_INT(ALL_KIND_COUNT, result);
    TEST_ASSERT_EQUAL_INT(ALL_KIND_COUNT, outbox.queue_len);
}

int main(void)
{
    UNITY_BEGIN();
    RUN_TEST(test_every_kind_fits_in_the_queue);
    RUN_TEST(test_every_kind_failing_at_once_is_all_kept);
    return UNITY_END();
}
