/**
 * @file health_hr_history.c
 * @brief The health store's heart rate graph: the last hour of heart rate, a reading a minute,
 * saved to flash so a relaunch shows it straight away. A face turns it on with HEALTH_HR_HISTORY,
 * and one that never names it carries none of this.
 *
 * @ingroup lib_stores
 */
#include "io/stores/health_store.h"
#include "io/stores/health_store_parts.h"
#include "io/stores/store_persist.h"

#include "health/minute_window.h"

#include <stdlib.h>
#include <string.h>
#include <time.h>

/**
 * @brief How many minutes of heart rate the graph shows.
 *
 * It has nothing to do with an hour having 60 minutes, even though it lands on the same number.
 */
#define HR_HISTORY_MINUTES 60

/**
 * @var s_window
 * @brief The rolling window and the minute its last slot holds.
 */
static struct
{
    uint8_t hr_history[HR_HISTORY_MINUTES]; ///< The rolling heart rate window, one reading a minute
    time_t  hr_last_min;                    ///< Wall-clock minute of the last history write, so the window can slide
} s_window;

/**
 * @brief The window as it goes to flash.
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

static bool s_live;            ///< True for a live store, so seed mode never writes to flash
static uint32_t s_persist_key; ///< The persist slot the face handed us for the saved window

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
    uint8_t *history = s_window.hr_history;

    HealthMinuteData *scratch = health_scratch_take(HR_HISTORY_MINUTES);
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
 * @brief Stash the heart rate graph so a relaunch can restore it.
 *
 * Only a live face writes, so seed mode never touches storage. A burst can land a reading a
 * second and a flash write blocks, so the saves are held to one a minute, which is all the graph
 * gains anyway.
 *
 * One a minute is the rate to keep, not one to trim. The save runs from whichever comes first in a
 * new minute, the face's cadence turn or a health event that refreshes the heart rate. Either way
 * the CPU is already awake for it, so no extra wake is spent. The face is closed whenever the
 * wearer opens a watchapp, even for a moment, and a graph saved less often comes back missing its
 * last minutes every time.
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
    memcpy(saved.hr_history, s_window.hr_history, sizeof(saved.hr_history));
    saved.hr_last_min = s_window.hr_last_min;

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
    time_t elapsed = now_min - s_window.hr_last_min;
    if (elapsed == 0)
    {
        return;  // same minute, so the reading goes in the slot it already has
    }

    // the clock went back, so the window's minutes now sit in the future. waiting for the clock to
    // catch up would pin every new reading to the last slot for as long as it went back, so the
    // window starts over from now
    if (elapsed < 0)
    {
        memset(s_window.hr_history, 0, sizeof(s_window.hr_history));
        s_window.hr_last_min = now_min;
        return;
    }

    if (elapsed >= HR_HISTORY_MINUTES)
    {
        memset(s_window.hr_history, 0, sizeof(s_window.hr_history));
    }
    else
    {
        int keep = HR_HISTORY_MINUTES - (int)elapsed;
        memmove(s_window.hr_history, s_window.hr_history + elapsed, keep);
        memset(s_window.hr_history + keep, 0, (int)elapsed);
    }

    s_window.hr_last_min = now_min;
}

/**
 * @brief Empties the window, then takes the seed, or restores the saved window and fills the time
 * away from the log for a live store.
 *
 * @param cfg The store's rules.
 * @param seed The store's seed, or NULL.
 */
static void hr_history_start(const HealthConfig *cfg, const HealthSeed *seed)
{
    s_live = cfg->live;
    s_persist_key = cfg->persist_key;
    memset(&s_window, 0, sizeof(s_window)); // a last minute of 0 means nothing restored yet

    if (seed)
    {
        if (seed->hr_history)
        {
            // a seeded curve ends on this minute, so a live store slides it on from here rather than
            // taking it for an empty first launch and wiping it
            memcpy(s_window.hr_history, seed->hr_history, sizeof(s_window.hr_history));
            s_window.hr_last_min = time(NULL) / SECONDS_PER_MINUTE;
        }
    }
    else if (cfg->live)
    {
        // restore the last graph so a relaunch (navigating away and back) shows it right away.
        // the tag store_restore checks tells this blob apart from an older shape, so a struct
        // change drops the old one instead of reading it as the wrong thing
        HealthSaved saved;
        if (store_restore(s_persist_key, &saved, sizeof(saved), STORE_TAG_HEALTH))
        {
            memcpy(s_window.hr_history, saved.hr_history, sizeof(s_window.hr_history));
            s_window.hr_last_min = saved.hr_last_min;
        }
    }

    if (!cfg->live)
    {
        return;
    }

    // the backfill below is a blocking read of the watch's minute log, which only a face that
    // named this part pays for
    time_t now_min = time(NULL) / SECONDS_PER_MINUTE;
    if (s_window.hr_last_min != 0)
    {
        // restored an earlier graph, so slide it forward over the time we were away (it
        // clears itself if that was over an hour), then fill that gap from the log
        hr_history_advance(now_min);
    }
    else
    {
        // first launch with nothing saved, so the whole window comes from the log
        memset(s_window.hr_history, 0, HR_HISTORY_MINUTES);
        s_window.hr_last_min = now_min;
    }
    read_hr_history(now_min);
}

/**
 * @brief Slides the window to now and puts a new reading in its last slot.
 *
 * The chart reads from this window rather than the minute history: the watch only logs a
 * per-minute heart_rate_bpm now and then in the background, so the minute history is mostly
 * empty, while peeking the live value on each event fills the window with real readings.
 *
 * @param hr The reading in beats per minute, or -1 for none.
 * @param from_event Unused, since a peek is as good as an event for the graph.
 */
static void hr_history_heart_rate(int hr, bool from_event)
{
    (void)from_event;

    hr_history_advance(time(NULL) / SECONDS_PER_MINUTE);
    if (hr > 0)
    {
        s_window.hr_history[HR_HISTORY_MINUTES - 1] = (uint8_t)(hr > 255 ? 255 : hr);
        // save on a real reading only, not every minute slide. the restore re-ages the window
        // so the empty minutes in between do not need writing. a burst can still land a reading
        // a second, so persist_save holds the actual writing down to one a minute
        persist_save();
    }
}

/**
 * @brief The window summed, so the store can tell when it moved.
 *
 * @return The sum.
 */
static uint32_t hr_history_sum(void)
{
    return store_sum(&s_window, sizeof(s_window));
}

const HealthPart health_part_hr_history = {
    .start = hr_history_start,
    .heart_rate = hr_history_heart_rate,
    .sum = hr_history_sum,
};

const uint8_t *health_store_hr_history(void) { return s_window.hr_history; }
