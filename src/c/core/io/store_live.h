/**
 * @file store_live.h
 * @brief Whether a store runs live after a reconfigure, the one rule every store with a reconfigure
 * follows.
 *
 * Only a store's init decides whether it can ever run live. A store that init started with `live`
 * false is pinned, and a reconfigure never turns it live, so a settings save in a build seeded for
 * screenshots leaves the fixture on screen. A store that init started live is never pinned, and a
 * reconfigure can stop it and start it again. The time store and the polling stores all ask here, so
 * the rule cannot come out different from one store to the next.
 *
 * @ingroup lib_core
 */
#pragma once
#include <stdbool.h>

/**
 * @addtogroup lib_core
 * @{
 */

/**
 * @brief Whether a store runs live once a reconfigure has asked for @p live.
 *
 * @param live What the reconfigure asked for.
 * @param pinned True when init started the store with `live` false.
 * @return True only when the reconfigure asked for live and the store is not pinned.
 */
static inline bool store_live_after_reconfigure(bool live, bool pinned)
{
    return live && !pinned;
}

/** @} */
