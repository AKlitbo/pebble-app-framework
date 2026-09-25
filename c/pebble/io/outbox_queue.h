/**
 * @file outbox_queue.h
 * @brief The outbox's work queue, its failed set, and the slot holding whatever is in flight.
 *
 * One AppMessage goes out at a time, so everything the watch wants to send queues here first. A
 * job the phone nacks is held in the failed set and moved back for a later pass, because its pkjs
 * was usually asleep or busy and that first send is often what wakes it. Holding it means a whole
 * poll, or the one settings reply a launch gets, is not lost to one nack.
 *
 * None of that needs the SDK. The transport owns one of these, does the sending and the timers, and
 * asks here what to send next, which keeps the deciding testable on the host.
 *
 * @ingroup lib_io
 */
#pragma once
#include <stdbool.h>

/**
 * @addtogroup lib_io
 * @{
 */

/// Most jobs the work queue or the failed set holds at once
#define OUTBOX_QUEUE_MAX 6

/**
 * @brief What an outbox job sends.
 */
typedef enum
{
    OUTBOX_NONE,     ///< The zero value, so a default-initialized job slot reads as nothing rather than a real request
    OUTBOX_WEATHER,  ///< A weather request
    OUTBOX_SETTINGS, ///< The settings reply
    OUTBOX_FRESH,    ///< The short settings reply, only whether the watch booted with nothing saved
    OUTBOX_STOCK,    ///< A stock request
    OUTBOX_CALENDAR  ///< A calendar request
} OutboxKind;

/**
 * @brief One job waiting to go out, or already in flight.
 */
typedef struct
{
    OutboxKind kind;         ///< What this job sends
    int        retries_left; ///< Retry passes left after a failed send
} OutboxJob;

/**
 * @brief Everything the outbox is holding: what is waiting, what nacked, and what is out.
 *
 * Zero-initialized is the empty state, since `OUTBOX_NONE` is the enum's zero.
 */
typedef struct
{
    OutboxJob queue[OUTBOX_QUEUE_MAX];  ///< This pass's work queue, oldest first
    int       queue_len;                ///< How many jobs are in the queue
    OutboxJob failed[OUTBOX_QUEUE_MAX]; ///< Requests that nacked this pass, held for the next
    int       failed_len;               ///< How many jobs are in the failed set
    OutboxJob inflight;                 ///< The job in flight, OUTBOX_NONE when nothing is out
} OutboxQueue;

/**
 * @brief Whether anything is in flight, which is what says the outbox is busy.
 *
 * @param outbox The outbox to read.
 * @return True while a send is waiting on its sent or failed callback.
 */
static inline bool outbox_busy(const OutboxQueue *outbox)
{
    return outbox->inflight.kind != OUTBOX_NONE;
}

/**
 * @brief Whether this kind is already somewhere in the outbox.
 *
 * Covers all three places a job can be, so a poll that repeats while an earlier one is still
 * working its way out does not queue a second copy of the same request.
 *
 * @param outbox The outbox to read.
 * @param kind The job kind to look for.
 * @return True when that kind is in flight, queued, or held after a nack.
 */
static inline bool outbox_pending(const OutboxQueue *outbox, OutboxKind kind)
{
    if (kind == OUTBOX_NONE)
    {
        // the empty flight slot and every unused array entry read as OUTBOX_NONE, so without this
        // an idle outbox would answer that nothing is already pending
        return false;
    }

    if (outbox->inflight.kind == kind)
    {
        return true;
    }

    for (int i = 0; i < outbox->queue_len; i++)
    {
        if (outbox->queue[i].kind == kind)
        {
            return true;
        }
    }

    for (int i = 0; i < outbox->failed_len; i++)
    {
        if (outbox->failed[i].kind == kind)
        {
            return true;
        }
    }

    return false;
}

/**
 * @brief Add a job to the work queue unless its kind is already pending.
 *
 * @param outbox The outbox to add to.
 * @param kind The job kind to send.
 * @param retries Retry passes left if the first send nacks.
 * @return True when the job was added, false when it was already pending or the queue is full.
 */
static inline bool outbox_push(OutboxQueue *outbox, OutboxKind kind, int retries)
{
    if (outbox_pending(outbox, kind) || outbox->queue_len >= OUTBOX_QUEUE_MAX)
    {
        return false;
    }

    outbox->queue[outbox->queue_len].kind = kind;
    outbox->queue[outbox->queue_len].retries_left = retries;
    outbox->queue_len++;
    return true;
}

/**
 * @brief Drop the front job off the work queue, shifting the rest forward.
 *
 * @param outbox The outbox to drop from.
 */
static inline void outbox_pop_front(OutboxQueue *outbox)
{
    for (int i = 1; i < outbox->queue_len; i++)
    {
        outbox->queue[i - 1] = outbox->queue[i];
    }

    if (outbox->queue_len > 0)
    {
        outbox->queue_len--;
    }
}

/**
 * @brief Take the head of the queue as the job now in flight.
 *
 * The caller sends it first and only takes it once the send was accepted, so a refused send leaves
 * the head where it was.
 *
 * @param outbox The outbox to take from.
 */
static inline void outbox_take_head(OutboxQueue *outbox)
{
    if (outbox->queue_len == 0)
    {
        return;  // outbox_clear leaves the array behind, so an empty queue still has one to read
    }

    outbox->inflight = outbox->queue[0];
    outbox_pop_front(outbox);
}

/**
 * @brief Mark whatever was in flight as settled, whichever way it went.
 *
 * @param outbox The outbox to clear.
 * @return The job that was in flight, so a nacked one can be handed to outbox_hold_failed.
 */
static inline OutboxJob outbox_release(OutboxQueue *outbox)
{
    OutboxJob settled = outbox->inflight;
    outbox->inflight.kind = OUTBOX_NONE;
    return settled;
}

/**
 * @brief Hold a nacked job for the next pass, if it still has retries.
 *
 * @param outbox The outbox to hold it in.
 * @param job The job that just nacked.
 */
static inline void outbox_hold_failed(OutboxQueue *outbox, OutboxJob job)
{
    if (job.retries_left <= 0)
    {
        return;
    }

    if (outbox->failed_len < OUTBOX_QUEUE_MAX)
    {
        outbox->failed[outbox->failed_len].kind = job.kind;
        outbox->failed[outbox->failed_len].retries_left = job.retries_left - 1;
        outbox->failed_len++;
    }
}

/**
 * @brief Move the whole failed set back into the work queue for another pass.
 *
 * @param outbox The outbox to move within.
 * @return How many jobs were moved back.
 */
static inline int outbox_retry_pass(OutboxQueue *outbox)
{
    int moved = 0;

    while (outbox->failed_len > 0 && outbox->queue_len < OUTBOX_QUEUE_MAX)
    {
        outbox->queue[outbox->queue_len++] = outbox->failed[0];
        for (int i = 1; i < outbox->failed_len; i++)
        {
            outbox->failed[i - 1] = outbox->failed[i];
        }
        outbox->failed_len--;
        moved++;
    }

    return moved;
}

/**
 * @brief Forget everything waiting, for a phone that is no longer there.
 *
 * Nothing reaches a phone that is not connected, so a store's next poll asks again once it is back
 * rather than a stale queue draining into it.
 *
 * @param outbox The outbox to empty.
 */
static inline void outbox_clear(OutboxQueue *outbox)
{
    outbox->queue_len = 0;
    outbox->failed_len = 0;
}

/** @} */
