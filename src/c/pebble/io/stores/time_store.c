/**
 * @file time_store.c
 * @brief The active time store: holds the current time and owns the tickers that update it.
 *
 * @ingroup lib_stores
 */
#include "io/stores/time_store.h"
#include "io/stores/store_cadence.h"

#include <time.h>

#include "system/units/units.h"

static struct tm s_tm;          ///< The current time, as of the last tick
static void (*s_cb)(void);      ///< Called whenever the time moves, so the face can redraw

static AppTimer *s_beats_timer; ///< The .beats ticker. NULL when it isn't running
static TimeConfig s_cfg;        ///< The rules running now, live included
static bool s_started_live;     ///< True when init started it live, so a reconfigure may run it

static void tick_handler(struct tm *tick_time, TimeUnits units_changed);

/**
 * @brief Save the new time and tell whoever is listening.
 *
 * @param t The new time.
 */
static void set(const struct tm *t)
{
    s_tm = *t;

    // the other stores ride this ticker rather than each running one of their own, so give them
    // their turn before the face is told, and it repaints once off the fresh numbers
    store_cadence_fire();

    if (s_cb) s_cb();
}

/**
 * @brief Minute or hour tick handler: feed the tick straight in.
 *
 * @param tick_time The new time.
 * @param units_changed Which units changed (unused, the store always takes the whole tick).
 */
static void tick_handler(struct tm *tick_time, TimeUnits units_changed)
{
    set(tick_time);
}

/**
 * @brief .beats ticker: refresh the time and re-arm for the next beat boundary.
 *
 * @param data The timer context (unused).
 */
static void beats_fire(void *data)
{
    time_t now = time(NULL);
    set(localtime(&now));

    s_beats_timer = app_timer_register(units_ms_until_next_beat(), beats_fire, NULL);
}

/**
 * @brief Run the tickers the config asks for. The minute tick and the .beats timer are independent,
 * so a face can have either or both (a clock and .beats can run together). With the minute tick off,
 * hourly subscribes the hour tick instead.
 */
static void start_ticker(void)
{
    if (s_cfg.minute_tick)
    {
        tick_timer_service_subscribe(MINUTE_UNIT, tick_handler);
    }
    else if (s_cfg.hourly)
    {
        // a face that needs only the top of the hour, such as an hourly buzz on a .beats clock,
        // wakes once an hour rather than every minute. the .beats timer alone lands in minute 0 of
        // only two hours in three in a zone half an hour or 45 minutes off UTC
        tick_timer_service_subscribe(HOUR_UNIT, tick_handler);
    }
    else
    {
        tick_timer_service_unsubscribe();
    }

    if (s_cfg.beats)
    {
        if (!s_beats_timer)
        {
            s_beats_timer = app_timer_register(units_ms_until_next_beat(), beats_fire, NULL);
        }
    }
    else if (s_beats_timer)
    {
        app_timer_cancel(s_beats_timer);
        s_beats_timer = NULL;
    }
}

/**
 * @brief Stop both tickers (seed mode / teardown).
 */
static void stop_ticker(void)
{
    tick_timer_service_unsubscribe();
    if (s_beats_timer)
    {
        app_timer_cancel(s_beats_timer);
        s_beats_timer = NULL;
    }
}

void time_store_subscribe(void (*cb)(void))
{
    s_cb = cb;
}

void time_store_init(TimeConfig cfg, const struct tm *seed)
{
    s_cfg = cfg;
    s_started_live = cfg.live;

    // seed the current time (or the pinned one) so the first paint has something to draw.
    // s_cb is NULL until the face subscribes so this doesn't redraw
    if (seed)
    {
        s_tm = *seed;
    }
    else
    {
        time_t now = time(NULL);
        s_tm = *localtime(&now);
    }

    // a store started again on its seed stops whatever an earlier live start left running, or that
    // ticker would keep moving the pinned time with nothing left to stop it
    if (cfg.live)
    {
        start_ticker();
    }
    else
    {
        stop_ticker();
    }
}

void time_store_reconfigure(TimeConfig cfg)
{
    // a store started on a pinned time stays on it, so a settings save in a screenshot build never
    // brings the real time back at the next tick. one never started counts as pinned too, so a save
    // cannot start tickers for a store the face never set up
    bool changed = time_config_reconfigure(&s_cfg, cfg, !s_started_live);
    bool beats_stopped = s_cfg.live && s_cfg.beats && !s_beats_timer;

    // a face calls this on every settings save, and most saves leave the tickers as they are, so
    // rules that run the same tickers return straight away. PebbleOS sends a first tick on every
    // subscribe, and skipping it saves a second repaint and another round of store poll checks.
    // the cost is that the time the store holds is not refreshed by the save, so the face's own
    // repaint draws a time up to one tick old, as it is between any two ticks.
    // the skip does not apply when the .beats timer should be running and is not. it sets itself
    // again on each beat, and a set that fails for want of memory ends the chain, so a save starts it
    // again
    if (!changed && !beats_stopped)
    {
        return;
    }

    if (s_cfg.live)
    {
        start_ticker();  // swaps to the right cadence
    }
    else
    {
        stop_ticker();
    }
}

const struct tm *time_store_tm(void)
{
    return &s_tm;
}
