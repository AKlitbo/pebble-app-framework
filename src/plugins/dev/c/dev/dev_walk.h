/**
 * @file dev_walk.h
 * @brief Shared dev harness for screenshots. It seeds the clock, weather, health, system, and
 * location stores with a fixed fixture, and the stock and calendar stores empty, using the store
 * seed mechanism so no live source overwrites it, and drives an accelerometer-tap theme "walk".
 * Each tap steps to the next theme and the next fixed set of readings, on the same fixed clock.
 *
 * The dev plugin owns the walk, the fixture, and the switches, which the build sets from `--dev` and
 * the unit's paf.dev.config.json. A face calls it through the hooks in `dev/dev_hooks.h` rather
 * than straight. Compiled for any face that lists the dev plugin, but never called by a release
 * build, so the linker drops it all.
 *
 * @ingroup lib_dev
 */
#pragma once
#include <pebble.h>

/**
 * @addtogroup lib_dev
 * @{
 */

/**
 * @brief Which walk a tap advances. `dev_start` picks it from the walk the dev switches name.
 */
typedef enum
{
    DEV_WALK_NONE,  ///< Just pin the fixture, no tap handler
    DEV_WALK_THEMES ///< A tap steps to the next theme
} DevWalkMode;

/**
 * @brief Inits the clock, weather, health, system, and location stores from the default fixture,
 * with `live` set to false and a pinned clock, so the face shows fixed data that no live reading can
 * stomp. Weather and location are only filled for a face that declares their keys, and left empty
 * otherwise. The stock and calendar stores start empty with `live` false for a face that declares
 * `STOCK_STRIP` or `CALENDAR_STRIP`, so a settings save cannot start them fetching. The phone battery
 * and now playing stores start empty with `live` false for a face that declares their keys, since the
 * seeded system store tells them nothing about the link. Call it after `settings_init`, so the
 * weather seed takes the wearer's temperature unit, in place of those stores' live inits, and before
 * any store init of the face's own, then seed the face's own data after it.
 *
 * @param hour The pinned clock hour (0-23).
 * @param min The pinned clock minute.
 */
void dev_walk_seed_stores(int hour, int min);

/**
 * @brief Starts the walk. A theme walk forces the first theme and subscribes the accelerometer
 * tap. Either mode then paints. Call after `engine_init`.
 *
 * @param mode Which walk to run.
 * @param apply_theme The face's own theme-apply hook. It re-colours the zones and swaps the
 * frame, and runs before the engine rebuilds so a theme change lands.
 */
void dev_walk_init(DevWalkMode mode, void (*apply_theme)(void));

/** @brief Drop the tap subscription. Call from deinit. */
void dev_walk_deinit(void);

/** @} */
