/**
 * @file store_fetch.c
 * @brief The fetch timing the polling stores share, in one copy every store links against.
 *
 * @ingroup lib_stores
 */
#include "io/stores/store_fetch.h"

void store_fetch_fire(void *data)
{
    StoreFetch *fetch = data;
    fetch->timer = NULL;
    fetch->request();
}

void store_fetch_stop(StoreFetch *fetch)
{
    if (fetch->timer)
    {
        app_timer_cancel(fetch->timer);
        fetch->timer = NULL;
    }
}

void store_fetch_arm(StoreFetch *fetch)
{
    if (!fetch->timer)
    {
        fetch->timer = app_timer_register(fetch->first_ms, store_fetch_fire, fetch);
    }
}

void store_fetch_turn(StoreFetch *fetch, time_t now)
{
    if (store_poll_turn(&fetch->poll, now))
    {
        fetch->request();
    }
}

void store_fetch_start(StoreFetch *fetch, int poll_min, bool live, time_t now)
{
    // nothing can be armed on a store that is not live, so the stop only matters for one that is
    bool polling = store_poll_set(&fetch->poll, poll_min, live, now);
    store_fetch_stop(fetch);
    if (polling)
    {
        store_fetch_arm(fetch);
    }
}

void store_fetch_reconfigure(StoreFetch *fetch, int poll_min, bool live, time_t now, bool empty)
{
    if (!store_poll_set(&fetch->poll, poll_min, live, now))
    {
        store_fetch_stop(fetch);
        return;
    }

    if (empty)
    {
        store_fetch_arm(fetch);
    }
}
