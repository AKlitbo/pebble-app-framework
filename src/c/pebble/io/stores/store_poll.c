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

bool store_poll_set(StorePoll *poll, int poll_min, bool live, time_t now)
{
    poll->poll_min = poll_min;
    poll->live = live;

    if (!live || poll_min <= 0)
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
