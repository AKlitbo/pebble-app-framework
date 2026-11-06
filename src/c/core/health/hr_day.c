/**
 * @file hr_day.c
 * @brief Today's heart rate by the hour. See hr_day.h.
 */
#include "hr_day.h"

#include <string.h>

void hr_day_clear(HrDay *day)
{
    memset(day, 0, sizeof(*day));
}

void hr_day_add(HrDay *day, int hour, int bpm)
{
    if (hour < 0 || hour >= HR_DAY_HOURS || bpm <= 0)
    {
        return;
    }

    HrHour *slot = &day->hours[hour];
    if (slot->count == UINT8_MAX)
    {
        return;
    }

    uint8_t reading = (uint8_t)(bpm > UINT8_MAX ? UINT8_MAX : bpm);
    if (slot->count == 0 || reading < slot->low)
    {
        slot->low = reading;
    }
    if (slot->count == 0 || reading > slot->high)
    {
        slot->high = reading;
    }

    // 255 readings of 255 is 65025, so the sum always fits
    slot->sum += reading;
    slot->count++;
}

int hr_day_hour_avg(const HrDay *day, int hour)
{
    if (hour < 0 || hour >= HR_DAY_HOURS)
    {
        return -1;
    }

    const HrHour *slot = &day->hours[hour];
    if (slot->count == 0)
    {
        return -1;
    }

    return (slot->sum + slot->count / 2) / slot->count;
}

void hr_day_stats(const HrDay *day, int *low, int *avg, int *high)
{
    *low = -1;
    *avg = -1;
    *high = -1;

    uint32_t sum = 0;
    uint32_t count = 0;
    for (int hour = 0; hour < HR_DAY_HOURS; hour++)
    {
        const HrHour *slot = &day->hours[hour];
        if (slot->count == 0)
        {
            continue;
        }

        if (*low < 0 || slot->low < *low)
        {
            *low = slot->low;
        }
        if (slot->high > *high)
        {
            *high = slot->high;
        }
        sum += slot->sum;
        count += slot->count;
    }

    if (count > 0)
    {
        *avg = (int)((sum + count / 2) / count);
    }
}
