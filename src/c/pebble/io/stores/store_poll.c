/**
 * @file store_poll.c
 * @brief The polling decisions the weather, stock, and calendar stores share.
 *
 * Each store keeps its own interval, its own first fetch, and its own request. What they share is
 * when a poll is due and when polling is on at all.
 *
 * @ingroup lib_stores
 */
#include "io/stores/store_poll.h"

#include "io/store_live.h"

bool store_poll_start(StorePoll *poll, int poll_min, bool live, time_t now)
{
    poll->pinned = !live;
    return store_poll_set(poll, poll_min, live, now);
}

bool store_poll_set(StorePoll *poll, int poll_min, bool live, time_t now)
{
    poll->poll_min = poll_min;
    poll->live = store_live_after_reconfigure(live, poll->pinned);

    if (!poll->live || poll_min <= 0)
    {
        return false;
    }

    poll->next = store_poll_next(poll_min, now);
    return true;
}

bool store_poll_turn(StorePoll *poll, time_t now)
{
    return poll->live && store_poll_due(poll->poll_min, &poll->next, now);
}

bool store_poll_reconnect(const StorePoll *poll, int age_s)
{
    return poll->live && store_poll_reconnect_due(age_s, poll->poll_min);
}
