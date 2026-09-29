/**
 * @file store_sum.h
 * @brief A checksum of a store's reading, so a reply that brings nothing new costs no flash write.
 *
 * Every reply stamps a fresh sync time, so the saved blob always differs from the last one even
 * when every reading in it is the same. A store sums only the part before its sync time, keeps that
 * sum, and skips the write when the next one matches. Four bytes a store is far cheaper in RAM than
 * a second copy of the blob.
 *
 * @ingroup lib_stores
 */
#pragma once
#include <stddef.h>
#include <stdint.h>

/**
 * @addtogroup lib_stores
 * @{
 */

/**
 * @brief How many leading bytes of a store's blob are the reading, which is everything before its
 * sync time.
 *
 * @param state The store's blob.
 * @param stamp The name of its sync time field, which has to come after every reading.
 */
#define STORE_READING_SIZE(state, stamp) \
    ((size_t)((const uint8_t *)&(state).stamp - (const uint8_t *)&(state)))

/**
 * @brief Sums a run of bytes, so two readings can be compared without keeping both.
 *
 * FNV-1a, which mixes each byte in turn. A plain byte total would miss two values swapping places,
 * and a reading that only reordered its forecast would never be saved.
 *
 * @param bytes The bytes to sum.
 * @param size How many there are.
 * @return The sum.
 */
uint32_t store_sum(const void *bytes, size_t size);

/** @} */
