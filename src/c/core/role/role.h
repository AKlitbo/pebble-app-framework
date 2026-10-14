/**
 * @file role.h
 * @brief Which of day, night, and Quiet Time should be on screen right now.
 *
 * A face can swap what it draws between an everyday look, a night one, and a Quiet Time one. This
 * answers which one wins when more than one wants to. Every reading comes in as a pair: whether that
 * trigger is firing, and whether there is actually something assigned to it. Both halves matter,
 * since a trigger with nothing behind it has to hand the screen to whatever would have had it
 * otherwise rather than draw nothing.
 *
 * The caller gathers the readings. Nothing here touches a watch, which is what keeps it
 * host-testable. A layout editor reads it to pick a grid, and a themed face to pick a palette.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdbool.h>

/**
 * @addtogroup lib_core
 * @{
 */

/// Which of the three is showing. The caller's own storage should line up with these
typedef enum
{
    ROLE_DAY = 0,   ///< The everyday look, and what everything else falls back to
    ROLE_NIGHT,     ///< The one the night schedule brings in after dark
    ROLE_QUIET,     ///< The one Quiet Time brings in, whatever the hour
    ROLE_COUNT
} Role;

/**
 * @brief Which role wins, given what is firing and what has something behind it.
 *
 * Quiet Time sits above the night schedule on purpose. Someone who has set both is saying they
 * want a quieter screen while the watch is quiet, and that holds whether it happens to be dark
 * out or not.
 *
 * A trigger with nothing assigned is skipped rather than honoured, so the answer walks down to
 * the next one that has something to show and lands on the day role if nothing else does. That is
 * what lets someone use one of these without filling in the other.
 *
 * @param quiet_on True while Quiet Time is on.
 * @param quiet_set True when something is assigned to Quiet Time.
 * @param night_on True while the night schedule says it is night.
 * @param night_set True when something is assigned to night.
 * @return The role whose look should be drawn.
 */
Role role_pick(bool quiet_on, bool quiet_set, bool night_on, bool night_set);

/** @} */
