/**
 * @file progress.c
 * @brief The progress sums: seconds gone over seconds in the period, as a whole percent.
 *
 * @ingroup lib_core
 */
#include "clock/progress.h"


#include "clock/date.h"

/// Seconds in an hour
#define SECS_PER_HOUR 3600

/// Seconds in a day on the wall clock, which is always 24 hours
#define SECS_PER_DAY 86400

/**
 * @brief Seconds gone over seconds in the period, as a whole percent rounded down.
 *
 * Every period is a whole number of hours, so a hundredth of one is a whole number of seconds, 36
 * an hour. Dividing by that hundredth gives the same answer as times 100 over the total, with no
 * product that could run past a 32 bit int on a year of seconds. It also keeps 64 bit division,
 * about 750 bytes of library code, off the watch.
 *
 * @param elapsed Seconds gone so far.
 * @param total Seconds in the whole period, a whole number of hours.
 * @return Whole percent from 0 to 99, or 0 when either count is not positive.
 */
static int pct_of_seconds(int elapsed, int total)
{
    if (total <= 0 || elapsed <= 0)
    {
        return 0;
    }
    int pct = elapsed / (total / 100);
    return pct > 99 ? 99 : pct;
}

/**
 * @brief How many seconds of the day have gone by on the wall clock.
 *
 * @param hour The hour, 0 to 23.
 * @param min The minute, 0 to 59.
 * @param sec The second, 0 to 59.
 * @return Seconds since midnight.
 */
static int seconds_into_day(int hour, int min, int sec)
{
    return hour * SECS_PER_HOUR + min * 60 + sec;
}

/**
 * @brief How many days a year has, 365 or 366.
 *
 * January 1st has every day of the year still ahead of it bar itself, so that count plus one is
 * the year's length, with the leap rule kept in date.c alone.
 *
 * @param year The full year (2026, not 126).
 * @return The day count, 365 or 366.
 */
static int days_in_year(int year)
{
    return date_days_left_in_year(year, 0) + 1;
}

int progress_week_day(int wday, int week_start)
{
    return (wday - week_start + 7) % 7 + 1;
}

int progress_hour_pct(int min, int sec)
{
    return pct_of_seconds(min * 60 + sec, SECS_PER_HOUR);
}

int progress_day_pct(int hour, int min, int sec)
{
    return pct_of_seconds(seconds_into_day(hour, min, sec), SECS_PER_DAY);
}

int progress_week_pct(int wday, int week_start, int hour, int min, int sec)
{
    int elapsed = (progress_week_day(wday, week_start) - 1) * SECS_PER_DAY + seconds_into_day(hour, min, sec);
    return pct_of_seconds(elapsed, 7 * SECS_PER_DAY);
}

int progress_year_pct(int year, int yday, int hour, int min, int sec)
{
    int elapsed = yday * SECS_PER_DAY + seconds_into_day(hour, min, sec);
    return pct_of_seconds(elapsed, days_in_year(year) * SECS_PER_DAY);
}
