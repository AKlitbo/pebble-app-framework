/**
 * @file store_persist.h
 * @brief Shared persist save and restore helpers for the stores.
 *
 * @ingroup lib_stores
 */
#pragma once
#include <pebble.h>

#include "io/stores/store_sum.h"

/**
 * @addtogroup lib_stores
 * @{
 */

/**
 * @name Store tags
 *
 * Every store stamps the first byte of its blob with a tag. The high nibble names the store and the
 * low nibble is that store's layout revision.
 *
 * The size on its own cannot tell two blobs apart. The calendar snapshot and the weather state
 * happen to be the same size, and reordering two fields keeps the size too, so the tag is what makes
 * the guard mean anything. Bump a store's low nibble whenever its persisted struct changes shape,
 * and an older blob is dropped rather than read as the wrong thing.
 * @{
 */
#define STORE_TAG_WEATHER  0x12 ///< The weather store's blob
#define STORE_TAG_STOCK    0x21 ///< The stock store's blob
#define STORE_TAG_CALENDAR 0x31 ///< The calendar store's snapshot
#define STORE_TAG_HEALTH   0x42 ///< The health store's saved heart rate window
#define STORE_TAG_LOCATION 0x51 ///< The location store's last fix
/** @} */

/**
 * @brief Restore a saved blob into @p state, but only when it is this store's own current layout.
 *
 * Checks the size and then the tag byte. Nothing is written into @p state unless both match, so
 * the defaults the caller applied before calling survive a rejected blob.
 *
 * @param key The persist slot the face handed the store.
 * @param[out] state The struct to fill. Its first field must be the uint8_t tag.
 * @param size sizeof that struct.
 * @param tag The store's STORE_TAG_* value.
 * @return Whether a saved blob was restored.
 */
static inline bool store_restore(uint32_t key, void *state, size_t size, uint8_t tag)
{
    if (!persist_exists(key) || persist_get_size(key) != (int)size)
    {
        return false;
    }

    // read the tag on its own first. reading the whole blob to check it would already have
    // stomped the defaults by the time we found out it was the wrong shape
    uint8_t stored = 0;
    if (persist_read_data(key, &stored, sizeof(stored)) != (int)sizeof(stored) || stored != tag)
    {
        return false;
    }

    return persist_read_data(key, state, size) == (int)size;
}

/**
 * @brief Save a store's blob with its tag stamped in, so the next restore can recognise it.
 *
 * @param key The persist slot the face handed the store.
 * @param[in,out] state The struct to write, with its tag stamped in on the way. Its first field
 *   must be the uint8_t tag.
 * @param size sizeof that struct.
 * @param tag The store's STORE_TAG_* value.
 * @return Whether the whole blob reached flash. False means the cache did not land, so a caller
 *   that tracks a dirty flag can hold it and try again.
 */
static inline bool store_save(uint32_t key, void *state, size_t size, uint8_t tag)
{
    *(uint8_t *)state = tag;
    return persist_write_data(key, state, size) == (int)size;
}

/**
 * @brief Save a store's blob only when its reading is different from what is already on flash.
 *
 * Only the first @p reading_size bytes are compared, so a reply that brings the same reading with
 * a new sync time writes nothing. The flash copy then keeps the sync time of the last real change,
 * and a relaunch reads the reading as older than it is. The catch-up poll after a reconnect fires a
 * little sooner for it, which costs one request at most.
 *
 * @param key The persist slot the face handed the store.
 * @param[in,out] state The struct to write, with its tag stamped in on the way. Its first field
 *   must be the uint8_t tag.
 * @param size sizeof that struct.
 * @param reading_size How many leading bytes are the reading, from STORE_READING_SIZE. Pass the
 *   whole size for a blob with no sync time.
 * @param tag The store's STORE_TAG_* value.
 * @param[in,out] saved_sum The sum of the reading last written, which the store keeps. It moves on
 *   only when a write lands.
 * @return Whether flash holds this reading now, because it already did or because the write
 *   landed. False means the write failed, so a caller that tracks a dirty flag can try again.
 */
bool store_save_changed(uint32_t key, void *state, size_t size, size_t reading_size, uint8_t tag,
                        uint32_t *saved_sum);

/**
 * @brief Restore a saved blob as store_restore does, and record the sum of the reading it holds.
 *
 * The sum is what store_save_changed compares against, so a first reply bringing the same reading
 * after a relaunch is not written again.
 *
 * @param key The persist slot the face handed the store.
 * @param[out] state The struct to fill. Its first field must be the uint8_t tag.
 * @param size sizeof that struct.
 * @param reading_size How many leading bytes are the reading, from STORE_READING_SIZE.
 * @param tag The store's STORE_TAG_* value.
 * @param[out] saved_sum The sum of the restored reading, or 0 when nothing was restored.
 * @return Whether a saved blob was restored.
 */
bool store_restore_reading(uint32_t key, void *state, size_t size, size_t reading_size, uint8_t tag,
                           uint32_t *saved_sum);

/** @} */
