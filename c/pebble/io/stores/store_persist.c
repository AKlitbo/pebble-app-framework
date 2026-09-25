/**
 * @file store_persist.c
 * @brief The save that skips an unchanged reading and the restore that feeds it, in one copy every
 * store links against.
 *
 * @ingroup lib_stores
 */
#include "io/stores/store_persist.h"

bool store_save_changed(uint32_t key, void *state, size_t size, size_t reading_size, uint8_t tag,
                        uint32_t *saved_sum)
{
    *(uint8_t *)state = tag;
    uint32_t sum = store_sum(state, reading_size);
    if (sum == *saved_sum)
    {
        return true;
    }

    if (!store_save(key, state, size, tag))
    {
        return false;
    }

    *saved_sum = sum;
    return true;
}

bool store_restore_reading(uint32_t key, void *state, size_t size, size_t reading_size, uint8_t tag,
                           uint32_t *saved_sum)
{
    *saved_sum = 0;
    if (!store_restore(key, state, size, tag))
    {
        return false;
    }

    *saved_sum = store_sum(state, reading_size);
    return true;
}
