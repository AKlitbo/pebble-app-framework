/**
 * @file date.c
 * @brief Pure calendar math, host-testable off-device.
 *
 * @ingroup lib_core
 */
#include "clock/date.h"

/**
 * @brief Whether a year is a leap year, by the usual rule.
 *
 * Every fourth year is one, except a century year, unless it also divides evenly by 400.
 *
 * @param year The full year (2026, not 126).
 * @return True when the year has a leap day, false when it does not.
 */
static int is_leap(int year)
{
    return (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
}

/**
 * @brief The weekday December 31st lands on for a year.
 *
 * @param year The full year (2026, not 126).
 * @return The weekday, 0 Sunday to 6 Saturday.
 */
static int dec31_wday(int year)
{
    return (year + year / 4 - year / 100 + year / 400) % 7;
}

int date_iso_weeks_in_year(int year)
{
    // 53 when the year ends on a Thursday or the year before it ended on a Wednesday
    return 52 + (dec31_wday(year) == 4 || dec31_wday(year - 1) == 3 ? 1 : 0);
}

/**
 * @brief The week number worked out from the date alone, before the year boundary is taken
 * into account.
 *
 * A number below 1 means the day belongs to last year's final week. A number above the year's
 * own total means it already belongs to next year's week 1. The ISO weekday used here runs
 * Monday as 1 through Sunday as 7.
 *
 * @param yday The day of the year counting January 1st as 0 (like tm_yday).
 * @param wday The weekday, 0 Sunday to 6 Saturday.
 * @return The raw week number, which may fall outside 1 to the year's own week count.
 */
static int raw_week(int yday, int wday)
{
    int iso_wday = wday == 0 ? 7 : wday;
    return (yday + 1 - iso_wday + 10) / 7;
}

int date_iso_week(int year, int yday, int wday)
{
    int week = raw_week(yday, wday);
    if (week < 1)
    {
        // the first days of January can still belong to last year's final week
        return date_iso_weeks_in_year(year - 1);
    }
    if (week > date_iso_weeks_in_year(year))
    {
        // the last days of December can already belong to next year's week 1
        return 1;
    }

    return week;
}

int date_iso_week_year(int year, int yday, int wday)
{
    int week = raw_week(yday, wday);
    if (week < 1)
    {
        return year - 1;
    }
    if (week > date_iso_weeks_in_year(year))
    {
        return year + 1;
    }

    return year;
}

int date_day_of_year(int yday)
{
    return yday + 1;
}

int date_days_left_in_year(int year, int yday)
{
    return (is_leap(year) ? 366 : 365) - date_day_of_year(yday);
}

int date_days_in_month(int year, int mon0)
{
    static const unsigned char days[12] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
    if (mon0 < 0 || mon0 > 11)
    {
        return 0;
    }

    return days[mon0] + (mon0 == 1 && is_leap(year) ? 1 : 0);
}

int date_first_wday(int wday, int mday)
{
    // walk today's weekday back to the 1st of the month
    return (wday - (mday - 1) % 7 + 7) % 7;
}
