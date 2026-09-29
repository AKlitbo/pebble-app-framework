/**
 * @file health_store.c
 * @brief The active health store: reads the watch's health service and holds the numbers.
 * It owns the service accessors too so it is the single point of truth for health.
 *
 * @ingroup lib_stores
 */
#include "io/stores/health_store.h"
#include "math/scale.h"
#include "io/stores/store_cadence.h"
#include "io/stores/store_persist.h"

#include "health/minute_window.h"
#include "health/step_hours.h"

#include <stdlib.h>
#include <string.h>
#include <time.h>

/**
 * @brief How many minutes of heart rate the graph shows.
 *
 * It has nothing to do with an hour having 60 minutes, even though it lands on the same number.
 */
#define HR_HISTORY_MINUTES 60
// HOURS_PER_DAY (24) and MINUTES_PER_HOUR (60) come from the Pebble SDK. the bucket maths lives in
// core so it can be tested on the host, so the two have to agree on how long a day is
_Static_assert(HOURS_PER_DAY == STEP_HOURS_PER_DAY, "core and the SDK must agree on the day");

/**
 * @var s_state
 * @brief Every health number the store holds.
 */
static struct
{
    int      hr;                             ///< The latest heart rate reading
    uint8_t  hr_history[HR_HISTORY_MINUTES]; ///< The rolling heart rate window, one reading a minute
    time_t   hr_last_min;                    ///< Wall-clock minute of the last history write, so the window can slide
    int      steps;                          ///< Step count
    int      calories;                       ///< Calorie count
    int      sleep_min;                      ///< Minutes slept
    int      active_min;                     ///< Active minutes
    int      distance_m;                     ///< Distance walked, in metres
    uint16_t step_hourly[HOURS_PER_DAY];     ///< Steps in each hour of today, midnight first
    int      step_hours;                     ///< How many of those hours are real (0 to 24)
} s_state;

/**
 * @brief The only part worth keeping across a relaunch.
 *
 * Every other number is read back off the health service before the first paint, but the watch
 * logs heart rate too rarely to rebuild the graph, so the rolling window is saved instead.
 */
typedef struct
{
    uint8_t tag;                            ///< STORE_TAG_HEALTH, so a restore can tell this blob from another shape
    uint8_t hr_history[HR_HISTORY_MINUTES]; ///< The saved rolling heart rate window
    time_t  hr_last_min;                    ///< Wall-clock minute the window last slid to
} HealthSaved;
_Static_assert(sizeof(HealthSaved) <= PERSIST_DATA_MAX_LENGTH, "health blob must fit one persist key");

static void (*s_cb)(void); ///< Called whenever a reading changes, so the face can redraw
static bool s_live;        ///< True once subscribed to the live health service, so the minute poll does nothing in seed mode

/**
 * @name History series
 *
 * The two history series cost real work, so only a face that graphs one asks for it. The current
 * readings are cheap and every face shows one, so those are always tracked.
 * @{
 */
static bool s_hr_history;   ///< Whether the face graphs heart rate history
static bool s_step_history; ///< Whether the face graphs steps by the hour
/** @} */

/**
 * @name Costly readings
 *
 * These three cost a flash read every time they are asked for, so only a face that shows one pays.
 * @{
 */
static bool s_sleep;    ///< Whether the face shows sleep
static bool s_active;   ///< Whether the face shows active minutes
static bool s_calories; ///< Whether the face shows calories
static bool s_distance; ///< Whether the face shows distance
/** @} */

/**
 * @name Settled step hours
 *
 * Finished hours can never gain another step, so they are read once and kept. These live out here
 * because init clears the buckets, and stale beliefs about them would strand the cleared ones.
 * @{
 */
static time_t s_cached_day; ///< The day the kept hours belong to
static int s_settled_hours; ///< How many finished hours are already read and kept
/** @} */

static bool s_steps_pending;   ///< True between init and the first bucket read, which is held back until the face has painted
static uint32_t s_persist_key; ///< The persist slot the face handed us for the saved history

// --- health service reads (no-op stubs without PBL_HEALTH) ---

#if defined(PBL_HEALTH)
/**
 * @brief Whether the watch actually has a reading for a metric over a time span.
 *
 * @param metric The health metric to check.
 * @param start Start of the span to check.
 * @param end End of the span to check.
 * @return True when the watch reports the metric available over that span.
 */
static bool metric_available(HealthMetric metric, time_t start, time_t end)
{
    HealthServiceAccessibilityMask access = health_service_metric_accessible(metric, start, end);
    return access & HealthServiceAccessibilityMaskAvailable;
}
#endif

/**
 * @brief Peek the current heart rate.
 *
 * @return The reading in beats per minute, or 0 when there is none.
 */
static int read_hr(void)
{
#if defined(PBL_HEALTH)
    time_t now = time(NULL);
    if (metric_available(HealthMetricHeartRateBPM, now, now))
    {
        return (int)health_service_peek_current_value(HealthMetricHeartRateBPM);
    }
#endif
    return 0;
}

/**
 * @brief Sum a metric over today, or return the fallback when it is unavailable.
 *
 * Distance passes 0 as its fallback, and a panel tells no data from a real zero by the steps
 * count. The rest, steps included, pass -1 so a panel can tell "no data yet" apart from a real
 * zero and show a placeholder.
 *
 * @param metric The health metric to sum.
 * @param fallback Returned when the metric is unavailable.
 * @return The sum for today, or @p fallback.
 */
static int read_sum_today(HealthMetric metric, int fallback)
{
#if defined(PBL_HEALTH)
    time_t now = time(NULL);
    if (metric_available(metric, time_start_of_today(), now))
    {
        return (int)health_service_sum_today(metric);
    }
#else
    (void)metric;
#endif
    return fallback;
}

#if defined(PBL_HEALTH)
/**
 * @brief How many hours the catch-up asks for at a time.
 *
 * A read costs the same whatever window it asks for, so a wider one gets most of a day's catch-up
 * done in four goes instead of twenty-four.
 */
#define STEP_CATCHUP_HOURS 6

/**
 * @brief Allocate scratch room for a minute-history read, off the heap for the length of the
 * read rather than sitting in the app's fixed footprint.
 *
 * What a Pebble app runs out of first is its image, and the heap does not count towards that.
 *
 * @param records How many minute records to make room for.
 * @return The scratch buffer, or NULL if the allocation failed.
 */
static HealthMinuteData *scratch_take(int records)
{
    return malloc(sizeof(HealthMinuteData) * records);
}
#endif

/**
 * @brief Fill the empty minutes of the heart rate window from the watch's own minute log.
 *
 * Used at launch, on an empty window or on a restored one slid forward over the time the face was
 * away, so the minutes spent in a watchapp show what the watch logged. A minute that already holds
 * a reading keeps it, since the live readings can be more frequent than the log. Each reading lands
 * in the slot for its own minute.
 *
 * @param now_min The minute the window's last slot holds, the same one the live readings write.
 */
static void read_hr_history(time_t now_min)
{
#if defined(PBL_HEALTH)
    uint8_t *history = s_state.hr_history;

    HealthMinuteData *scratch = scratch_take(HR_HISTORY_MINUTES);
    if (!scratch)
    {
        return; // no room for the records, so leave the window as it is and let live readings fill it
    }

    // ask for exactly the window's minutes. a start partway through a minute counts from that
    // minute's start, so asking an hour back from now reached one minute past the window
    time_t start = (now_min - (HR_HISTORY_MINUTES - 1)) * SECONDS_PER_MINUTE;
    time_t end = (now_min + 1) * SECONDS_PER_MINUTE;

    uint32_t records_read = health_service_get_minute_history(scratch, HR_HISTORY_MINUTES, &start, &end);

    // the service is handed the room it has and documents that it returns that many or fewer, but
    // that is its promise rather than something checked here. more than asked for would put offset
    // below zero and the fill would run backwards out of the front of the window, so take its word
    // no further than the buffer goes
    if (records_read > HR_HISTORY_MINUTES)
    {
        records_read = HR_HISTORY_MINUTES;
    }

    // start comes back moved on to the first record the watch held, and the log runs behind the
    // clock, so a record's slot comes from its own minute rather than from how many came back.
    // with no records the loop never runs, so start is never read when it means nothing
    int slot = minute_window_first_slot(start / SECONDS_PER_MINUTE, now_min, HR_HISTORY_MINUTES);
    for (uint32_t i = 0; i < records_read; i++, slot++)
    {
        if (slot >= HR_HISTORY_MINUTES)
        {
            break; // the records run in order, so nothing after this fits either
        }
        if (slot >= 0 && !scratch[i].is_invalid && history[slot] == 0)
        {
            history[slot] = scratch[i].heart_rate_bpm;
        }
    }

    free(scratch);
#endif
}

/**
 * @brief When a local hour of today starts.
 *
 * Counted on the wall clock rather than as hours since midnight, because on the days the clocks
 * change the two part ways by an hour. An hour past the end of the day rolls onto the next
 * midnight, and the hour a spring change skips starts where the one after it does.
 *
 * @param today Today's local time, broken apart.
 * @param hour The hour of the day, 0 to 24.
 * @return The epoch the hour starts at.
 */
// kept out of line, since inlining the struct copy at every call site costs about 120 bytes of binary
__attribute__((noinline)) static time_t hour_start(const struct tm *today, int hour)
{
    struct tm at = *today;
    at.tm_hour = hour;
    at.tm_min = 0;
    at.tm_sec = 0;
    at.tm_isdst = -1;  // let mktime work out whether the hour falls in summer time
    return mktime(&at);
}

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
        memset(s_state.step_hourly, 0, sizeof(s_state.step_hourly));
        s_state.step_hours = 0;
        s_cached_day = day_start;
        s_settled_hours = 0;
    }

    if (!metric_available(HealthMetricStepCount, day_start, now))
    {
        return;
    }

    // any whole hour behind the current one that has not been read yet. normally none, one on the
    // turn an hour rolls over, and the run since midnight on the first turn after a launch
    if (s_settled_hours < cur_hour)
    {
        // room for one hour more than a batch spans on the wall clock, since the batch holding the
        // hour the clocks go back through runs an hour longer in real time
        const uint32_t room = (STEP_CATCHUP_HOURS + 1) * MINUTES_PER_HOUR;
        HealthMinuteData *scratch = scratch_take(room);
        if (!scratch)
        {
            return; // no room, so leave the buckets as they are and try again next turn
        }

        int sums[HOURS_PER_DAY] = {0};

        for (int h = s_settled_hours; h < cur_hour; h += STEP_CATCHUP_HOURS)
        {
            int span = cur_hour - h;
            if (span > STEP_CATCHUP_HOURS)
            {
                span = STEP_CATCHUP_HOURS;
            }

            // each hour is the wall clock's own, so on a clock change day the buckets still line up
            // with the hour the chart labels and the one the current bar is worked out from
            time_t want_end = hour_start(&local, h + span);
            time_t q_start = hour_start(&local, h);
            time_t q_end = want_end;

            // the batch's real length rather than its wall hours. asking for only its wall hours
            // left the last hour of a clocks-back batch empty and settled, and the current hour's bar
            // took its steps
            uint32_t asked = (uint32_t)((want_end - q_start) / SECONDS_PER_MINUTE);
            if (asked > room)
            {
                asked = room;
            }
            uint32_t got = health_service_get_minute_history(scratch, asked, &q_start, &q_end);

            // same guard as the backfill: trust the promise no further than the buffer goes
            if (got > asked)
            {
                got = asked;
            }

            // q_start comes back moved on to the first record the watch held, so a record's place
            // in the array says nothing about its hour. only its own time does
            int bucket = h;
            time_t bucket_end = hour_start(&local, h + 1);
            for (uint32_t i = 0; i < got; i++)
            {
                time_t record_at = q_start + (time_t)i * SECONDS_PER_MINUTE;

                // only the count reaches the watch, never the window's end, so a read that opened
                // on a gap runs past what was asked for and the next batch would count it twice
                if (record_at >= want_end)
                {
                    break; // the records run in order, so nothing after this is wanted either
                }

                // the records run in order, so the bucket only ever moves forward
                while (record_at >= bucket_end && bucket < h + span - 1)
                {
                    bucket++;
                    bucket_end = hour_start(&local, bucket + 1);
                }

                if (!scratch[i].is_invalid)
                {
                    sums[bucket] += scratch[i].steps;
                }
            }
        }

        for (int h = s_settled_hours; h < cur_hour && h < HOURS_PER_DAY; h++)
        {
            s_state.step_hourly[h] = (uint16_t)clamp_int(sums[h], 0, 65535);
        }

        free(scratch);
    }

    s_settled_hours = step_hours_settled(cur_hour, local.tm_min);
    s_state.step_hours = cur_hour + 1;

    // what is left of today once the settled hours are taken off. the two counts come from
    // different places in the watch, so a step or two of disagreement lands on this bar
    int behind = 0;
    for (int h = 0; h < cur_hour && h < HOURS_PER_DAY; h++)
    {
        behind += s_state.step_hourly[h];
    }
    s_state.step_hourly[cur_hour] = (uint16_t)clamp_int(s_state.steps - behind, 0, 65535);
#endif
}

// --- state + poller ---

/**
 * @brief Stash the heart rate graph so a relaunch can restore it.
 *
 * Only a live face writes, so seed mode never touches storage. A burst can land a reading a
 * second and a flash write blocks, so the saves are held to one a minute, which is all the graph
 * gains anyway.
 *
 * One a minute is on purpose, not a rate to trim. The save runs inside the minute tick, so the
 * CPU is already awake for it and no extra wake is spent. The face is closed whenever the wearer
 * opens a watchapp, even for a moment, and a graph saved less often comes back missing its last
 * minutes every time.
 */
static void persist_save(void)
{
    static time_t s_saved_min = 0;

    if (!s_live)
    {
        return;
    }

    time_t now_min = time(NULL) / SECONDS_PER_MINUTE;
    if (now_min == s_saved_min)
    {
        return;
    }
    s_saved_min = now_min;

    // zeroed so the padding between fields goes to flash as something settled
    HealthSaved saved;
    memset(&saved, 0, sizeof(saved));
    memcpy(saved.hr_history, s_state.hr_history, sizeof(saved.hr_history));
    saved.hr_last_min = s_state.hr_last_min;

    store_save(s_persist_key, &saved, sizeof(saved), STORE_TAG_HEALTH);
}

/**
 * @brief Slide the rolling heart rate window forward to now_min, zeroing any minutes that
 * passed with no reading. The last slot always holds the current minute, so the chart reads
 * oldest on the left and newest on the right.
 *
 * @param now_min The current wall-clock minute (time / SECONDS_PER_MINUTE).
 */
static void hr_history_advance(time_t now_min)
{
    time_t elapsed = now_min - s_state.hr_last_min;
    if (elapsed == 0)
    {
        return;  // same minute, so the reading goes in the slot it already has
    }

    // the clock went back, so the window's minutes now sit in the future. waiting for the clock to
    // catch up would pin every new reading to the last slot for as long as it went back, so the
    // window starts over from now
    if (elapsed < 0)
    {
        memset(s_state.hr_history, 0, sizeof(s_state.hr_history));
        s_state.hr_last_min = now_min;
        return;
    }

    if (elapsed >= HR_HISTORY_MINUTES)
    {
        memset(s_state.hr_history, 0, sizeof(s_state.hr_history));
    }
    else
    {
        int keep = HR_HISTORY_MINUTES - (int)elapsed;
        memmove(s_state.hr_history, s_state.hr_history + elapsed, keep);
        memset(s_state.hr_history + keep, 0, (int)elapsed);
    }

    s_state.hr_last_min = now_min;
}

/**
 * @brief Refresh the heart rate, and append the live reading to the rolling window when the face
 * asked for one. A heart rate is never really 0, so 0 is kept as "no reading yet".
 *
 * The chart reads from this window rather than the minute history: the watch only logs a
 * per-minute heart_rate_bpm now and then in the background, so the minute history is mostly
 * empty, while peeking the live value on each event fills the window with real readings.
 */
static void refresh_hr(void)
{
    int hr = read_hr();
    s_state.hr = hr > 0 ? hr : -1;

    // a face showing a plain heart rate number has no use for the window behind it
    if (!s_hr_history)
    {
        return;
    }

    hr_history_advance(time(NULL) / SECONDS_PER_MINUTE);
    if (hr > 0)
    {
        s_state.hr_history[HR_HISTORY_MINUTES - 1] = (uint8_t)(hr > 255 ? 255 : hr);
        // save on a real reading only, not every minute slide. the restore re-ages the window
        // so the empty minutes in between do not need writing. a burst can still land a reading
        // a second, so persist_save holds the actual writing down to one a minute
        persist_save();
    }
}

/**
 * @brief Refresh the daily activity scalars (steps, distance, calories, sleep, active).
 *
 * These are whole-day sums that move once a minute at most, but movement events arrive every few
 * seconds while walking, and every metric bar steps costs a blocking flash read. So the reads are
 * held to one round a minute, and the four a face has to ask for are skipped unless it has.
 *
 * @param force Read now regardless of the minute gate, for the seed read and for the significant
 * update that calls every number stale.
 */
static void refresh_activity(bool force)
{
    static time_t s_read_min = 0;
    time_t now_min = time(NULL) / SECONDS_PER_MINUTE;
    if (!force && now_min == s_read_min)
    {
        return;
    }
    s_read_min = now_min;

    // sleep and active time come in seconds. keep the -1 that means no data rather than
    // dividing it down to 0
    if (s_sleep)
    {
        int sleep_sec = read_sum_today(HealthMetricSleepSeconds, -1);
        s_state.sleep_min = sleep_sec < 0 ? -1 : sleep_sec / 60;
    }

    if (s_active)
    {
        int active_sec = read_sum_today(HealthMetricActiveSeconds, -1);
        s_state.active_min = active_sec < 0 ? -1 : active_sec / 60;
    }

    if (s_calories)
    {
        s_state.calories = read_sum_today(HealthMetricActiveKCalories, -1);
    }

    // the watch keeps the step count to hand so that one is cheap. the distance is not. no reading
    // stays -1 like the other counts, so a watch with Health off shows a placeholder rather than 0
    s_state.steps = read_sum_today(HealthMetricStepCount, -1);
    if (s_distance)
    {
        s_state.distance_m = read_sum_today(HealthMetricWalkedDistanceMeters, 0);
    }

    // the hourly buckets are the dearest thing here, so only a face that graphs them pays. the
    // first read of all is owed to the timer below, which runs once the face is on screen
    if (s_step_history && !s_steps_pending)
    {
        read_step_hourly();
    }
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
    // cleared first so nothing below can leave the reader switched off for good
    s_steps_pending = false;

    read_step_hourly();
    if (s_cb) s_cb();
}

/**
 * @brief Asks the face for a repaint only when a reading really moved.
 *
 * The minute tick and most movement events bring back the same numbers, and a repaint for nothing
 * still reruns every health panel. A face graphing the heart rate window still gets one a minute,
 * since the window slides. It compares sums rather than a copy of every reading, which keeps the
 * readings off the stack.
 *
 * @param before The sum of the readings before the refresh.
 */
static void notify_if_moved(uint32_t before)
{
    if (s_cb && store_sum(&s_state, sizeof(s_state)) != before)
    {
        s_cb();
    }
}

/**
 * @brief Health event handler: refresh only the metrics the event touched, then notify.
 *
 * A movement event does not change the heart rate history and an hr event does not change the
 * step count, so each reads only its own group. The minute gate inside refresh_activity does the
 * rest, turning most movement events into nothing at all.
 *
 * @param event The health event type.
 * @param context Context (unused).
 */
static void on_health_event(HealthEventType event, void *context)
{
    // the state is summed before and after even when the minute gate reads nothing. that is two
    // passes over a couple of hundred bytes on an event that comes about once a minute, which costs
    // less than the bytes a gate that reports back would add
    uint32_t before = store_sum(&s_state, sizeof(s_state));

    switch (event)
    {
        case HealthEventHeartRateUpdate:
            refresh_hr();
            break;
        case HealthEventMovementUpdate:
            refresh_activity(false);
            break;
        case HealthEventSignificantUpdate:
            refresh_hr();
            refresh_activity(true);
            break;
        default:
            return;
    }

    notify_if_moved(before);
}

/**
 * @brief The store's turn on the face's cadence, registered at init so no face wires it by hand.
 *
 * The events alone are not enough. Heart rate events are sparse, so the graph would be dots not a
 * line, and movement events stop the moment the wearer goes still, stranding the step count. The
 * gates inside the two refreshes make this free on a turn an event already covered.
 */
static void cadence_poll(void)
{
    if (!s_live)
    {
        return;
    }

    uint32_t before = store_sum(&s_state, sizeof(s_state));

    refresh_hr();
    refresh_activity(false);

    notify_if_moved(before);
}

// --- public API ---

void health_store_subscribe(void (*cb)(void))
{
    s_cb = cb;
}

void health_store_init(HealthConfig cfg, const HealthSeed *seed)
{
    s_live = false;
    s_hr_history = cfg.hr_history;
    s_step_history = cfg.step_history;
    s_sleep = cfg.sleep;
    s_active = cfg.active;
    s_calories = cfg.calories;
    s_distance = cfg.distance;
    s_persist_key = cfg.persist_key;

    // registering here rather than leaving it to the face means every face gets it
    store_cadence_register(cadence_poll);

    // -1 means no reading yet so a panel shows a placeholder until data turns up
    s_state.hr = -1;
    s_state.steps = -1;
    s_state.calories = -1;
    s_state.sleep_min = -1;
    s_state.active_min = -1;
    s_state.distance_m = 0;
    s_state.hr_last_min = 0; // 0 means nothing restored yet, so the live path knows to backfill
    memset(s_state.hr_history, 0, sizeof(s_state.hr_history));
    s_state.step_hours = 0;
    memset(s_state.step_hourly, 0, sizeof(s_state.step_hourly));
    // clearing the buckets without clearing what the reader believes about them would leave every
    // hour before s_settled_hours reading zero for the rest of the day
    s_cached_day = 0;
    s_settled_hours = 0;
    // a store coming up seeded never arms the timer, so it must not inherit a gate from a live run
    s_steps_pending = false;

    if (seed)
    {
        s_state.hr = seed->hr > 0 ? seed->hr : -1;
        s_state.steps = seed->steps;
        s_state.calories = seed->calories;
        s_state.sleep_min = seed->sleep_min;
        s_state.active_min = seed->active_min;
        s_state.distance_m = seed->distance_m;
        if (seed->hr_history)
        {
            memcpy(s_state.hr_history, seed->hr_history, sizeof(s_state.hr_history));
        }
        s_state.step_hours = seed->step_hours;
        if (seed->step_hourly)
        {
            memcpy(s_state.step_hourly, seed->step_hourly, sizeof(s_state.step_hourly));
        }
    }
    else if (cfg.live && s_hr_history)
    {
        // restore the last graph so a relaunch (navigating away and back) shows it right away.
        // the tag store_restore checks tells this blob apart from an older shape, so a struct
        // change drops the old one instead of reading it as the wrong thing
        HealthSaved saved;
        if (store_restore(s_persist_key, &saved, sizeof(saved), STORE_TAG_HEALTH))
        {
            memcpy(s_state.hr_history, saved.hr_history, sizeof(s_state.hr_history));
            s_state.hr_last_min = saved.hr_last_min;
        }
    }

    if (cfg.live)
    {
        s_live = true;

        // hold the first bucket read until the face is on screen. subscribing below queues a
        // significant update that lands before the timer, so the gate goes up ahead of both
        s_steps_pending = s_step_history;

#if defined(PBL_HEALTH)
        health_service_events_subscribe(on_health_event, NULL);
#endif
        // only a face that graphs the window pays for one. the backfill below is a blocking read
        // of the watch's minute log, so it is worth skipping outright for a face that does not
        if (s_hr_history)
        {
            time_t now_min = time(NULL) / SECONDS_PER_MINUTE;
            if (s_state.hr_last_min != 0)
            {
                // restored an earlier graph, so slide it forward over the time we were away (it
                // clears itself if that was over an hour), then fill that gap from the log
                hr_history_advance(now_min);
            }
            else
            {
                // first launch with nothing saved, so the whole window comes from the log
                memset(s_state.hr_history, 0, HR_HISTORY_MINUTES);
                s_state.hr_last_min = now_min;
            }
            read_hr_history(now_min);
        }

        // seed the first reading before any event lands. these are cheap, a peek and a handful of
        // keyed reads, and the panels would show placeholders on every launch without them
        refresh_hr();
        refresh_activity(true);

        // the timer fires from the event loop, which the first paint runs ahead of. with no timer
        // to be had, drop the gate and let the next refresh do it, which is also after the paint
        if (s_steps_pending && !app_timer_register(0, steps_first_read, NULL))
        {
            s_steps_pending = false;
        }
    }
}

uint8_t *health_store_hr_history(void) { return s_state.hr_history; }

const uint16_t *health_store_step_hourly(void) { return s_state.step_hourly; }
int health_store_step_hours(void)              { return s_state.step_hours; }

int health_store_hr(void)         { return s_state.hr; }
int health_store_steps(void)      { return s_state.steps; }
int health_store_calories(void)   { return s_state.calories; }
int health_store_sleep_min(void)  { return s_state.sleep_min; }
int health_store_active_min(void) { return s_state.active_min; }
int health_store_distance_m(void) { return s_state.distance_m; }
