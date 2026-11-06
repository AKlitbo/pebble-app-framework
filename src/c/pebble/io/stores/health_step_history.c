/**
 * @file health_step_history.c
 * @brief The health store's hourly steps: today's steps by the hour for a bar chart. A face turns
 * it on with HEALTH_STEP_HISTORY, and one that never names it carries none of this.
 *
 * @ingroup lib_stores
 */
#include "io/stores/health_store.h"
#include "io/stores/health_store_parts.h"
#include "io/stores/store_sum.h"
#include "math/scale.h"

#include "health/step_hours.h"

#include <string.h>
#include <time.h>

// HOURS_PER_DAY (24) and MINUTES_PER_HOUR (60) come from the Pebble SDK. the bucket maths lives in
// core so it can be tested on the host, so the two have to agree on how long a day is
_Static_assert(HOURS_PER_DAY == STEP_HOURS_PER_DAY, "core and the SDK must agree on the day");

/**
 * @var s_hours
 * @brief Today's steps by the hour and how many of the hours are real.
 */
static struct
{
    uint16_t step_hourly[HOURS_PER_DAY]; ///< Steps in each hour of today, midnight first
    int      step_hours;                 ///< How many of those hours are real (0 to 24)
} s_hours;

/**
 * @name Settled step hours
 *
 * Finished hours can never gain another step, so they are read once and kept. These live out here
 * because a start clears the buckets, and stale beliefs about them would strand the cleared ones.
 * @{
 */
static time_t s_cached_day; ///< The day the kept hours belong to
static int s_settled_hours; ///< How many finished hours are already read and kept
/** @} */

static bool s_pending;  ///< True between a live start and the first bucket read, which is held back until the face has painted
static bool s_no_timer; ///< True when the start got no timer, so the gate drops after the store's own launch read
static int s_steps;    ///< Today's step count as the store last read it, or -1 for none

#if defined(PBL_HEALTH)
/** @brief Adds a record's steps to its hour's total, for the hourly step read. */
static void add_record_steps(int hour, const HealthMinuteData *record, void *context)
{
    ((int *)context)[hour] += record->steps;
}
#endif

/**
 * @brief Fill the per-hour step buckets from midnight up to the current hour.
 *
 * `step_hours` records how many buckets are real so the chart can tell a quiet hour from one
 * that has not happened yet.
 *
 * An hour is read as it rolls over and once more the minute after, then never again. The hour in
 * progress is today's total less the settled ones, which is free. Each real read blocks on a
 * scan of the watch's whole minute log, so they stay off the minute path.
 */
static void read_step_hourly(void)
{
#if defined(PBL_HEALTH)
    time_t now = time(NULL);
    time_t day_start = time_start_of_today();
    struct tm local = *localtime(&now);  // a copy, since mktime below reuses the same buffer
    int cur_hour = local.tm_hour;

    // a new day, or a clock that jumped backwards, leaves the kept buckets describing hours that
    // are no longer the ones being asked about, so drop the lot and read them again
    if (day_start != s_cached_day || cur_hour < s_settled_hours)
    {
        memset(&s_hours, 0, sizeof(s_hours));
        s_cached_day = day_start;
        s_settled_hours = 0;
    }

    if (!health_metric_available(HealthMetricStepCount, day_start, now))
    {
        return;
    }

    // any whole hour behind the current one that has not been read yet. normally none, one on the
    // turn an hour rolls over, and the run since midnight on the first turn after a launch
    if (s_settled_hours < cur_hour)
    {
        int sums[HOURS_PER_DAY] = {0};
        if (!health_walk_minute_log(&local, s_settled_hours, cur_hour, health_hour_start(&local, cur_hour),
                                    add_record_steps, sums))
        {
            return; // no room, so leave the buckets as they are and try again next turn
        }

        for (int h = s_settled_hours; h < cur_hour && h < HOURS_PER_DAY; h++)
        {
            s_hours.step_hourly[h] = (uint16_t)clamp_int(sums[h], 0, 65535);
        }
    }

    s_settled_hours = step_hours_settled(cur_hour, local.tm_min);
    s_hours.step_hours = cur_hour + 1;

    // what is left of today once the settled hours are taken off. the two counts come from
    // different places in the watch, so a step or two of disagreement lands on this bar
    int behind = 0;
    for (int h = 0; h < cur_hour && h < HOURS_PER_DAY; h++)
    {
        behind += s_hours.step_hourly[h];
    }
    s_hours.step_hourly[cur_hour] = (uint16_t)clamp_int(s_steps - behind, 0, 65535);
#endif
}

/**
 * @brief The first read of the hourly buckets, once the face is up.
 *
 * Launching is the one time the buckets have a whole day to catch up on, which is several blocking
 * scans even batched. Doing that inside init leaves the old screen frozen until it finishes.
 *
 * @param data The timer context (unused).
 */
static void steps_first_read(void *data)
{
    // a store started again since this was queued is seeded, so it keeps its fixture, or live, so
    // its own read is queued behind this one and one read is enough
    if (!s_pending)
    {
        return;
    }

    // cleared first so nothing below can leave the reader switched off for good
    s_pending = false;

    read_step_hourly();
    health_store_redraw();
}

/**
 * @brief Empties the buckets, then takes the seed, or queues the first read for a live store.
 *
 * @param cfg The store's rules.
 * @param seed The store's seed, or NULL.
 */
static void step_history_start(const HealthConfig *cfg, const HealthSeed *seed)
{
    memset(&s_hours, 0, sizeof(s_hours));
    // clearing the buckets without clearing what the reader believes about them would leave every
    // hour before s_settled_hours reading zero for the rest of the day
    s_cached_day = 0;
    s_settled_hours = 0;
    s_steps = -1;
    // a store coming up seeded never arms the timer, so it must not inherit a gate from a live run
    s_pending = false;
    s_no_timer = false;

    if (seed)
    {
        s_hours.step_hours = seed->step_hours;
        if (seed->step_hourly)
        {
            memcpy(s_hours.step_hourly, seed->step_hourly, sizeof(s_hours.step_hourly));
        }
    }

    if (!cfg->live)
    {
        return;
    }

    // hold the first bucket read until the face is on screen. the timer fires from the event loop,
    // which the first paint runs ahead of. with no timer to be had, the gate stays up through the
    // store's own read at launch and drops after it, so the refresh after that does it, which is
    // also after the paint
    s_pending = true;
    s_no_timer = !app_timer_register(0, steps_first_read, NULL);
}

/**
 * @brief Brings the buckets up to date after the store read the day's step count.
 *
 * The store only reads the count once a minute at most, so this runs at that pace too. The first
 * read of all is owed to the launch timer, which runs once the face is on screen.
 *
 * @param steps Today's step count, or -1 for none.
 */
static void step_history_steps(int steps)
{
    s_steps = steps;
    if (s_pending)
    {
        if (s_no_timer)
        {
            s_pending = false;
            s_no_timer = false;
        }
        return;
    }

    read_step_hourly();
}

/**
 * @brief The buckets summed, so the store can tell when they moved.
 *
 * @return The sum.
 */
static uint32_t step_history_sum(void)
{
    return store_sum(&s_hours, sizeof(s_hours));
}

const HealthPart health_part_step_history = {
    .start = step_history_start,
    .steps = step_history_steps,
    .sum = step_history_sum,
};

const uint16_t *health_store_step_hourly(void) { return s_hours.step_hourly; }
int health_store_step_hours(void)              { return s_hours.step_hours; }
