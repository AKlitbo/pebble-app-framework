/**
 * @file goal_latch.h
 * @brief Decides when a daily movement goal has just been met, so the watch cheers once per goal
 * per day.
 *
 * It watches steps, calories, distance, and active minutes. A goal counts as met when its reading
 * reaches its target after a reading below the target that same day, and after that it stays met
 * until the day changes. A reading already past the target with none below it first never counts.
 * That keeps the face quiet on a goal met before it opened, and on yesterday's total, which the health
 * store can still hold for up to a minute after midnight. The goal then waits for today's own readings
 * to climb past it.
 *
 * The latch only moves when it is asked. A target raised past a goal already met stays met for the
 * day, and a target lowered below the reading reports on the next ask rather than straight away.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdint.h>

/**
 * @addtogroup lib_core
 * @{
 */

/**
 * @brief The goals the latch watches, in the order it reads their readings and targets.
 */
typedef enum
{
    GOAL_LATCH_STEPS,     ///< Steps so far today
    GOAL_LATCH_CALORIES,  ///< Active calories so far today
    GOAL_LATCH_DISTANCE,  ///< Walked distance so far today, in metres
    GOAL_LATCH_ACTIVE,    ///< Active minutes so far today
    GOAL_LATCH_COUNT      ///< How many goals the latch watches
} GoalLatchGoal;

/** @brief The bit a goal takes in the mask goal_latch_update hands back. */
#define GOAL_LATCH_BIT(goal) ((uint8_t)(1u << (goal)))

/**
 * @brief Remembers which goals were met today.
 */
typedef struct
{
    int     day;    ///< The day the marks belong to, as tm_yday, or -1 before the first look
    uint8_t below;  ///< One GOAL_LATCH_BIT for each goal with a reading below its target today
    uint8_t met;    ///< One GOAL_LATCH_BIT for each goal already met today
} GoalLatch;

#define GOAL_LATCH_EMPTY {.day = -1}  ///< a latch that has not looked yet

/**
 * @brief Takes the latest readings and says which goals they just met.
 *
 * A new day clears the marks first. A reading of 0 or less is no reading yet, since the health store
 * reads -1 for a missing step, calorie, or active minutes total and 0 for a missing distance. A
 * target of 0 or less is no goal, for a face that does not keep one. Either way the goal waits.
 *
 * @param latch The latch to check and update.
 * @param day The day of the readings, as tm_yday.
 * @param readings Today's readings, one per GoalLatchGoal in its order.
 * @param targets The goals, one per GoalLatchGoal in its order.
 * @return A GOAL_LATCH_BIT for each goal met since the last ask, or 0 when none was.
 */
uint8_t goal_latch_update(GoalLatch *latch, int day, const int readings[GOAL_LATCH_COUNT],
                          const int targets[GOAL_LATCH_COUNT]);

/** @} */
