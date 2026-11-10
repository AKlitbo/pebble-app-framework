/**
 * @file link_change.h
 * @brief Tells a real change of the phone link from a reading that changes nothing.
 *
 * The system store hands each reading of the link here and acts on the answer. The first reading
 * after the store starts only seeds, so a face never buzzes or catches up at launch. A reading that
 * matches the one before is no change either. Only a real drop or a real return reaches the face's
 * buzz, its reconnect callback, and the stores listening for the link.
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
 * @brief What one reading of the link means.
 */
typedef enum
{
    LINK_SAME,       ///< The first reading, or one that matches the last. Nothing to act on
    LINK_DROPPED,    ///< The phone link just went down
    LINK_RECONNECTED ///< The phone link just came back
} LinkChange;

/**
 * @brief The link as last read. Zeroed is a store that has read nothing yet.
 */
typedef struct
{
    bool connected; ///< True when the phone link was up at the last reading
    bool seeded;    ///< True once a reading has come in, so the next one can be a change
} LinkState;

/**
 * @brief Takes one reading of the link and says what it means.
 *
 * The new reading is kept whatever it means, so a store reading the state from inside a buzz or a
 * catch-up sees the link as it is now.
 *
 * @param state The link as last read. Updated to this reading.
 * @param connected True when the phone link is up now.
 * @return LINK_DROPPED or LINK_RECONNECTED for a real change, and LINK_SAME for the first reading or a repeat.
 */
static inline LinkChange link_change_read(LinkState *state, bool connected)
{
    bool was_connected = state->connected;
    bool seeded = state->seeded;

    state->connected = connected;
    state->seeded = true;

    if (!seeded || was_connected == connected)
    {
        return LINK_SAME;
    }

    return connected ? LINK_RECONNECTED : LINK_DROPPED;
}

/** @} */
