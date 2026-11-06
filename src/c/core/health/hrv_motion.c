/**
 * @file hrv_motion.c
 * @brief Tells whether the wearer kept still while a burst of beat gaps was measured.
 *
 * @ingroup lib_core
 */
#include "health/hrv_motion.h"

#include <string.h>

/**
 * @brief How far one reading moved from the one before, as a positive number.
 *
 * @param now The reading now, in milli-g.
 * @param before The reading before, in milli-g.
 * @return The distance between them.
 */
static uint32_t moved(int16_t now, int16_t before)
{
    int32_t diff = (int32_t)now - (int32_t)before;
    return (uint32_t)(diff < 0 ? -diff : diff);
}

void hrv_motion_reset(HrvMotion *motion)
{
    memset(motion, 0, sizeof(*motion));
}

void hrv_motion_push(HrvMotion *motion, int16_t x_mg, int16_t y_mg, int16_t z_mg)
{
    // gravity is always there, so a watch held still reads the same tilt over and over. measuring
    // the change from sample to sample leaves the tilt out and keeps only the movement
    if (motion->primed && motion->samples < UINT16_MAX)
    {
        motion->sum += moved(x_mg, motion->last_x) + moved(y_mg, motion->last_y) + moved(z_mg, motion->last_z);
        motion->samples++;
    }

    motion->last_x = x_mg;
    motion->last_y = y_mg;
    motion->last_z = z_mg;
    motion->primed = true;
}

int hrv_motion_score(const HrvMotion *motion)
{
    if (motion->samples < HRV_MOTION_MIN_SAMPLES)
    {
        return -1;
    }

    return (int)(motion->sum / motion->samples);
}

bool hrv_motion_over(const HrvMotion *motion, uint16_t max_mg)
{
    return hrv_motion_score(motion) > max_mg;
}

bool hrv_motion_cannot_pass(const HrvMotion *motion, uint16_t max_mg, uint32_t max_samples)
{
    // the most movement the longest burst can hold and still average at the limit. the sum only
    // grows, so once it is past that the burst is over the limit whatever comes next
    return motion->sum > (uint32_t)max_mg * max_samples;
}
