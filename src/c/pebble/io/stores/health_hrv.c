/**
 * @file health_hrv.c
 * @brief The heart rate variability half of the health store.
 *
 * The watch reports one gap between two heartbeats at a time, as a health event. The health store
 * holds the app's one health subscription, so it hands each of those events here, along with its
 * turn on the face's cadence. The arithmetic, which beats count and how a run adds up to RMSSD,
 * is in core/health/hrv_run.c, and the movement score is in core/health/hrv_motion.c.
 *
 * @ingroup lib_stores
 */
#include "io/stores/health_hrv.h"
#include "health/hrv_run.h"
#include "health/hrv_motion.h"
#include "io/stores/store_persist.h"

#include <string.h>
#include <time.h>

/**
 * @brief The run of beats being added up. It is kept apart from the reading, since a gap lands
 * about once a beat and only a finished run changes what the face shows.
 */
static HrvRun s_run;
static int s_ms = -1;            ///< The reading shown, or -1 for none
static uint32_t s_measured_at;   ///< When the reading shown was taken, in seconds
static uint16_t s_period_sec;    ///< How often the watch takes a burst, or 0 for not at all
static bool s_live;              ///< True once HRV asks the watch, so seed mode never does
static bool s_sampling;          ///< Whether the watch took the last request
static uint32_t s_asked_at;      ///< When the watch was last asked, in seconds
static uint32_t s_gap_at;        ///< When the last gap arrived, or the watch took a request, in seconds
static bool s_holding;           ///< True while a burst is held on with HRV_HOLD_PERIOD_SEC
static uint8_t s_settle;         ///< Gaps still to leave out at the start of this burst
static uint16_t s_still_mg;      ///< The most the wrist may move for a burst to be still
static uint16_t s_walk_steps;    ///< The steps through a burst that make it a walk
static uint8_t s_settle_gaps;    ///< The gaps a burst leaves out as it starts
static HrvCount s_count;         ///< Which bursts count for the main reading
static bool s_accel_on;          ///< Whether the accelerometer is being read for the burst
static HrvMotion s_motion;       ///< The movement seen through the burst being held
static uint32_t s_held_since;    ///< When the hold started, in seconds
static void (*s_changed)(void);  ///< Called whenever the reading changes, so the face can redraw
static bool s_keep_all;          ///< Whether a burst that cannot count is measured anyway, for a panel that shows it
static bool s_live_redraw;       ///< Whether the face is redrawn once a second while a burst is held, for a tuning panel
static int32_t s_steps_start = -1; ///< The day's step count when the hold started, or -1 when not known
static uint8_t s_hold_gaps;      ///< Gaps added to the run since the hold started
static HrvBurst s_recent[HRV_RECENT];  ///< The latest bursts, for a tuning panel, kept in memory only
static uint8_t s_recent_head;    ///< The slot the next burst goes in
static uint32_t s_persist_key;   ///< The persist slot the log is saved in, or 0 for none
static HrvLog s_log;             ///< The readings kept for the face's panels

/**
 * @brief The log as it goes to flash, with the tag store_restore checks in front.
 */
typedef struct
{
    uint8_t tag;     ///< STORE_TAG_HRV, so an older shape is turned away
    uint8_t pad[3];  ///< Keeps the log on a word boundary
    HrvLog log;      ///< The readings
} HrvSaved;
_Static_assert(sizeof(HrvSaved) <= PERSIST_DATA_MAX_LENGTH, "the HRV log must fit one persist key");

/** @brief The day's step count so far, or -1 when the watch cannot say. */
static int32_t steps_now(void)
{
#if defined(PBL_HEALTH)
    return (int32_t)health_service_sum_today(HealthMetricStepCount);
#else
    return -1;
#endif
}

/**
 * @brief The steps taken since the hold started.
 *
 * The day's count starts over at midnight, and the sleep tracker can take steps back off minutes
 * it later judges asleep, so a count that went down says nothing and reads as not known.
 *
 * @return The steps, or -1 when not known.
 */
static int steps_through(void)
{
    if (s_steps_start < 0)
    {
        return -1;
    }

    int32_t now = steps_now();
    if (now < s_steps_start)
    {
        return -1;
    }

    return (int)(now - s_steps_start);
}

/** @brief What the wearer is doing through the burst so far, from its steps and its movement. */
static HrvState burst_state(void)
{
    return hrv_log_state_of(hrv_motion_score(&s_motion), steps_through(), s_still_mg, s_walk_steps);
}

/**
 * @brief Whether the burst being held can no longer count for the main reading.
 *
 * Steps never come back off within a burst, so a walk decides it at once. The still level also
 * gives up once the wrist has moved more than a whole burst at the limit could hold, rather than
 * as soon as the average crosses it, since a scratch early on does not mean the burst will not pass.
 */
static bool cannot_count(void)
{
    if (s_count == HRV_COUNT_ANY)
    {
        return false;
    }

    int steps = steps_through();
    if (steps >= s_walk_steps)
    {
        return true;
    }

    return s_count == HRV_COUNT_STILL &&
           hrv_motion_cannot_pass(&s_motion, s_still_mg, (uint32_t)HRV_HOLD_MAX_SEC * 10);
}

/**
 * @brief Keeps a finished or dropped burst in the tuning ring.
 *
 * @param ms Its reading, or -1 when it was dropped or gave none.
 * @param now_sec The time now, in seconds.
 * @param counted Whether it became the main reading.
 */
static void note_burst(int ms, uint32_t now_sec, bool counted)
{
    int steps = steps_through();
    int score = hrv_motion_score(&s_motion);
    HrvBurst *burst = &s_recent[s_recent_head];

    burst->at_sec = now_sec;
    burst->ms = (int16_t)(ms > HRV_LOG_MS_MAX ? HRV_LOG_MS_MAX : ms);
    burst->score = (int16_t)(score > INT16_MAX ? INT16_MAX : score);
    burst->steps = (int16_t)(steps > INT16_MAX ? INT16_MAX : steps);
    burst->state = (uint8_t)burst_state();
    burst->kept = (uint8_t)(s_run.finished_diffs > UINT8_MAX ? UINT8_MAX : s_run.finished_diffs);
    burst->gaps = s_hold_gaps;
    burst->counted = counted;
    s_recent_head = (uint8_t)((s_recent_head + 1) % HRV_RECENT);
}

/**
 * @brief Puts a new reading up, or takes one down with -1, and redraws only when it moved.
 *
 * @param ms The reading in ms, or -1 for none.
 * @param now_sec The time now, in seconds, which the staleness check counts from.
 */
static void show(int ms, uint32_t now_sec)
{
    s_measured_at = now_sec;

    if (ms == s_ms)
    {
        return;
    }

    s_ms = ms;
    if (s_changed)
    {
        s_changed();
    }
}

/**
 * @brief Saves the log to flash, when the face gave it a slot.
 *
 * It runs once a reading, which at a five minute period is a few hundred writes of a quarter of a
 * kilobyte a day. The CPU is already awake for the burst, and a log saved only when the face
 * closes would lose the day whenever the watch resets.
 */
static void save_log(void)
{
    if (s_persist_key == 0)
    {
        return;
    }

    HrvSaved saved = {0};
    saved.log = s_log;
    store_save(s_persist_key, &saved, sizeof(saved), STORE_TAG_HRV);
}

/**
 * @brief The day and the minute of the day on the watch's own clock.
 *
 * The log only needs a day that changes at local midnight, so the year and the day of the year
 * make one without any date sums.
 *
 * @param now_sec The time now, in seconds.
 * @param[out] day The day.
 * @param[out] minute_of_day The minute of the day, 0 to 1439.
 */
static void local_day(uint32_t now_sec, int32_t *day, int *minute_of_day)
{
    time_t now = (time_t)now_sec;
    struct tm *local = localtime(&now);
    *day = local->tm_year * 1000 + local->tm_yday;
    *minute_of_day = local->tm_hour * 60 + local->tm_min;
}

/**
 * @brief Files a finished reading and shows it, when it counts.
 *
 * Every reading goes into the log with what the wearer was doing. One the face's count level
 * leaves out, such as a walking one, is logged but does not replace the main reading, which stays
 * a resting one.
 *
 * @param ms The reading in ms.
 * @param now_sec The time now, in seconds.
 */
static void record(int ms, uint32_t now_sec)
{
    HrvState state = burst_state();
    bool asleep = false;
#if defined(PBL_HEALTH)
    asleep = (health_service_peek_current_activities() & (HealthActivitySleep | HealthActivityRestfulSleep)) != 0;
#endif

    int32_t day = 0;
    int minute = 0;
    local_day(now_sec, &day, &minute);
    hrv_log_add(&s_log, ms, now_sec / 60, day, minute, state, asleep);
    save_log();

    bool counts = hrv_log_counts(state, s_count);
    note_burst(ms, now_sec, counts);
    if (counts)
    {
        show(ms, now_sec);
    }
    else if (s_changed)
    {
        // the main reading stays, but the panels that show the log have a new reading to draw
        s_changed();
    }
}

/**
 * @brief Asks the watch for beat gaps at a period, or tells it to stop with a period of 0.
 *
 * @param period_sec How often the watch takes a burst, or 0 to stop.
 * @param now_sec The time now, in seconds, which the next ask is spaced from.
 */
static void request(uint16_t period_sec, uint32_t now_sec)
{
    s_asked_at = now_sec;
#if defined(PBL_HEALTH)
    bool taken = health_service_set_hrv_sample_period(period_sec);
    s_sampling = taken && period_sec > 0;
#else
    s_sampling = false;
#endif
    if (s_sampling)
    {
        // a request just taken counts as fresh, so a lapse is measured from here until the first gap
        s_gap_at = now_sec;
    }
}

/**
 * @brief Adds each accelerometer sample to the burst's movement, leaving out ones taken while the
 * watch was vibrating, since the motor shakes it as hard as a step.
 *
 * @param data The samples.
 * @param num_samples How many there are.
 */
static void on_accel(AccelData *data, uint32_t num_samples)
{
    for (uint32_t sample = 0; sample < num_samples; sample++)
    {
        if (!data[sample].did_vibrate)
        {
            hrv_motion_push(&s_motion, data[sample].x, data[sample].y, data[sample].z);
        }
    }

    // a batch comes once a second, so a tuning panel can show the score climbing as it happens
    if (s_live_redraw && s_changed)
    {
        s_changed();
    }
}

/**
 * @brief Starts reading the accelerometer for a burst.
 *
 * Every held burst is scored, since the log tags each reading still or busy and an unscored one
 * would go in as still whatever the wrist did.
 */
static void accel_start(void)
{
    hrv_motion_reset(&s_motion);
    if (s_accel_on)
    {
        return;
    }

    // ten samples handed over once a second is enough to see a step, and costs far less than a
    // faster rate the score has no use for
    accel_data_service_subscribe(10, on_accel);
    accel_service_set_sampling_rate(ACCEL_SAMPLING_10HZ);
    s_accel_on = true;
}

/** @brief Stops reading the accelerometer once a burst is over. */
static void accel_stop(void)
{
    if (!s_accel_on)
    {
        return;
    }

    accel_data_service_unsubscribe();
    s_accel_on = false;
}

/** @brief Drops a hold without asking the watch for anything, for a caller about to ask for a period of its own. */
static void hold_drop(void)
{
    // a burst that ended during its settle would otherwise leave the count running, and the next
    // burst's first gap would not read as fresh, so it would never be held
    s_holding = false;
    s_settle = 0;
    accel_stop();
}

/**
 * @brief Holds the sensor on for the burst that just started, so its run can fill.
 *
 * The watch turns the sensor off on its first good heart rate, which is only a handful of beats
 * in. A period shorter than the sensor's warm up keeps it on, so the burst is asked for at
 * HRV_HOLD_PERIOD_SEC until its run is done. That costs up to HRV_HOLD_MAX_SEC of sensor time a
 * burst, and is what gives a run its 20 beats at all.
 *
 * @param now_sec The time now, in seconds.
 */
static void hold_start(uint32_t now_sec)
{
    if (s_holding || s_period_sec == 0)
    {
        return;
    }

    s_holding = true;
    s_held_since = now_sec;
    s_steps_start = steps_now();
    s_hold_gaps = 0;
    accel_start();
    request(HRV_HOLD_PERIOD_SEC, now_sec);
}

/**
 * @brief Lets the sensor go back to the face's period once a burst is measured.
 *
 * @param now_sec The time now, in seconds.
 */
static void hold_end(uint32_t now_sec)
{
    if (!s_holding)
    {
        return;
    }

    hold_drop();
    request(s_period_sec, now_sec);
}

/**
 * @brief Ends a burst whose beats went quiet: files what it measured, or notes it as dropped on a
 * tuning panel, and lets the sensor go.
 *
 * Beats that came outside a hold have no score and never make a reading, so their run is only
 * emptied.
 *
 * @param now_sec The time now, in seconds.
 */
static void end_quiet_burst(uint32_t now_sec)
{
    int finished = hrv_run_finish(&s_run);
    if (!s_holding)
    {
        return;
    }

    if (finished >= 0)
    {
        record(finished, now_sec);
    }
    else
    {
        note_burst(-1, now_sec, false);
    }
    hold_end(now_sec);
}

// --- called by the health store ---

void health_hrv_on_gap(void)
{
#if defined(PBL_HEALTH)
    if (!s_live)
    {
        return;
    }

    uint32_t now = (uint32_t)time(NULL);
    s_gap_at = now;

    // a gap with nothing before it, or after a pause, is the start of a burst
    bool fresh = s_settle == 0 && (s_run.last_at == 0 || hrv_run_quiet(&s_run, now));

    if (fresh)
    {
        // the burst before the pause ends here, since the gaps left out below never reach its run.
        // a held one went quiet partway, such as with a loose strap, and is filed the same as the
        // poll would have filed it
        if (s_run.last_at != 0)
        {
            end_quiet_burst(now);
        }
        s_settle = s_settle_gaps;
        hold_start(now);
    }

    if (s_settle > 0)
    {
        // the first gaps of a burst can swap between two values while the sensor settles, close
        // enough to pass the jump rule. on a Time 2 that lifted a reading of 35 ms to 50, so they are
        // left out. the arrival time still moves on, so the burst is not taken for a new one
        s_settle--;
        s_run.last_at = now;
        return;
    }

    // the event carries no gap of its own, but the watch saves this event's gap for the peek on the
    // app's own task just before it calls the handler. so each call reads its own beat, even when
    // several events were queued while the face was busy
    int finished = hrv_run_push(&s_run, health_service_peek_hrv_ppi_ms(), now);
    if (s_holding && s_hold_gaps < UINT8_MAX)
    {
        s_hold_gaps++;
    }

    if (!s_keep_all && s_holding && cannot_count())
    {
        // the burst cannot count, so it is dropped and the sensor let go straight away rather than
        // held on for a reading nothing shows. the arrival time is kept, so the beats that follow
        // are not taken for a new burst
        s_run.finished_diffs = s_run.diffs;
        note_burst(-1, now, false);
        hrv_run_reset(&s_run);
        s_run.last_at = now;
        hold_end(now);
        return;
    }

    // beats outside a hold have no score and never make a reading
    if (!s_holding)
    {
        finished = -1;
    }

    bool over = s_holding && hrv_hold_over(s_held_since, now);
    if (over && finished < 0)
    {
        // the run never filled, so it gives what it has. the arrival time is kept, so the gaps
        // still trickling in after the hold do not read as a new burst and start another one
        finished = hrv_run_finish(&s_run);
        s_run.last_at = now;
        if (finished < 0)
        {
            // too few beats to give a reading, which a tuning panel still shows
            note_burst(-1, now, false);
        }
    }

    if (finished >= 0)
    {
        record(finished, now);
    }

    if (finished >= 0 || over)
    {
        hold_end(now);
    }
#endif
}

void health_hrv_poll(void)
{
    if (!s_live)
    {
        return;
    }

    uint32_t now = (uint32_t)time(NULL);

    // a clock the phone set back leaves these stamps in the future. pulling them back to now
    // starts each wait over from here, rather than holding it until the clock catches up
    if (s_asked_at > now)
    {
        s_asked_at = now;
    }
    if (s_gap_at > now)
    {
        s_gap_at = now;
    }
    if (s_measured_at > now)
    {
        s_measured_at = now;
    }
    if (s_run.last_at > now)
    {
        s_run.last_at = now;
    }

    int32_t day = 0;
    int minute = 0;
    local_day(now, &day, &minute);
    if (hrv_log_roll_day(&s_log, day))
    {
        save_log();
        if (s_changed)
        {
            s_changed();
        }
    }

    if (s_period_sec == 0)
    {
        return;
    }

    // asking again picks up heart rate turned back on in the Health settings, or a request the
    // watch dropped, without a restart. a burst being held is asked for at its own period, which
    // asking again here would cut short
    if (!s_holding && hrv_should_ask(s_sampling, s_gap_at, s_asked_at, now, s_period_sec))
    {
        request(s_period_sec, now);
    }

    if (hrv_run_quiet(&s_run, now))
    {
        end_quiet_burst(now);
    }

    if (s_ms >= 0 && hrv_reading_stale(s_measured_at, now, s_period_sec))
    {
        show(-1, now);
    }
}

/**
 * @brief Puts the log's newest reading that counted back up, when it is not stale yet.
 *
 * Without it the readout shows dashes after every relaunch until the next burst finishes, which is
 * up to a sample period plus the hold, while the panels that read the log still show it.
 *
 * @param now_sec The time now, in seconds.
 */
static void show_latest_logged(uint32_t now_sec)
{
    for (int back = 0; back < HRV_LOG_SLOTS; back++)
    {
        int ms = 0;
        uint32_t at_min = 0;
        uint8_t flags = 0;
        if (!hrv_log_get(&s_log, back, &ms, &at_min, &flags))
        {
            return;
        }

        if (!hrv_log_counts((HrvState)(flags & HRV_LOG_STATE_MASK), s_count))
        {
            continue;
        }

        // only the newest that counted matters, since any older one is staler still
        uint32_t at_sec = at_min * 60;
        if (at_sec <= now_sec && !hrv_reading_stale(at_sec, now_sec, s_period_sec))
        {
            s_ms = ms;
            s_measured_at = at_sec;
        }
        return;
    }
}

void health_hrv_start(const HealthHrvConfig *cfg, int seed_ms, const HrvLog *seed_log, void (*changed)(void))
{
    s_changed = changed;

    // a health store started again live, such as on a settings save, keeps the burst being added
    // up and the reading shown. only the rules can have changed
    if (s_live && cfg->live)
    {
        health_hrv_set_rules(cfg->still_mg, cfg->walk_steps, cfg->settle_gaps, cfg->count, cfg->keep_all,
                             cfg->live_redraw);
        health_hrv_set_period(cfg->period_sec);
        return;
    }

    bool live = cfg->live;
    uint16_t period_sec = cfg->period_sec;

    // started again on its seed, the request an earlier start made has to stop here, since nothing
    // else would stop it
    health_hrv_stop();

    hrv_run_reset(&s_run);
    s_period_sec = period_sec;
    s_sampling = false;
    hold_drop();
    health_hrv_set_rules(cfg->still_mg, cfg->walk_steps, cfg->settle_gaps, cfg->count, cfg->keep_all,
                         cfg->live_redraw);
    // a seeded log is a fixture, so it never goes to flash over the wearer's own
    s_persist_key = seed_log ? 0 : cfg->persist_key;
    memset(s_recent, 0, sizeof(s_recent));
    s_recent_head = 0;
    s_settle = 0;

    // the log comes back from flash so the panels keep their history across an app, and a seeded
    // store takes the face's fixture instead
    hrv_log_reset(&s_log);
    if (seed_log)
    {
        s_log = *seed_log;
    }
    else if (live && s_persist_key != 0)
    {
        HrvSaved saved;
        if (store_restore(s_persist_key, &saved, sizeof(saved), STORE_TAG_HRV))
        {
            s_log = saved.log;
        }
    }

    uint32_t now = (uint32_t)time(NULL);

    // a log saved yesterday would show yesterday's hours as today's until the first poll, and a
    // fresh one would roll on that poll and be written to flash empty
    if (live && !seed_log)
    {
        int32_t day = 0;
        int minute = 0;
        local_day(now, &day, &minute);
        hrv_log_roll_day(&s_log, day);
    }

    // a live store with a period of 0 never samples, so a seed there would sit on screen looking real
    s_ms = seed_ms > 0 && !(live && period_sec == 0) ? seed_ms : -1;
    s_measured_at = now;
    if (live && !seed_log && s_ms < 0 && period_sec > 0)
    {
        show_latest_logged(now);
    }

    if (!live)
    {
        return;
    }

    s_live = true;
    request(s_period_sec, now);
}

void health_hrv_set_period(uint16_t period_sec)
{
    if (period_sec == s_period_sec)
    {
        return;
    }

    s_period_sec = period_sec;

    if (!s_live)
    {
        // a seeded store keeps its seed whatever the period, so a screenshot shows the fixture
        return;
    }

    uint32_t now = (uint32_t)time(NULL);

    // a burst being held carries on, and its end asks for the new period
    if (s_holding && period_sec > 0)
    {
        return;
    }

    hold_drop();
    request(period_sec, now);

    if (period_sec == 0)
    {
        hrv_run_reset(&s_run);
        show(-1, now);
    }
}

void health_hrv_set_rules(uint16_t still_mg, uint16_t walk_steps, uint16_t settle_gaps, HrvCount count, bool keep_all,
                          bool live_redraw)
{
    s_still_mg = still_mg > 0 ? still_mg : HRV_MOTION_STILL_DEFAULT;
    s_walk_steps = walk_steps > 0 ? walk_steps : HRV_WALK_STEPS_DEFAULT;
    // read only as a burst starts, so a burst already settling keeps its count and the next one
    // takes the new one
    s_settle_gaps = hrv_settle_gaps(settle_gaps);
    s_count = count <= HRV_COUNT_ANY ? count : HRV_COUNT_NOT_WALKING;
    s_keep_all = keep_all;
    s_live_redraw = live_redraw;
}

void health_hrv_stop(void)
{
    if (!s_live)
    {
        return;
    }

    s_period_sec = 0;
    hold_drop();
    s_settle = 0;
    request(0, (uint32_t)time(NULL));
    s_live = false;
}

int health_hrv_ms(void)
{
    return s_ms;
}

bool health_hrv_sampling(void)
{
    return s_sampling;
}

bool health_hrv_measuring(void)
{
    return s_holding;
}

const HrvLog *health_hrv_log(void)
{
    return &s_log;
}

bool health_hrv_recent(int back, HrvBurst *out)
{
    if (back < 0 || back >= HRV_RECENT)
    {
        return false;
    }

    const HrvBurst *burst = &s_recent[(s_recent_head - 1 - back + 2 * HRV_RECENT) % HRV_RECENT];
    if (burst->at_sec == 0)
    {
        return false;
    }

    *out = *burst;
    return true;
}

bool health_hrv_live(int *score, int *steps, int *held_sec)
{
    if (!s_holding)
    {
        return false;
    }

    *score = hrv_motion_score(&s_motion);
    *steps = steps_through();
    *held_sec = (int)((uint32_t)time(NULL) - s_held_since);
    return true;
}

uint16_t health_hrv_still_mg(void)
{
    return s_still_mg > 0 ? s_still_mg : HRV_MOTION_STILL_DEFAULT;
}

uint16_t health_hrv_walk_steps(void)
{
    return s_walk_steps > 0 ? s_walk_steps : HRV_WALK_STEPS_DEFAULT;
}

uint16_t health_hrv_settle_gaps(void)
{
    return s_settle_gaps > 0 ? s_settle_gaps : HRV_SETTLE_GAPS;
}
