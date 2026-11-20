/**
 * @file goal_latch.c
 * @brief The goal-met latch, host-testable off-device.
 *
 * @ingroup lib_core
 */
#include "health/goal_latch.h"

uint8_t goal_latch_update(GoalLatch *latch, int day, const int readings[GOAL_LATCH_COUNT],
                          const int targets[GOAL_LATCH_COUNT])
{
    // a new day, or the very first look, forgets yesterday's goals
    if (day != latch->day)
    {
        latch->below = 0;
        latch->met = 0;
        latch->day = day;
    }

    uint8_t crossed = 0;
    for (int goal = 0; goal < GOAL_LATCH_COUNT; goal++)
    {
        uint8_t bit = GOAL_LATCH_BIT(goal);

        // no goal, or no reading yet, so this goal waits
        // a reading of 0 waits too, since the store reads a missing distance as 0 and every day
        // passes through readings above 0 and below its goal before it meets it
        if (targets[goal] <= 0 || readings[goal] <= 0)
        {
            continue;
        }

        if (readings[goal] < targets[goal])
        {
            latch->below |= bit;
            continue;
        }

        // past the goal counts only after a reading below it today
        // a reading already past it may be yesterday's total, which the store still holds for up to a
        // minute after midnight, or a goal met before the face opened. neither should buzz
        if ((latch->below & bit) && !(latch->met & bit))
        {
            latch->met |= bit;
            crossed |= bit;
        }
    }

    return crossed;
}
