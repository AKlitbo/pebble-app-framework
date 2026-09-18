/**
 * @file outbox_queue.spec.c
 * @brief Host tests for the outbox's queue, failed set and in-flight slot.
 *
 * The transport does the sending and the timers, but what to send next is decided here, so the
 * deciding is testable off the watch. What matters is not the array shuffling but the two ways a
 * poll goes missing: a nacked request dropped instead of held, which leaves the face on a stale
 * reading until the next interval, and a repeat poll queued twice, which spends a metered
 * provider's quota on an answer already on its way.
 */
#include "unity.h"

#include "io/outbox_queue.h"

/** The retry budget a real request is queued with, matching REQUEST_RETRY_MAX in the transport. */
#define RETRIES 3

static OutboxQueue outbox;

void setUp(void)
{
    outbox = (OutboxQueue){0};
}

void tearDown(void) {}

/** A zeroed outbox has to read as idle, since that is the state the transport starts in. */
void test_a_fresh_outbox_is_not_busy(void)
{
    bool result = outbox_busy(&outbox);

    TEST_ASSERT_FALSE(result);
}

/** Only the in-flight slot marks the outbox busy. A queued job is waiting, not out. */
void test_a_queued_job_does_not_make_the_outbox_busy(void)
{
    outbox_push(&outbox, OUTBOX_WEATHER, RETRIES);

    bool result = outbox_busy(&outbox);

    TEST_ASSERT_FALSE(result);
}

/** Taking the head is what says a send is out, and it is what holds the next one back. */
void test_taking_the_head_makes_the_outbox_busy(void)
{
    outbox_push(&outbox, OUTBOX_WEATHER, RETRIES);

    outbox_take_head(&outbox);

    TEST_ASSERT_TRUE(outbox_busy(&outbox));
    TEST_ASSERT_EQUAL_INT(0, outbox.queue_len);
}

/**
 * @brief A repeated poll must not queue a second copy.
 *
 * The watch re-asks every few seconds until its first reading lands. Without this each ask would
 * queue its own request and every one of them would spend a metered provider's daily quota.
 */
void test_a_kind_already_queued_is_not_queued_again(void)
{
    outbox_push(&outbox, OUTBOX_WEATHER, RETRIES);

    bool result = outbox_push(&outbox, OUTBOX_WEATHER, RETRIES);

    TEST_ASSERT_FALSE(result);
    TEST_ASSERT_EQUAL_INT(1, outbox.queue_len);
}

/** The same guard has to cover the job already out, or a re-ask doubles up mid-send. */
void test_a_kind_in_flight_is_not_queued_again(void)
{
    outbox_push(&outbox, OUTBOX_WEATHER, RETRIES);
    outbox_take_head(&outbox);

    bool result = outbox_push(&outbox, OUTBOX_WEATHER, RETRIES);

    TEST_ASSERT_FALSE(result);
    TEST_ASSERT_EQUAL_INT(0, outbox.queue_len);
}

/** And the failed set too, or a re-ask queues a copy of something already waiting to retry. */
void test_a_kind_held_after_a_nack_is_not_queued_again(void)
{
    OutboxJob nacked = {.kind = OUTBOX_STOCK, .retries_left = RETRIES};
    outbox_hold_failed(&outbox, nacked);

    bool result = outbox_push(&outbox, OUTBOX_STOCK, RETRIES);

    TEST_ASSERT_FALSE(result);
}

/** An idle outbox must not answer that OUTBOX_NONE is pending, since its empty slots read as that. */
void test_an_idle_outbox_has_no_pending_none(void)
{
    bool result = outbox_pending(&outbox, OUTBOX_NONE);

    TEST_ASSERT_FALSE(result);
}

/** Taking the head of an empty queue would put a stale job in the flight slot and wedge the outbox. */
void test_taking_the_head_of_an_empty_queue_does_nothing(void)
{
    outbox.queue[0].kind = OUTBOX_WEATHER;  // left behind by a clear

    outbox_take_head(&outbox);

    TEST_ASSERT_FALSE(outbox_busy(&outbox));
}

/** A different kind is a different request and must still get through. */
void test_a_different_kind_still_queues(void)
{
    outbox_push(&outbox, OUTBOX_WEATHER, RETRIES);

    bool result = outbox_push(&outbox, OUTBOX_CALENDAR, RETRIES);

    TEST_ASSERT_TRUE(result);
    TEST_ASSERT_EQUAL_INT(2, outbox.queue_len);
}

/**
 * @brief Releasing hands back what was in flight, not what the slot reads after it is freed.
 *
 * Clearing the slot first and then reading its kind is the bug this pins. hold_failed refuses
 * anything that is not a request, so a cleared kind meant every nacked poll was dropped instead
 * of retried and the face sat on a stale reading until the next interval.
 */
void test_releasing_returns_the_job_that_was_in_flight(void)
{
    outbox_push(&outbox, OUTBOX_WEATHER, RETRIES);
    outbox_take_head(&outbox);

    OutboxJob result = outbox_release(&outbox);

    TEST_ASSERT_EQUAL_INT(OUTBOX_WEATHER, result.kind);
    TEST_ASSERT_FALSE(outbox_busy(&outbox));
}

/** A nacked request is held so a later pass can send it again. */
void test_a_nacked_request_is_held_for_the_next_pass(void)
{
    OutboxJob nacked = {.kind = OUTBOX_WEATHER, .retries_left = RETRIES};

    outbox_hold_failed(&outbox, nacked);

    TEST_ASSERT_EQUAL_INT(1, outbox.failed_len);
    TEST_ASSERT_EQUAL_INT(RETRIES - 1, outbox.failed[0].retries_left);
}

/**
 * @brief The settings reply is never retried.
 *
 * It answers something the phone asked for, so the phone asks again if it needs to. Retrying it
 * would send the watch's snapshot at a moment the phone is no longer waiting for one.
 */
void test_a_nacked_settings_reply_is_not_held(void)
{
    OutboxJob nacked = {.kind = OUTBOX_SETTINGS, .retries_left = RETRIES};

    outbox_hold_failed(&outbox, nacked);

    TEST_ASSERT_EQUAL_INT(0, outbox.failed_len);
}

/** Without a floor on the retries one unsendable request would bounce between the two sets forever. */
void test_a_request_out_of_retries_is_dropped(void)
{
    OutboxJob spent = {.kind = OUTBOX_WEATHER, .retries_left = 0};

    outbox_hold_failed(&outbox, spent);

    TEST_ASSERT_EQUAL_INT(0, outbox.failed_len);
}

/** The retry pass is what actually sends a held request again, so it has to move the whole set. */
void test_a_retry_pass_moves_every_held_request_back(void)
{
    OutboxJob weather = {.kind = OUTBOX_WEATHER, .retries_left = RETRIES};
    OutboxJob stock = {.kind = OUTBOX_STOCK, .retries_left = RETRIES};
    outbox_hold_failed(&outbox, weather);
    outbox_hold_failed(&outbox, stock);

    int result = outbox_retry_pass(&outbox);

    TEST_ASSERT_EQUAL_INT(2, result);
    TEST_ASSERT_EQUAL_INT(2, outbox.queue_len);
    TEST_ASSERT_EQUAL_INT(0, outbox.failed_len);
    TEST_ASSERT_EQUAL_INT(OUTBOX_WEATHER, outbox.queue[0].kind);
}

/** A request that keeps nacking has to run out, or it is retried for the life of the app. */
void test_a_request_stops_being_held_once_its_retries_run_out(void)
{
    OutboxJob job = {.kind = OUTBOX_WEATHER, .retries_left = RETRIES};

    for (int pass = 0; pass < RETRIES + 1; pass++)
    {
        outbox_hold_failed(&outbox, job);
        if (outbox.failed_len == 0)
        {
            break;
        }
        job = outbox.failed[0];
        outbox.failed_len = 0;
    }

    TEST_ASSERT_EQUAL_INT(0, outbox.failed_len);
    TEST_ASSERT_EQUAL_INT(0, job.retries_left);
}

/** The head goes out first, so popping has to keep the rest in the order they were asked for. */
void test_popping_the_head_keeps_the_rest_in_order(void)
{
    outbox_push(&outbox, OUTBOX_WEATHER, RETRIES);
    outbox_push(&outbox, OUTBOX_STOCK, RETRIES);
    outbox_push(&outbox, OUTBOX_CALENDAR, RETRIES);

    outbox_pop_front(&outbox);

    TEST_ASSERT_EQUAL_INT(2, outbox.queue_len);
    TEST_ASSERT_EQUAL_INT(OUTBOX_STOCK, outbox.queue[0].kind);
    TEST_ASSERT_EQUAL_INT(OUTBOX_CALENDAR, outbox.queue[1].kind);
}

/** Popping an empty queue must not walk the length negative and read off the front of the array. */
void test_popping_an_empty_queue_leaves_it_empty(void)
{
    outbox_pop_front(&outbox);

    TEST_ASSERT_EQUAL_INT(0, outbox.queue_len);
}

/**
 * @brief A full queue must refuse rather than write past the end of its array.
 *
 * The kind pushed has to be one the queue does not already hold, or the pending check refuses it
 * first and the capacity guard is never reached. There are only four kinds and the pending check
 * sits in front of it, so a real run never fills the queue, which leaves this the only thing
 * holding the guard up.
 */
void test_a_full_queue_refuses_another_job(void)
{
    for (int i = 0; i < OUTBOX_QUEUE_MAX; i++)
    {
        outbox.queue[i].kind = OUTBOX_WEATHER;
    }
    outbox.queue_len = OUTBOX_QUEUE_MAX;

    bool result = outbox_push(&outbox, OUTBOX_STOCK, RETRIES);

    TEST_ASSERT_FALSE(result);
    TEST_ASSERT_EQUAL_INT(OUTBOX_QUEUE_MAX, outbox.queue_len);
}

/**
 * @brief A disconnected phone drops everything waiting rather than draining a stale queue into it.
 *
 * The job already in flight is left alone, since its callback still has to settle it.
 */
void test_clearing_empties_both_sets_and_leaves_the_flight_slot(void)
{
    outbox_push(&outbox, OUTBOX_WEATHER, RETRIES);
    outbox_take_head(&outbox);
    outbox_push(&outbox, OUTBOX_STOCK, RETRIES);
    OutboxJob nacked = {.kind = OUTBOX_CALENDAR, .retries_left = RETRIES};
    outbox_hold_failed(&outbox, nacked);

    outbox_clear(&outbox);

    TEST_ASSERT_EQUAL_INT(0, outbox.queue_len);
    TEST_ASSERT_EQUAL_INT(0, outbox.failed_len);
    TEST_ASSERT_TRUE(outbox_busy(&outbox));
}

/** Unity needs each test naming, so a new one above is added here too. */
int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_a_fresh_outbox_is_not_busy);
    RUN_TEST(test_a_queued_job_does_not_make_the_outbox_busy);
    RUN_TEST(test_taking_the_head_makes_the_outbox_busy);
    RUN_TEST(test_a_kind_already_queued_is_not_queued_again);
    RUN_TEST(test_a_kind_in_flight_is_not_queued_again);
    RUN_TEST(test_a_kind_held_after_a_nack_is_not_queued_again);
    RUN_TEST(test_an_idle_outbox_has_no_pending_none);
    RUN_TEST(test_taking_the_head_of_an_empty_queue_does_nothing);
    RUN_TEST(test_a_different_kind_still_queues);
    RUN_TEST(test_releasing_returns_the_job_that_was_in_flight);
    RUN_TEST(test_a_nacked_request_is_held_for_the_next_pass);
    RUN_TEST(test_a_nacked_settings_reply_is_not_held);
    RUN_TEST(test_a_request_out_of_retries_is_dropped);
    RUN_TEST(test_a_retry_pass_moves_every_held_request_back);
    RUN_TEST(test_a_request_stops_being_held_once_its_retries_run_out);
    RUN_TEST(test_popping_the_head_keeps_the_rest_in_order);
    RUN_TEST(test_popping_an_empty_queue_leaves_it_empty);
    RUN_TEST(test_a_full_queue_refuses_another_job);
    RUN_TEST(test_clearing_empties_both_sets_and_leaves_the_flight_slot);

    return UNITY_END();
}
