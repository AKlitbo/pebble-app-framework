/**
 * @file hrv_motion.h
 * @brief Tells how much the wearer's wrist moved while a burst of beat gaps was measured.
 *
 * Heart rate variability only means something at rest, and a busy wrist also shakes the sensor.
 * This adds up how far the accelerometer moves from one sample to the next, which leaves the pull
 * of gravity out, and averages it over the burst. Plain C with no SDK, so its specs run on a PC.
 *
 * The score is milli-g per sample at 10 Hz, and the numbers mean nothing at another rate, since
 * the same motion sampled faster moves less between samples. On a Pebble Time 2 one wearer scored
 * about 23 to 47 sitting still and 57 to 160 eating or fidgeting. The wrist alone cannot tell desk
 * work from walking, since a mouse and keyboard scored 267, so walking is decided by steps
 * instead, in hrv_log_state_of.
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

#define HRV_MOTION_STILL_DEFAULT 60 ///< The top of still a face gets when it sets none, in milli-g a sample
#define HRV_MOTION_MIN_SAMPLES 20   ///< Samples needed before the score means anything, two seconds at 10 Hz

/**
 * @brief The movement seen over one burst. Start it with hrv_motion_reset.
 */
typedef struct
{
    int16_t last_x;   ///< The sample before, on each axis, in milli-g
    int16_t last_y;
    int16_t last_z;
    bool primed;      ///< Whether there is a sample before to measure from
    uint32_t sum;     ///< The movement from one sample to the next, added up
    uint16_t samples; ///< How many moves are added up
} HrvMotion;

/**
 * @brief Empties the movement, ready for the next burst.
 *
 * @param motion The movement to empty.
 */
void hrv_motion_reset(HrvMotion *motion);

/**
 * @brief Adds one accelerometer sample.
 *
 * @param motion The movement to add to.
 * @param x_mg The x reading, in milli-g.
 * @param y_mg The y reading, in milli-g.
 * @param z_mg The z reading, in milli-g.
 */
void hrv_motion_push(HrvMotion *motion, int16_t x_mg, int16_t y_mg, int16_t z_mg);

/**
 * @brief The average movement per sample so far.
 *
 * @param motion The movement to read.
 * @return The average in milli-g, or -1 before HRV_MOTION_MIN_SAMPLES moves are in.
 */
int hrv_motion_score(const HrvMotion *motion);

/**
 * @brief Whether the wrist has moved more than a limit through the burst so far.
 *
 * Too few samples counts as not over, so a burst is not judged before the accelerometer has said
 * anything.
 *
 * @param motion The movement to read.
 * @param max_mg The limit, in milli-g a sample.
 * @return True once the score is over the limit.
 */
bool hrv_motion_over(const HrvMotion *motion, uint16_t max_mg);

/**
 * @brief Whether the burst can no longer finish under a limit, however still the wrist stays.
 *
 * The score is an average, so a scratch early in a burst lifts it for a while and stillness after
 * brings it back down. Dropping a burst the moment the average crosses the limit would throw away
 * one that ends up well under it. This only says yes once the movement already added up is more
 * than the limit allows over the longest burst there can be.
 *
 * @param motion The movement to read.
 * @param max_mg The limit, in milli-g a sample.
 * @param max_samples The most samples a burst can hold, such as 90 seconds at 10 Hz.
 * @return True when no amount of stillness in the rest of the burst brings it under.
 */
bool hrv_motion_cannot_pass(const HrvMotion *motion, uint16_t max_mg, uint32_t max_samples);

/** @} */
