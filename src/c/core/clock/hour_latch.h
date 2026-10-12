/**
 * @file hour_latch.h
 * @brief Decides when an hourly buzz fires, so it fires once for each real hour.
 *
 * More than one ticker can run inside minute 0, such as the minute tick and the .beats timer, and
 * each would buzz without a latch. The latch remembers when the hour that last buzzed began, as
 * seconds since the epoch, rather than its hour number. Two different real hours never share a
 * start, so the hour the clocks repeat when they fall back still gets its buzz.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdbool.h>
#include <time.h>

/**
 * @addtogroup lib_core
 * @{
 */

/**
 * @brief Remembers the hour that last buzzed.
 */
typedef struct
{
    time_t last_start;  ///< when the hour that last buzzed began, or -1 before any has
} HourLatch;

#define HOUR_LATCH_EMPTY {.last_start = -1}  ///< a latch that has not buzzed yet

/**
 * @brief When the local hour holding a moment began, as seconds since the epoch.
 *
 * The minute and second have to come from breaking apart the same reading as now. Taking them
 * from an older tick gives one hour two starts whenever a second turns over between the two
 * reads, and the hour buzzes twice.
 *
 * @param now The moment, as seconds since the epoch.
 * @param tm_min The local minute of now.
 * @param tm_sec The local second of now.
 * @return The start of the hour holding now.
 */
time_t hour_latch_start(time_t now, int tm_min, int tm_sec);

/**
 * @brief Whether a tick should buzz the hour, and if so, marks the hour as buzzed.
 *
 * @param latch The latch to check and update.
 * @param tick_min The minute of the tick that is asking. Only minute 0 can buzz.
 * @param start When the current hour began, from hour_latch_start.
 * @return True the first time minute 0 of an hour asks, false otherwise.
 */
bool hour_latch_take(HourLatch *latch, int tick_min, time_t start);

/**
 * @brief Marks an hour as buzzed without buzzing it.
 *
 * @param latch The latch to update.
 * @param start When the hour began, from hour_latch_start.
 */
void hour_latch_seed(HourLatch *latch, time_t start);

/** @} */
