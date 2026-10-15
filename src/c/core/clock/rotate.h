/**
 * @file rotate.h
 * @brief Which one of a set to show right now, on a timed rotation.
 *
 * Given the clock, how often to move on, and how many there are, this says which one is up. It
 * works the choice out from the time itself rather than keeping a counter, so it survives a restart
 * with no saved state and two watches set the same land on the same one.
 *
 * It takes the clock already broken apart into its fields rather than a time_t or a struct tm, the
 * way the rest of the core clock code does, so it needs no gmtime and stays off the SDK, which is
 * what keeps it host-testable.
 *
 * @ingroup lib_core
 */
#pragma once

/**
 * @addtogroup lib_core
 * @{
 */

/**
 * @brief Which of `count` is up now, advancing by one every `interval_min` minutes and wrapping
 * round at the end.
 *
 * The answer holds steady through a slot and steps to the next when the slot turns over, so a
 * screen drawn from it only changes on a boundary. It is 0 for a count of one, and for an interval
 * or a count that is not positive, which is the safe nothing-to-rotate answer.
 *
 * It counts the year as a round 366 days, so the one boundary at a non-leap new year jumps by more
 * than a single step and can, for a count that divides the jump, land on the same one twice. For a
 * shuffle that one ragged boundary a year does not matter.
 *
 * The time comes in as the same fields a struct tm carries, so the caller hands them straight from
 * its broken-apart clock.
 *
 * @param year Years since 1900, as tm_year.
 * @param yday Days into the year, 0 to 365, as tm_yday.
 * @param hour The hour, 0 to 23, as tm_hour.
 * @param minute The minute, 0 to 59, as tm_min.
 * @param interval_min How many minutes each one is shown for.
 * @param count How many there are to rotate through.
 * @return The index that is up, from 0 to count - 1.
 */
int rotate_index(int year, int yday, int hour, int minute, int interval_min, int count);

/** @} */
