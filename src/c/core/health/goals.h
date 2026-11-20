/**
 * @file goals.h
 * @brief The daily goals a wearer picks on the settings page, turned from a menu choice into the
 * real target.
 *
 * The page sends the index of the choice rather than the number, and these tables hold the numbers
 * in the same order as the page's menus. The page's rows live in `ts/pkjs/goal-rows.ts`, and a spec
 * checks the two sides hold the same values in the same order. An index past the end of a table
 * reads as its first entry, so a damaged setting still gives a real goal.
 *
 * Each table's length is a plain number the compiler knows, so a `KNOWN_GOAL_*` entry can hold its
 * setting to it.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdint.h>

/**
 * @addtogroup lib_core
 * @{
 */

#define GOALS_STEPS_COUNT    7  ///< How many step goals the page offers, from 5,000 to 25,000
#define GOALS_DISTANCE_COUNT 7  ///< How many distance goals the page offers, from 2 km to 20 km
#define GOALS_CALORIES_COUNT 6  ///< How many calorie goals the page offers, from 500 to 3,000 kcal
#define GOALS_ACTIVE_COUNT   5  ///< How many active minute goals the page offers, from 15 to 90 minutes
#define GOALS_SLEEP_COUNT    5  ///< How many sleep goals the page offers, from 6 to 10 hours
#define GOALS_HR_COUNT       6  ///< How many heart rate limits the page offers, from 150 to 200 bpm

/**
 * @brief The step goal for a menu choice.
 *
 * @param index The saved choice, 0 for the first option.
 * @return The goal in steps.
 */
int goals_steps(uint8_t index);

/**
 * @brief The distance goal for a menu choice, in metres.
 *
 * The goals are always kilometres, whatever unit the wearer reads distance in. The unit only matters
 * when the goal is drawn.
 *
 * @param index The saved choice, 0 for the first option.
 * @return The goal in metres.
 */
int goals_distance_m(uint8_t index);

/**
 * @brief The active calorie goal for a menu choice.
 *
 * @param index The saved choice, 0 for the first option.
 * @return The goal in kilocalories.
 */
int goals_calories(uint8_t index);

/**
 * @brief The active minutes goal for a menu choice.
 *
 * @param index The saved choice, 0 for the first option.
 * @return The goal in minutes.
 */
int goals_active_min(uint8_t index);

/**
 * @brief The sleep goal for a menu choice, in minutes.
 *
 * The page offers whole hours, and this hands back minutes, the unit the health store reads sleep in.
 *
 * @param index The saved choice, 0 for the first option.
 * @return The goal in minutes.
 */
int goals_sleep_min(uint8_t index);

/**
 * @brief The heart rate limit for a menu choice, the top of a heart rate bar.
 *
 * @param index The saved choice, 0 for the first option.
 * @return The limit in beats per minute.
 */
int goals_hr_limit(uint8_t index);

/** @} */
