/**
 * @file layout_role.h
 * @brief Which of a face's layouts should be on screen right now.
 *
 * A face can hold more than one grid and swap between them. This answers which one wins when more
 * than one thing wants to. Every reading comes in as a pair: whether that trigger is firing, and
 * whether there is actually a layout assigned to it. Both halves matter, since a trigger with
 * nothing behind it has to hand the screen to whatever would have had it otherwise rather than
 * draw nothing.
 *
 * The caller gathers the readings. Nothing here touches a watch, which is what keeps it
 * host-testable.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdbool.h>

/**
 * @addtogroup lib_core
 * @{
 */

/// Which layout is showing. The caller's own storage should line up with these
typedef enum
{
    LAYOUT_ROLE_DAY = 0,   ///< The everyday grid, and what everything else falls back to
    LAYOUT_ROLE_NIGHT,     ///< The one the night schedule brings in after dark
    LAYOUT_ROLE_QUIET,     ///< The one Quiet Time brings in, whatever the hour
    LAYOUT_ROLE_COUNT
} LayoutRole;

/**
 * @brief Which layout wins, given what is firing and what has a grid behind it.
 *
 * Quiet Time sits above the night schedule on purpose. Someone who has set both is saying they
 * want a quieter screen while the watch is quiet, and that holds whether it happens to be dark
 * out or not.
 *
 * A trigger with no layout assigned is skipped rather than honoured, so the answer walks down to
 * the next one that has something to show and lands on the day grid if nothing else does. That is
 * what lets someone use one of these without filling in the other.
 *
 * @param quiet_on True while Quiet Time is on.
 * @param quiet_set True when a layout is assigned to Quiet Time.
 * @param night_on True while the night schedule says it is night.
 * @param night_set True when a layout is assigned to night.
 * @return The role whose layout should be drawn.
 */
LayoutRole layout_role_pick(bool quiet_on, bool quiet_set, bool night_on, bool night_set);

/** @} */
