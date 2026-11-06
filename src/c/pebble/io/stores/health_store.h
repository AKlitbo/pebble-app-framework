/**
 * @file health_store.h
 * @brief Active health store. It subscribes to the watch's health service itself and holds
 * the readings, so a face just hands it the rules, optionally seeds it, then reads the numbers
 * back.
 *
 * @ingroup lib_stores
 */
#pragma once
#include <pebble.h>
#include "health/hrv_motion.h"
#include "health/hrv_log.h"
#include "health/hr_day.h"

/**
 * @addtogroup lib_stores
 * @{
 */

/**
 * @brief The rules a face hands the store.
 */
typedef struct
{
    bool     live;         ///< True subscribes the health service and false just keeps the fake data for screenshots
    bool     hr_history;   ///< Keep the rolling minute by minute heart rate window, for a face that graphs it
    bool     step_history; ///< Keep the hour by hour step buckets, for a face that graphs them
    bool     hr_day;       ///< Keep today's heart rate by the hour with its low, average, and high, for a face that charts the day
    // the heart rate and steps are read for every face, since the watch keeps both to hand. these
    // four are not, so each is only read for a face that shows it. the getter for one left off
    // keeps returning its no reading value, -1 for the first three and 0 for the distance
    bool     sleep;        ///< Read the sleep total
    bool     active;       ///< Read the active minutes total
    bool     calories;     ///< Read the active calories total
    bool     distance;     ///< Read the walked distance, including for a steps readout that can show it instead
    // heart rate variability only runs in a face built with HEALTH_HRV in its appinfo's defines.
    // these are ignored otherwise, so a face without it carries none of the code
    uint16_t hrv_period_sec;    ///< How often the watch takes a burst of beat gaps, in seconds, or 0 for no HRV
    uint16_t hrv_still_mg;      ///< The most the wrist may move for a burst to be still, in milli-g a sample, or 0 for HRV_MOTION_STILL_DEFAULT
    uint16_t hrv_walk_steps;    ///< The steps through a burst that make it a walk, or 0 for HRV_WALK_STEPS_DEFAULT
    HrvCount hrv_count;         ///< Which bursts count for the main reading. The default leaves out walking ones
    bool     hrv_keep_all;      ///< Measure a burst that cannot count rather than drop it, for a panel that shows walking readings
    bool     hrv_live_redraw;   ///< Redraw once a second while a burst is held, for a panel that shows the burst as it happens
    uint32_t hrv_persist_key;   ///< Slot for the saved HRV readings, or 0 to keep them in memory only
    uint32_t persist_key;  ///< Slot for the saved history so the face owns the key instead of the store
} HealthConfig;

/**
 * @brief Optional prefill, or pinned readings when live = false.
 */
typedef struct
{
    int hr;         ///< Heart rate in beats per minute
    int steps;      ///< Steps so far today
    int calories;   ///< Active calories so far today
    int sleep_min;  ///< Minutes of sleep
    int active_min; ///< Active minutes so far today
    int distance_m; ///< Walked distance in meters
    const uint8_t *hr_history;   ///< Optional 60 slot minute by minute heart rate curve (0 means no reading), or NULL
    const uint16_t *step_hourly; ///< Optional 24 slot hour by hour step curve, or NULL
    int step_hours;              ///< How many of those hourly buckets are real (0 to 24)
    int hrv_ms;                  ///< Heart rate variability as RMSSD in ms, or 0 for none
    const HrvLog *hrv_log;       ///< Optional HRV readings for the panels that show the log, or NULL
    const HrDay *hr_day;         ///< Optional heart rate by the hour for today, or NULL
} HealthSeed;

/**
 * @brief Start the store with its rules. Pass seed = NULL for normal use.
 *
 * @param cfg The rules (live).
 * @param seed Optional prefill, or NULL.
 */
void health_store_init(HealthConfig cfg, const HealthSeed *seed);

/**
 * @brief Hand it the function to call when the numbers change (the screen redraw).
 *
 * @param cb The function to call, or NULL for none.
 */
void health_store_subscribe(void (*cb)(void));

/**
 * @brief Stops what the store asked of the watch. Call from the face's deinit.
 *
 * The watch keeps an app's request for heart rate variability going for an hour after the app
 * closes, so a face with HRV that leaves this out has the sensor sampling for that hour whenever
 * the wearer opens an app from it. Without HRV it does nothing.
 */
void health_store_deinit(void);

/**
 * @brief Changes how often the watch takes a burst of beat gaps, such as when the wearer changes a
 * setting or places a panel. A period of 0 stops the sampling and puts the reading back to none.
 *
 * @param period_sec How often in seconds, or 0 for no HRV.
 */
void health_store_set_hrv_period(uint16_t period_sec);

/**
 * @brief Changes which HRV bursts count and how they are measured, such as when the wearer changes
 * a setting or places a panel.
 *
 * @param still_mg The most the wrist may move for a burst to be still, or 0 for HRV_MOTION_STILL_DEFAULT.
 * @param walk_steps The steps through a burst that make it a walk, or 0 for HRV_WALK_STEPS_DEFAULT.
 * @param count Which bursts count for the main reading.
 * @param keep_all Measure a burst that cannot count rather than drop it. Holds the sensor on for up to 90 seconds more each.
 * @param live_redraw Redraw once a second while a burst is held.
 */
void health_store_set_hrv_rules(uint16_t still_mg, uint16_t walk_steps, HrvCount count, bool keep_all, bool live_redraw);

// the store takes its own turn on the face's cadence (see store_cadence.h), registered at init,
// so nothing here needs calling once a minute by hand

/**
 * @brief The last hour of heart rate readings, one per minute (a 60 slot buffer). The store
 * fills it on each update. The little charts read it back out.
 */
const uint8_t *health_store_hr_history(void);

/**
 * @brief Today's heart rate by the hour, for a face that set hr_day. Read each hour and the day's
 * low, average, and high from it with the hr_day.h getters. Empty for a face that did not ask.
 *
 * @return The day, midnight first.
 */
const HrDay *health_store_hr_day(void);

/**
 * @brief Today's steps split into per-hour buckets, one slot per hour from midnight (24 slots).
 * The bar chart reads it back out.
 */
const uint16_t *health_store_step_hourly(void);

/**
 * @brief How many of the hourly step buckets hold a real value (0 to 24). Steps count 0 as a
 * real reading (a quiet hour), so a chart needs the count rather than a no-data marker.
 */
int health_store_step_hours(void);

/** @brief The heart rate in beats per minute, or -1 if we have not got one yet. */
int health_store_hr(void);

/** @brief The steps taken so far today, or -1 if we have not got one yet. */
int health_store_steps(void);

/** @brief The active calories so far today, or -1 if we have not got one yet. */
int health_store_calories(void);

/** @brief The minutes of sleep, or -1 if we have not got one yet. */
int health_store_sleep_min(void);

/** @brief The active minutes so far today, or -1 if we have not got one yet. */
int health_store_active_min(void);

/** @brief Today's walked distance in meters, or 0 if we cannot read it. */
int health_store_distance_m(void);

/**
 * @brief Heart rate variability as RMSSD in ms, or -1 if we have not got one, it went stale, or the
 * face is built without HEALTH_HRV.
 *
 * Only a watch whose sensor reports beat gaps gives readings, which today is the Pebble Time 2.
 */
int health_store_hrv_ms(void);

/**
 * @brief Whether the watch took the last request for beat gaps.
 *
 * False on a watch without the sensor, with heart rate turned off in the watch's Health settings,
 * with a period of 0, or in a face built without HEALTH_HRV.
 *
 * @return True while the watch is sampling for HRV.
 */
bool health_store_hrv_sampling(void);

/**
 * @brief Whether a burst of beat gaps is being measured right now, with the sensor held on.
 *
 * @return True for the 40 to 90 seconds a burst is held, false otherwise and in a face built without HEALTH_HRV.
 */
bool health_store_hrv_measuring(void);

/**
 * @brief The HRV readings kept for the panels: the latest few with what the wearer was doing,
 * today by the hour, last night's average, and the latest of each kind.
 *
 * Read it with the hrv_log functions in health/hrv_log.h. A face built without HEALTH_HRV gets an
 * empty log, so a panel that reads it still draws.
 *
 * @return The log. Never NULL.
 */
const HrvLog *health_store_hrv_log(void);

/**
 * @brief One of the latest HRV bursts as a tuning panel shows it, dropped ones included, newest
 * first. Kept in memory only, so a face starts each launch with none.
 *
 * @param back 0 for the newest.
 * @param[out] out The burst.
 * @return False when there is none that far back, or in a face built without HEALTH_HRV.
 */
bool health_store_hrv_recent(int back, HrvBurst *out);

/**
 * @brief The HRV burst being held right now, for a panel that shows it as it happens.
 *
 * @param[out] score Its movement score so far, or -1 before there is one.
 * @param[out] steps Its steps so far, or -1 when not known.
 * @param[out] held_sec How long it has been held.
 * @return False when no burst is being held, or in a face built without HEALTH_HRV.
 */
bool health_store_hrv_live(int *score, int *steps, int *held_sec);

/**
 * @brief The still limit in use, in milli-g a sample, so a panel shows the same number as the setting.
 *
 * @return The limit.
 */
uint16_t health_store_hrv_still_mg(void);

/**
 * @brief The steps through a burst that make it a walk, so a panel shows the same number as the setting.
 *
 * @return The step count.
 */
uint16_t health_store_hrv_walk_steps(void);

/** @} */
