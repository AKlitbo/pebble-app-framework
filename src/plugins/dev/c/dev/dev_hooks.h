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
 * A face's own walk reads its own name the same way.
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

/**
 * @brief Seeds the stores from the dev fixture on the pinned clock when dev mode is on. Call it in
 * place of the live store inits, and skip them when it returns true.
 *
 * @return True when it seeded the stores, so the face skips its live inits. False with dev mode off.
 */
static inline bool dev_seed_stores(void)
{
#if DEV_MODE
    dev_walk_seed_stores(DEV_TIME_HOUR, DEV_TIME_MIN);
    return true;
#else
    return false;
#endif
}

/**
 * @brief Starts the walk when dev mode is on. With the theme walk picked it forces the first theme
 * and steps to the next on each tap. Any other walk, or none, just paints the fixture once and
 * leaves the taps to the face. Call after `engine_init`.
 *
 * @param apply_theme The face's own theme-apply hook, or NULL for none.
 */
static inline void dev_start(void (*apply_theme)(void))
{
#if DEV_MODE
#if defined(DEV_TAP_WALK_THEMES) && DEV_TAP_WALK_THEMES
    dev_walk_init(DEV_WALK_THEMES, apply_theme);
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
 * @brief Sets a time's hour and minute to the pinned clock when dev mode is on. A panel that builds
 * its own time, such as a second time zone, calls it so a screenshot shows the same time in every
 * panel.
 *
 * @param when The time to set, changed in place. Left alone with dev mode off.
 */
static inline void dev_force_time(struct tm *when)
{
#if DEV_MODE
    when->tm_hour = DEV_TIME_HOUR;
    when->tm_min = DEV_TIME_MIN;
#else
    (void)when;
#endif
}

/** @} */
