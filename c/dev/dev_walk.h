/**
 * @file dev_walk.h
 * @brief Shared dev harness for the frame faces. It seeds every store with a fixed fixture,
 * using the store seed mechanism so no live source overwrites it, and drives an
 * accelerometer-tap theme "walk" for deterministic screenshots. Each tap steps to the next
 * theme on the same fixed data and the same fixed clock.
 *
 * `lib` owns the walk and the fixture. A face owns only its switches, see each face's
 * `src/c/dev/dev.h`, and passes them in. Always compiled but never called by a release build,
 * so the linker drops it all.
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
 * @brief Which walk a tap advances. The face works this out from its own toggles.
 */
typedef enum
{
    DEV_WALK_NONE,  ///< Just pin the fixture, no tap handler
    DEV_WALK_THEMES ///< A tap steps to the next theme
} DevWalkMode;

/**
 * @brief Inits every store from the default fixture, with `live` set to false and a pinned
 * clock, so the face shows fixed data that no live reading can stomp. Call in place of the
 * live store inits.
 *
 * @param hour The pinned clock hour (0-23).
 * @param min The pinned clock minute.
 */
void dev_walk_seed_stores(int hour, int min);

/**
 * @brief Starts the walk. Forces the initial theme, paints, and, for a real walk, subscribes
 * the accelerometer tap. Call after `engine_init`.
 *
 * @param mode Which walk to run.
 * @param apply_theme The face's own theme-apply hook. It re-colours the zones and swaps the
 * frame, and runs before the engine rebuilds so a theme change lands.
 */
void dev_walk_init(DevWalkMode mode, void (*apply_theme)(void));

/** @brief Drop the tap subscription. Call from deinit. */
void dev_walk_deinit(void);

/** @} */
