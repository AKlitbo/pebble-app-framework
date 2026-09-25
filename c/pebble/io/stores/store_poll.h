/**
 * @file store_poll.h
 * @brief Wall-clock deadlines for the stores that poll the phone.
 *
 * @ingroup lib_stores
 */
#pragma once
#include <pebble.h>
#include <time.h>

/**
 * @addtogroup lib_stores
 * @{
 */

/**
 * @brief The next wall-clock second a poll of this interval falls due.
 *
 * Counted from the epoch rather than from launch, so two watches started minutes apart poll at
 * the same moments and a relaunch does not shift the phase.
 *
 * @param poll_min Minutes between polls. Must be above 0.
 * @param now The current wall-clock time.
 * @return The second the next poll is due.
 */
static inline time_t store_poll_next(int poll_min, time_t now)
{
    time_t interval = (time_t)poll_min * SECONDS_PER_MINUTE;
    return ((now / interval) + 1) * interval;
}

/**
 * @brief Whether @p next has come round, moving it on to the following deadline when it has.
 *
 * A clock that jumps forward just fires once and carries on. One that jumps back would strand the
 * deadline more than an interval ahead, so that case is pulled back in.
 *
 * @param poll_min Minutes between polls. 0 or less means polling is off and this is never due.
 * @param[in,out] next The store's deadline, read and updated in place.
 * @param now The current wall-clock time.
 * @return Whether a poll should go out now.
 */
static inline bool store_poll_due(int poll_min, time_t *next, time_t now)
{
    if (poll_min <= 0)
    {
        return false;
    }

    time_t interval = (time_t)poll_min * SECONDS_PER_MINUTE;
    if (*next > now + interval)
    {
        *next = store_poll_next(poll_min, now);
    }

    if (now < *next)
    {
        return false;
    }

    *next = store_poll_next(poll_min, now);
    return true;
}

/** @brief One store's polling: its interval, whether it polls at all, and when it is next due. */
typedef struct
{
    time_t next;     ///< Wall-clock second the next recurring poll is due
    int    poll_min; ///< Minutes between polls. 0 or less means no recurring poll
    bool   live;     ///< True on a live face. A store seeded with fixtures never polls
} StorePoll;

/**
 * @brief Take a store's interval and whether it is live, as its init and its reconfigure both do.
 *
 * Both are always recorded. The deadline only moves when polling is on, and then to the next
 * interval boundary, so a save can bring a poll nearer but never make one come faster than the
 * interval allows.
 *
 * @param[in,out] poll The store's polling state.
 * @param poll_min Minutes between polls. 0 or less turns polling off.
 * @param live Whether the store is live.
 * @param now The current wall-clock time.
 * @return Whether polling is on, which is when a store may arm its first or catch-up fetch.
 */
bool store_poll_set(StorePoll *poll, int poll_min, bool live, time_t now);

/**
 * @brief A store's turn on the face's cadence: whether a poll should go out now.
 *
 * @param[in,out] poll The store's polling state. The deadline moves on when a poll is due.
 * @param now The current wall-clock time.
 * @return Whether to ask the phone now.
 */
bool store_poll_turn(StorePoll *poll, time_t now);

/** @} */
