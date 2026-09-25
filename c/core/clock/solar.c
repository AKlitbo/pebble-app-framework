/**
 * @file solar.c
 * @brief How the day's light is going, worked out from three plain clock readings.
 *
 * @ingroup lib_core
 */
#include "clock/solar.h"

/// A day's worth of minutes, for wrapping the night span across midnight
#define MINUTES_PER_DAY 1440

/**
 * @brief Whether all three readings are real minutes of the day, so the maths below is not run on a
 * missing time. Sunrise and sunset landing on the same minute also count as missing, since that
 * could be a sun that never sets or one that never rises and there is no telling which.
 *
 * @param rise Sunrise, minutes past midnight, or -1 for no data.
 * @param set Sunset, minutes past midnight, or -1 for no data.
 * @param now The clock, minutes past midnight, or -1 for no data.
 * @return True when all three are real readings and the sun both rises and sets.
 */
static bool have_all(int rise, int set, int now)
{
    // a reading below zero turns into a huge unsigned one, so each check covers both ends
    return (unsigned)rise < MINUTES_PER_DAY &&
           (unsigned)set < MINUTES_PER_DAY &&
           (unsigned)now < MINUTES_PER_DAY &&
           rise != set;
}

/**
 * @brief Minutes going forward round the clock from one reading to another.
 *
 * Sunset falls after midnight in a high latitude summer, so the daylight can run from 03:00 round
 * to 00:30. Measuring everything forward from sunrise this way covers that and an ordinary day
 * with the same maths.
 *
 * @param from The earlier reading, minutes past midnight.
 * @param to The later reading, minutes past midnight.
 * @return 0 to 1439.
 */
static int forward(int from, int to)
{
    int minutes = to - from;
    if (minutes < 0)
    {
        minutes += MINUTES_PER_DAY;
    }
    return minutes;
}

int solar_day_progress(int rise, int set, int now)
{
    if (!have_all(rise, set, now))
    {
        return -1;
    }

    int span = forward(rise, set);
    int elapsed = forward(rise, now);
    if (elapsed > span)
    {
        return -1;  // past sunset and not yet round to sunrise, so it is night
    }
    return (elapsed * 100) / span;
}

int solar_night_progress(int rise, int set, int now)
{
    if (!have_all(rise, set, now) || forward(rise, now) <= forward(rise, set))
    {
        return -1;
    }

    // sunset to the next sunrise, which is whatever the daylight leaves of the day
    int span = MINUTES_PER_DAY - forward(rise, set);
    return (forward(set, now) * 100) / span;
}

int solar_next_event(int rise, int set, int now, bool *is_sunrise)
{
    if (!have_all(rise, set, now))
    {
        return -1;
    }

    if (forward(rise, now) < forward(rise, set))
    {
        *is_sunrise = false;
        return forward(now, set);
    }
    *is_sunrise = true;
    return forward(now, rise);
}
