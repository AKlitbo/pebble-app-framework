/**
 * @file store_fetch.h
 * @brief The fetch timing the polling stores share: the one-shot catch-up, the cadence turn, and
 * what an init or a reconfigure does to them.
 *
 * Each store keeps one StoreFetch and points it at its own request. The interval and deadline
 * decisions stay in store_poll.h, so everything here is a guard around a timer or a request.
 *
 * @ingroup lib_stores
 */
#pragma once
#include <pebble.h>
#include "io/stores/store_poll.h"

/**
 * @addtogroup lib_stores
 * @{
 */

/** @brief One store's polling state, its catch-up timer, and how it asks the phone. */
typedef struct
{
    StorePoll poll;        ///< The interval, whether the store is live, and when it is next due
    AppTimer *timer;       ///< The one-shot fetch, or NULL when none is armed
    void (*request)(void); ///< Asks the phone for this store's data
    uint32_t first_ms;     ///< How long after launch or a catch-up call the one-shot fetch goes
} StoreFetch;

/**
 * @brief The one-shot fetch's timer callback. Clears the timer and asks the phone.
 *
 * @param data The StoreFetch the timer was armed for.
 */
void store_fetch_fire(void *data);

/**
 * @brief Cancel the one-shot fetch, if one is armed.
 *
 * @param fetch The store's fetch state.
 */
void store_fetch_stop(StoreFetch *fetch);

/**
 * @brief Arm the one-shot fetch after first_ms, unless one is already waiting.
 *
 * @param fetch The store's fetch state.
 */
void store_fetch_arm(StoreFetch *fetch);

/**
 * @brief The store's turn on the face's cadence. Asks the phone when the deadline has come round.
 *
 * @param fetch The store's fetch state.
 * @param now The current wall-clock time.
 */
void store_fetch_turn(StoreFetch *fetch, time_t now);

/**
 * @brief What a store's init does with its polling. Takes the interval, then arms one fetch shortly
 * after launch when polling is on, so the store is not blank while the first deadline is coming.
 *
 * @param fetch The store's fetch state.
 * @param poll_min Minutes between polls. 0 or less means no polling.
 * @param live True on a live face.
 * @param now The current wall-clock time.
 */
void store_fetch_start(StoreFetch *fetch, int poll_min, bool live, time_t now);

/**
 * @brief What a store's reconfigure does with its polling.
 *
 * Switching the store off clears the live flag, which stops the cadence turn too, and drops any
 * fetch still waiting. A store that keeps polling keeps its launch fetch, since a settings push that
 * lands in the first second would otherwise cancel it and leave a restored reading stale until the
 * next deadline.
 *
 * An empty store has nothing to draw, so it catches up right away. One that already holds data
 * waits for its deadline, so a save that only touched colours does not fetch on the spot and spend
 * a metered provider's quota. That deadline is a wall-clock boundary, so a save can bring it nearer
 * but never past the interval's rate.
 *
 * @param fetch The store's fetch state.
 * @param poll_min Minutes between polls. 0 or less means no polling.
 * @param live True on a live face.
 * @param now The current wall-clock time.
 * @param empty True when the store holds nothing to show yet.
 */
void store_fetch_reconfigure(StoreFetch *fetch, int poll_min, bool live, time_t now, bool empty);

/** @} */
