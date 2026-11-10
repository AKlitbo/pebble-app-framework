/**
 * @file callback_list.h
 * @brief A short fixed list of callbacks, run in the order they were added.
 *
 * The stores hang their periodic work on one of these, and the transport keeps another for the
 * work that waits until a whole inbound message is handled. Each list lives in the file that owns
 * it, with room set by how many callers there can be, so nothing here allocates.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdbool.h>

/**
 * @addtogroup lib_core
 * @{
 */

/** @brief One callback in a list. */
typedef void (*CallbackListFn)(void);

/** @brief A list over storage its owner provides. Start it as `{entries, max, 0}`. */
typedef struct
{
    CallbackListFn *entries; ///< The owner's array, max long
    int max;                 ///< How many the array holds
    int count;               ///< How many are in use
} CallbackList;

/**
 * @brief Adds a callback to the end of the list. Adding one that is already there does nothing.
 *
 * @param list The list.
 * @param cb The callback. NULL is ignored.
 * @return False only when the list is full and @p cb was dropped, so the owner can say so.
 */
bool callback_list_add(CallbackList *list, CallbackListFn cb);

/**
 * @brief Takes a callback off the list. The ones after it move up, so the rest keep their order.
 * Removing one that is not there does nothing.
 *
 * A callback that removes itself or another from inside callback_list_fire makes that run skip the
 * one that moves into its place, so remove from outside a run.
 *
 * @param list The list.
 * @param cb The callback.
 */
void callback_list_remove(CallbackList *list, CallbackListFn cb);

/**
 * @brief Runs every callback in the order it was added.
 *
 * @param list The list.
 */
void callback_list_fire(const CallbackList *list);

/** @} */
