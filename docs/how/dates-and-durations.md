# Dates and Durations

On the 1st of January 2027, a week readout totalled against the calendar year says `53/52`. The day is in ISO week 53 of 2026, and 2027 itself has only 52 weeks. Small calendar readouts are full of edges like that, which only show on a few days a year, and the framework gets them right once so a face does not find them on someone's wrist in January. It covers the week number, the day of the year, the days left in it, a month grid, two-letter weekday labels, and a length of time such as a night's sleep or the wait until sunset.

The code lives in [`date.h`](../../src/c/core/clock/date.h) and [`date.c`](../../src/c/core/clock/date.c), [`duration.h`](../../src/c/core/clock/duration.h) and [`duration.c`](../../src/c/core/clock/duration.c), and [`weekday.h`](../../src/c/core/clock/weekday.h) and [`weekday.c`](../../src/c/core/clock/weekday.c), all under `src/c/core/clock/`. The date functions take the fields of a `struct tm` one at a time, with the year written out in full, so a face passes `tm_year + 1900`, `tm_yday`, and `tm_wday` straight from its clock.

## Week Numbers

The week number is the ISO 8601 one. Weeks start on Monday, and week 1 is the week that holds the year's first Thursday. So the last few days of December can be in next year's week 1, and the first few days of January in last year's final week:

| Date | Weekday | ISO Week |
| :-- | :-- | :-- |
| 28 December 2026 | Monday | 53 of 2026 |
| 31 December 2026 | Thursday | 53 of 2026 |
| 1 January 2027 | Friday | 53 of 2026 |
| 4 January 2027 | Monday | 1 of 2027 |

**The Week and Its Total.** A readout such as `41/53` has to take its total from the year the week belongs to, which is not always the calendar year. `date_iso_week_year` gives that year, so the number and its total always agree:

```c
int year = t->tm_year + 1900;
int week = date_iso_week(year, t->tm_yday, t->tm_wday);
int total = date_iso_weeks_in_year(date_iso_week_year(year, t->tm_yday, t->tm_wday));

snprintf(out, n, "%d/%d", week, total);   // "53/53" on the 1st of January 2027
```

**Finding the Week.** The sum moves to the Thursday of the same week, since that day decides which year the week belongs to, and counts sevens. An answer below 1 means the day belongs to last year's final week, and one past this year's total means it is already next year's week 1.

**52 or 53 Weeks.** A year has 53 ISO weeks when it ends on a Thursday or starts on one. The weekday of the 31st of December is one sum, counting the years and the leap days from a year 0 that ended on a Sunday:

```c
return (year + year / 4 - year / 100 + year / 400) % 7;   // 0 Sunday to 6 Saturday
```

2020, 2026, and 2032 have 53 weeks.

## Counting Days

`date_day_of_year` counts the 1st of January as day 1, one more than `tm_yday`, and `date_days_left_in_year` counts what is left after today, so the 31st of December reads 0. Leap years follow the full rule, so 1900 was not one and 2000 was.

**A Month Grid.** `date_days_in_month` gives a month's length, with February's leap day, and 0 for a month number that does not exist rather than reading past the end of its table. `date_first_wday` gives the weekday of the 1st by walking back from today's weekday, so a face needs nothing more than its clock to lay out the month:

```c
int days = date_days_in_month(t->tm_year + 1900, t->tm_mon);
int first = date_first_wday(t->tm_wday, t->tm_mday);   // 0 Sunday to 6 Saturday

// a grid with Monday in its first column leaves this many empty cells before the 1st
int lead = (first - 1 + 7) % 7;
```

## Durations

Both formats take a count of minutes. A negative count reads as zero, so a countdown that has just passed never shows a stray minus sign. Both write with `snprintf`, so a buffer too small for the text gets it cut short rather than overrun.

**`duration_hm`.** A clock-style `H:MM`, for a total such as a night's sleep. The minutes always have two digits, so 425 minutes reads `7:05` rather than `7:5`. The hours are not capped, so 1500 minutes reads `25:00`.

**`duration_hm_compact`.** `Xh Ym`, for a countdown, and just the minutes once it is under an hour. 65 minutes reads `1h 5m` and 45 reads `45m`.

## Weekday Names

`weekday_short` gives the two-letter name for a weekday, `SU` through `SA`, numbered from 0 for Sunday like `tm_wday`. The daily forecast from the phone numbers its days the same way, so a forecast strip and a calendar share one table. A number outside 0 to 6 gives an empty string rather than reading past the table. The names are English only.
