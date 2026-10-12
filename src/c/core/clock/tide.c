/**
 * @file tide.c
 * @brief The rise and fall of a semidiurnal tide, from a plain running minute count.
 *
 * @ingroup lib_core
 */
#include "clock/tide.h"

/// The cycle's length cubed, which the smoothstep divides by
#define TIDE_PERIOD_CUBE ((int64_t)TIDE_PERIOD_MIN * TIDE_PERIOD_MIN * TIDE_PERIOD_MIN)

/**
 * @brief Where in the cycle a minute count lands.
 *
 * C truncates a negative division towards zero, which leaves a negative remainder, so this
 * pulls it back up by hand.
 *
 * @param minutes A running minute count, on the same base as tide_level.
 * @return The phase within the cycle, 0 to TIDE_PERIOD_MIN - 1.
 */
static int32_t phase(int32_t minutes)
{
    int32_t within = minutes % TIDE_PERIOD_MIN;

    return within < 0 ? within + TIDE_PERIOD_MIN : within;
}

int tide_level(int32_t minutes)
{
    // twice the phase, folded back at the turn, so it climbs from 0 to the period over the first
    // half of the cycle and comes back down over the second
    int32_t twice = phase(minutes) * 2;
    int32_t climb = twice < TIDE_PERIOD_MIN ? twice : 2 * TIDE_PERIOD_MIN - twice;

    // the smoothstep curve 3t^2-2t^3 of climb over the period, scaled to 0..100. it flattens both
    // turns and steepens the middle
    // it is worked out in one go with one rounding at the end, so the level moves at most one point
    // a minute and low and high water last about as long as each other
    // the product on top runs past 40 billion, so it is worked in 64 bits
    int64_t top = (int64_t)100 * climb * climb * (3 * TIDE_PERIOD_MIN - 2 * climb);

    return (int)((top + TIDE_PERIOD_CUBE / 2) / TIDE_PERIOD_CUBE);
}

bool tide_rising(int32_t minutes)
{
    return phase(minutes) * 2 < TIDE_PERIOD_MIN;
}
