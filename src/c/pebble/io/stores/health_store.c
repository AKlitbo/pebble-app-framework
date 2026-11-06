/**
 * @file health_store.c
 * @brief The active health store: reads the watch's health service and holds the numbers.
 * It owns the service accessors too so it is the single point of truth for health.
 *
 * @ingroup lib_stores
 */
#include "io/stores/health_store.h"
#include "io/stores/store_cadence.h"
#include "io/stores/store_sum.h"
#include "io/stores/health_hrv.h"
#include "io/stores/health_store_parts.h"

#include <stdlib.h>
#include <string.h>
#include <time.h>

// heart rate variability is built in only for a face that sets HEALTH_HRV in its appinfo's defines.
// with it off nothing here calls into health_hrv.c, so the linker leaves that out of the face
#if defined(HEALTH_HRV) && HEALTH_HRV
#define HRV_BUILT 1
#else
#define HRV_BUILT 0
#endif

/**
 * @var s_state
 * @brief Every health number the store holds.
 */
static struct
{
    int hr;         ///< The latest heart rate reading
    int steps;      ///< Step count
    int calories;   ///< Calorie count
    int sleep_min;  ///< Minutes slept
    int active_min; ///< Active minutes
    int distance_m; ///< Distance walked, in metres
} s_state;

static void (*s_cb)(void); ///< Called whenever a reading changes, so the face can redraw
static bool s_live;        ///< True once subscribed to the live health service, so the minute poll does nothing in seed mode

/**
 * @brief The parts the face named, the heart rate graph, the hourly steps, and the heart rate day,
 * with NULL for one it left out.
 */
#define HEALTH_PART_COUNT 3
static const HealthPart *s_parts[HEALTH_PART_COUNT];

/**
 * @name Costly readings
 *
 * These four cost a flash read every time they are asked for, so only a face that shows one pays.
 * @{
 */
static bool s_sleep;    ///< Whether the face shows sleep
static bool s_active;   ///< Whether the face shows active minutes
static bool s_calories; ///< Whether the face shows calories
static bool s_distance; ///< Whether the face shows distance
/** @} */

// --- health service reads (stubs that do nothing without PBL_HEALTH) ---

#if defined(PBL_HEALTH)
// documented in health_store_parts.h, with the other helpers the parts share
bool health_metric_available(HealthMetric metric, time_t start, time_t end)
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
    if (health_metric_available(HealthMetricHeartRateBPM, now, now))
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
    if (health_metric_available(metric, time_start_of_today(), now))
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
 * @brief How many hours a walk of the minute log asks for at a time.
 *
 * The records come into a buffer borrowed from the heap, so a batch this size keeps it a few KB.
 * A read costs the same whatever window it asks for, so this still takes a day in four reads.
 */
#define STEP_CATCHUP_HOURS 6

// documented in health_store_parts.h
HealthMinuteData *health_scratch_take(int records)
{
    return malloc(sizeof(HealthMinuteData) * records);
}
#endif

// documented in health_store_parts.h. kept out of line, since inlining the struct copy at every call site costs about 120 bytes of binary
__attribute__((noinline)) time_t health_hour_start(const struct tm *today, int hour)
{
    struct tm at = *today;
    at.tm_hour = hour;
    at.tm_min = 0;
    at.tm_sec = 0;
    at.tm_isdst = -1;  // let mktime work out whether the hour falls in summer time
    return mktime(&at);
}

#if defined(PBL_HEALTH)
// documented in health_store_parts.h
bool health_walk_minute_log(const struct tm *local, int first_hour, int end_hour, time_t until, MinuteRecordFn each,
                            void *context)
{
    // room for one hour more than a batch spans on the wall clock, since the batch holding the
    // hour the clocks go back through runs an hour longer in real time
    const uint32_t room = (STEP_CATCHUP_HOURS + 1) * MINUTES_PER_HOUR;
    HealthMinuteData *scratch = health_scratch_take(room);
    if (!scratch)
    {
        return false;
    }

    for (int h = first_hour; h < end_hour; h += STEP_CATCHUP_HOURS)
    {
        int span = end_hour - h;
        if (span > STEP_CATCHUP_HOURS)
        {
            span = STEP_CATCHUP_HOURS;
        }

        time_t want_end = health_hour_start(local, h + span);
        if (want_end > until)
        {
            want_end = until;
        }
        time_t q_start = health_hour_start(local, h);
        if (q_start >= want_end)
        {
            continue; // nothing to ask for in this batch
        }
        time_t q_end = want_end;

        // the batch's real length rather than its wall hours, since the batch holding the hour the
        // clocks go back through runs an hour longer than its wall hours and its last hour would
        // otherwise come back empty
        uint32_t asked = (uint32_t)((want_end - q_start) / SECONDS_PER_MINUTE);
        if (asked > room)
        {
            asked = room;
        }
        uint32_t got = health_service_get_minute_history(scratch, asked, &q_start, &q_end);

        // the service says it returns no more records than asked for, and this holds it to that, so
        // a bigger count never reads past the end of the buffer
        if (got > asked)
        {
            got = asked;
        }

        // q_start comes back moved on to the first record the watch held, so a record's place
        // in the array says nothing about its hour. only its own time does
        int bucket = h;
        time_t bucket_end = health_hour_start(local, h + 1);
        for (uint32_t i = 0; i < got; i++)
        {
            time_t record_at = q_start + (time_t)i * SECONDS_PER_MINUTE;

            // the watch caps the count from the start asked for, not the one it moved on to, so a
            // read that opened on a gap runs past what was asked for and the next batch would count
            // it twice
            if (record_at >= want_end)
            {
                break; // the records run in order, so nothing after this is wanted either
            }

            // the records run in order, so the bucket only ever moves forward
            while (record_at >= bucket_end && bucket < h + span - 1)
            {
                bucket++;
                bucket_end = health_hour_start(local, bucket + 1);
            }

            if (!scratch[i].is_invalid)
            {
                each(bucket, &scratch[i], context);
            }
        }
    }

    free(scratch);
    return true;
}

#endif

// --- state + poller ---

/**
 * @brief Refresh the heart rate and hand it to each part. A heart rate is never really 0, so -1 is
 * kept as "no reading yet".
 *
 * @param from_event True when a heart rate event brought a new reading, rather than a peek that
 * can hand back the same one for up to fifteen minutes.
 */
static void refresh_hr(bool from_event)
{
    int hr = read_hr();
    s_state.hr = hr > 0 ? hr : -1;

    for (int i = 0; i < HEALTH_PART_COUNT; i++)
    {
        if (s_parts[i] && s_parts[i]->heart_rate)
        {
            s_parts[i]->heart_rate(s_state.hr, from_event);
        }
    }
}

/**
 * @brief Refresh the day's activity totals, steps, distance, calories, sleep, and active time, and
 * hand the step count to each part.
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

    for (int i = 0; i < HEALTH_PART_COUNT; i++)
    {
        if (s_parts[i] && s_parts[i]->steps)
        {
            s_parts[i]->steps(s_state.steps);
        }
    }
}

/**
 * @brief The readings and every named part's state summed, so a change anywhere shows.
 *
 * @return The sum.
 */
static uint32_t state_sum(void)
{
    uint32_t sum = store_sum(&s_state, sizeof(s_state));
    for (int i = 0; i < HEALTH_PART_COUNT; i++)
    {
        if (s_parts[i] && s_parts[i]->sum)
        {
            sum += s_parts[i]->sum();
        }
    }
    return sum;
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
    if (s_cb && state_sum() != before)
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
#if HRV_BUILT
    // a beat gap comes about once a beat while HRV samples, and reads nothing else here
    if (event == HealthEventHRVUpdate)
    {
        health_hrv_on_gap();
        return;
    }
#endif

    // the switch only decides what to read. an event the store does not read leaves through the
    // default before the sum
    bool hr = false;
    bool activity = false;
    bool force = false;

    switch (event)
    {
        case HealthEventHeartRateUpdate:
            hr = true;
            break;
        case HealthEventMovementUpdate:
            activity = true;
            break;
        case HealthEventSignificantUpdate:
            hr = true;
            activity = true;
            force = true;
            break;
        default:
            return;
    }

    // the state is summed before and after even when the minute gate reads nothing. that is two
    // passes over a couple of hundred bytes on an event that comes about once a minute, which costs
    // less than the bytes a gate that reports back would add
    uint32_t before = state_sum();

    if (hr)
    {
        refresh_hr(event == HealthEventHeartRateUpdate);
    }
    if (activity)
    {
        refresh_activity(force);
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

#if HRV_BUILT
    health_hrv_poll();
#endif

    uint32_t before = state_sum();

    refresh_hr(false);
    refresh_activity(false);
    for (int i = 0; i < HEALTH_PART_COUNT; i++)
    {
        if (s_parts[i] && s_parts[i]->poll)
        {
            s_parts[i]->poll();
        }
    }

    notify_if_moved(before);
}

#if HRV_BUILT
/** @brief A new HRV reading redraws the face the same way any other reading does. */
static void hrv_changed(void)
{
    if (s_cb)
    {
        s_cb();
    }
}
#endif

// --- public API ---

void health_store_subscribe(void (*cb)(void))
{
    s_cb = cb;
}

void health_store_redraw(void)
{
    if (s_cb)
    {
        s_cb();
    }
}

void health_store_deinit(void)
{
#if HRV_BUILT
    health_hrv_stop();
#endif
}

void health_store_set_hrv_period(uint16_t period_sec)
{
#if HRV_BUILT
    health_hrv_set_period(period_sec);
#else
    (void)period_sec;
#endif
}

void health_store_set_hrv_rules(uint16_t still_mg, uint16_t walk_steps, HrvCount count, bool keep_all, bool live_redraw)
{
#if HRV_BUILT
    health_hrv_set_rules(still_mg, walk_steps, count, keep_all, live_redraw);
#else
    (void)still_mg;
    (void)walk_steps;
    (void)count;
    (void)keep_all;
    (void)live_redraw;
#endif
}

void health_store_init(HealthConfig cfg, const HealthSeed *seed)
{
#if defined(PBL_HEALTH)
    // a face starting the store again on its seed, such as for screenshots, would otherwise keep
    // getting events, and the next one would put a live reading over the seed
    if (s_live && !cfg.live)
    {
        health_service_events_unsubscribe();
    }
#endif
    s_live = false;

    // a part named before but left out now is emptied, so its getter answers empty rather than with
    // what the last start left in it, and a launch read it queued finds nothing owed
    const HealthPart *named[HEALTH_PART_COUNT] = { cfg.hr_history, cfg.step_history, cfg.hr_day };
    const HealthConfig left_out = { .live = false };
    for (int i = 0; i < HEALTH_PART_COUNT; i++)
    {
        if (s_parts[i] && s_parts[i] != named[i] && s_parts[i]->start)
        {
            s_parts[i]->start(&left_out, NULL);
        }
        s_parts[i] = named[i];
    }
    s_sleep = cfg.sleep;
    s_active = cfg.active;
    s_calories = cfg.calories;
    s_distance = cfg.distance;

    // registering here rather than leaving it to the face means every face gets it
    store_cadence_register(cadence_poll);

    // -1 means no reading yet so a panel shows a placeholder until data turns up
    s_state.hr = -1;
    s_state.steps = -1;
    s_state.calories = -1;
    s_state.sleep_min = -1;
    s_state.active_min = -1;
    s_state.distance_m = 0;

    if (seed)
    {
        s_state.hr = seed->hr > 0 ? seed->hr : -1;
        s_state.steps = seed->steps;
        s_state.calories = seed->calories;
        s_state.sleep_min = seed->sleep_min;
        s_state.active_min = seed->active_min;
        s_state.distance_m = seed->distance_m;
    }

    // each part empties itself and takes its seed, or restores and queues its launch read. a live
    // part's launch read waits on a timer, which the first paint runs ahead of. they start before
    // the subscribe, which queues a significant update, so each gate is up ahead of it
    for (int i = 0; i < HEALTH_PART_COUNT; i++)
    {
        if (s_parts[i] && s_parts[i]->start)
        {
            s_parts[i]->start(&cfg, seed);
        }
    }

    if (cfg.live)
    {
        s_live = true;
#if defined(PBL_HEALTH)
        health_service_events_subscribe(on_health_event, NULL);
#endif

        // seed the first reading before any event lands. these are cheap, a peek and a handful of
        // keyed reads, and the panels would show placeholders on every launch without them
        refresh_hr(false);
        refresh_activity(true);
    }

#if HRV_BUILT
    // HRV takes the same live and seed as the rest, so a seeded store never asks the watch for beat gaps
    HealthHrvConfig hrv = {
        .live = cfg.live,
        .period_sec = cfg.hrv_period_sec,
        .still_mg = cfg.hrv_still_mg,
        .walk_steps = cfg.hrv_walk_steps,
        .count = cfg.hrv_count,
        .keep_all = cfg.hrv_keep_all,
        .live_redraw = cfg.hrv_live_redraw,
        .persist_key = cfg.hrv_persist_key,
    };
    health_hrv_start(&hrv, seed ? seed->hrv_ms : 0, seed ? seed->hrv_log : NULL, hrv_changed);
#endif
}

int health_store_hr(void)         { return s_state.hr; }
int health_store_steps(void)      { return s_state.steps; }
int health_store_calories(void)   { return s_state.calories; }
int health_store_sleep_min(void)  { return s_state.sleep_min; }
int health_store_active_min(void) { return s_state.active_min; }
int health_store_distance_m(void) { return s_state.distance_m; }

int health_store_hrv_ms(void)
{
#if HRV_BUILT
    return health_hrv_ms();
#else
    return -1;
#endif
}

bool health_store_hrv_sampling(void)
{
#if HRV_BUILT
    return health_hrv_sampling();
#else
    return false;
#endif
}

bool health_store_hrv_measuring(void)
{
#if HRV_BUILT
    return health_hrv_measuring();
#else
    return false;
#endif
}

bool health_store_hrv_recent(int back, HrvBurst *out)
{
#if HRV_BUILT
    return health_hrv_recent(back, out);
#else
    (void)back;
    (void)out;
    return false;
#endif
}

bool health_store_hrv_live(int *score, int *steps, int *held_sec)
{
#if HRV_BUILT
    return health_hrv_live(score, steps, held_sec);
#else
    (void)score;
    (void)steps;
    (void)held_sec;
    return false;
#endif
}

uint16_t health_store_hrv_still_mg(void)
{
#if HRV_BUILT
    return health_hrv_still_mg();
#else
    return HRV_MOTION_STILL_DEFAULT;
#endif
}

uint16_t health_store_hrv_walk_steps(void)
{
#if HRV_BUILT
    return health_hrv_walk_steps();
#else
    return HRV_WALK_STEPS_DEFAULT;
#endif
}

const HrvLog *health_store_hrv_log(void)
{
#if HRV_BUILT
    return health_hrv_log();
#else
    // a face without HRV still links panels that read the log, so they get one that is empty
    static const HrvLog empty;
    return &empty;
#endif
}
