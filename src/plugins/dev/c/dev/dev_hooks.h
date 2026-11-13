/**
 * @file dev_hooks.h
 * @brief The calls a face makes to run the dev harness, and the switches they read. The build sets
 * the switches from `paf build <face> --dev` and the unit's paf.dev.config.json, beside its
 * paf.config.json, so a face writes none of them and `main.c` calls the hooks without any `#if` of its
 * own.
 *
 * `DEV_MODE` is 1 on a build with `--dev` and 0 otherwise. The build sets it on every face,
 * so a face's own header with a plain `#define DEV_MODE` of a different value stops the build on the
 * redefinition. With dev mode on the build also sets `DEV_TIME_HOUR` and `DEV_TIME_MIN` from the pinned
 * clock, and `DEV_TAP_WALK_<NAME>` to 1 for the walk the switches pick, such as `DEV_TAP_WALK_THEMES`.
 * A face's own walk reads its own name the same way. A walk the config lays out as a list also sets
 * `DEV_WALK_FROM_CONFIG`, and the rest of the config reaches the harness through dev/dev_config.h.
 *
 * A face that includes this header deletes its own `dev_seed_stores`, `dev_start`, `dev_stop`, and
 * `dev_force_time` everywhere, in every file and in its family core too. Each copy is static, so one
 * left in a file that never includes this header builds without a word and runs its own switches in
 * that file alone.
 *
 * The hooks are static inline, and with dev mode off each one is empty or returns false, so a
 * release build never includes the harness and carries none of it.
 *
 * @ingroup lib_dev
 */
#pragma once
#include <pebble.h>

/**
 * @addtogroup lib_dev
 * @{
 */

#ifndef DEV_MODE
#error "DEV_MODE comes from the build, which sets it on every face. Build the face with paf build, and add --dev for dev mode"
#endif

#if DEV_MODE
#if !defined(DEV_TIME_HOUR) || !defined(DEV_TIME_MIN)
#error "DEV_MODE is on without DEV_TIME_HOUR and DEV_TIME_MIN. Turn dev mode on with paf build <face> --dev, which sets all three"
#endif
#include "dev/dev_walk.h"
#endif
#include "dev/dev_config.h"

/**
 * @brief Applies the config's settings, then seeds the stores on the pinned clock, when dev mode is
 * on. A store the config seeds takes the config's readings, and the rest take the dev fixture. Call it
 * after settings_init and in place of the live store inits, and skip them when it returns true.
 *
 * @return True when it seeded the stores, so the face skips its live inits. False with dev mode off.
 */
static inline bool dev_seed_stores(void)
{
#if DEV_MODE
    // the settings go first, since the fixture's weather takes the temperature unit they may set
    dev_config_apply_settings();
    dev_walk_seed_stores(DEV_TIME_HOUR, DEV_TIME_MIN);
    return true;
#else
    return false;
#endif
}

/**
 * @brief Starts the walk when dev mode is on. With the theme walk picked it forces the first theme
 * and steps to the next on each tap. With a walk the config lays out it shows the first step and
 * steps to the next on each tap. Any other walk, or none, just paints the fixture once and leaves the
 * taps to the face. Call after `engine_init`.
 *
 * @param apply_theme The face's own hook for a settings change, run after each step and before the
 * engine rebuilds, or NULL for none.
 */
static inline void dev_start(void (*apply_theme)(void))
{
#if DEV_MODE
#if defined(DEV_TAP_WALK_THEMES) && DEV_TAP_WALK_THEMES
    dev_walk_init(DEV_WALK_THEMES, apply_theme);
#elif defined(DEV_WALK_FROM_CONFIG) && DEV_WALK_FROM_CONFIG
    dev_walk_init(DEV_WALK_CONFIG, apply_theme);
#else
    dev_walk_init(DEV_WALK_NONE, apply_theme);
#endif
#else
    (void)apply_theme;
#endif
}

/** @brief Drops the walk's tap subscription when dev mode is on. Call from deinit. */
static inline void dev_stop(void)
{
#if DEV_MODE
    dev_walk_deinit();
#endif
}

/**
 * @brief Sets a time to the pinned clock when dev mode is on, and to the pinned date when the config
 * has one. A panel that builds its own time, such as a second time zone, calls it so a screenshot
 * shows the same time and day in every panel.
 *
 * @param when The time to set, changed in place. Left alone with dev mode off.
 */
static inline void dev_force_time(struct tm *when)
{
#if DEV_MODE
    dev_config_pin(when);
#else
    (void)when;
#endif
}

/** @} */
