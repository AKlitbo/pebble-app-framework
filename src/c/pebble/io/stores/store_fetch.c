/**
 * @file store_fetch.c
 * @brief The fetch timing the polling stores share, in one copy every store links against.
 *
 * @ingroup lib_stores
 */
#include "io/stores/store_fetch.h"

#include "io/stores/system_store.h"

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

void store_fetch_on_link(StoreFetch *fetch, int age_s)
{
    // the listener runs on a drop too, and the system store already holds the new state, so a drop
    // reads as not connected here. only a store's init makes it live and sets its request in the same go,
    // so a live store always has a request to call
    if (system_store_bluetooth() && store_poll_reconnect(&fetch->poll, age_s))
    {
        fetch->request();
    }
}

void store_fetch_start(StoreFetch *fetch, int poll_min, bool live, time_t now)
{
    // nothing can be armed on a store that is not live, so the stop only matters for one that is
    bool polling = store_poll_start(&fetch->poll, poll_min, live, now);
    store_fetch_stop(fetch);
    if (polling)
    {
        store_fetch_arm(fetch);
    }
}

void store_fetch_reconfigure(StoreFetch *fetch, int poll_min, bool live, time_t now, bool empty)
{
    // only a store's init sets its request, so a store the face never started has none. it ignores
    // the reconfigure, since arming a fetch there would call a NULL request and crash the watch
    if (!fetch->request)
    {
        return;
    }

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
