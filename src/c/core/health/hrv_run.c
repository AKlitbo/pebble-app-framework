/**
 * @file hrv_run.c
 * @brief Turns the beat gaps the watch reports into heart rate variability, as RMSSD in ms.
 *
 * @ingroup lib_core
 */
#include "health/hrv_run.h"

#include <string.h>

/**
 * @brief The square root of a whole number, rounded down.
 *
 * The watch has no hardware floating point, so this walks the bits instead of calling sqrt.
 *
 * @param value The number to take the root of.
 * @return The largest whole number whose square is no more than value.
 */
static uint32_t root_floor(uint32_t value)
{
    uint32_t root = 0;
    uint32_t bit = 1u << 30;

    while (bit > value)
    {
        bit >>= 2;
    }

    uint32_t rest = value;
    while (bit != 0)
    {
        if (rest >= root + bit)
        {
            rest -= root + bit;
            root = (root >> 1) + bit;
        }
        else
        {
            root >>= 1;
        }
        bit >>= 2;
    }

    return root;
}

void hrv_run_reset(HrvRun *run)
{
    memset(run, 0, sizeof(*run));
}

int hrv_run_finish(HrvRun *run)
{
    int result = -1;

    if (run->diffs >= HRV_DIFFS_MIN)
    {
        // the root of the mean rounded down is the root of the whole mean rounded down, so only
        // the round up needs the fraction. it goes up when the mean reaches root and a half
        // squared, which times 4 and the count stays in whole numbers. rounding the mean first
        // instead would round twice and read 1 ms low on a mean just past the halfway mark.
        // the sums stay well inside 32 bits, since a kept difference is at most 400 ms
        uint32_t root = root_floor(run->sum_sq / run->diffs);
        uint32_t halfway = (2 * root + 1) * (2 * root + 1);
        if (halfway * run->diffs <= 4 * run->sum_sq)
        {
            root++;
        }
        result = (int)root;
    }

    uint16_t diffs = run->diffs;
    hrv_run_reset(run);
    run->finished_diffs = diffs;
    return result;
}

bool hrv_run_quiet(const HrvRun *run, uint32_t now_sec)
{
    // a clock set back since the last gap reads as no time passed, rather than wrapping round to
    // a pause of over a century
    return run->last_at != 0 && now_sec >= run->last_at && now_sec - run->last_at >= HRV_QUIET_SEC;
}

int hrv_run_push(HrvRun *run, uint16_t ppi_ms, uint32_t now_sec)
{
    int finished = -1;
    if (hrv_run_quiet(run, now_sec))
    {
        finished = hrv_run_finish(run);
    }

    run->last_at = now_sec;

    // a 0 is the watch saying it has no gap for this beat, which is dropped like any other bad one.
    // taking the watch off shows up as the gaps stopping, which the quiet check ends the run on
    if (ppi_ms < HRV_PPI_MIN_MS || ppi_ms > HRV_PPI_MAX_MS)
    {
        // a difference is only worth anything between neighbouring beats, and this gap stood
        // between the last good one and the next, so the chain starts over after it
        run->last_ms = 0;
        return finished;
    }

    if (run->last_ms == 0)
    {
        run->last_ms = ppi_ms;
        return finished;
    }

    uint32_t diff = ppi_ms > run->last_ms ? ppi_ms - run->last_ms : run->last_ms - ppi_ms;

    if (diff * 100 > (uint32_t)run->last_ms * HRV_JUMP_PCT)
    {
        // a missed beat reads as one gap twice as long, and an extra one as two short ones. it is
        // dropped and the chain starts over after it, which also lets a heart rate that really
        // moved carry on from its new pace, since the next gap is taken as it comes
        run->last_ms = 0;
        return finished;
    }

    run->sum_sq += diff * diff;
    run->diffs++;
    run->last_ms = ppi_ms;

    // a gap that finished a quiet run returned above as the first beat of the next, so only one
    // run can finish here. the gap that fills a run also starts the next one, since its neighbour
    // after it is still a real difference
    if (run->diffs >= HRV_DIFFS_FULL)
    {
        int full = hrv_run_finish(run);
        run->last_ms = ppi_ms;
        run->last_at = now_sec;
        return full;
    }

    return finished;
}

bool hrv_reading_stale(uint32_t measured_at, uint32_t now_sec, uint16_t period_sec)
{
    uint32_t after = (uint32_t)period_sec * HRV_STALE_PERIODS;
    if (after < HRV_STALE_MIN_SEC)
    {
        after = HRV_STALE_MIN_SEC;
    }

    // a clock set back since the reading reads as no time passed, like the quiet check
    return now_sec > measured_at && now_sec - measured_at > after;
}

bool hrv_should_ask(bool sampling, uint32_t gap_at, uint32_t asked_at, uint32_t now_sec, uint16_t period_sec)
{
    bool lapsed = !sampling || hrv_reading_stale(gap_at, now_sec, period_sec);

    return lapsed && hrv_reading_stale(asked_at, now_sec, period_sec);
}

bool hrv_hold_over(uint32_t held_since, uint32_t now_sec)
{
    return now_sec >= held_since && now_sec - held_since >= HRV_HOLD_MAX_SEC;
}

// the settle is held to HRV_SETTLE_GAPS_MAX, so a face cannot leave out more than 20 gaps even for a
// sensor that settles slower. a burst is held for HRV_HOLD_MAX_SEC at most, and a run needs
// HRV_DIFFS_MIN differences, which takes that many gaps plus one after the settle. at the slowest heart
// rate kept, 30 a minute, a gap lands every 2 seconds, so a settle of 20 has the run's 20th difference
// in by 80 seconds with five beats spare. a longer settle would let a slow heart's hold run out before
// its run gave a reading, so that wearer would never see one
_Static_assert((HRV_SETTLE_GAPS_MAX + HRV_DIFFS_MIN) * HRV_PPI_MAX_MS / 1000 <= HRV_HOLD_MAX_SEC,
               "the longest settle must leave a run at 30 bpm time to finish inside one hold");

uint8_t hrv_settle_gaps(uint16_t asked)
{
    if (asked == 0)
    {
        return HRV_SETTLE_GAPS;
    }

    return asked < HRV_SETTLE_GAPS_MAX ? (uint8_t)asked : HRV_SETTLE_GAPS_MAX;
}
