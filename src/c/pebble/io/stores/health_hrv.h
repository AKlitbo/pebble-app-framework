/**
 * @file health_hrv.h
 * @brief The heart rate variability half of the health store. It asks the watch for beat gaps now
 * and then, holds the sensor on while a burst is measured, and keeps the latest reading.
 *
 * Only the health store calls these. A face turns HRV on with `HEALTH_HRV` in its appinfo's
 * `defines` and the HRV fields of `HealthConfig`, and reads it back through the health store.
 *
 * @ingroup lib_stores
 */
#pragma once
#include <pebble.h>
#include "health/hrv_log.h"

/**
 * @addtogroup lib_stores
 * @{
 */

/**
 * @brief The HRV rules the health store passes on from its own config.
 */
typedef struct
{
    bool live;              ///< True asks the watch for beat gaps, and false just keeps the seed
    uint16_t period_sec;    ///< How often the watch takes a burst, in seconds, or 0 for not at all
    uint16_t still_mg;      ///< The most the wrist may move for a burst to be still, or 0 for HRV_MOTION_STILL_DEFAULT
    uint16_t walk_steps;    ///< The steps through a burst that make it a walk, or 0 for HRV_WALK_STEPS_DEFAULT
    uint16_t settle_gaps;   ///< Gaps left out at the start of a burst, or 0 for HRV_SETTLE_GAPS
    HrvCount count;         ///< Which bursts count for the main reading
    bool keep_all;          ///< Measure a burst that cannot count rather than drop it, for a panel that shows it
    bool live_redraw;       ///< Redraw the face once a second while a burst is held, for a tuning panel
    uint32_t persist_key;   ///< The persist slot for the log, or 0 to keep it in memory only
} HealthHrvConfig;

/**
 * @brief Starts HRV with the health store's rules, or starts it again with new ones.
 *
 * Started again live on a live store, only the period and the movement rules change, and the burst
 * being added up, the reading shown, and the log are kept. Started with `live` false, any request
 * an earlier start made is stopped and the seed is shown instead.
 *
 * @param cfg The rules.
 * @param seed_ms A reading to start with, or 0 or less for none.
 * @param seed_log A log to start with for screenshots, or NULL to restore the saved one.
 * @param changed Called whenever the reading or the log changes, so the face can redraw.
 */
void health_hrv_start(const HealthHrvConfig *cfg, int seed_ms, const HrvLog *seed_log, void (*changed)(void));

/**
 * @brief Changes how often the watch takes a burst. A period of 0 stops the sampling and puts the
 * reading back to none on a live store, and a seeded store keeps its seed.
 *
 * @param period_sec How often in seconds, or 0 for not at all.
 */
void health_hrv_set_period(uint16_t period_sec);

/**
 * @brief Changes the rules for which bursts count and how they are measured, such as when the
 * wearer changes a setting or places a panel.
 *
 * @param still_mg The most the wrist may move for a burst to be still, or 0 for HRV_MOTION_STILL_DEFAULT.
 * @param walk_steps The steps through a burst that make it a walk, or 0 for HRV_WALK_STEPS_DEFAULT.
 * @param settle_gaps Gaps left out at the start of a burst, or 0 for HRV_SETTLE_GAPS. Held to
 * HRV_SETTLE_GAPS_MAX, and a burst already settling keeps the count it started with.
 * @param count Which bursts count for the main reading.
 * @param keep_all Measure a burst that cannot count rather than drop it.
 * @param live_redraw Redraw the face once a second while a burst is held.
 */
void health_hrv_set_rules(uint16_t still_mg, uint16_t walk_steps, uint16_t settle_gaps, HrvCount count, bool keep_all,
                          bool live_redraw);

/** @brief Reads one beat gap from the watch. The health store calls it for each HRV event. */
void health_hrv_on_gap(void);

/** @brief The HRV turn on the face's cadence, which the health store passes on while it is live. */
void health_hrv_poll(void);

/** @brief Stops the sampling, since the watch keeps an app's request going for an hour after it closes. */
void health_hrv_stop(void);

/** @brief The latest reading as RMSSD in ms, or -1 if there is none or it went stale. */
int health_hrv_ms(void);

/** @brief Whether the watch took the last request for beat gaps. */
bool health_hrv_sampling(void);

/** @brief Whether a burst is being measured right now, with the sensor held on. */
bool health_hrv_measuring(void);

/** @brief The readings kept for the face's panels. Never NULL. */
const HrvLog *health_hrv_log(void);

/**
 * @brief One of the latest bursts, dropped ones included, newest first.
 *
 * @param back 0 for the newest.
 * @param[out] out The burst.
 * @return False when there is none that far back.
 */
bool health_hrv_recent(int back, HrvBurst *out);

/**
 * @brief The burst being held right now.
 *
 * @param[out] score Its movement score so far, or -1 before there is one.
 * @param[out] steps Its steps so far, or -1 when not known.
 * @param[out] held_sec How long it has been held.
 * @return False when no burst is being held.
 */
bool health_hrv_live(int *score, int *steps, int *held_sec);

/** @brief The still limit in use, in milli-g a sample. */
uint16_t health_hrv_still_mg(void);

/** @brief The steps through a burst that make it a walk. */
uint16_t health_hrv_walk_steps(void);

/** @brief The gaps left out at the start of each burst. */
uint16_t health_hrv_settle_gaps(void);

/** @} */
