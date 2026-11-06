/**
 * @file health_hr_day.c
 * @brief The health store's heart rate day: today's heart rate by the hour, filled from the
 * watch's minute log at launch and from each reading after. A face turns it on with HEALTH_HR_DAY,
 * and one that never names it carries none of this.
 *
 * @ingroup lib_stores
 */
#include "io/stores/health_store.h"
#include "io/stores/health_store_parts.h"
#include "io/stores/store_sum.h"

#include <time.h>

static HrDay s_day; ///< Today's heart rate by the hour

/**
 * @name Filling the day
 *
 * The minute log fills the day up to the minute the store started, once the face has painted. Each
 * reading after that is added as it arrives, so the two never count the same minute.
 * @{
 */
static time_t s_day_start; ///< The midnight the kept hours belong to
static time_t s_from_min;  ///< The minute the store started. The log fills before it, live readings from it on
static time_t s_last_min;  ///< The minute of the last live reading added, so a burst adds one a minute
static bool s_pending;     ///< True between a live start and its read of the log
/** @} */

/**
 * @brief Empties the hours once midnight has passed since they were filled.
 */
static void hr_day_roll(void)
{
    time_t today = time_start_of_today();
    if (today != s_day_start)
    {
        hr_day_clear(&s_day);
        s_day_start = today;
    }
}

#if defined(PBL_HEALTH)
/** @brief Adds a record's heart rate to its hour, for the read of the log. */
static void add_record_hr(int hour, const HealthMinuteData *record, void *context)
{
    hr_day_add((HrDay *)context, hour, record->heart_rate_bpm);
}
#endif

/**
 * @brief Fills today's hours from the watch's minute log, from midnight up to the minute the store
 * started.
 *
 * The log holds a reading for each minute the sensor took one, the same as it holds the steps, so
 * the hours before launch read the same as they would have live. It is a blocking scan of the log,
 * so it runs once, after the face has painted.
 *
 * @return False when there was no room for the records, so the read is still owed.
 */
static bool read_hr_day(void)
{
#if defined(PBL_HEALTH)
    hr_day_roll();

    time_t until = s_from_min * SECONDS_PER_MINUTE;
    if (until <= s_day_start)
    {
        return true;
    }

    // today's hours come from the start minute itself, so a midnight passing during the read
    // cannot move them. the hour the store started in is the last one read, up to that minute
    struct tm local = *localtime(&until);  // a copy, since mktime in health_hour_start reuses the same buffer
    return health_walk_minute_log(&local, 0, local.tm_hour + 1, until, add_record_hr, &s_day);
#else
    return true;
#endif
}

/**
 * @brief The first read of today's heart rate from the log, once the face is up.
 *
 * @param data The timer context (unused).
 */
static void hr_day_first_read(void *data)
{
    // a store started again since this was queued is seeded, so it keeps its fixture, or live, so
    // its own read is queued behind this one and a second would count every hour twice
    if (!s_pending)
    {
        return;
    }

    // with no room for the records the read stays owed, and the cadence asks again
    uint32_t before = store_sum(&s_day, sizeof(s_day));
    s_pending = !read_hr_day();
    if (store_sum(&s_day, sizeof(s_day)) != before)
    {
        health_store_redraw();
    }
}

/**
 * @brief Empties the day, then takes the seed, or queues the read of the log for a live store.
 *
 * @param cfg The store's rules.
 * @param seed The store's seed, or NULL.
 */
static void hr_day_start(const HealthConfig *cfg, const HealthSeed *seed)
{
    hr_day_clear(&s_day);
    s_day_start = time_start_of_today();
    s_from_min = time(NULL) / SECONDS_PER_MINUTE;
    s_last_min = 0;
    s_pending = false;

    if (seed && seed->hr_day)
    {
        s_day = *seed->hr_day;
    }

    if (!cfg->live)
    {
        return;
    }

    // the log read waits for the paint. with no timer it runs here instead, since nothing else
    // would ever fill the hours before launch. a seeded day stands in for the log, so it is not
    // read on top
    s_pending = !(seed && seed->hr_day);
    if (s_pending && !app_timer_register(0, hr_day_first_read, NULL))
    {
        s_pending = !read_hr_day();
    }
}

/**
 * @brief Adds a new reading to its hour, at most one a minute.
 *
 * Only a heart rate event brings a new reading. A peek on the cadence can hand back the same one for
 * up to fifteen minutes, which would count it many times. While HRV holds the sensor on, a reading
 * lands about once a second, and keeping one a minute weighs those minutes the same as the rest of
 * the day, where the watch logs one now and then.
 *
 * @param hr The reading in beats per minute, or -1 for none.
 * @param from_event True when a heart rate event brought it.
 */
static void hr_day_heart_rate(int hr, bool from_event)
{
    time_t now = time(NULL);
    time_t now_min = now / SECONDS_PER_MINUTE;
    if (!from_event || hr <= 0 || now_min == s_last_min)
    {
        return;
    }

    // a clock the phone set back would leave every reading short of the start minute until the
    // clock caught up, so the start comes back to now and the day keeps filling
    if (now_min < s_from_min)
    {
        s_from_min = now_min;
    }

    s_last_min = now_min;
    hr_day_roll();
    hr_day_add(&s_day, localtime(&now)->tm_hour, hr);
}

/**
 * @brief Empties the day at midnight even with no reading to bring it, and tries again on a launch
 * read that found no room.
 */
static void hr_day_poll(void)
{
    hr_day_roll();
    if (s_pending)
    {
        s_pending = !read_hr_day();
    }
}

/**
 * @brief The day summed, so the store can tell when it moved.
 *
 * @return The sum.
 */
static uint32_t hr_day_sum(void)
{
    return store_sum(&s_day, sizeof(s_day));
}

const HealthPart health_part_hr_day = {
    .start = hr_day_start,
    .heart_rate = hr_day_heart_rate,
    .poll = hr_day_poll,
    .sum = hr_day_sum,
};

const HrDay *health_store_hr_day(void) { return &s_day; }
