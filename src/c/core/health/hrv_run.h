/**
 * @file hrv_run.h
 * @brief Turns the beat gaps the watch reports into heart rate variability, as RMSSD in ms.
 *
 * The watch hands over one gap between two heartbeats at a time. One gap is just the heart rate
 * said another way, so the number worth showing is how much each gap differs from the one before
 * it, taken over a run of clean beats. That is RMSSD, the square root of the mean of the squared
 * differences. Plain C with no SDK, so its specs run on a PC.
 *
 * Apps never see the sensor's own quality grade, so the rules for which beats count are here. A gap
 * outside a heart rate of 30 to 200 is dropped, and so is one that jumps too far from the one
 * before, which is what a missed or doubled beat looks like. A dropped gap also breaks the chain,
 * so the next difference is only taken between the two good gaps after it, which really are
 * neighbours.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdbool.h>
#include <stdint.h>

/**
 * @addtogroup lib_core
 * @{
 */

#define HRV_PPI_MIN_MS 300   ///< The shortest gap kept, a heart rate of 200
#define HRV_PPI_MAX_MS 2000  ///< The longest gap kept, a heart rate of 30
#define HRV_JUMP_PCT 20      ///< A gap further than this percent from the one before it is dropped
#define HRV_QUIET_SEC 15     ///< A pause this long with no gap ends the run
#define HRV_DIFFS_MIN 20     ///< Differences a run needs before its answer means anything
#define HRV_DIFFS_FULL 60    ///< A run this long is finished, and the next gap starts a new one
#define HRV_STALE_PERIODS 3  ///< A reading is stale once this many sample periods pass without a new one
#define HRV_STALE_MIN_SEC 1800 ///< A reading is never stale sooner than this, however short the period
#define HRV_HOLD_PERIOD_SEC 1  ///< The period asked for while a burst is measured, which keeps the sensor on
#define HRV_HOLD_MAX_SEC 90    ///< The longest the sensor is held on for one burst
#define HRV_SETTLE_GAPS 10     ///< Gaps left out at the start of each burst while the sensor settles, when a face sets none
#define HRV_SETTLE_GAPS_MAX 20 ///< The most gaps a face can have left out, which still leaves a slow heart time for a run

/**
 * @brief One run of beats being added up. Start it with hrv_run_reset.
 */
typedef struct
{
    uint16_t last_ms;  ///< The gap before, or 0 when the next gap starts the chain over
    uint16_t diffs;    ///< How many differences are summed
    uint32_t sum_sq;   ///< The squared differences added up
    uint32_t last_at;  ///< When the last gap arrived, in seconds, or 0 before the first
    uint16_t finished_diffs; ///< How many differences the last finished run held, kept across the reset
} HrvRun;

/**
 * @brief Empties a run, so the next gap starts it.
 *
 * @param run The run to empty.
 */
void hrv_run_reset(HrvRun *run);

/**
 * @brief Adds one gap from the watch.
 *
 * A gap of 0, the watch's no reading, is dropped like a gap out of range and breaks the chain. A gap
 * after a quiet pause ends the run before it and starts the next one. A run reaching HRV_DIFFS_FULL
 * ends there. Each ending hands back the finished run's answer, when it had enough beats to give one.
 *
 * @param run The run to add to.
 * @param ppi_ms The gap between two beats in ms, or 0 when the watch has none for this beat.
 * @param now_sec The time now, in seconds.
 * @return The RMSSD of a run this gap finished, or -1 when no run finished with an answer.
 */
int hrv_run_push(HrvRun *run, uint16_t ppi_ms, uint32_t now_sec);

/**
 * @brief Whether a run has gone quiet, so it is finished and waiting to be read.
 *
 * The watch only samples now and then, so the last run of a burst is followed by silence rather
 * than another gap. This lets the caller finish it on a timer instead of a whole period later.
 *
 * @param run The run to look at.
 * @param now_sec The time now, in seconds.
 * @return True when the run holds beats and none has arrived for HRV_QUIET_SEC.
 */
bool hrv_run_quiet(const HrvRun *run, uint32_t now_sec);

/**
 * @brief Ends a run and empties it. How many differences it held stays in finished_diffs, so a
 * caller can say how much of the burst went into the reading.
 *
 * @param run The run to finish.
 * @return Its RMSSD in ms, rounded, or -1 when it had fewer than HRV_DIFFS_MIN differences.
 */
int hrv_run_finish(HrvRun *run);

/**
 * @brief Whether a reading is too old to show.
 *
 * A reading only comes once a run finishes, so with the watch off the wrist the last one would sit
 * on screen for good. This puts it down once a few sample periods pass with nothing new.
 *
 * @param measured_at When the reading was taken, in seconds.
 * @param now_sec The time now, in seconds.
 * @param period_sec How often the watch samples, in seconds.
 * @return True when the reading should go back to no reading.
 */
bool hrv_reading_stale(uint32_t measured_at, uint32_t now_sec, uint16_t period_sec);

/**
 * @brief Whether to ask the watch for beat gaps again.
 *
 * The watch is asked again when it turned the last request down, or when no gap has come for as
 * long as a reading takes to go stale, which is how a dropped request shows. The asks are spaced by
 * that same wait, so a watch with no sensor is asked about twice an hour rather than every turn.
 *
 * @param sampling Whether the watch took the last request.
 * @param gap_at When the last gap arrived, or the watch took a request, in seconds.
 * @param asked_at When the watch was last asked, in seconds.
 * @param now_sec The time now, in seconds.
 * @param period_sec How often the watch takes a burst, in seconds.
 * @return True when the watch should be asked now.
 */
bool hrv_should_ask(bool sampling, uint32_t gap_at, uint32_t asked_at, uint32_t now_sec, uint16_t period_sec);

/**
 * @brief Whether the sensor has been held on for a burst as long as it may be.
 *
 * The watch turns the sensor off once it has a good heart rate, which is only a handful of beats
 * in. So a burst is held on with a short period until its run fills, and this caps that hold in
 * case the run never does, such as with the watch loose on the wrist.
 *
 * @param held_since When the hold started, in seconds.
 * @param now_sec The time now, in seconds.
 * @return True once HRV_HOLD_MAX_SEC have passed. A clock set back reads as no time passed.
 */
bool hrv_hold_over(uint32_t held_since, uint32_t now_sec);

/**
 * @brief How many gaps to leave out at the start of a burst, from the count a face asked for.
 *
 * The first gaps of a burst can swap between two values while the sensor settles, so the store
 * leaves some out. A face can tune how many, and this holds its ask to 1 to HRV_SETTLE_GAPS_MAX.
 *
 * @param asked The gaps the face asked for, or 0 for HRV_SETTLE_GAPS.
 * @return HRV_SETTLE_GAPS for 0, otherwise the ask, held to HRV_SETTLE_GAPS_MAX.
 */
uint8_t hrv_settle_gaps(uint16_t asked);

/** @} */
