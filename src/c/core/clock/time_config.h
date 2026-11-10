/**
 * @file time_config.h
 * @brief The rules a face hands the time store, what a reconfigure runs of them, and the check for
 * whether two sets of rules run the same tickers.
 *
 * The time store owns the tickers and talks to the SDK. The rules and what it decides from them
 * live here as plain C, so their specs run on a PC.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdbool.h>

/**
 * @addtogroup lib_core
 * @{
 */

/**
 * @brief The rules a face hands the time store, built from its own settings so the store names no
 * SETTING_*.
 *
 * The minute tick and the beats timer are independent, so a face can run either or both. One face
 * might run exactly one when its time format is a single exclusive choice. Another runs the minute
 * tick always plus the beats timer whenever a live .beats module is on screen. With the minute tick
 * off, hourly adds the SDK's hour tick, so a face still wakes at the top of the hour.
 */
typedef struct
{
    /**
     * At init this decides whether the clock can ever run. False holds it on the time it was seeded
     * with, for screenshots, and no later reconfigure starts it. In a reconfigure it only stops or
     * restarts a clock that init started running.
     */
    bool live;
    bool minute_tick; ///< Run the minute tick (clock date and most readouts)
    bool beats;       ///< Also run the 86.4 second .beats timer for a live .beats readout
    bool hourly;      ///< With the minute tick off, still wake at the top of each hour, such as for an hourly buzz
} TimeConfig;

// a new field changes what the tickers run, so time_config_same_tickers has to read it too.
// this stops the build until it does
_Static_assert(sizeof(TimeConfig) == 4, "a new TimeConfig field also goes into time_config_same_tickers");

/**
 * @brief Whether two sets of rules run the same tickers.
 *
 * It compares what the store would run rather than the fields one by one. With `live` false nothing
 * runs whatever the other fields say, and with the minute tick on, `hourly` changes nothing, since
 * the minute tick already lands on the hour.
 *
 * @param a One set of rules.
 * @param b The other.
 * @return True when both run the same tickers.
 */
bool time_config_same_tickers(TimeConfig a, TimeConfig b);

/**
 * @brief The rules a reconfigure runs, which are the face's own with `live` held off on a store
 * init started frozen.
 *
 * Only init decides whether the clock runs at all. A store started with `live` false stays on its
 * pinned time through every settings save, so a screenshot build never has the real time back at
 * the next tick. A store started live can still be stopped by a reconfigure and started again.
 *
 * @param cfg The rules the face passed.
 * @param pinned True when init started the store with `live` false, or never started it.
 * @return The rules to run.
 */
TimeConfig time_config_reconfigured(TimeConfig cfg, bool pinned);

/**
 * @brief What a reconfigure does to the rules running, in the order the time store needs.
 *
 * The face's rules go through time_config_reconfigured first, and only then are they compared with
 * the ones running. Compared the other way round, a pinned clock handed `live` true would read as a
 * change and start the tickers it is held off from running.
 *
 * @param[in,out] running The rules running now. Replaced with the rules the reconfigure runs.
 * @param cfg The rules the face passed.
 * @param pinned True when init started the store with `live` false, or never started it.
 * @return True when the new rules run different tickers, so the store has to swap them.
 */
bool time_config_reconfigure(TimeConfig *running, TimeConfig cfg, bool pinned);

/** @} */
