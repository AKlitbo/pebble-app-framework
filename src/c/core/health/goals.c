/**
 * @file goals.c
 * @brief The daily goal tables, host-testable off-device.
 *
 * goal-rows.spec.ts reads these tables as text and checks them against the page's, so each one
 * stays a plain list of numbers.
 *
 * @ingroup lib_core
 */
#include "health/goals.h"

/** @cond */
#define GOALS_LENGTH(table) (sizeof(table) / sizeof((table)[0]))
/** @endcond */

static const int16_t s_steps[] = {5000, 7500, 10000, 12500, 15000, 20000, 25000};  ///< step goals
static const int16_t s_distance_m[] = {2000, 3000, 5000, 8000, 10000, 15000, 20000};  ///< distance goals in metres, from the page's km
static const int16_t s_calories[] = {500, 1000, 1500, 2000, 2500, 3000};  ///< active calorie goals in kcal
static const int16_t s_active_min[] = {15, 30, 45, 60, 90};  ///< active minute goals
static const int16_t s_sleep_h[] = {6, 7, 8, 9, 10};  ///< sleep goals in hours
static const int16_t s_hr_limits[] = {150, 160, 170, 180, 190, 200};  ///< heart rate limits in bpm

// each count is what a KNOWN_GOAL_* entry holds the page to, so it has to be the table's real length
_Static_assert(GOALS_LENGTH(s_steps) == GOALS_STEPS_COUNT, "GOALS_STEPS_COUNT is not the step table's length");
_Static_assert(GOALS_LENGTH(s_distance_m) == GOALS_DISTANCE_COUNT, "GOALS_DISTANCE_COUNT is not the distance table's length");
_Static_assert(GOALS_LENGTH(s_calories) == GOALS_CALORIES_COUNT, "GOALS_CALORIES_COUNT is not the calorie table's length");
_Static_assert(GOALS_LENGTH(s_active_min) == GOALS_ACTIVE_COUNT, "GOALS_ACTIVE_COUNT is not the active table's length");
_Static_assert(GOALS_LENGTH(s_sleep_h) == GOALS_SLEEP_COUNT, "GOALS_SLEEP_COUNT is not the sleep table's length");
_Static_assert(GOALS_LENGTH(s_hr_limits) == GOALS_HR_COUNT, "GOALS_HR_COUNT is not the heart rate table's length");

/**
 * @brief A table's entry for a menu choice, or its first entry for a choice past the end.
 *
 * @param table The goals, in menu order.
 * @param count How many the table holds.
 * @param index The saved choice.
 * @return The goal.
 */
static int goal_at(const int16_t *table, uint8_t count, uint8_t index)
{
    return table[index < count ? index : 0];
}

int goals_steps(uint8_t index)
{
    return goal_at(s_steps, GOALS_STEPS_COUNT, index);
}

int goals_distance_m(uint8_t index)
{
    return goal_at(s_distance_m, GOALS_DISTANCE_COUNT, index);
}

int goals_calories(uint8_t index)
{
    return goal_at(s_calories, GOALS_CALORIES_COUNT, index);
}

int goals_active_min(uint8_t index)
{
    return goal_at(s_active_min, GOALS_ACTIVE_COUNT, index);
}

int goals_sleep_min(uint8_t index)
{
    return goal_at(s_sleep_h, GOALS_SLEEP_COUNT, index) * 60;
}

int goals_hr_limit(uint8_t index)
{
    return goal_at(s_hr_limits, GOALS_HR_COUNT, index);
}
