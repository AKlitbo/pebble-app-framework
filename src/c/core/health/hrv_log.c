/**
 * @file hrv_log.c
 * @brief The heart rate variability readings kept for a face's panels.
 *
 * @ingroup lib_core
 */
#include "health/hrv_log.h"

#include <string.h>

void hrv_log_reset(HrvLog *log)
{
    memset(log, 0, sizeof(*log));
}

HrvState hrv_log_state_of(int motion_score, int steps, uint16_t still_mg, uint16_t walk_steps)
{
    if (steps >= walk_steps)
    {
        return HRV_STATE_WALKING;
    }

    if (motion_score > still_mg)
    {
        return HRV_STATE_BUSY;
    }

    return HRV_STATE_STILL;
}

bool hrv_log_counts(HrvState state, HrvCount count)
{
    switch (count)
    {
        case HRV_COUNT_STILL:
            return state == HRV_STATE_STILL;
        case HRV_COUNT_ANY:
            return true;
        default:
            return state != HRV_STATE_WALKING;
    }
}

bool hrv_log_roll_day(HrvLog *log, int32_t day)
{
    if (day == log->today)
    {
        return false;
    }

    memset(log->hour_sum, 0, sizeof(log->hour_sum));
    memset(log->hour_count, 0, sizeof(log->hour_count));
    log->today = day;
    return true;
}

void hrv_log_add(HrvLog *log, int ms, uint32_t now_min, int32_t day, int minute_of_day, HrvState state, bool asleep)
{
    if (ms < 0 || state >= HRV_STATE_COUNT)
    {
        return;
    }

    uint8_t kept = (uint8_t)(ms > HRV_LOG_MS_MAX ? HRV_LOG_MS_MAX : ms);

    log->at_min[log->head] = now_min;
    log->ms[log->head] = kept;
    log->flags[log->head] = (uint8_t)(state | (asleep ? HRV_LOG_ASLEEP : 0));
    log->head = (uint8_t)((log->head + 1) % HRV_LOG_SLOTS);

    log->state_ms[state] = kept;
    log->state_at_min[state] = now_min;

    // a walking reading shows in the history and as the latest walking one, but it is not a
    // resting figure, so it stays out of the day's hours and the night
    if (state == HRV_STATE_WALKING)
    {
        return;
    }

    hrv_log_roll_day(log, day);
    int hour = minute_of_day / 60;
    if (hour >= 0 && hour < HRV_LOG_HOURS && log->hour_count[hour] < UINT8_MAX &&
        log->hour_sum[hour] <= UINT16_MAX - kept)
    {
        log->hour_sum[hour] = (uint16_t)(log->hour_sum[hour] + kept);
        log->hour_count[hour]++;
    }

    // the watch calls a sleep a nap once it ends, when it started and ended between noon and 21:00.
    // a reading taken during one cannot ask yet, so it goes by the same hours. a nap's reading
    // stays out of the night and does not hold the night open either. a sleep in that window
    // longer than a nap, such as after a night shift, is left out the same way
    bool nap = minute_of_day >= HRV_LOG_NAP_FROM_MIN && minute_of_day < HRV_LOG_NAP_UNTIL_MIN;
    if (!asleep || nap)
    {
        return;
    }

    // a night is the readings taken asleep with no long gap between them, so the first one after
    // a day awake starts the count again rather than averaging into last night
    bool new_night = log->night_last_min == 0 || now_min < log->night_last_min ||
                     now_min - log->night_last_min >= HRV_LOG_NIGHT_GAP_MIN;
    if (new_night)
    {
        log->night_sum = 0;
        log->night_count = 0;
    }

    if (log->night_count < UINT8_MAX && log->night_sum <= UINT16_MAX - kept)
    {
        log->night_sum = (uint16_t)(log->night_sum + kept);
        log->night_count++;
    }
    log->night_last_min = now_min;
}

int hrv_log_count(const HrvLog *log)
{
    int count = 0;
    for (int slot = 0; slot < HRV_LOG_SLOTS; slot++)
    {
        if (log->at_min[slot] != 0)
        {
            count++;
        }
    }

    return count;
}

bool hrv_log_get(const HrvLog *log, int back, int *ms, uint32_t *at_min, uint8_t *flags)
{
    if (back < 0 || back >= HRV_LOG_SLOTS)
    {
        return false;
    }

    int slot = (log->head - 1 - back + 2 * HRV_LOG_SLOTS) % HRV_LOG_SLOTS;
    if (log->at_min[slot] == 0)
    {
        return false;
    }

    *ms = log->ms[slot];
    *at_min = log->at_min[slot];
    *flags = log->flags[slot];
    return true;
}

int hrv_log_hour_avg(const HrvLog *log, int hour)
{
    if (hour < 0 || hour >= HRV_LOG_HOURS || log->hour_count[hour] == 0)
    {
        return -1;
    }

    // rounded to the nearest, the same as the readings themselves
    return (log->hour_sum[hour] + log->hour_count[hour] / 2) / log->hour_count[hour];
}

void hrv_log_today(const HrvLog *log, int *low_ms, int *avg_ms, int *high_ms)
{
    uint32_t sum = 0;
    uint32_t count = 0;
    int low = -1;
    int high = -1;

    for (int hour = 0; hour < HRV_LOG_HOURS; hour++)
    {
        int avg = hrv_log_hour_avg(log, hour);
        if (avg < 0)
        {
            continue;
        }

        sum += log->hour_sum[hour];
        count += log->hour_count[hour];
        if (low < 0 || avg < low)
        {
            low = avg;
        }
        if (avg > high)
        {
            high = avg;
        }
    }

    *low_ms = low;
    *high_ms = high;
    *avg_ms = count == 0 ? -1 : (int)((sum + count / 2) / count);
}

int hrv_log_night_avg(const HrvLog *log)
{
    if (log->night_count == 0)
    {
        return -1;
    }

    return (log->night_sum + log->night_count / 2) / log->night_count;
}

bool hrv_log_last(const HrvLog *log, HrvState state, int *ms, uint32_t *at_min)
{
    if (state >= HRV_STATE_COUNT || log->state_at_min[state] == 0)
    {
        return false;
    }

    *ms = log->state_ms[state];
    *at_min = log->state_at_min[state];
    return true;
}
