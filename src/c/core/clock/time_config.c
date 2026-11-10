/**
 * @file time_config.c
 * @brief What a time store reconfigure runs, and the check for whether two sets of its rules run
 * the same tickers.
 *
 * @ingroup lib_core
 */
#include "clock/time_config.h"

#include <stdint.h>

#include "io/store_live.h"

#define TICKER_MINUTE 0x1  ///< The minute tick
#define TICKER_HOUR 0x2    ///< The hour tick, run only with the minute tick off
#define TICKER_BEATS 0x4   ///< The .beats timer

/**
 * @brief The tickers a set of rules runs, one bit each, in the same order the store starts them.
 *
 * @param cfg The rules.
 * @return The tickers, or 0 when none runs.
 */
static uint8_t tickers(TimeConfig cfg)
{
    if (!cfg.live)
    {
        return 0;
    }

    uint8_t running = 0;
    if (cfg.minute_tick)
    {
        running |= TICKER_MINUTE;
    }
    else if (cfg.hourly)
    {
        running |= TICKER_HOUR;
    }

    if (cfg.beats)
    {
        running |= TICKER_BEATS;
    }

    return running;
}

bool time_config_same_tickers(TimeConfig a, TimeConfig b)
{
    return tickers(a) == tickers(b);
}

TimeConfig time_config_reconfigured(TimeConfig cfg, bool pinned)
{
    cfg.live = store_live_after_reconfigure(cfg.live, pinned);
    return cfg;
}

bool time_config_reconfigure(TimeConfig *running, TimeConfig cfg, bool pinned)
{
    TimeConfig next = time_config_reconfigured(cfg, pinned);
    bool same = time_config_same_tickers(next, *running);
    *running = next;
    return !same;
}
