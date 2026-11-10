/**
 * @file time_store.h
 * @brief Active time store. It owns the tickers (the minute tick, the swatch .beats AppTimer,
 * and the hour tick) and swaps between them for the current cadence, so a face just hands it
 * the rules and reads the time back.
 *
 * @ingroup lib_stores
 */
#pragma once
#include <pebble.h>
#include "clock/time_config.h"

/**
 * @addtogroup lib_stores
 * @{
 */

/**
 * @brief Start the store with its rules. Pass seed = NULL to start from the current time.
 *
 * @param cfg The rules (live / cadence).
 * @param seed Optional time to pin (dev/screenshots), or NULL for the current time.
 */
void time_store_init(TimeConfig cfg, const struct tm *seed);

/**
 * @brief Re-apply the rules (e.g. the time format changed). Swaps the ticker to match. Rules that
 * run the same tickers as the ones running do nothing, so a face can call it on every settings save.
 * Only init decides whether the store is live, so one init started with live = false keeps its
 * pinned time whatever cfg says, and one never started ignores it. TimeConfig and the decisions
 * live in clock/time_config.h.
 *
 * @param cfg The new rules.
 */
void time_store_reconfigure(TimeConfig cfg);

/** @brief Hand it the function to call when the time changes (the screen redraw). */
void time_store_subscribe(void (*cb)(void));

/** @brief The time we hold right now. */
const struct tm *time_store_tm(void);

/** @} */
