/**
 * @file store_cadence.c
 * @brief Holds the list of work the stores want run on the face's cadence.
 *
 * @ingroup lib_stores
 */
#include "io/stores/store_cadence.h"

#include "io/callback_list.h"

static CallbackListFn s_entries[STORE_CADENCE_MAX];              ///< The registered work, in the order it was registered
static CallbackList s_list = {s_entries, STORE_CADENCE_MAX, 0}; ///< The list over that storage

void store_cadence_register(void (*cb)(void))
{
    // a full list means a store quietly stops getting its cadence, so the size is set by how many
    // stores there are rather than by guesswork. this fails loudly in a debug build instead
    if (!callback_list_add(&s_list, cb))
    {
        APP_LOG(APP_LOG_LEVEL_ERROR, "store cadence full, dropping a registration");
    }
}

void store_cadence_fire(void)
{
    callback_list_fire(&s_list);
}
