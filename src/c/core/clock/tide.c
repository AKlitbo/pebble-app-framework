/**
 * @file tide.c
 * @brief The rise and fall of a semidiurnal tide, from a plain running minute count.
 *
 * @ingroup lib_core
 */
#include "clock/tide.h"

/// Half the cycle's length cubed, rounded down, which rounds the smoothstep to the nearest point
#define TIDE_HALF_CUBE ((TIDE_PERIOD_MIN * TIDE_PERIOD_MIN * TIDE_PERIOD_MIN) / 2)

// the most tide_level's first division can take, a remainder of the period less one minute times the
// largest scale, plus the half cube
_Static_assert((int64_t)(TIDE_PERIOD_MIN - 1) * 300 * TIDE_PERIOD_MIN
                   + (int64_t)TIDE_PERIOD_MIN * TIDE_PERIOD_MIN * TIDE_PERIOD_MIN / 2
                   <= INT32_MAX,
               "a longer TIDE_PERIOD_MIN overflows tide_level's 32-bit maths");

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

    // the smoothstep curve 3t^2-2t^3 of climb over the period, scaled to 0..100 and rounded once to
    // the nearest point, so the level moves at most one point a minute
    // dividing by the period and then by its square gives the same whole number as dividing by the
    // cube, and keeps every step under 400 million, inside 32 bits
    // the half cube that rounds it goes in before the first division
    // added any later, the steps round down first and high water lasts only a few minutes
    int32_t square = climb * climb;
    int32_t scale = 100 * (3 * TIDE_PERIOD_MIN - 2 * climb);
    int32_t part = ((square % TIDE_PERIOD_MIN) * scale + TIDE_HALF_CUBE) / TIDE_PERIOD_MIN;
    int32_t over_period = (square / TIDE_PERIOD_MIN) * scale + part;

    return (int)(over_period / (TIDE_PERIOD_MIN * TIDE_PERIOD_MIN));
}

bool tide_rising(int32_t minutes)
{
    return phase(minutes) * 2 < TIDE_PERIOD_MIN;
}
