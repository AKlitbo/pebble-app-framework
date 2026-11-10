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

/**
 * @brief Whether a reading is worth asking for again now that the phone is back.
 *
 * The phone's side may have been closed the whole time it was away, so a face catches up a reading
 * that went stale meanwhile. Only a reading that never arrived, or one at least its own interval old,
 * is asked for, so bluetooth dropping in and out cannot fetch faster than the normal polling. Polling
 * turned off is left alone, the same as its store.
 *
 * @param age_s Seconds since the reading arrived, or below 0 when it never has.
 * @param poll_min Minutes between polls. 0 or less means polling is off.
 * @return Whether to ask for the reading again.
 */
static inline bool store_poll_reconnect_due(int age_s, int poll_min)
{
    if (poll_min <= 0)
    {
        return false;
    }
    // a clock set back makes a saved reading's age negative too, so it reads as never arrived and the
    // reconnect asks again. the first answer resets the age, and a reconnect means the phone is there
    // to give one, so it costs about one fetch. counting that age as fresh instead would skip every
    // reconnect fetch until the clock caught up, which can be hours
    return age_s < 0 || age_s >= poll_min * SECONDS_PER_MINUTE;
}

/**
 * @brief One store's polling: its interval, whether it polls at all, and when it is next due.
 *
 * A StorePoll has to begin zeroed, as a static one does, or go through store_poll_start before
 * anything else reads it. Zero one on the stack or the heap before its first store_poll_set, or a
 * stray `pinned` keeps it off for good.
 */
typedef struct
{
    time_t next;         ///< Wall-clock second the next recurring poll is due
    int    poll_min;     ///< Minutes between polls. 0 or less means no recurring poll
    bool   live;         ///< True on a live face. A store seeded with fixtures never polls
    bool   pinned;       ///< True when init started the store not live, so no reconfigure turns it live
} StorePoll;

/**
 * @brief Take a store's interval and whether it is live, as its init does.
 *
 * Init is the one place that decides whether the store is live at all. A store it starts with
 * `live` false is pinned, and stays not live through every reconfigure, as store_poll_set covers.
 * A store whose init calls store_poll_set instead is never pinned, so a reconfigure can turn it
 * live.
 *
 * The pin only covers asking the phone. A store that also takes pushes or listens for the link
 * registers its handler and its listener only when init starts it live. An init that starts it with
 * `live` false clears the handler and removes the listener, so a store started live and then pinned
 * takes no push over its seed.
 *
 * @param[in,out] poll The store's polling state.
 * @param poll_min Minutes between polls. 0 or less turns polling off.
 * @param live Whether the store is live.
 * @param now The current wall-clock time.
 * @return Whether polling is on, which is when a store may arm its first fetch.
 */
bool store_poll_start(StorePoll *poll, int poll_min, bool live, time_t now);

/**
 * @brief Take a store's interval and whether it is live, as its reconfigure does.
 *
 * Both are always recorded. A store that store_poll_start pinned stays not live whatever @p live
 * says, so a settings save in a build seeded for screenshots never starts it fetching over its
 * fixture. A live store can still be switched off here and back on again. The deadline only moves
 * when polling is on, and then to the next interval boundary, so a save can bring a poll nearer but
 * never make one come faster than the interval allows.
 *
 * @param[in,out] poll The store's polling state.
 * @param poll_min Minutes between polls. 0 or less turns polling off.
 * @param live Whether the store should be live.
 * @param now The current wall-clock time.
 * @return Whether polling is on, which is when a store may arm its catch-up fetch.
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

/**
 * @brief A store's catch-up when the phone comes back: whether to ask for its reading again.
 *
 * Only a live store asks, so a store seeded for screenshots keeps its fixture through a reconnect.
 * The age and the interval decide the rest, the same as store_poll_reconnect_due. The deadline is
 * left alone, so a catch-up never pushes the next recurring poll further away.
 *
 * @param poll The store's polling state.
 * @param age_s Seconds since the reading arrived, or below 0 when it never has.
 * @return Whether to ask the phone now.
 */
bool store_poll_reconnect(const StorePoll *poll, int age_s);

/** @} */
